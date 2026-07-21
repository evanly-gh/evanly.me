import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import { groundRoadClearance, groundRoadEdgePoints, keepClear, overheadClearance } from './roads';

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
  `${P}BldgSM_C_AC`, `${P}BldgSM_C_Boxes`, `${P}BldgSM_C_CratesA`,
  `${P}BldgSM_C_CratesB`, `${P}BldgSM_C_Pipes`,
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
  foot?: number;
  outDir?: [number, number];
}

const g = (n: string) => `neocity/${n}.glb`;

// Road cross-section (from City.tsx / roads.ts): the driving deck is ±hw, then a
// wide sidewalk (half-width 4.5, offset hw+4.5) → outer sidewalk edge at hw+9.
const SIDEWALK = 9;     // sidewalk outer edge, measured from the road centre-line
const GAP = 1;          // buildings hug the sidewalk (small clear gap)
const ALLEY = 3;        // narrow alley between the front wall and the back towers
const FOOT_A = 16;      // front-row footprint radius (medium/tall rises)
const FOOT_B = 28;      // back-row footprint radius (tall towers / heroes)

/**
 * Buildings line every road in TWO tight rows per side, forming a continuous
 * canyon WALL that towers over the street (so billboards can be projected on
 * the faces). Each placement stores an ANCHOR at the sidewalk edge + an outward
 * direction; InstancedPieces pushes the building out by its real footprint so
 * its near face lands exactly on the sidewalk edge (scaling down only oversized
 * pieces). A worst-case clearance test guarantees NOTHING overlaps a road.
 */
export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];

  const anchorA = SIDEWALK + GAP;                  // front wall hugs the sidewalk (hw+10)
  const anchorB = anchorA + 2 * FOOT_A + ALLEY;    // back towers behind a narrow alley

  const place = (
    base: THREE.Vector3, bin: THREE.Vector3, tan: THREE.Vector3,
    side: number, hw: number, anchor: number, pool: string[], foot: number,
  ): void => {
    const jit = rng.range(-2, 2);
    const ax = base.x + bin.x * side * (hw + anchor) + tan.x * jit;
    const az = base.z + bin.z * side * (hw + anchor) + tan.z * jit;
    const ox = bin.x * side, oz = bin.z * side; // outward (away from road)
    const cx = ax + ox * foot, cz = az + oz * foot; // worst-case building centre
    // must clear every ground road+sidewalk, and never sit under the elevated deck
    if (keepClear(cx, cz)) return;
    if (groundRoadClearance(cx, cz) < foot + SIDEWALK + 1) return;
    // tall buildings under the highway clip its deck → use a short building there
    if (overheadClearance(cx, cz) < foot + 18) pool = SMALL;
    const name = rng.pick(pool);
    const rotationY = Math.atan2(-ox, -oz) + rng.range(-0.02, 0.02);
    out.push({ file: g(name), position: [ax, 0, az], rotationY, foot, outDir: [ox, oz] });
  };

  // front wall — dense (≈every 18 m → buildings touch into a continuous wall)
  for (const e of groundRoadEdgePoints(18)) {
    const far = e.pos.z < -560;
    for (const side of [1, -1] as const) {
      if (rng.chance(far ? 0.4 : 0.02)) continue;
      place(e.pos, e.bin, e.tan, side, e.hw, anchorA, rng.chance(0.35) ? TALL : MID, FOOT_A);
    }
  }
  // back towers — sparser big buildings peeking over the front wall
  for (const e of groundRoadEdgePoints(34)) {
    const far = e.pos.z < -560;
    for (const side of [1, -1] as const) {
      if (rng.chance(far ? 0.55 : 0.14)) continue;
      place(e.pos, e.bin, e.tan, side, e.hw, anchorB, rng.chance(0.4) ? HERO : TALL, FOOT_B);
    }
  }

  // ── Back-fill district: dense blocks behind the walls, with alley gaps, so the
  //    surrounding area reads as a real city rather than a thin strip. ──
  const FILL_FOOT = 18;
  const cell = 42;
  const CARD = [0, Math.PI / 2];
  for (let x = -400; x <= 400; x += cell) {
    for (let z = -720; z <= 150; z += cell) {
      const jx = x + rng.range(-6, 6), jz = z + rng.range(-6, 6);
      const c = groundRoadClearance(jx, jz);
      if (c < 84) continue;                 // handled by the two road-facing rows
      if (c > 230) continue;                // beyond the district → skyline territory
      if (keepClear(jx, jz)) continue;
      if (rng.chance(0.14)) continue;       // alleys / courtyards
      let pool = rng.chance(0.1) ? HERO : rng.chance(0.4) ? TALL : rng.chance(0.55) ? MID : SMALL;
      if (overheadClearance(jx, jz) < FILL_FOOT + 18) pool = SMALL;
      out.push({
        file: g(rng.pick(pool)),
        position: [jx, 0, jz],
        rotationY: rng.pick(CARD) + rng.range(-0.05, 0.05),
        foot: FILL_FOOT,
      });
    }
  }
  return out;
}

/** Street props + shop stalls + trees on the SIDEWALKS (never on the road). */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  // require ≥ 3 m clearance so a prop's footprint never spills onto the driving lane
  const push = (file: string, x: number, z: number, rot: number): void => {
    if (keepClear(x, z) || groundRoadClearance(x, z) < 3) return;
    out.push({ file, position: [x, 0, z], rotationY: rot });
  };
  // small props / shop stalls sit on the OUTER half of the sidewalk (hw+5.5)
  for (const e of groundRoadEdgePoints(22)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.6)) continue;
      const rot = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      if (rng.chance(0.3)) {
        const n = 2 + rng.int(0, 1);
        for (let i = 0; i < n; i++) {
          const p = e.pos.clone()
            .addScaledVector(e.bin, side * (e.hw + 5.5))
            .addScaledVector(e.tan, (i - 1) * 2.4);
          push(g(rng.pick(SHOP)), p.x, p.z, rot + rng.range(-0.2, 0.2));
        }
      } else {
        const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 6));
        push(g(rng.pick(EDGE)), p.x, p.z, rot);
      }
    }
  }
  // trees / banners set BACK past the sidewalk (planting strip by the buildings),
  // so nothing overhangs the street
  for (const e of groundRoadEdgePoints(34)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.65)) continue;
      const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 10.5 + rng.range(0, 2)));
      push(g(rng.pick(DECOR)), p.x, p.z, rng.range(0, Math.PI * 2));
    }
  }
  return out;
}

// ── Billboards: emissive screens projected across the front building walls ──
export interface Billboard {
  position: [number, number, number];
  rotationY: number;
  w: number;
  h: number;
  tex: number;
}

export function buildBillboards(seed = 3311, nTex = 8): Billboard[] {
  const rng = makeRng(seed);
  const out: Billboard[] = [];
  for (const e of groundRoadEdgePoints(12)) {
    if (e.pos.z < -560) continue;              // skip the far bridge run
    for (const side of [1, -1] as const) {
      if (rng.chance(0.32)) continue;
      const ox = e.bin.x * side, oz = e.bin.z * side;
      const off = e.hw + 9.6;                    // just in front of the front wall
      const px = e.pos.x + ox * off, pz = e.pos.z + oz * off;
      if (keepClear(px, pz) || groundRoadClearance(px, pz) < 8) continue;
      const vertical = rng.chance(0.42);
      const w = vertical ? rng.range(3.5, 6.5) : rng.range(9, 20);
      const h = vertical ? rng.range(12, 30) : rng.range(4.5, 11);
      const y = rng.range(11, 52) + h / 2;
      out.push({ position: [px, y, pz], rotationY: Math.atan2(-ox, -oz), w, h, tex: rng.int(0, nTex - 1) });
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
    const off = e.hw + 4.5; // mid-sidewalk, well off the driving lane
    const base = e.pos.clone().addScaledVector(e.bin, side * off);
    // lamp facing the road
    lamps.push({ pos: base.clone(), rotationY: Math.atan2(-e.bin.x * side, -e.bin.z * side) });
    // powerline poles on the opposite side, cables strung between consecutive ones
    if (i % 2 === 0) {
      const pbase = e.pos.clone().addScaledVector(e.bin, -side * (e.hw + 8));
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
