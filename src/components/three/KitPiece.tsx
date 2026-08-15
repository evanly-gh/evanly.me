import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const EMISSIVE_HINT = /light|neon|glass|screen|banner|letter|sign|decal/i;

/**
 * One placed KitBash piece. Clones the cached GLTF (so a piece can appear many
 * times), tunes emissive materials so neon reads under bloom, and drops the
 * piece onto the ground (shifts so its bbox min.y = 0).
 */
export function KitPiece({
  file,
  position,
  rotationY = 0,
  center = false,
  scale = 1,
}: {
  file: string;
  position: [number, number, number];
  rotationY?: number;
  /** Recentre the footprint in X/Z so `position` is the piece centre. */
  center?: boolean;
  /** Uniform scale applied before grounding/centering (gallery size normalization). */
  scale?: number;
}) {
  const { scene } = useGLTF('/models/' + file);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const raw of mats) {
        const mat = raw as THREE.MeshStandardMaterial;
        if (!mat) continue;
        // Building shells (esp. glass) ship as single-sided FrontSide meshes with
        // inward-facing back walls; from outside you see straight through the
        // culled faces into the empty interior ("hollow"). Render both sides so
        // the shell reads solid. (City instances get this via tuneClonedMaterial;
        // the gallery renders raw GLTFs through here, so it needs the same fix.)
        mat.side = THREE.DoubleSide;
        if (mat.emissive && (mat.emissiveMap || EMISSIVE_HINT.test(mat.name || ''))) {
          mat.emissiveIntensity = 1.6;
        }
      }
    });
    if (scale !== 1) c.scale.setScalar(scale);
    c.updateMatrixWorld(true); // ensure child world matrices are current before measuring
    const box = new THREE.Box3().setFromObject(c);
    if (Number.isFinite(box.min.y)) c.position.y -= box.min.y; // sit on the ground
    if (center && Number.isFinite(box.min.x)) {
      c.position.x -= (box.min.x + box.max.x) / 2;
      c.position.z -= (box.min.z + box.max.z) / 2;
    }
    return c;
  }, [scene, center, scale]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={obj} />
    </group>
  );
}
