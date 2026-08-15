import * as THREE from 'three';

/**
 * Cinematic intro: the ride opens on the bike parked leaning against a building
 * near the route start, camera in close, behind a pixel loading bar → title →
 * START button. On START the bike drives itself over to the semantic t=0 start
 * pose while the camera eases back to the opening chase, then normal scroll takes
 * over. See ProductionDirector (runs the animation) and ScrollExperience (owns
 * the phase state machine + DOM overlays).
 *
 * The bike/camera are stateless functions of t (see bikePath.ts), so the intro
 * simply drives the bike's transform manually until it hands off at t=0 — no
 * physics state to reconcile.
 */

export type IntroPhase = 'loading' | 'title' | 'driving' | 'live';

/** Seconds the START → drive-in animation runs before handing off to scroll. */
export const INTRO_DRIVE_DURATION = 2.8;

// Bike parked leaning on the +Z sidewalk, back down the street from the t=0 start
// (-420,0,0) so the drive-in has real forward travel (it merges into the lane
// while driving, not sliding sideways). Forward is +X; the pose leans it toward
// +Z (its right) into the facade.
export const INTRO_BIKE_LEAN_POS = new THREE.Vector3(-452, 0, 12);
/** Slight yaw so the parked bike is angled into the wall, not dead-parallel. */
export const INTRO_BIKE_LEAN_YAW = -0.16;
/** pose.lean (roll about the bike's forward axis) while propped against the wall. */
export const INTRO_BIKE_LEAN_ANGLE = 0.5;
/** pose.crouch while parked (rider standing, foot-down feel). */
export const INTRO_BIKE_LEAN_CROUCH = 0.12;

// Hero framing on the parked bike. Camera sits out across the road, pulled back
// and raised so the frame holds BOTH the bike (foreground, lower) and the title
// billboard mounted on the facade behind it (upper). Looking back-and-across so
// the facade reads as the backdrop and the camera never sits inside a building.
export const INTRO_CAM_POS = new THREE.Vector3(-438, 5, -9);
export const INTRO_CAM_TARGET = new THREE.Vector3(-452, 4, 12);
export const INTRO_CAM_FOV = 46;

// Quadratic-bezier control point for the drive-in. Placed past the x-midpoint at
// the lane centre (z=0) so the merge curves smoothly OUT of the curb and the exit
// tangent is pure +X — the bike arrives driving straight down the street, exactly
// matching the t=0 heading for a snap-free hand-off.
const DRIVE_CONTROL = new THREE.Vector3(-430, 0, 0);

/** Bike position along the drive-in merge curve at progress p∈[0,1]. */
export function introDrivePosition(
  p: number,
  endPos: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - p;
  return out.set(
    u * u * INTRO_BIKE_LEAN_POS.x + 2 * u * p * DRIVE_CONTROL.x + p * p * endPos.x,
    u * u * INTRO_BIKE_LEAN_POS.y + 2 * u * p * DRIVE_CONTROL.y + p * p * endPos.y,
    u * u * INTRO_BIKE_LEAN_POS.z + 2 * u * p * DRIVE_CONTROL.z + p * p * endPos.z,
  );
}

/** Yaw (about +Y) tangent to the drive-in curve, so the bike faces where it goes. */
export function introDriveYaw(p: number, endPos: THREE.Vector3): number {
  const u = 1 - p;
  const tx =
    2 * u * (DRIVE_CONTROL.x - INTRO_BIKE_LEAN_POS.x)
    + 2 * p * (endPos.x - DRIVE_CONTROL.x);
  const tz =
    2 * u * (DRIVE_CONTROL.z - INTRO_BIKE_LEAN_POS.z)
    + 2 * p * (endPos.z - DRIVE_CONTROL.z);
  return Math.atan2(-tz, tx);
}

/** Smootherstep — zero velocity AND acceleration at both ends, for the drive-in. */
export function introEase(x: number): number {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}
