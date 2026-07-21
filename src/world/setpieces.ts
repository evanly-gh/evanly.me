import * as THREE from 'three';

/**
 * A ramp wedge you ride UP: right-triangle profile (front y=0 → back y=rise)
 * extruded to `width`, centred on Z. Local +X is the up-slope run.
 */
export function buildRampGeometry(length: number, width: number, rise: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, rise);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.computeVertexNormals();
  return g;
}

// Stunt corridor (from the route in route.ts): the bike travels −Z along x=240.
//   ramp1 (JUNK pile, y0→11) → flip → land on SCAFFOLD deck (y13) → ride across →
//   ramp2 (thin kicker, y13→22) → flip → drop back to the road.
// rotationY = π/2 maps a piece's local +X (up-slope run) to world −Z.

// The stunt sits off to the +X (right) side of the road (x=250) and is kept
// thin so it hugs one side; matches the route waypoints in route.ts.
const STUNT_X = 250;

/** Ramp 1: improvised junk pile — base wedge dressed with crates/dumpster/planks. */
export const JUNK = {
  base: [STUNT_X, 0, -70] as [number, number, number], // world base of the up-slope
  rotationY: Math.PI / 2,
  run: 26,
  width: 7,
  rise: 11,
};

/** Elevated scaffold deck the bike rides across (off to one side, tied to a building). */
export const SCAFFOLD = {
  deckCenter: [STUNT_X, 13, -165] as [number, number, number],
  deckLen: 96,   // z ≈ -117 .. -213
  deckWidth: 9,
  deckThick: 1,
  deckY: 13,
  building: 'KB3D_NEC_BldgLG_C_Main',
  buildingPos: [300, 0, -165] as [number, number, number],
  buildingRot: -Math.PI / 2,
};

/** Ramp 2: a thin metal kicker off the end of the deck (y13 → 22). */
export const RAMP2 = {
  base: [STUNT_X, 13, -210] as [number, number, number],
  rotationY: Math.PI / 2,
  run: 25,
  width: 6,
  rise: 9,
};
