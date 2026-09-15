import { Fragment, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { calculateRenderedScale, BUILDING_CATALOG } from '../../world/buildingCatalog';
import { resolveQuality } from '../../world/deviceQuality';
import {
  buildModelSpatialBuckets,
  buildSpatialChunks,
  INSTANCE_CHUNK_SIZE,
  type SpatialChunk,
} from '../../world/instanceBuckets';
import {
  HUMAN_VARIANTS,
  type HumanVariantId,
} from '../../world/crowdLayout';
import { useCommittedThreeResource } from './useCommittedThreeResources';
import {
  KITBASH_EMISSIVE_SCALE,
  KITBASH_PACKED_ATTRIBUTE,
  kitbashArrayMaterial,
  kitbashPartEmissive,
  kitbashTextureArray,
} from './kitbashArrayMaterial';

export {
  buildModelSpatialBuckets,
  buildSpatialChunks,
  INSTANCE_CHUNK_SIZE,
};
export type { SpatialChunk };

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
  /** Stable palette key resolved to per-instance colors without splitting draws. */
  materialVariant?: string;
  /** Horizontal body-width multiplier applied after uniform height scaling. */
  buildScale?: number;
  /** Max footprint radius (m). The instance is uniformly scaled so its
   *  circumscribed footprint never exceeds this — guarantees no road overlap. */
  foot?: number;
  /** Optional exact X/Z offset from the placement anchor to rendered centre. */
  centerOffset?: [number, number];
  /** Unit outward (away-from-road) direction [x,z]. If set, the instance is
   *  pushed out by its effective footprint radius so its near face lands on the
   *  sidewalk edge — buildings of any size line up cleanly with no overlap. */
  outDir?: [number, number];
}

const EMISSIVE_HINT = /light|neon|glass|screen|banner|letter|sign|decal/i;
const MATERIAL_MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
] as const;

export type InstancedMaterialTransform = (
  material: THREE.Material,
  materialVariant: string,
) => THREE.Material;
export type InstancedColorResolver = (
  item: Placement,
  material: THREE.Material,
) => THREE.ColorRepresentation | undefined;

const HUMAN_PALETTES = new Map(
  HUMAN_VARIANTS.map((variant) => [variant.id, variant]),
);

export function stylePedestrianMaterial(
  material: THREE.Material,
  _variant: string,
): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    return material;
  }
  const name = material.name.toLowerCase();
  let roughness = 0.68;
  let metalness = 0.08;
  if (name === 'material') {
    roughness = 0.82;
    metalness = 0;
  } else if (name === 'black') {
    roughness = 0.78;
    metalness = 0.02;
  } else if (name === 'accent') {
    roughness = 0.74;
    metalness = 0.03;
  } else if (name === 'accent_dark') {
    roughness = 0.8;
    metalness = 0.04;
  } else if (name === 'blade' || name === 'blade_edge') {
    roughness = name === 'blade_edge' ? 0.66 : 0.72;
    metalness = name === 'blade_edge' ? 0.12 : 0.08;
  }
  material.color.set(0xffffff);
  material.roughness = roughness;
  material.metalness = metalness;
  material.emissive.set(0x000000);
  material.emissiveIntensity = 0;
  material.toneMapped = true;
  material.needsUpdate = true;
  return material;
}

export function pedestrianInstanceColor(
  item: Pick<Placement, 'materialVariant'>,
  material: THREE.Material,
): THREE.ColorRepresentation | undefined {
  const palette = HUMAN_PALETTES.get(
    item.materialVariant as HumanVariantId,
  );
  if (!palette) return undefined;
  const name = material.name.toLowerCase();
  if (name === 'material') return palette.skin;
  if (name === 'black') return palette.hair;
  if (name === 'accent') return palette.shirt;
  if (name === 'accent_dark') return palette.pants;
  if (name === 'blade' || name === 'blade_edge') return palette.accent;
  return palette.jacket;
}

function tuneClonedMaterial(c: THREE.Material): THREE.Material {
  const standard = c as THREE.MeshStandardMaterial;
  if (standard.emissive
    && (standard.emissiveMap || EMISSIVE_HINT.test(standard.name || ''))) {
    standard.emissiveIntensity = 1.6;
  }
  // FrontSide: backface culling halves the rasterized fragments on every
  // building (measured -20% GPU frame time at t=0.2 on an integrated Radeon).
  // Files whose shells are genuinely hollow and read see-through from the ride
  // are listed in DOUBLE_SIDED_FILES and keep both faces.
  standard.side = THREE.FrontSide;
  return c;
}

/** KitBash files whose open shells look see-through with backface culling
 *  (verified by scouting the ride); everything else renders FrontSide. */
const DOUBLE_SIDED_FILES = new Set<string>([]);

/**
 * Clone before applying any optional per-instancer styling so cached useGLTF
 * materials remain immutable and reusable by other scene consumers.
 */
export function cloneInstancedMaterial(
  material: THREE.Material,
  transform?: InstancedMaterialTransform,
  materialVariant = 'default',
  file?: string,
): THREE.Material {
  const cloned = material.clone();
  const tuned = transform
    ? transform(cloned, materialVariant)
    : tuneClonedMaterial(cloned);
  if (file && DOUBLE_SIDED_FILES.has(file)) tuned.side = THREE.DoubleSide;
  return tuned;
}

/**
 * The per-instance world transform, independent of which mesh-part it applies
 * to. Identical across all of a file's material-parts, so compute it once per
 * instance and reuse — see composePlacementMatrix / InstancedSpatialChunk.
 */
export function composeItemInstanceMatrix(
  item: Placement,
  footRadius: number,
  height: number,
  targetHeight: number | undefined,
): THREE.Matrix4 {
  const scale = calculateRenderedScale(
    {
      size: { x: footRadius * 2, y: height, z: 0 },
      sourceRadius: footRadius,
    },
    {
      scale: item.scale,
      foot: item.foot,
      targetHeight,
    },
  );
  let x = item.position[0];
  let z = item.position[2];
  if (item.centerOffset) {
    x += item.centerOffset[0];
    z += item.centerOffset[1];
  } else if (item.outDir) {
    const radius = footRadius * scale;
    x += item.outDir[0] * radius;
    z += item.outDir[1] * radius;
  }
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, item.position[1], z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, item.rotationY, 0),
    ),
    new THREE.Vector3(
      scale * (item.buildScale ?? 1),
      scale,
      scale * (item.buildScale ?? 1),
    ),
  );
}

export function composePlacementMatrix(
  item: Placement,
  footRadius: number,
  height: number,
  targetHeight: number | undefined,
  local: THREE.Matrix4,
): THREE.Matrix4 {
  const instance = composeItemInstanceMatrix(item, footRadius, height, targetHeight);
  return instance.multiply(local);
}

export function applyInstanceMatrices(
  mesh: THREE.InstancedMesh,
  matrices: THREE.Matrix4[],
): void {
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function applyInstanceColors<T extends Placement>(
  mesh: THREE.InstancedMesh,
  items: T[],
  material: THREE.Material,
  resolver: InstancedColorResolver,
): void {
  const colors = items.map((item) => resolver(item, material));
  if (colors.every((color) => color === undefined)) return;
  const resolved = new THREE.Color();
  colors.forEach((color, index) => {
    resolved.set(color ?? 0xffffff);
    mesh.setColorAt(index, resolved);
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function createOwnedMaterialDisposer(
  materials: THREE.Material[],
): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const material of new Set(materials)) material.dispose();
  };
}

/**
 * GPU-instances every mesh of one GLB across many placements. Draw calls =
 * (#meshes × #material-groups) per file, independent of instance count — so the
 * city can be dense. Each placement is grounded (file bbox min.y → 0).
 */
function createGeometryView(
  source: THREE.BufferGeometry,
  start: number,
  count: number,
): THREE.BufferGeometry {
  const view = new THREE.BufferGeometry();
  view.name = `${source.name || 'geometry'}:${start}:${count}`;
  view.setIndex(source.getIndex());
  for (const [name, attribute] of Object.entries(source.attributes)) {
    view.setAttribute(name, attribute);
  }
  view.morphAttributes = source.morphAttributes;
  view.morphTargetsRelative = source.morphTargetsRelative;
  view.setDrawRange(start, count);
  view.boundingBox = source.boundingBox?.clone() ?? null;
  view.boundingSphere = source.boundingSphere?.clone() ?? null;
  return view;
}

interface ResolvedInstancedPart {
  geometry: THREE.BufferGeometry;
  sourceMaterial: THREE.Material;
  material: THREE.Material;
  local: THREE.Matrix4;
}

function InstancedSpatialChunk({
  chunk,
  parts,
  footRadius,
  height,
  targetHeight,
  instanceColor,
}: {
  chunk: SpatialChunk<Placement>;
  parts: ResolvedInstancedPart[];
  footRadius: number;
  height: number;
  targetHeight?: number;
  instanceColor?: InstancedColorResolver;
}) {
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => () => {
    // Fiber must not recursively dispose shared geometry/materials, but every
    // keyed chunk owns its InstancedMesh buffers. Disposing the mesh releases
    // instanceMatrix/instanceColor when this chunk alone leaves the profile.
    const meshes = new Set(
      refs.current.filter(
        (mesh): mesh is THREE.InstancedMesh => mesh !== null,
      ),
    );
    for (const mesh of meshes) mesh.dispose();
  }, []);
  useLayoutEffect(() => {
    // The per-instance world transform is identical across every material-part,
    // so compute it once per instance here rather than re-deriving it (scale
    // solve + compose) inside the parts loop — that redundant work scaled with
    // parts (11-14 for a big building) and dominated the first-load setup.
    const instanceMatrices = chunk.items.map((item) => composeItemInstanceMatrix(
      item,
      footRadius,
      height,
      targetHeight,
    ));
    parts.forEach((part, partIndex) => {
      const mesh = refs.current[partIndex];
      if (!mesh) return;
      applyInstanceMatrices(
        mesh,
        instanceMatrices.map((instance) =>
          new THREE.Matrix4().multiplyMatrices(instance, part.local)),
      );
      if (instanceColor) {
        applyInstanceColors(
          mesh,
          chunk.items,
          part.sourceMaterial,
          instanceColor,
        );
      }
    });
  }, [
    chunk,
    parts,
    footRadius,
    height,
    targetHeight,
    instanceColor,
  ]);
  return (
    <>
      {parts.map((part, partIndex) => (
        <instancedMesh
          key={partIndex}
          name="lifecycle-spatial-chunk"
          ref={(element) => {
            refs.current[partIndex] = element;
          }}
          args={[
            part.geometry,
            part.material,
            chunk.items.length,
          ]}
          dispose={null}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </>
  );
}

/**
 * Single InstancedMesh for a whole file whose material-parts have been merged
 * into one grouped geometry (see mergedParts in InstancedFile). The per-instance
 * matrix buffer is built and filled ONCE here instead of once per material-part
 * — the ~14x win for a big building — with pixel-identical output because each
 * part's local transform was baked into the merged geometry.
 */
function InstancedMergedChunk({
  chunk,
  geometry,
  materials,
  footRadius,
  height,
  targetHeight,
}: {
  chunk: SpatialChunk<Placement>;
  geometry: THREE.BufferGeometry;
  /** A material array for grouped geometry, or one material for a groupless
   *  (texture-array merged) geometry. */
  materials: THREE.Material[] | THREE.Material;
  footRadius: number;
  height: number;
  targetHeight?: number;
}) {
  const ref = useRef<THREE.InstancedMesh | null>(null);
  useLayoutEffect(() => () => {
    ref.current?.dispose();
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    applyInstanceMatrices(
      mesh,
      chunk.items.map((item) => composeItemInstanceMatrix(
        item,
        footRadius,
        height,
        targetHeight,
      )),
    );
  }, [chunk, geometry, footRadius, height, targetHeight]);
  return (
    <instancedMesh
      name="lifecycle-merged-chunk"
      ref={ref}
      args={[geometry, materials, chunk.items.length]}
      dispose={null}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

// The two most triangle-dense city models cost far more than they're worth for a
// scroll-past background: LG_C_Main is 256K tris (×19 placements) and BuildingC
// is 113K (×30). Substitute lighter look-alikes — a tall tower and a small
// building — scaled to fill each original's bounding box (see InstancedFile) so
// the native-scale layout is unchanged and nothing overlaps. Removes ~5.8M
// triangles from the heavy intro/about shots. Delete this map to restore the
// original models.
const HEAVY_MODEL_SWAPS: Record<string, string> = {
  'neocity/KB3D_NEC_BldgLG_C_Main.glb': 'neocity/KB3D_NEC_BldgLG_B_Main.glb',
  'neocity/KB3D_NEC_BldgLG_A_BuildingC.glb': 'neocity/KB3D_NEC_BldgLG_A_BuildingA.glb',
};

function InstancedFile({
  file,
  items,
  targetHeight,
  materialTransform,
  instanceColor,
  inspectionGroupName,
}: {
  file: string;
  items: Placement[];
  targetHeight?: number;
  materialTransform?: InstancedMaterialTransform;
  instanceColor?: InstancedColorResolver;
  inspectionGroupName?: string;
}) {
  const renderFile = HEAVY_MODEL_SWAPS[file] ?? file;
  const { scene } = useGLTF('/models/' + renderFile);
  const { sourceParts, footRadius, height } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    // Ground (min.y → 0) AND recentre the footprint in X/Z so the placement
    // origin equals the building centre (KitBash origins are often way off).
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const ground = new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz);
    // Heavy-model substitution: non-uniformly rescale the (lighter) substitute to
    // the ORIGINAL model's bounding box so it fills exactly the slot the layout
    // packed. Placements render at native scale, so the box must match or the
    // swapped building would resize and overlap its neighbours.
    let sizeX = box.max.x - box.min.x;
    let sizeY = box.max.y - box.min.y;
    let sizeZ = box.max.z - box.min.z;
    let prescale: THREE.Matrix4 | null = null;
    if (renderFile !== file) {
      const orig = BUILDING_CATALOG.get(file)?.size;
      if (orig) {
        prescale = new THREE.Matrix4().makeScale(
          orig.x / (sizeX || 1),
          orig.y / (sizeY || 1),
          orig.z / (sizeZ || 1),
        );
        sizeX = orig.x; sizeY = orig.y; sizeZ = orig.z;
      }
    }
    const radius = 0.5 * Math.hypot(sizeX, sizeZ) || 1;
    const out: {
      geometry: THREE.BufferGeometry;
      sourceMaterial: THREE.Material;
      drawRange?: { start: number; count: number };
      local: THREE.Matrix4;
    }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(
        ground,
        m.matrixWorld,
      );
      if (prescale) local.premultiply(prescale);
      if (Array.isArray(m.material)) {
        for (const group of m.geometry.groups) {
          const sourceMaterial = m.material[group.materialIndex ?? 0];
          if (!sourceMaterial) continue;
          out.push({
            geometry: m.geometry,
            sourceMaterial,
            drawRange: { start: group.start, count: group.count },
            local,
          });
        }
      } else {
        out.push({
          geometry: m.geometry,
          sourceMaterial: m.material,
          local,
        });
      }
    });
    return {
      sourceParts: out,
      footRadius: radius,
      height: sizeY || 1,
    };
  }, [scene, file, renderFile]);

  const owned = useCommittedThreeResource(
    `instanced:${file}`,
    ({ own }) => {
      const resources: Array<THREE.Material | THREE.BufferGeometry> = [];
      // Texture-array path (see kitbashArrayMaterial): every opaque PBR part of
      // the file merges into ONE geometry drawn with ONE shared material, so the
      // whole building is a single draw per zone instead of one per material
      // part. Parts the array can't express (transparent, alpha-tested,
      // emissive-mapped, multi-material draw ranges) stay on the per-part path.
      let arrayGeometries: THREE.BufferGeometry[] = [];
      let arrayMaterial: THREE.Material | null = null;
      let remainingParts = sourceParts;
      if (!materialTransform && !instanceColor) {
        const array = kitbashTextureArray();
        const merged: THREE.BufferGeometry[] = [];
        const rest: typeof sourceParts = [];
        for (const part of sourceParts) {
          const sm = part.sourceMaterial as THREE.MeshStandardMaterial;
          const eligible = sm.isMeshStandardMaterial
            && !part.drawRange
            && !sm.transparent
            && sm.alphaTest === 0
            && !sm.emissiveMap
            && !sm.alphaMap
            && part.geometry.getAttribute('position') !== undefined;
          const layer = eligible
            ? (sm.map ? array.layerForTexture(sm.map) : array.layerForColor(sm.color))
            : -1;
          if (!eligible || layer < 0) { rest.push(part); continue; }
          const g = part.geometry.clone();
          for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
          }
          if (!g.getAttribute('normal')) g.computeVertexNormals();
          const count = g.getAttribute('position').count;
          if (!g.getAttribute('uv')) {
            g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
          }
          const emissive = kitbashPartEmissive(sm);
          const q = (v: number) => Math.round(THREE.MathUtils.clamp(v * KITBASH_EMISSIVE_SCALE, 0, 255));
          const er = q(emissive.r); const eg = q(emissive.g); const eb = q(emissive.b);
          const packed = new Uint8Array(count * 4);
          for (let i = 0; i < count; i += 1) {
            packed[i * 4] = layer;
            packed[i * 4 + 1] = er;
            packed[i * 4 + 2] = eg;
            packed[i * 4 + 3] = eb;
          }
          g.setAttribute(KITBASH_PACKED_ATTRIBUTE, new THREE.BufferAttribute(packed, 4, false));
          g.applyMatrix4(part.local);
          g.clearGroups();
          merged.push(g);
        }
        if (merged.length > 0) {
          // mergeGeometries needs all-indexed or all-non-indexed input. Give the
          // few non-indexed parts a trivial index rather than expanding every
          // indexed part (which would triple the vertex work on the GPU).
          for (const g of merged) {
            if (g.index) continue;
            const count = g.getAttribute('position').count;
            const index = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
            for (let i = 0; i < count; i += 1) index[i] = i;
            g.setIndex(new THREE.BufferAttribute(index, 1));
          }
          // Batch parts so each merged geometry stays under 65,535 vertices and
          // keeps a 16-bit index: one 32-bit index for a whole tower doubled the
          // index bandwidth and showed up as +2 ms GPU on an integrated Radeon.
          const UINT16_LIMIT = 65535;
          const sorted = [...merged].sort(
            (a, b) => b.getAttribute('position').count - a.getAttribute('position').count,
          );
          const batches: THREE.BufferGeometry[][] = [];
          for (const g of sorted) {
            const n = g.getAttribute('position').count;
            const batch = batches.find((b) =>
              b.reduce((sum, x) => sum + x.getAttribute('position').count, 0) + n <= UINT16_LIMIT);
            if (batch) batch.push(g); else batches.push([g]);
          }
          const fusedAll: THREE.BufferGeometry[] = [];
          for (const batch of batches) {
            const fused = batch.length === 1 ? batch[0] : mergeGeometries(batch, false);
            if (fused) fusedAll.push(fused);
          }
          for (const g of merged) if (!fusedAll.includes(g)) g.dispose();
          if (fusedAll.length > 0) {
            arrayGeometries = fusedAll.map((g) => own(g));
            resources.push(...fusedAll);
            arrayMaterial = kitbashArrayMaterial(
              DOUBLE_SIDED_FILES.has(file) ? THREE.DoubleSide : THREE.FrontSide,
            );
            remainingParts = rest;
          }
        }
      }
      const parts = remainingParts.map((part) => {
        const material = own(cloneInstancedMaterial(
          part.sourceMaterial,
          materialTransform,
          'default',
          file,
        ));
        const geometry = part.drawRange
          ? own(createGeometryView(
              part.geometry,
              part.drawRange.start,
              part.drawRange.count,
            ))
          : part.geometry;
        resources.push(material);
        if (geometry !== part.geometry) resources.push(geometry);
        return { ...part, geometry, material };
      });
      // Collapse the file's material-parts into ONE grouped geometry + material
      // array so the whole file instances as a single InstancedMesh per chunk
      // (one matrix buffer instead of one-per-part). Only when per-instance
      // coloring is off (that needs per-part instanceColor buffers) and every
      // part shares an attribute layout mergeGeometries can fuse; otherwise fall
      // back to per-part InstancedSpatialChunk.
      let merged: { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null = null;
      if (!instanceColor && parts.length > 1 && parts.every((p) => !p.drawRange)) {
        const sig = (g: THREE.BufferGeometry) =>
          `${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}`;
        const base = sig(parts[0].geometry);
        if (parts.every((p) => sig(p.geometry) === base)) {
          const baked = parts.map((p) => p.geometry.clone().applyMatrix4(p.local));
          try {
            const geometry = mergeGeometries(baked, true);
            if (geometry) {
              resources.push(own(geometry));
              merged = { geometry, materials: parts.map((p) => p.material) };
            }
          } catch {
            merged = null;
          }
          baked.forEach((g) => g.dispose());
        }
      }
      return { value: { parts, merged, arrayGeometries, arrayMaterial }, resources };
    },
    [sourceParts, materialTransform, instanceColor, file],
  );
  const parts = owned?.parts ?? [];
  const sourceMaterials = useMemo(
    () => sourceParts.map(({ sourceMaterial }) => sourceMaterial),
    [sourceParts],
  );
  const sourceMapCount = useMemo(() => sourceMaterials.reduce(
    (count, material) => count + MATERIAL_MAP_KEYS.filter((key) =>
      (material as unknown as Record<string, unknown>)[key] instanceof THREE.Texture,
    ).length,
    0,
  ), [sourceMaterials]);
  const sourcePbrMaterialCount = useMemo(() => sourceMaterials.filter(
    (material) =>
      material instanceof THREE.MeshStandardMaterial
      || material instanceof THREE.MeshPhysicalMaterial,
  ).length, [sourceMaterials]);
  // Chunk granularity is device-adaptive: weak (CPU-bound) tiers use larger
  // chunks to submit fewer InstancedMesh draw calls, since their GPU sits idle
  // and draw-call submission is the real per-frame cost (see deviceQuality).
  const chunkSize = resolveQuality().instanceChunkSize;
  const chunks = useMemo(() => buildSpatialChunks(items, chunkSize), [items, chunkSize]);

  if (!owned) return null;

  const merged = owned.merged;
  const { arrayGeometries, arrayMaterial } = owned;
  const content = (
    <>
      {chunks.map((chunk) => (
        <Fragment key={chunk.id}>
          {arrayMaterial && arrayGeometries.map((geometry, index) => (
            <InstancedMergedChunk
              key={index}
              chunk={chunk}
              geometry={geometry}
              materials={arrayMaterial}
              footRadius={footRadius}
              height={height}
              targetHeight={targetHeight}
            />
          ))}
          {merged ? (
            <InstancedMergedChunk
              chunk={chunk}
              geometry={merged.geometry}
              materials={merged.materials}
              footRadius={footRadius}
              height={height}
              targetHeight={targetHeight}
            />
          ) : parts.length > 0 ? (
            <InstancedSpatialChunk
              chunk={chunk}
              parts={parts}
              footRadius={footRadius}
              height={height}
              targetHeight={targetHeight}
              instanceColor={instanceColor}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  );
  return inspectionGroupName ? (
    <group
      name={inspectionGroupName}
      userData={{
        sourceFile: file,
        placementCount: items.length,
        sourceMapCount,
        sourcePbrMaterialCount,
      }}
    >
      {content}
    </group>
  ) : content;
}

// Progressive mount: how many file-groups to add per macrotask tick, and how
// long to wait between ticks. Each tick's commit runs the per-instance matrix
// construction (InstancedSpatialChunk's useLayoutEffect) synchronously, so
// spreading the file groups across setTimeout ticks keeps that ~1.6s of matrix
// work — which asset shrinking does NOT reduce (it is per-instance, not
// per-vertex) — from landing as one long frame at first load. setTimeout (not
// rAF) so it keeps draining even in a backgrounded/throttled tab.
const PROGRESSIVE_BATCH = 3;
const PROGRESSIVE_DELAY_MS = 24;

/** Groups placements by file and instances each file. */
export function InstancedPieces({
  placements,
  targetHeight,
  materialTransform,
  instanceColor,
  inspectionGroupName,
  progressive = false,
  onComplete,
}: {
  placements: Placement[];
  /** Uniformly normalize each source GLB to this world-space height. */
  targetHeight?: number;
  /** Optional styling applied only to cloned instance materials. */
  materialTransform?: InstancedMaterialTransform;
  /** Optional per-placement color, applied without splitting spatial chunks. */
  instanceColor?: InstancedColorResolver;
  /** Optional dev-only group name emitted after GLB/material resolution. */
  inspectionGroupName?: string;
  /** Mount file-groups a few at a time (setTimeout-paced) instead of all at
   *  once, and wrap each in its own Suspense so one uncached GLB never blanks
   *  its already-committed siblings. */
  progressive?: boolean;
  /** Fired once every file-group has been scheduled to mount. */
  onComplete?: () => void;
}) {
  const groups = useMemo(() => {
    const g = new Map<string, {
      file: string;
      items: Placement[];
    }>();
    for (const placement of placements) {
      const key = placement.file;
      const group = g.get(key) ?? {
        file: placement.file,
        items: [],
      };
      group.items.push(placement);
      g.set(key, group);
    }
    return [...g].sort(([a], [b]) => a.localeCompare(b));
  }, [placements]);

  const total = groups.length;
  const [count, setCount] = useState(
    progressive ? Math.min(PROGRESSIVE_BATCH, total) : total,
  );
  // Reset the reveal window whenever the group set changes (e.g. the async
  // full-visibility layout swaps in over the buildings-only bootstrap).
  useEffect(() => {
    setCount(progressive ? Math.min(PROGRESSIVE_BATCH, total) : total);
  }, [progressive, total]);
  // Drain the remaining groups one batch per macrotask.
  useEffect(() => {
    if (!progressive || count >= total) return undefined;
    const id = setTimeout(
      () => setCount((current) => Math.min(current + PROGRESSIVE_BATCH, total)),
      PROGRESSIVE_DELAY_MS,
    );
    return () => clearTimeout(id);
  }, [progressive, count, total]);

  const done = count >= total;
  useEffect(() => {
    if (done) onComplete?.();
  }, [done, onComplete]);

  const visible = progressive ? groups.slice(0, count) : groups;
  return (
    <>
      {visible.map(([key, { file, items }]) => {
        const piece = (
          <InstancedFile
            key={key}
            file={file}
            items={items}
            targetHeight={targetHeight}
            materialTransform={materialTransform}
            instanceColor={instanceColor}
            inspectionGroupName={inspectionGroupName}
          />
        );
        return progressive
          ? <Suspense key={key} fallback={null}>{piece}</Suspense>
          : piece;
      })}
    </>
  );
}
