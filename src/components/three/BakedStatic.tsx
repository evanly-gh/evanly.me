import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collapses a STATIC subtree of many small single-material meshes into one merged
// mesh per material — a draw-call optimization that is visually identical (the exact
// same geometry and materials, just fewer submissions). Built for the monorail,
// finale bridge and ad billboards, each of which was 100s of tiny meshes → 100s-800s
// of draw calls despite almost no triangles (see the draw-call attribution scan).
// On CPU/draw-bound weak devices those submissions are a real per-frame cost.
//
// Only meshes that are safe to merge are baked; everything else renders normally:
//   - skips NAMED meshes (dev scene-inspection looks them up by name)
//   - skips MULTI-material meshes (would need per-group splitting)
//   - skips TRANSPARENT / additive / depthWrite:false meshes (render-order sensitive)
//   - the caller must only wrap subtrees whose world transforms are fixed (no
//     per-frame animation); size may still settle asynchronously (see resettleMs).
//
// For merging to actually collapse draws, sibling meshes must SHARE material objects
// (same reference) — see AdBillboard's shared-material cache.
//
// `resettleMs` re-bakes after the given delays, for subtrees whose geometry finishes
// resolving after mount (e.g. billboard panels resize once their texture's true
// aspect loads). Leave empty for fully-deterministic content (monorail/bridge).

function isBakeable(mesh: THREE.Mesh): boolean {
  if (!mesh.isMesh || !mesh.geometry) return false;
  if (mesh.name) return false;
  if (Array.isArray(mesh.material)) return false;
  const mat = mesh.material as THREE.Material & { blending?: THREE.Blending };
  if (mat.transparent) return false;
  if (mat.depthWrite === false) return false;
  if (mat.blending !== undefined && mat.blending !== THREE.NormalBlending) return false;
  return true;
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

export function BakedStatic({
  children,
  resettleMs = [],
}: {
  children: ReactNode;
  resettleMs?: number[];
}) {
  const srcRef = useRef<THREE.Group>(null);
  const [baked, setBaked] = useState<THREE.Group | null>(null);
  const currentRef = useRef<THREE.Group | null>(null);
  const hiddenRef = useRef<THREE.Mesh[]>([]);

  useLayoutEffect(() => {
    const dispose = (group: THREE.Group | null) => {
      group?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    };

    const runBake = () => {
      const root = srcRef.current;
      if (!root) return;
      // Undo the previous pass so we re-read fresh (resettled) geometry.
      for (const mesh of hiddenRef.current) mesh.visible = true;
      hiddenRef.current = [];

      root.updateWorldMatrix(true, true);
      const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const local = new THREE.Matrix4();
      const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const baking: THREE.Mesh[] = [];

      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!isBakeable(mesh)) return;
        local.multiplyMatrices(rootInv, mesh.matrixWorld);
        const geometry = normalize(mesh.geometry);
        geometry.applyMatrix4(local);
        const material = mesh.material as THREE.Material;
        const list = byMaterial.get(material) ?? [];
        list.push(geometry);
        byMaterial.set(material, list);
        baking.push(mesh);
      });

      if (byMaterial.size === 0) return;

      const group = new THREE.Group();
      for (const [material, geometries] of byMaterial) {
        const merged = geometries.length === 1
          ? geometries[0]
          : mergeGeometries(geometries, false);
        if (!merged) continue;
        merged.clearGroups();
        const mesh = new THREE.Mesh(merged, material);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        for (const g of geometries) if (g !== merged) g.dispose();
      }

      for (const mesh of baking) mesh.visible = false;
      hiddenRef.current = baking;
      const previous = currentRef.current;
      currentRef.current = group;
      setBaked(group);
      // Dispose the superseded merge on the next tick, after React swaps it out.
      if (previous) setTimeout(() => dispose(previous), 0);
    };

    runBake();
    const timers = resettleMs.map((ms) => window.setTimeout(runBake, ms));

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      for (const mesh of hiddenRef.current) mesh.visible = true;
      hiddenRef.current = [];
      dispose(currentRef.current);
      currentRef.current = null;
    };
    // Re-run only when the resettle schedule actually changes (not on every render,
    // since callers may pass a fresh array literal each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resettleMs.join(',')]);

  return (
    <group ref={srcRef}>
      {children}
      {baked && <primitive object={baked} />}
    </group>
  );
}
