import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import { groundRoadClearance, groundRoadEdgePoints, keepClear } from './roads';

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

const g = (n: string) => `neocity/${n}.glb`;

/**
 * Buildings line the roads in aligned ROWS (a canyon between dense walls): a
 * short front wall right behind the sidewalk, taller buildings set back, rare
 * hero towers deep. Every building FACES the road and is verified clear of all
 * roads + the stunt keep-clear zone, so nothing lands on a street.
 */
export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];

  const place = (base: THREE.Vector3, bin: THREE.Vector3, tan: THREE.Vector3, side: number, off: number, pool: string[], foot: number): void => {
    const jitter = rng.range(-7, 7);
    const px = base.x + bin.x * side * off + tan.x * jitter;
    const pz = base.z + bin.z * side * off + tan.z * jitter;
    if (keepClear(px, pz)) return;
    if (groundRoadClearance(px, pz) < foot + 2) return;
    const name = rng.pick(pool);
    // face the road: front (+Z of the piece) points toward the road centre
    const rotationY = Math.atan2(-bin.x * side, -bin.z * side) + rng.range(-0.05, 0.05);
    out.push({ file: g(name), position: [px, 0, pz], rotationY });
  };

  for (const e of groundRoadEdgePoints(34)) {
    for (const side of [1, -1] as const) {
      // front wall (dense) — small/mid right behind the sidewalk
      if (!rng.chance(0.12)) place(e.pos, e.bin, e.tan, side, e.hw + 11, rng.chance(0.5) ? SMALL : MID, 9);
      // second row — mid/tall
      if (!rng.chance(0.3)) place(e.pos, e.bin, e.tan, side, e.hw + 40, rng.chance(0.35) ? TALL : MID, 22);
      // occasional deep tower / hero landmark
      if (rng.chance(0.28)) place(e.pos, e.bin, e.tan, side, e.hw + 72, rng.chance(0.3) ? HERO : TALL, 26);
    }
  }
  return out;
}

/** Street props + shop stalls + trees on the SIDEWALKS (never on the road). */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const push = (file: string, x: number, z: number, rot: number): void => {
    if (keepClear(x, z) || groundRoadClearance(x, z) < 1.5) return; // stay off the road + zones
    out.push({ file, position: [x, 0, z], rotationY: rot });
  };
  for (const e of groundRoadEdgePoints(20)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.55)) continue;
      const rot = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      if (rng.chance(0.3)) {
        // shop stall: 2-3 props clustered along the sidewalk (parallel to road)
        const n = 2 + rng.int(0, 1);
        for (let i = 0; i < n; i++) {
          const p = e.pos.clone()
            .addScaledVector(e.bin, side * (e.hw + 4))
            .addScaledVector(e.tan, (i - 1) * 2.4);
          push(g(rng.pick(SHOP)), p.x, p.z, rot + rng.range(-0.2, 0.2));
        }
      } else {
        const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 3.2));
        push(g(rng.pick(EDGE)), p.x, p.z, rot);
      }
    }
  }
  // trees / banners set back on the sidewalk
  for (const e of groundRoadEdgePoints(30)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.6)) continue;
      const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + rng.range(5, 9)));
      push(g(rng.pick(DECOR)), p.x, p.z, rng.range(0, Math.PI * 2));
    }
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
  const cx = -40, cz = -260;
  for (let i = 0; i < 150; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(620, 1300);
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
