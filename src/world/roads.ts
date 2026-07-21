import * as THREE from 'three';
import { sampleRoute } from './route';

const UP = new THREE.Vector3(0, 1, 0);

export interface RoadDef {
  curve: THREE.CatmullRomCurve3;
  halfWidth: number;
  ground: boolean; // ground roads carve the building grid; elevated ones pass over
  level: number;   // y of the road deck
}

// ── Main city road: the approved route, but FLATTENED to ground level (y=0) so
//    the street stays level; the ramps/scaffold/bridge are separate assets. ──
const mainPts: THREE.Vector3[] = [];
for (let i = 0; i <= 90; i++) {
  const p = sampleRoute(i / 90).pos;
  mainPts.push(new THREE.Vector3(p.x, 0, p.z));
}
const mainCurve = new THREE.CatmullRomCurve3(mainPts, false, 'centripetal', 0.5);

// ── One secondary ground cross-street (an intersection for variety) ──
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const cross = new THREE.CatmullRomCurve3(
  [V(90, 0, -120), V(-40, 0, -60), V(-200, 0, -30)], false, 'centripetal', 0.5);

// ── Elevated curved highway sweeping over the scene (multi-level, dynamic) ──
const hwy = new THREE.CatmullRomCurve3(
  [V(-380, 40, -420), V(-120, 46, -240), V(160, 52, -60), V(360, 44, -260)],
  false, 'centripetal', 0.5);

export const ROADS: RoadDef[] = [
  { curve: mainCurve, halfWidth: 11, ground: true, level: 0 },
  { curve: cross, halfWidth: 7, ground: true, level: 0 },
  { curve: hwy, halfWidth: 8, ground: false, level: 0 },
];

// ── Keep-clear zones (rectangles) — the ramp/scaffold stunt corridor; the city
//    grid must not place buildings/props here. ──
interface Rect { x0: number; x1: number; z0: number; z1: number }
export const KEEP_CLEAR: Rect[] = [
  { x0: 224, x1: 320, z0: -272, z1: -50 }, // ramps + scaffold deck + scaffold building
];
export function keepClear(x: number, z: number): boolean {
  for (const r of KEEP_CLEAR) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  return false;
}

/** Sweep a flat ribbon along an arbitrary curve, frame kept horizontal. */
export function buildCurveRibbon(
  curve: THREE.CatmullRomCurve3,
  halfWidth: number,
  { offset = 0, lift = 0, steps = 400, vScale = 0.06 } = {}
): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).setY(0).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, UP).normalize();
    const nrm = new THREE.Vector3().crossVectors(bin, tan).normalize();
    const c = p.clone().addScaledVector(bin, offset).addScaledVector(UP, lift);
    if (prev) dist += c.distanceTo(prev);
    prev = c;
    const l = c.clone().addScaledVector(bin, halfWidth);
    const r = c.clone().addScaledVector(bin, -halfWidth);
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
    nor.push(nrm.x, nrm.y, nrm.z, nrm.x, nrm.y, nrm.z);
    const v = dist * vScale;
    uv.push(0, v, 1, v);
    if (i < steps) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ── Ground-road collision samples (for carving the building grid) ──
interface Sample { x: number; z: number; hw: number }
const groundSamples: Sample[] = [];
for (const r of ROADS) {
  if (!r.ground) continue;
  const n = Math.max(24, Math.floor(r.curve.getLength() / 8));
  for (let i = 0; i <= n; i++) {
    const p = r.curve.getPointAt(i / n);
    groundSamples.push({ x: p.x, z: p.z, hw: r.halfWidth });
  }
}

/** Signed clearance (m) from (x,z) to the nearest GROUND road EDGE. <0 = on a road. */
export function groundRoadClearance(x: number, z: number): number {
  let min = Infinity;
  for (const s of groundSamples) {
    const d = Math.hypot(x - s.x, z - s.z) - s.hw;
    if (d < min) min = d;
  }
  return min;
}

/** Sample points + frames along ground roads (for placing edge props/buildings). */
export function groundRoadEdgePoints(spacing = 26): { pos: THREE.Vector3; tan: THREE.Vector3; bin: THREE.Vector3; hw: number }[] {
  const out: { pos: THREE.Vector3; tan: THREE.Vector3; bin: THREE.Vector3; hw: number }[] = [];
  for (const r of ROADS) {
    if (!r.ground) continue;
    const n = Math.max(8, Math.floor(r.curve.getLength() / spacing));
    for (let i = 0; i <= n; i++) {
      const p = r.curve.getPointAt(i / n);
      const tan = r.curve.getTangentAt(i / n).setY(0).normalize();
      const bin = new THREE.Vector3().crossVectors(tan, UP).normalize();
      out.push({ pos: p, tan, bin, hw: r.halfWidth });
    }
  }
  return out;
}
