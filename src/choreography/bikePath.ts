import * as THREE from 'three';
import {
  BIKE_WHEEL_CENTERLINE_RADIUS,
  type BikePose,
} from '../assets/bike';
import {
  roadFrame,
  routeDistanceAt,
  sampleRoute,
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

function computeLean(t: number): number {
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

function computeRouteQuaternion(t: number): THREE.Quaternion {
  const frame = roadFrame(t);
  const tangent = mountedBikeTangent(t, frame.tangent);
  const binormal = new THREE.Vector3()
    .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
    .normalize();
  const normal = new THREE.Vector3()
    .crossVectors(binormal, tangent)
    .normalize();
  const rotation = new THREE.Matrix4().makeBasis(tangent, normal, binormal);
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize();
}

export class BikePath {
  state(t: number): BikeState {
    if (!Number.isFinite(t)) {
      throw new Error('BikePath progress must be finite');
    }
    const progress = clamp01(t);
    const pos = sampleRoute(progress).pos;
    const quat = computeRouteQuaternion(progress);
    const pose = computePose(progress);
    pos.y = solveMountedBikeContact(progress, pos, quat, pose).rootY;
    return {
      pos,
      quat,
      pose,
    };
  }
}
