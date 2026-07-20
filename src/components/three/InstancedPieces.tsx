import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
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
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const ground = new THREE.Matrix4().makeTranslation(0, -box.min.y, 0);
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const material = Array.isArray(m.material) ? m.material.map(tuneMat) : tuneMat(m.material);
      out.push({ geometry: m.geometry, material, local: new THREE.Matrix4().multiplyMatrices(ground, m.matrixWorld) });
    });
    return out;
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
        const s = it.scale ?? 1;
        q.setFromEuler(new THREE.Euler(0, it.rotationY, 0));
        pos.set(it.position[0], it.position[1], it.position[2]);
        scl.set(s, s, s);
        itemM.compose(pos, q, scl);
        out.multiplyMatrices(itemM, part.local);
        im.setMatrixAt(ii, out);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    });
  }, [parts, items]);

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
