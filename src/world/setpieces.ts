import * as THREE from 'three';
import {
  STUNT_CENTER_X,
  STUNT_RAMP1,
  STUNT_RAMP2,
  STUNT_SCAFFOLD,
} from './stuntGeometry';

export function rampProfileHeight(fraction: number, rise: number): number {
  const t = THREE.MathUtils.clamp(fraction, 0, 1);
  return rise * t * t * t * (3 - 2 * t);
}

export function rampProfileSlope(
  fraction: number,
  run: number,
  rise: number,
): number {
  const t = THREE.MathUtils.clamp(fraction, 0, 1);
  return rise / run * t * t * (9 - 8 * t);
}

export const RAMP_RIDE_PLATE_PROUD_HEIGHT = 0.002;

export function rampRidePlateTransform(
  fraction: number,
  run: number,
  rise: number,
  thickness: number,
): { x: number; centerY: number; angle: number } {
  const clamped = THREE.MathUtils.clamp(fraction, 0, 1);
  const angle = Math.atan(rampProfileSlope(clamped, run, rise));
  return {
    x: run * clamped,
    centerY:
      rampProfileHeight(clamped, rise)
      - thickness / 2 * Math.cos(angle)
      + RAMP_RIDE_PLATE_PROUD_HEIGHT,
    angle,
  };
}

export const RAMP_PROFILE_SEGMENTS = 128;

/**
 * A narrow curved kicker assembled as an extruded sampled profile. Local +X
 * remains the ridden direction so the render and contact solver share one arc.
 */
export function buildRampGeometry(length: number, width: number, rise: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let index = 1; index <= RAMP_PROFILE_SEGMENTS; index += 1) {
    const fraction = index / RAMP_PROFILE_SEGMENTS;
    shape.lineTo(
      length * fraction,
      rampProfileHeight(fraction, rise),
    );
  }
  shape.lineTo(length, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2);
  g.computeVertexNormals();
  return g;
}

// Stunt corridor (from stuntLayout.ts): the bike travels −Z along STUNT_CENTER_X.
//   ramp1 (JUNK pile, y0→12) → flip → land on SCAFFOLD deck (y13) → ride across →
//   ramp2 (thin kicker, y13→23) → flip → drop back to the road.
// rotationY = π/2 maps a piece's local +X (up-slope run) to world −Z.

/** Ramp 1: improvised junk pile — base wedge dressed with crates/dumpster/planks. */
export const JUNK = {
  base: [
    STUNT_CENTER_X,
    STUNT_RAMP1.baseY,
    STUNT_RAMP1.baseZ,
  ] as [number, number, number],
  rotationY: Math.PI / 2,
  run: STUNT_RAMP1.run,
  width: STUNT_RAMP1.width,
  rise: STUNT_RAMP1.rise,
};

/** Elevated scaffold deck the bike rides across (off to one side, tied to a building). */
export const SCAFFOLD = {
  deckCenter: [
    STUNT_CENTER_X,
    STUNT_SCAFFOLD.deckY,
    STUNT_SCAFFOLD.centerZ,
  ] as [number, number, number],
  deckLen: STUNT_SCAFFOLD.length,
  deckWidth: STUNT_SCAFFOLD.width,
  deckThick: STUNT_SCAFFOLD.thickness,
  deckY: STUNT_SCAFFOLD.deckY,
};

/** Ramp 2: a thin metal kicker off the end of the deck (y13 → 23). */
export const RAMP2 = {
  base: [
    STUNT_CENTER_X,
    STUNT_RAMP2.baseY,
    STUNT_RAMP2.baseZ,
  ] as [number, number, number],
  rotationY: Math.PI / 2,
  run: STUNT_RAMP2.run,
  width: STUNT_RAMP2.width,
  rise: STUNT_RAMP2.rise,
};
