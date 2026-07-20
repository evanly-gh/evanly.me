import { roadFrame } from './route';
import { makeRng } from '../assets/rng';

/**
 * Hand-authored-ish city placement (NOT the ported cybersite layout, per the
 * handoff). Walks the route; on the GROUND zones (intro/about/turn/research)
 * it flanks the road with rows of KitBash buildings — tall towers in the back
 * row, mid/small buildings in front — with a road-clearance clamp. The elevated
 * stunt section (ramps/scaffold/bridge, y > 3) is skipped; it gets set-pieces.
 * Deterministic (seeded) so the city is stable across reloads/tests.
 */
const P = 'KB3D_NEC_';
const TOWERS = [
  `${P}BldgLG_A_Main`, `${P}BldgLG_C_Main`, `${P}BldgLG_B_Main`,
  `${P}BldgLG_A_BuildingC`, `${P}BldgLG_A_BuildingB`,
];
const MIDS = [
  `${P}BldgMD_A_Main`, `${P}BldgMD_B_Main`, `${P}BldgMD_C_Main`,
  `${P}BldgLG_A_BuildingA`, `${P}BldgLG_A_BuildingD`, `${P}BldgMD_C_BuildingA`,
];
const SMALLS = [`${P}BldgSM_A_Main`, `${P}BldgSM_B_Main`, `${P}BldgSM_C_Main`];

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
}

const ROAD_HALF = 9;
const CLEARANCE = 8; // min gap from road edge to nearest building

export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const STEPS = 1400;
  const spacing = 64;

  let prev = roadFrame(0).pos;
  let acc = spacing; // place at the first eligible step

  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const f = roadFrame(t);
    acc += f.pos.distanceTo(prev);
    prev = f.pos;

    if (f.pos.y > 3) continue; // skip elevated stunt section
    if (acc < spacing) continue;
    acc = 0;

    for (const side of [1, -1] as const) {
      const rows = rng.chance(0.5) ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        const offset = ROAD_HALF + CLEARANCE + r * 34 + rng.range(0, 6);
        const back = rng.range(-12, 12);
        const px = f.pos.x + f.binormal.x * side * offset + f.tangent.x * back;
        const pz = f.pos.z + f.binormal.z * side * offset + f.tangent.z * back;
        const pool = r === 0
          ? (rng.chance(0.5) ? MIDS : SMALLS)
          : (rng.chance(0.6) ? TOWERS : MIDS);
        const name = rng.pick(pool);
        const rotationY =
          Math.atan2(f.tangent.x, f.tangent.z) + (side > 0 ? 0 : Math.PI) + rng.range(-0.15, 0.15);
        out.push({ file: `neocity/${name}.glb`, position: [px, 0, pz], rotationY });
      }
    }
  }
  return out;
}
