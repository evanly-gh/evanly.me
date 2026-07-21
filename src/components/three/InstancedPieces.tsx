import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
  /** Max footprint radius (m). The instance is uniformly scaled so its
   *  circumscribed footprint never exceeds this — guarantees no road overlap. */
  foot?: number;
  /** Unit outward (away-from-road) direction [x,z]. If set, the instance is
   *  pushed out by its effective footprint radius so its near face lands on the
   *  sidewalk edge — buildings of any size line up cleanly with no overlap. */
  outDir?: [number, number];
}

const EMISSIVE_HINT = /light|neon|glass|screen|banner|letter|sign|decal/i;

function tuneMat(m: THREE.Material): THREE.Material {
  const c = m.clone() as THREE.MeshStandardMaterial;
  if (c.emissive && (c.emissiveMap || EMISSIVE_HINT.test(c.name || ''))) c.emissiveIntensity = 1.6;
  return c;
}

/**
 * GPU-instances every mesh of one GLB across many placements. Draw calls =
 * (#meshes × #material-groups) per file, independent of instance count — so the
 * city can be dense. Each placement is grounded (file bbox min.y → 0).
 */
function InstancedFile({ file, items }: { file: string; items: Placement[] }) {
  const { scene } = useGLTF('/models/' + file);
  const { parts, footRadius } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    // Ground (min.y → 0) AND recentre the footprint in X/Z so the placement
    // origin equals the building centre (KitBash origins are often way off).
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const ground = new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz);
    const sizeX = box.max.x - box.min.x, sizeZ = box.max.z - box.min.z;
    const radius = 0.5 * Math.hypot(sizeX, sizeZ) || 1;
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const material = Array.isArray(m.material) ? m.material.map(tuneMat) : tuneMat(m.material);
      out.push({ geometry: m.geometry, material, local: new THREE.Matrix4().multiplyMatrices(ground, m.matrixWorld) });
    });
    return { parts: out, footRadius: radius };
  }, [scene]);

  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    const itemM = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    parts.forEach((part, pi) => {
      const im = refs.current[pi];
      if (!im) return;
      items.forEach((it, ii) => {
        const base = it.scale ?? 1;
        // clamp footprint so the building can never spill onto the road
        const s = it.foot ? Math.min(base, it.foot / footRadius) : base;
        q.setFromEuler(new THREE.Euler(0, it.rotationY, 0));
        let px = it.position[0], pz = it.position[2];
        if (it.outDir) {
          const effR = footRadius * s; // = min(footRadius, foot)
          px += it.outDir[0] * effR;
          pz += it.outDir[1] * effR;
        }
        pos.set(px, it.position[1], pz);
        scl.set(s, s, s);
        itemM.compose(pos, q, scl);
        out.multiplyMatrices(itemM, part.local);
        im.setMatrixAt(ii, out);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }, [parts, footRadius, items]);

  return (
    <>
      {parts.map((part, pi) => (
        <instancedMesh
          key={pi}
          ref={(el) => { refs.current[pi] = el; }}
          args={[part.geometry, part.material as THREE.Material, items.length]}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </>
  );
}

/** Groups placements by file and instances each file. */
export function InstancedPieces({ placements }: { placements: Placement[] }) {
  const groups = useMemo(() => {
    const g: Record<string, Placement[]> = {};
    for (const p of placements) (g[p.file] ??= []).push(p);
    return g;
  }, [placements]);
  return (
    <>
      {Object.entries(groups).map(([file, items]) => (
        <InstancedFile key={file} file={file} items={items} />
      ))}
    </>
  );
}
