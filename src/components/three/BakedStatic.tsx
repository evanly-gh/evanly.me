import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapses a STATIC subtree of many small meshes into one merged mesh per
// material — a draw-call optimization that is visually identical (the exact same
// geometry and materials, just fewer submissions). Built for the monorail, finale
// bridge, ad billboards, scaffold, ramps and section-panel structure, each of
// which was 10s-100s of tiny meshes → as many draw calls despite almost no
// triangles. Draw submission is the dominant per-frame CPU cost on weak devices
// (~10-20 µs each in three.js), so these merges are a real frame-time win.
//
// What gets baked (everything else renders normally):
//   - opaque, single-material, unnamed meshes (always)
//   - `bakeNamed`: also meshes that carry a name. The originals stay in the
//     graph (hidden), so dev scene-inspection can still find them by name.
//   - `bakeBlended`: ADDITIVE, depthWrite:false meshes (billboard halos, beams,
//     glows). Additive blending is order-independent, so merging them per
//     material cannot change the image. Normal-blended transparency is never
//     baked (it is sort-order sensitive).
//   - `atlasScreens`: MeshBasicMaterial meshes whose only per-mesh difference is
//     their `map` (the ad-billboard screens, one artwork each). Their textures
//     are packed into one canvas atlas per material signature and their UVs
//     remapped, so ~100 unique-texture planes become one draw. Screens whose
//     image has not loaded yet are skipped and picked up by a later pass.
//
// The caller must only wrap subtrees whose world transforms are fixed (no
// per-frame animation). Size may still settle asynchronously: `resettleMs`
// re-bakes after the given delays, and bumping `revision` re-bakes (debounced)
// — e.g. when another artwork texture finishes loading.
//
// For merging to actually collapse draws, sibling meshes must SHARE material
// objects (same reference) — see AdBillboard's shared-material cache.

type BakeClass = 'opaque' | 'blend' | 'screen';

interface BakeOptions {
  bakeNamed: boolean;
  bakeBlended: boolean;
  atlasScreens: boolean;
}

interface Classified {
  cls: BakeClass;
  key: string;
}

type AnyMaterial = THREE.Material & {
  isMeshBasicMaterial?: boolean;
  map?: THREE.Texture | null;
  color?: THREE.Color;
  toneMapped?: boolean;
  blending?: THREE.Blending;
};

function classify(mesh: THREE.Mesh, opts: BakeOptions): Classified | null {
  if (!mesh.isMesh || !mesh.geometry) return null;
  if (mesh.name && !opts.bakeNamed) return null;
  if (Array.isArray(mesh.material)) return null;
  const mat = mesh.material as AnyMaterial;
  const additive = mat.blending === THREE.AdditiveBlending && mat.depthWrite === false;
  const blended = mat.transparent
    || mat.depthWrite === false
    || (mat.blending !== undefined && mat.blending !== THREE.NormalBlending);
  if (opts.atlasScreens && mat.isMeshBasicMaterial && mat.map) {
    const image = mat.map.image as { width?: number; height?: number } | undefined;
    if (!image || !image.width || !image.height) return null; // texture still loading
    if (blended && !additive) return null;
    const key = [
      'screen', mat.blending, mat.side, mat.depthWrite ? 1 : 0, mat.transparent ? 1 : 0,
      mat.opacity.toFixed(3), mat.color ? mat.color.getHexString() : '', mat.toneMapped ? 1 : 0,
      mesh.renderOrder, mat.map.colorSpace,
    ].join('|');
    return { cls: 'screen', key };
  }
  if (blended) {
    if (!opts.bakeBlended || !additive) return null;
    return { cls: 'blend', key: `blend|${mat.uuid}|${mesh.renderOrder}` };
  }
  return { cls: 'opaque', key: `opaque|${mat.uuid}|${mesh.renderOrder}` };
}

// Normalize to a uniform, groupless [position, normal, uv] geometry so a batch of
// heterogeneous primitives (Box / Cylinder / Extrude / Plane) merges into one draw.
function normalize(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  g.clearGroups();
  return g;
}

interface AtlasRect { x: number; y: number; w: number; h: number }

/** Shelf-packs unique textures into a single canvas (≤ maxSize²), downscaling
 *  uniformly if they don't fit. Returns the atlas texture + per-texture rects. */
function buildAtlas(
  textures: THREE.Texture[],
  maxSize: number,
): { texture: THREE.CanvasTexture; rects: Map<THREE.Texture, AtlasRect>; width: number; height: number } | null {
  const items = textures.map((t) => {
    const img = t.image as { width: number; height: number };
    return { t, w: img.width, h: img.height };
  });
  if (items.length === 0) return null;
  const totalArea = items.reduce((a, i) => a + i.w * i.h, 0);
  let scale = Math.min(1, Math.sqrt((maxSize * maxSize * 0.8) / totalArea));
  const PAD = 2;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sorted = [...items].sort((a, b) => b.h * scale - a.h * scale);
    const rects = new Map<THREE.Texture, AtlasRect>();
    let x = PAD; let y = PAD; let shelf = 0; let ok = true;
    for (const item of sorted) {
      const w = Math.max(1, Math.round(item.w * scale));
      const h = Math.max(1, Math.round(item.h * scale));
      if (x + w + PAD > maxSize) { x = PAD; y += shelf + PAD; shelf = 0; }
      if (y + h + PAD > maxSize) { ok = false; break; }
      rects.set(item.t, { x, y, w, h });
      x += w + PAD;
      shelf = Math.max(shelf, h);
    }
    if (!ok) { scale *= 0.85; continue; }
    const height = Math.min(maxSize, Math.ceil((y + shelf + PAD) / 4) * 4);
    const canvas = document.createElement('canvas');
    canvas.width = maxSize;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (const [t, r] of rects) {
      ctx.drawImage(t.image as CanvasImageSource, r.x, r.y, r.w, r.h);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = textures[0].colorSpace;
    texture.anisotropy = textures[0].anisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return { texture, rects, width: maxSize, height };
  }
  return null;
}

export function BakedStatic({
  children,
  resettleMs = [],
  revision = 0,
  bakeNamed = false,
  bakeBlended = false,
  atlasScreens = false,
  maxAtlasSize = 4096,
  exclude,
}: {
  children: ReactNode;
  resettleMs?: number[];
  /** Bump to request a (debounced) re-bake, e.g. when a screen texture loads. */
  revision?: number;
  bakeNamed?: boolean;
  bakeBlended?: boolean;
  atlasScreens?: boolean;
  maxAtlasSize?: number;
  /** Meshes to leave live (e.g. ones with pointer handlers). */
  exclude?: (mesh: THREE.Mesh) => boolean;
}) {
  const srcRef = useRef<THREE.Group>(null);
  const [baked, setBaked] = useState<THREE.Group | null>(null);
  const currentRef = useRef<THREE.Group | null>(null);
  const ownedRef = useRef<Array<{ dispose(): void }>>([]);
  const hiddenRef = useRef<THREE.Mesh[]>([]);
  const optsRef = useRef<BakeOptions>({ bakeNamed, bakeBlended, atlasScreens });
  optsRef.current = { bakeNamed, bakeBlended, atlasScreens };
  const maxAtlasRef = useRef(maxAtlasSize);
  maxAtlasRef.current = maxAtlasSize;
  const excludeRef = useRef(exclude);
  excludeRef.current = exclude;

  // A merged mesh is authored in the root's local space with an identity
  // matrix. Ancestors may already be matrix-frozen (see staticMatrices), so
  // force its world matrix once when it is attached.
  useLayoutEffect(() => {
    srcRef.current?.updateMatrixWorld(true);
  }, [baked]);

  useLayoutEffect(() => {
    const disposeOwned = () => {
      for (const resource of ownedRef.current) resource.dispose();
      ownedRef.current = [];
    };

    const runBake = () => {
      const root = srcRef.current;
      if (!root) return;
      const opts = optsRef.current;
      // Undo the previous pass so we re-read fresh (resettled) geometry.
      for (const mesh of hiddenRef.current) mesh.visible = true;
      hiddenRef.current = [];

      root.updateWorldMatrix(true, true);
      const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const local = new THREE.Matrix4();
      const groups = new Map<string, { cls: BakeClass; meshes: THREE.Mesh[] }>();

      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (currentRef.current && isDescendant(mesh, currentRef.current)) return;
        if (excludeRef.current && excludeRef.current(mesh)) return;
        const c = classify(mesh, opts);
        if (!c) return;
        const group = groups.get(c.key) ?? { cls: c.cls, meshes: [] };
        group.meshes.push(mesh);
        groups.set(c.key, group);
      });

      if (groups.size === 0) return;

      const owned: Array<{ dispose(): void }> = [];
      const bakedGroup = new THREE.Group();
      const baking: THREE.Mesh[] = [];

      for (const { cls, meshes } of groups.values()) {
        // A lone mesh gains nothing from merging (and would only duplicate memory).
        if (meshes.length < 2 && cls !== 'screen') continue;
        const first = meshes[0];
        const firstMat = first.material as AnyMaterial;
        let atlas: ReturnType<typeof buildAtlas> = null;
        let material: THREE.Material = firstMat;
        if (cls === 'screen') {
          const unique = [...new Set(meshes.map((m) => (m.material as AnyMaterial).map as THREE.Texture))];
          atlas = buildAtlas(unique, maxAtlasRef.current);
          if (!atlas) continue;
          owned.push(atlas.texture);
          const cloned = firstMat.clone() as AnyMaterial;
          cloned.map = atlas.texture;
          cloned.needsUpdate = true;
          owned.push(cloned);
          material = cloned;
        }
        const geometries: THREE.BufferGeometry[] = [];
        for (const mesh of meshes) {
          local.multiplyMatrices(rootInv, mesh.matrixWorld);
          const geometry = normalize(mesh.geometry);
          geometry.applyMatrix4(local);
          if (atlas) {
            const rect = atlas.rects.get((mesh.material as AnyMaterial).map as THREE.Texture);
            if (rect) {
              const uv = geometry.attributes.uv as THREE.BufferAttribute;
              for (let i = 0; i < uv.count; i += 1) {
                const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1);
                const v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
                uv.setXY(
                  i,
                  (rect.x + u * rect.w) / atlas.width,
                  1 - (rect.y + (1 - v) * rect.h) / atlas.height,
                );
              }
              uv.needsUpdate = true;
            }
          }
          geometries.push(geometry);
          baking.push(mesh);
        }
        const merged = geometries.length === 1
          ? geometries[0]
          : mergeGeometries(geometries, false);
        if (!merged) { for (const g of geometries) g.dispose(); continue; }
        merged.clearGroups();
        owned.push(merged);
        for (const g of geometries) if (g !== merged) g.dispose();
        const mesh = new THREE.Mesh(merged, material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.renderOrder = first.renderOrder;
        mesh.frustumCulled = true;
        bakedGroup.add(mesh);
      }

      if (bakedGroup.children.length === 0) {
        for (const resource of owned) resource.dispose();
        return;
      }

      for (const mesh of baking) mesh.visible = false;
      hiddenRef.current = baking;
      const previousOwned = ownedRef.current;
      ownedRef.current = owned;
      currentRef.current = bakedGroup;
      setBaked(bakedGroup);
      // Dispose the superseded merge on the next tick, after React swaps it out.
      if (previousOwned.length) setTimeout(() => { for (const r of previousOwned) r.dispose(); }, 0);
    };

    // Debounce revision bumps (several textures often land within a few ms).
    const initial = window.setTimeout(runBake, revision === 0 ? 0 : 250);
    const timers = resettleMs.map((ms) => window.setTimeout(runBake, ms));

    return () => {
      window.clearTimeout(initial);
      timers.forEach((id) => window.clearTimeout(id));
      for (const mesh of hiddenRef.current) mesh.visible = true;
      hiddenRef.current = [];
      disposeOwned();
      currentRef.current = null;
    };
    // Re-run only when the resettle schedule or revision actually changes (not on
    // every render, since callers may pass a fresh array literal each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resettleMs.join(','), revision]);

  return (
    <group ref={srcRef}>
      {children}
      {baked && <primitive object={baked} />}
    </group>
  );
}

function isDescendant(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = object;
  while (p) { if (p === ancestor) return true; p = p.parent; }
  return false;
}
