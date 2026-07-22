import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { calculateRenderedScale } from '../../world/buildingCatalog';
import { useCommittedThreeResource } from './useCommittedThreeResources';

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
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

export type InstancedMaterialTransform = (
  material: THREE.Material,
) => THREE.Material;

function tuneClonedMaterial(c: THREE.Material): THREE.Material {
  const standard = c as THREE.MeshStandardMaterial;
  if (standard.emissive
    && (standard.emissiveMap || EMISSIVE_HINT.test(standard.name || ''))) {
    standard.emissiveIntensity = 1.6;
  }
  return c;
}

/**
 * Clone before applying any optional per-instancer styling so cached useGLTF
 * materials remain immutable and reusable by other scene consumers.
 */
export function cloneInstancedMaterial(
  material: THREE.Material,
  transform?: InstancedMaterialTransform,
): THREE.Material {
  const cloned = material.clone();
  return transform ? transform(cloned) : tuneClonedMaterial(cloned);
}

export const INSTANCE_CHUNK_SIZE = 180;

export interface SpatialChunk<T> {
  id: string;
  items: T[];
}

export function buildSpatialChunks<T extends {
  position: [number, number, number];
}>(
  items: T[],
  chunkSize = INSTANCE_CHUNK_SIZE,
): SpatialChunk<T>[] {
  const chunks = new Map<string, T[]>();
  for (const item of items) {
    const x = Math.floor(item.position[0] / chunkSize);
    const z = Math.floor(item.position[2] / chunkSize);
    const id = `${x}:${z}`;
    const chunk = chunks.get(id) ?? [];
    chunk.push(item);
    chunks.set(id, chunk);
  }
  return [...chunks]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([id, members]) => ({ id, items: members }));
}

export function composePlacementMatrix(
  item: Placement,
  footRadius: number,
  height: number,
  targetHeight: number | undefined,
  local: THREE.Matrix4,
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
  const instance = new THREE.Matrix4().compose(
    new THREE.Vector3(x, item.position[1], z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, item.rotationY, 0),
    ),
    new THREE.Vector3(scale, scale, scale),
  );
  return new THREE.Matrix4().multiplyMatrices(instance, local);
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
function InstancedFile({
  file,
  items,
  targetHeight,
  materialTransform,
}: {
  file: string;
  items: Placement[];
  targetHeight?: number;
  materialTransform?: InstancedMaterialTransform;
}) {
  const { scene } = useGLTF('/models/' + file);
  const { sourceParts, footRadius, height } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    // Ground (min.y → 0) AND recentre the footprint in X/Z so the placement
    // origin equals the building centre (KitBash origins are often way off).
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const ground = new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz);
    const sizeX = box.max.x - box.min.x, sizeZ = box.max.z - box.min.z;
    const radius = 0.5 * Math.hypot(sizeX, sizeZ) || 1;
    const out: {
      geometry: THREE.BufferGeometry;
      sourceMaterial: THREE.Material | THREE.Material[];
      local: THREE.Matrix4;
    }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      out.push({
        geometry: m.geometry,
        sourceMaterial: m.material,
        local: new THREE.Matrix4().multiplyMatrices(ground, m.matrixWorld),
      });
    });
    return {
      sourceParts: out,
      footRadius: radius,
      height: box.max.y - box.min.y || 1,
    };
  }, [scene]);

  const owned = useCommittedThreeResource(
    `instanced:${file}`,
    ({ own }) => {
      const resources: THREE.Material[] = [];
      const parts = sourceParts.map((part) => {
        const material = Array.isArray(part.sourceMaterial)
          ? part.sourceMaterial.map((source) =>
              own(cloneInstancedMaterial(source, materialTransform)))
          : own(cloneInstancedMaterial(part.sourceMaterial, materialTransform));
        resources.push(...(Array.isArray(material) ? material : [material]));
        return { ...part, material };
      });
      return { value: { parts }, resources };
    },
    [sourceParts, materialTransform],
  );
  const parts = owned?.parts ?? [];
  const chunks = useMemo(() => buildSpatialChunks(items), [items]);
  const refs = useRef<(THREE.InstancedMesh | null)[][]>([]);
  useLayoutEffect(() => {
    parts.forEach((part, pi) => {
      chunks.forEach((chunk, chunkIndex) => {
        const mesh = refs.current[pi]?.[chunkIndex];
        if (!mesh) return;
        const matrices = chunk.items.map((item) =>
          composePlacementMatrix(
            item,
            footRadius,
            height,
            targetHeight,
            part.local,
          ));
        applyInstanceMatrices(mesh, matrices);
      });
    });
  }, [chunks, parts, footRadius, height, targetHeight]);

  if (!owned) return null;

  return (
    <>
      {parts.flatMap((part, partIndex) =>
        chunks.map((chunk, chunkIndex) => (
          <instancedMesh
            key={`${partIndex}:${chunk.id}`}
            name="lifecycle-spatial-chunk"
            ref={(element) => {
              const partRefs = refs.current[partIndex] ?? [];
              partRefs[chunkIndex] = element;
              refs.current[partIndex] = partRefs;
            }}
            args={[
              part.geometry,
              part.material as THREE.Material,
              chunk.items.length,
            ]}
            dispose={null}
            castShadow={false}
            receiveShadow={false}
          />
        )))}
    </>
  );
}

/** Groups placements by file and instances each file. */
export function InstancedPieces({
  placements,
  targetHeight,
  materialTransform,
}: {
  placements: Placement[];
  /** Uniformly normalize each source GLB to this world-space height. */
  targetHeight?: number;
  /** Optional styling applied only to cloned instance materials. */
  materialTransform?: InstancedMaterialTransform;
}) {
  const groups = useMemo(() => {
    const g: Record<string, Placement[]> = {};
    for (const p of placements) (g[p.file] ??= []).push(p);
    return g;
  }, [placements]);
  return (
    <>
      {Object.entries(groups).map(([file, items]) => (
        <InstancedFile
          key={file}
          file={file}
          items={items}
          targetHeight={targetHeight}
          materialTransform={materialTransform}
        />
      ))}
    </>
  );
}
