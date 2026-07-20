import * as THREE from 'three';

/**
 * A ramp wedge you ride UP: right-triangle profile (front at y=0 → back at
 * y=rise) extruded to `width`, centred on Z. Local +X is the up-slope run.
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
export const RAMPS: RampPlacement[] = [
  { position: [240, 0, -58], rotationY: Math.PI / 2, length: 34, width: 16, rise: 12 },
  { position: [240, 0, -215], rotationY: Math.PI / 2, length: 34, width: 16, rise: 14 },
];

// Scaffold: a designated tall building with a cantilevered deck on its road
// side (the bike lands on it between the two ramps).
export const SCAFFOLD = {
  building: 'KB3D_NEC_BldgLG_C_Main',
  buildingPos: [302, 0, -185] as [number, number, number],
  buildingRot: -Math.PI / 2,
  deckCenter: [264, 13, -185] as [number, number, number],
  deckLen: 62,   // along Z
  deckWidth: 15, // along X
  deckThick: 1.2,
};
