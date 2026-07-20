import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import { groundRoadClearance, groundRoadEdgePoints } from './roads';

/**
 * City placement. A grid over the map is CARVED by the road network (a cell is
 * only used if its clearance to every ground road exceeds the building's
 * footprint) so nothing ever lands on a street. Buildings band along the roads;
 * street props dress the sidewalk edges; a cheap far-field skyline fills the
 * background. Deterministic (seeded).
 */
const P = 'KB3D_NEC_';
const TOWERS = [
  `${P}BldgLG_A_Main`, `${P}BldgLG_C_Main`, `${P}BldgLG_B_Main`,
  `${P}BldgLG_A_BuildingC`, `${P}BldgLG_A_BuildingB`, `${P}BldgLG_A_BuildingA`,
];
const MIDS = [
  `${P}BldgMD_A_Main`, `${P}BldgMD_B_Main`, `${P}BldgMD_C_Main`,
  `${P}BldgLG_A_BuildingD`, `${P}BldgMD_C_BuildingA`,
];
const SMALLS = [`${P}BldgSM_A_Main`, `${P}BldgSM_B_Main`, `${P}BldgSM_C_Main`];
const PROPS = [
  `${P}BldgSM_A_ConcreteBarrier`, `${P}BldgSM_C_AC`, `${P}BldgSM_C_Boxes`,
  `${P}BldgSM_C_Containers`, `${P}BldgSM_C_CratesA`, `${P}BldgSM_C_CratesB`,
  `${P}BldgSM_C_Pipes`, `${P}BldgSM_C_NeonSignA`, `${P}BldgSM_C_NeonSignB`,
  `${P}BldgSM_C_NeonSignC`, `${P}BldgSM_B_Cart`, `${P}BldgSM_B_Bbq`,
  `${P}BldgSM_B_Umbrella`, `${P}BldgSM_C_Fan`, `${P}BldgSM_C_Stool`,
];

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
}

const CARD = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const cell = 48;
  for (let x = -400; x <= 340; x += cell) {
    for (let z = -720; z <= 120; z += cell) {
      const jx = x + rng.range(-9, 9);
      const jz = z + rng.range(-9, 9);
      const clr = groundRoadClearance(jx, jz);
      if (clr < 15) continue;            // on / hugging a road → carve out
      if (clr > 82) continue;            // deep interior → leave to skyline
      let pool: string[]; let need: number;
      if (clr < 30) { pool = SMALLS; need = 14; }
      else if (clr < 52) { pool = rng.chance(0.55) ? MIDS : TOWERS; need = 30; }
      else { pool = rng.chance(0.6) ? TOWERS : MIDS; need = 30; }
      if (clr < need) continue;
      if (rng.chance(0.28)) continue;    // occasional empty lot
      const name = rng.pick(pool);
      const rotationY = rng.pick(CARD) + rng.range(-0.08, 0.08);
      out.push({ file: `neocity/${name}.glb`, position: [jx, 0, jz], rotationY });
    }
  }
  return out;
}

/** Street props dressing the sidewalk edges of the ground roads. */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  for (const e of groundRoadEdgePoints(24)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.55)) continue; // sparse so it doesn't clutter
      const off = e.hw + 2.2 + rng.range(0, 1.5);
      const pos = e.pos.clone().addScaledVector(e.bin, side * off);
      const name = rng.pick(PROPS);
      const rotationY = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      out.push({ file: `neocity/${name}.glb`, position: [pos.x, 0, pos.z], rotationY });
    }
  }
  return out;
}

/** Cheap far-field skyline: instanced boxes ringing the play area for depth. */
export interface SkyBox { matrix: THREE.Matrix4; emissive: boolean }
export function buildSkyline(seed = 4242): SkyBox[] {
  const rng = makeRng(seed);
  const boxes: SkyBox[] = [];
  const cx = -40, cz = -320;
  for (let i = 0; i < 260; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(720, 1700); // clearly BEHIND the play area
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
