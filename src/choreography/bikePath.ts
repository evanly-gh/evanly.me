import * as THREE from 'three';
import {
  BIKE_WHEEL_CENTERLINE_RADIUS,
  type BikePose,
} from '../assets/bike';
import {
  roadFrame,
  routeDistanceAt,
  sampleRoute,
  type RoadFrame,
  type RouteSample,
} from '../world/route';
import { STUNT_ROUTE } from '../world/stuntLayout';
import {
  STUNT_FLIP_TIMINGS,
  type StuntFlipTiming,
} from './stuntTiming';
import {
  mountedBikeTangent,
  solveMountedBikeContact,
} from './rideSurface';

export interface BikeState {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  pose: BikePose;
}

export const BIKE_LEAN_LIMIT = 0.61;
export const WHEEL_RADIUS_METERS = BIKE_WHEEL_CENTERLINE_RADIUS;

export function wheelRotationForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error('Wheel travel distance must be finite and non-negative');
  }
  return distance / WHEEL_RADIUS_METERS;
}

const LEAN_SAMPLE_STEP = 0.00025;
const LEAN_GAIN = 12;
const LEAN_FILTER_WEIGHTS = [1, 2, 3, 2, 1] as const;
const DEFAULT_CROUCH = 0.2;
const APEX_CROUCH = 0.6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function signedCurvatureAt(t: number): number {
  const beforeT = Math.max(0, t - LEAN_SAMPLE_STEP);
  const afterT = Math.min(1, t + LEAN_SAMPLE_STEP);
  if (afterT === beforeT) return 0;
  const before = sampleRoute(beforeT).tangent;
  const after = sampleRoute(afterT).tangent;
  const beforeHorizontal = new THREE.Vector2(before.x, before.z).normalize();
  const afterHorizontal = new THREE.Vector2(after.x, after.z).normalize();
  const cross =
    beforeHorizontal.x * afterHorizontal.y -
    beforeHorizontal.y * afterHorizontal.x;
  const turnAngle = Math.atan2(cross, beforeHorizontal.dot(afterHorizontal));
  const distance = routeDistanceAt(afterT) - routeDistanceAt(beforeT);
  return distance <= Number.EPSILON ? 0 : turnAngle / distance;
}

function computeLeanExact(t: number): number {
  let weightedCurvature = 0;
  let totalWeight = 0;
  for (let index = 0; index < LEAN_FILTER_WEIGHTS.length; index += 1) {
    const sampleOffset =
      (index - Math.floor(LEAN_FILTER_WEIGHTS.length / 2)) * LEAN_SAMPLE_STEP;
    const weight = LEAN_FILTER_WEIGHTS[index];
    weightedCurvature += signedCurvatureAt(clamp01(t + sampleOffset)) * weight;
    totalWeight += weight;
  }
  const rawLean = weightedCurvature / totalWeight * LEAN_GAIN;
  return BIKE_LEAN_LIMIT * Math.tanh(
    rawLean / BIKE_LEAN_LIMIT,
  );
}

// Lean is a pure function of the (static) route geometry, but evaluating it live
// cost ~10 sampleRoute calls per frame (5-tap curvature filter, two samples per
// tap) plus a dozen throwaway Vector2s. Bake it once into a table and linearly
// interpolate at runtime — same trick route.ts uses for SEMANTIC_ROUTE_DISTANCES.
const LEAN_LUT_SIZE = 4096;

function buildLeanLut(): Float32Array {
  const table = new Float32Array(LEAN_LUT_SIZE + 1);
  for (let index = 0; index <= LEAN_LUT_SIZE; index += 1) {
    table[index] = computeLeanExact(index / LEAN_LUT_SIZE);
  }
  return table;
}

const LEAN_LUT = buildLeanLut();

function computeLean(t: number): number {
  const scaled = clamp01(t) * LEAN_LUT_SIZE;
  const lower = Math.floor(scaled);
  if (lower >= LEAN_LUT_SIZE) return LEAN_LUT[LEAN_LUT_SIZE];
  const frac = scaled - lower;
  return LEAN_LUT[lower] * (1 - frac) + LEAN_LUT[lower + 1] * frac;
}

function flipPitch(t: number, flip: Readonly<StuntFlipTiming>): number {
  if (t < flip.lip || t > flip.landing) return 0;
  if (t <= flip.apex) {
    return smoothstep((t - flip.lip) / (flip.apex - flip.lip)) * Math.PI;
  }
  return Math.PI + smoothstep(
    (t - flip.apex) / (flip.landing - flip.apex),
  ) * Math.PI;
}

export function bikeFlipPitchAt(t: number): number {
  const progress = clamp01(t);
  return flipPitch(progress, STUNT_FLIP_TIMINGS[0])
    || flipPitch(progress, STUNT_FLIP_TIMINGS[1]);
}

function flipCrouch(t: number, flip: Readonly<StuntFlipTiming>): number {
  if (t <= flip.lip || t >= flip.landing) return 0;
  return t <= flip.apex
    ? smoothstep((t - flip.lip) / (flip.apex - flip.lip))
    : smoothstep((flip.landing - t) / (flip.landing - flip.apex));
}

function computePose(t: number): BikePose {
  const pitch = bikeFlipPitchAt(t);
  const lean = t >= STUNT_ROUTE.ramp1Base.t
    && t <= STUNT_ROUTE.groundResume.t
    ? 0
    : computeLean(t);
  const crouchPulse = Math.max(
    ...STUNT_FLIP_TIMINGS.map((flip) => flipCrouch(t, flip)),
  );

  return {
    lean,
    pitch,
    crouch: THREE.MathUtils.lerp(DEFAULT_CROUCH, APEX_CROUCH, crouchPulse),
    wheelSpin: wheelRotationForDistance(routeDistanceAt(t)),
  };
}

const BIKE_WORLD_UP = new THREE.Vector3(0, 1, 0);

export class BikePath {
  // Per-instance scratch for the hot path. sampleRoute/roadFrame write into these
  // instead of allocating; the returned pos/quat/pose stay freshly allocated each
  // call because callers retain them (BikeRider stores state across frames), so
  // pooling the *return* would alias. Each BikePath instance has its own scratch,
  // so separate instances (bike, trail, director) never collide.
  private readonly sampleScratch: RouteSample = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
  };
  private readonly frameScratch: RoadFrame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
  };
  private readonly tangentScratch = new THREE.Vector3();
  private readonly binormalScratch = new THREE.Vector3();
  private readonly normalScratch = new THREE.Vector3();
  private readonly matrixScratch = new THREE.Matrix4();

  private computeRouteQuaternion(t: number, out: THREE.Quaternion): THREE.Quaternion {
    const frame = roadFrame(t, this.frameScratch);
    const tangent = this.tangentScratch.copy(mountedBikeTangent(t, frame.tangent));
    const binormal = this.binormalScratch
      .crossVectors(tangent, BIKE_WORLD_UP)
      .normalize();
    const normal = this.normalScratch
      .crossVectors(binormal, tangent)
      .normalize();
    this.matrixScratch.makeBasis(tangent, normal, binormal);
    return out.setFromRotationMatrix(this.matrixScratch).normalize();
  }

  state(t: number): BikeState {
    if (!Number.isFinite(t)) {
      throw new Error('BikePath progress must be finite');
    }
    const progress = clamp01(t);
    const pos = new THREE.Vector3().copy(
      sampleRoute(progress, this.sampleScratch).pos,
    );
    const quat = this.computeRouteQuaternion(progress, new THREE.Quaternion());
    const pose = computePose(progress);
    pos.y = solveMountedBikeContact(progress, pos, quat, pose).rootY;
    return {
      pos,
      quat,
      pose,
    };
  }
}
