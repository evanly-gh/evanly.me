import type { Placement } from './cityLayout';

/**
 * Hand-authored filler buildings that cap the two Shibuya side-street stubs (the
 * north spur ending at z≈110 and the east spur ending at x≈350) which otherwise
 * dead-ended into empty void. Injected into buildCityLayout's seed list (like
 * ABOUT_PLAZA_PLACEMENTS / STUNT_BACKDROP) so the packer parts around them. Each
 * carries an `outDir` facing back toward the crossing so the ad-billboard pass
 * mounts a sign on its crossing-facing facade. Role `shibuya-fill` keeps them out
 * of the generic street pass (they sit beyond road range) — a dedicated pass in
 * adBillboardPlacement handles their billboards.
 */

const fill = (
  name: string,
  x: number,
  z: number,
  rotationY: number,
  outDir: [number, number],
): Placement => ({
  file: `neocity/${name}.glb`,
  position: [x, 0, z],
  rotationY,
  centerOffset: [0, 0],
  outDir,
  layoutRole: 'shibuya-back',
});

export const SHIBUYA_FILLER_PLACEMENTS: readonly Placement[] = Object.freeze([
  // North terminus cap (face south toward the crossing). Medium heights — the
  // elevated monorail deck sweeps overhead near z≈150.
  fill('KB3D_NEC_BldgMD_C_Main', 216, 128, Math.PI, [0, -1]),
  fill('KB3D_NEC_BldgLG_A_BuildingD', 240, 136, Math.PI, [0, -1]),
  fill('KB3D_NEC_BldgMD_C_Main', 264, 128, Math.PI, [0, -1]),
  fill('KB3D_NEC_BldgMD_B_Main', 226, 158, Math.PI, [0, -1]),
  fill('KB3D_NEC_BldgMD_C_Main', 256, 158, Math.PI, [0, -1]),
  // East terminus cap (face west toward the crossing). No height limit here.
  fill('KB3D_NEC_BldgLG_A_Main', 372, -18, -Math.PI / 2, [-1, 0]),
  fill('KB3D_NEC_BldgMD_C_Main', 372, 18, -Math.PI / 2, [-1, 0]),
  fill('KB3D_NEC_BldgLG_A_BuildingD', 396, 0, -Math.PI / 2, [-1, 0]),
  fill('KB3D_NEC_BldgMD_C_Main', 412, -20, -Math.PI / 2, [-1, 0]),
  fill('KB3D_NEC_BldgLG_A_Main', 412, 20, -Math.PI / 2, [-1, 0]),
]);
