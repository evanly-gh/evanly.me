import * as THREE from 'three';
import { roadFrame } from './route';

/**
 * Sweep a flat ribbon along the route frame. `offset` shifts the ribbon centre
 * sideways (along the binormal) so the same helper builds the road deck and the
 * thin glowing edge/centre strips. `lift` raises it slightly to avoid z-fight.
 * UV.v accumulates real distance so textures tile without stretching.
 */
export function buildRibbon(
  halfWidth: number,
  { offset = 0, lift = 0, steps = 700, vScale = 0.04 } = {}
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let dist = 0;
  let prevCenter: THREE.Vector3 | null = null;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const f = roadFrame(t);
    const center = f.pos.clone()
      .addScaledVector(f.binormal, offset)
      .addScaledVector(f.normal, lift);
    if (prevCenter) dist += center.distanceTo(prevCenter);
    prevCenter = center;

    const left = center.clone().addScaledVector(f.binormal, halfWidth);
    const right = center.clone().addScaledVector(f.binormal, -halfWidth);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(f.normal.x, f.normal.y, f.normal.z, f.normal.x, f.normal.y, f.normal.z);
    const v = dist * vScale;
    uvs.push(0, v, 1, v);

    if (i < steps) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}
