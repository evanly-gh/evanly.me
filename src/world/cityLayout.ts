import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import { groundRoadClearance, groundRoadEdgePoints } from './roads';

/**
 * City placement. A dense grid fills the WHOLE map with building blocks; the
 * road network is CARVED out (a lot is only used if its clearance exceeds the
 * building footprint) so roads read as canyons and nothing lands on a street.
 * Buildings are GPU-instanced (see InstancedPieces) so density is cheap.
 */
const P = 'KB3D_NEC_';
// Pools grouped by TRIANGLE COST (instancing saves draw calls but not vertex
// work). Heavy hero towers are used sparingly as landmarks; the bulk is light.
const HERO = [`${P}BldgLG_C_Main`, `${P}BldgLG_A_BuildingC`, `${P}BldgLG_B_Main`]; // ~120–270k tris
const TALL = [`${P}BldgLG_A_Main`, `${P}BldgMD_C_Main`];                            // ~90–150k
const MID = [`${P}BldgMD_A_Main`, `${P}BldgMD_B_Main`, `${P}BldgLG_A_BuildingB`, `${P}BldgLG_A_BuildingD`, `${P}BldgMD_C_BuildingA`]; // ~15–35k
const SMALL = [`${P}BldgSM_A_Main`, `${P}BldgSM_B_Main`, `${P}BldgSM_C_Main`];      // ~3–25k
const EDGE = [
  `${P}BldgSM_A_ConcreteBarrier`, `${P}BldgSM_C_AC`, `${P}BldgSM_C_Boxes`,
  `${P}BldgSM_C_Containers`, `${P}BldgSM_C_CratesA`, `${P}BldgSM_C_CratesB`, `${P}BldgSM_C_Pipes`,
];
const SHOP = [
  `${P}BldgSM_B_Cart`, `${P}BldgSM_B_Bbq`, `${P}BldgSM_B_Umbrella`, `${P}BldgSM_B_FridgeA`,
  `${P}BldgSM_B_FridgeB`, `${P}BldgSM_C_Shelf`, `${P}BldgSM_C_Stool`, `${P}BldgSM_B_Computers`,
  `${P}BldgSM_C_NeonSignA`, `${P}BldgSM_C_NeonSignB`, `${P}BldgSM_C_NeonSignC`, `${P}BldgSM_C_Fan`,
];
const DECOR = [`${P}BldgLG_A_Tree`, `${P}BldgMD_A_Banners`, `${P}BldgMD_C_Banners`];

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
}

const CARD = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function footHalf(name: string): number {
  if (name.includes('LG_B_Main')) return 28;
  if (name.includes('MD_C_Main')) return 26;
  if (name.includes('LG_C_Main')) return 20;
  if (name.includes('LG_A_Building')) return 17;
  if (name.includes('BldgLG')) return 17;
  if (name.includes('BldgMD')) return 19;
  if (name.includes('BldgSM')) return 6;
  return 6;
}
const g = (n: string) => `neocity/${n}.glb`;

export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const cell = 44;
  for (let x = -430; x <= 380; x += cell) {
    for (let z = -770; z <= 160; z += cell) {
      const jx = x + rng.range(-8, 8);
      const jz = z + rng.range(-8, 8);
      const clr = groundRoadClearance(jx, jz);
      if (clr < 14) continue;         // road / intersection / alley
      if (rng.chance(0.14)) continue; // a few open lots (props/trees fill these)
      // canyon: small at the street, taller deeper in — but keep heavy hero
      // towers RARE (triangle budget), bulk is light MID/SMALL.
      let pool: string[];
      if (clr < 24) pool = rng.chance(0.5) ? SMALL : MID;
      else if (clr < 58) pool = rng.chance(0.22) ? TALL : MID;
      else pool = rng.chance(0.18) ? HERO : (rng.chance(0.5) ? TALL : MID);
      let name = rng.pick(pool);
      if (clr < footHalf(name) + 3) {
        name = rng.pick(SMALL);
        if (clr < footHalf(name) + 3) continue;
      }
      out.push({ file: g(name), position: [jx, 0, jz], rotationY: rng.pick(CARD) + rng.range(-0.06, 0.06) });
    }
  }
  return out;
}

/** Street props + shop clusters + trees dressing the road edges and open lots. */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  // edge clutter + occasional shop stall along road edges
  for (const e of groundRoadEdgePoints(16)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.4)) continue;
      const off = e.hw + 2 + rng.range(0, 2);
      const base = e.pos.clone().addScaledVector(e.bin, side * off);
      const rot = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      if (rng.chance(0.3)) {
        // a little shop stall: 2-4 clustered SM_B/SM_C props
        const n = 2 + rng.int(0, 2);
        for (let i = 0; i < n; i++) {
          const p = base.clone().addScaledVector(e.bin, side * i * 2.2).addScaledVector(new THREE.Vector3(1, 0, 0), rng.range(-1.5, 1.5));
          out.push({ file: g(rng.pick(SHOP)), position: [p.x, 0, p.z], rotationY: rot + rng.range(-0.2, 0.2) });
        }
      } else {
        out.push({ file: g(rng.pick(EDGE)), position: [base.x, 0, base.z], rotationY: rot });
      }
    }
  }
  // scatter trees / banners in open ground near roads
  for (let i = 0; i < 90; i++) {
    const e = groundRoadEdgePoints(9)[rng.int(0, groundRoadEdgePoints(9).length - 1)];
    const side = rng.chance(0.5) ? 1 : -1;
    const off = e.hw + rng.range(4, 16);
    const p = e.pos.clone().addScaledVector(e.bin, side * off);
    if (groundRoadClearance(p.x, p.z) < 3) continue;
    out.push({ file: g(rng.pick(DECOR)), position: [p.x, 0, p.z], rotationY: rng.range(0, Math.PI * 2) });
  }
  return out;
}

// ── Street furniture: lamp posts + powerline poles/cables (procedural) ──
export interface Lamp { pos: THREE.Vector3; rotationY: number }
export interface Cable { a: THREE.Vector3; b: THREE.Vector3 }
export interface StreetFurniture { lamps: Lamp[]; poles: THREE.Vector3[]; cables: Cable[] }

export function buildStreetFurniture(seed = 5150): StreetFurniture {
  const rng = makeRng(seed);
  const lamps: Lamp[] = [];
  const poles: THREE.Vector3[] = [];
  const cables: Cable[] = [];
  const edges = groundRoadEdgePoints(22);
  let prevPoleTop: THREE.Vector3 | null = null;
  edges.forEach((e, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const off = e.hw + 1.6;
    const base = e.pos.clone().addScaledVector(e.bin, side * off);
    // lamp facing the road
    lamps.push({ pos: base.clone(), rotationY: Math.atan2(-e.bin.x * side, -e.bin.z * side) });
    // powerline poles on the opposite side, cables strung between consecutive ones
    if (i % 2 === 0) {
      const pbase = e.pos.clone().addScaledVector(e.bin, -side * (e.hw + 2.5));
      poles.push(pbase.clone());
      const top = pbase.clone().setY(13);
      if (prevPoleTop && top.distanceTo(prevPoleTop) < 90) cables.push({ a: prevPoleTop.clone(), b: top.clone() });
      prevPoleTop = top;
    }
    void rng;
  });
  return { lamps, poles, cables };
}

/** Cheap far-field skyline: instanced boxes ringing the play area for depth. */
export interface SkyBox { matrix: THREE.Matrix4; emissive: boolean }
export function buildSkyline(seed = 4242): SkyBox[] {
  const rng = makeRng(seed);
  const boxes: SkyBox[] = [];
  const cx = -40, cz = -320;
  for (let i = 0; i < 260; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(760, 1700);
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad * 1.1;
    const w = rng.range(22, 52);
    const d = rng.range(22, 52);
    const h = rng.range(70, 300);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, h / 2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI), 0)),
      new THREE.Vector3(w, h, d)
    );
    boxes.push({ matrix: m, emissive: rng.chance(0.28) });
  }
  return boxes;
}
