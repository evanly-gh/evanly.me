import * as THREE from 'three';

/**
 * A ramp wedge you ride UP: right-triangle profile (front y=0 → back y=rise)
 * extruded to `width`, centred on Z. Local +X is the up-slope run. Rendered with
 * added side rails + underside struts + warning stripes in City (Ramps).
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

export interface RampPlacement {
  position: [number, number, number];
  rotationY: number;
  length: number;
  width: number;
  rise: number;
}

// On the flat post-turn stretch (x≈240, heading −Z). rotationY = π/2 maps the
// local +X run onto world −Z so the bike rides up in its travel direction.
// Lifted slightly (y) so the ramp deck covers the road glow lines beneath it.
export const RAMPS: RampPlacement[] = [
  { position: [240, 0.12, -58], rotationY: Math.PI / 2, length: 34, width: 16, rise: 12 },
  { position: [240, 0.12, -218], rotationY: Math.PI / 2, length: 34, width: 16, rise: 14 },
];

// Scaffold: a designated tall building with a supported deck lattice against its
// road-facing wall (the bike lands on the top deck between the two ramps).
export const SCAFFOLD = {
  building: 'KB3D_NEC_BldgLG_C_Main',
  buildingPos: [302, 0, -185] as [number, number, number],
  buildingRot: -Math.PI / 2,
  // deck spans x[deckX0..deckX1] (outer→building), z[deckZ0..deckZ1], at deckY
  deckX0: 253,   // outer edge (near the road) — support poles drop here
  deckX1: 284,   // inner edge (against the building wall)
  deckZ0: -214,
  deckZ1: -156,
  deckY: 13,
  deckThick: 1.3,
};
