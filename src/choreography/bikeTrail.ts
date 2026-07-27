import * as THREE from 'three';
import { BIKE_PITCH_PIVOT_Y } from '../assets/bike';
import {
  BikePath,
  type BikeState,
} from './bikePath';
import {
  BIKE_WHEEL_RIM_POINT_COUNT,
  createBikeWheelRimTransformScratch,
} from './bikeContact';
import { mountedRearTireContactPoint } from './rideSurface';
import {
  SEMANTIC_ROUTE_LENGTH,
  routeDistanceAt,
} from '../world/route';
import { finaleSubjectOpacityAt } from '../world/finaleRender';

export const BIKE_TRAIL_MAX_SAMPLES = 96;
export const BIKE_ECHO_POOL_SIZE = 10;

const TRAIL_STEP_METERS = 0.42;
const TRAIL_HALF_WIDTH = 0.14;
const MIN_TRAIL_LENGTH = 12;
const MAX_TRAIL_LENGTH = 40;
const HISTORY_DISTANCE_QUANTUM = 0.5;
const DEFAULT_BIKE_PATH = new BikePath();
export const BIKE_TRAIL_HISTORY_BIN_COUNT =
  Math.floor(SEMANTIC_ROUTE_LENGTH / HISTORY_DISTANCE_QUANTUM + 0.5) + 1;
const HISTORY_VALUES_PER_BIN = 13;
export const BIKE_TRAIL_HISTORY_BYTES =
  BIKE_TRAIL_HISTORY_BIN_COUNT
  * HISTORY_VALUES_PER_BIN
  * Float64Array.BYTES_PER_ELEMENT;

interface BikeTrailHistory {
  readonly semantic: Float64Array;
  readonly positions: Float64Array;
  readonly rear: Float64Array;
  readonly quaternions: Float64Array;
  readonly leans: Float64Array;
  readonly pitches: Float64Array;
}

const HISTORY_BY_PATH = new WeakMap<BikePath, BikeTrailHistory>();

function semanticAtDistance(distance: number): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (routeDistanceAt(middle) <= distance) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function buildBikeTrailHistory(path: BikePath): BikeTrailHistory {
  const semantic = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT);
  const positions = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT * 3);
  const rearPositions = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT * 3);
  const quaternions = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT * 4);
  const leans = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT);
  const pitches = new Float64Array(BIKE_TRAIL_HISTORY_BIN_COUNT);
  const rear = new THREE.Vector3();
  const rimBuffer = new Float64Array(BIKE_WHEEL_RIM_POINT_COUNT * 3);
  const rimScratch = createBikeWheelRimTransformScratch();
  for (let index = 0; index < BIKE_TRAIL_HISTORY_BIN_COUNT; index += 1) {
    const sampledDistance = Math.min(
      SEMANTIC_ROUTE_LENGTH,
      index * HISTORY_DISTANCE_QUANTUM,
    );
    const semanticT = semanticAtDistance(sampledDistance);
    const state = path.state(semanticT);
    mountedRearTireContactPoint(
      semanticT,
      state.pos,
      state.quat,
      state.pose,
      rear,
      rimBuffer,
      rimScratch,
    );
    const positionOffset = index * 3;
    const quaternionOffset = index * 4;
    semantic[index] = semanticT;
    positions[positionOffset] = state.pos.x;
    positions[positionOffset + 1] = state.pos.y;
    positions[positionOffset + 2] = state.pos.z;
    rearPositions[positionOffset] = rear.x;
    rearPositions[positionOffset + 1] = rear.y;
    rearPositions[positionOffset + 2] = rear.z;
    quaternions[quaternionOffset] = state.quat.x;
    quaternions[quaternionOffset + 1] = state.quat.y;
    quaternions[quaternionOffset + 2] = state.quat.z;
    quaternions[quaternionOffset + 3] = state.quat.w;
    leans[index] = state.pose.lean;
    pitches[index] = state.pose.pitch;
  }
  return Object.freeze({
    semantic,
    positions,
    rear: rearPositions,
    quaternions,
    leans,
    pitches,
  });
}

function bikeTrailHistoryFor(path: BikePath): BikeTrailHistory {
  const existing = HISTORY_BY_PATH.get(path);
  if (existing) return existing;
  const history = buildBikeTrailHistory(path);
  HISTORY_BY_PATH.set(path, history);
  return history;
}

export interface BikeTrailSample {
  trailCount: number;
  trailLength: number;
  trailPositions: Float32Array;
  trailAges: Float32Array;
  trailDistances: Float32Array;
  echoCount: number;
  echoMatrices: Float32Array;
  echoColors: Float32Array;
  echoAges: Float32Array;
  echoDistances: Float32Array;
  echoSemantic: Float32Array;
  echoLeans: Float32Array;
  echoPitches: Float32Array;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pulseAt(
  semanticT: number,
  start: number,
  end: number,
  feather: number,
): number {
  const enter = smoothstep((semanticT - start) / feather);
  const exit = smoothstep((end - semanticT) / feather);
  return Math.min(enter, exit);
}

export function bikeTrailFinaleFadeAt(semanticT: number): number {
  return finaleSubjectOpacityAt(semanticT);
}

function boostAt(semanticT: number): number {
  return Math.max(
    pulseAt(semanticT, 0.28, 0.36, 0.018),
    pulseAt(semanticT, 0.385, 0.465, 0.012),
    pulseAt(semanticT, 0.565, 0.645, 0.012),
  );
}

function writeEchoColor(
  target: Float32Array,
  index: number,
  age: number,
  alpha: number,
): void {
  const offset = index * 4;
  let startR: number;
  let startG: number;
  let startB: number;
  let endR: number;
  let endG: number;
  let endB: number;
  let fraction: number;
  if (age < 0.38) {
    startR = 0.08;
    startG = 0.68;
    startB = 0.48;
    endR = 0.43;
    endG = 0.16;
    endB = 0.69;
    fraction = age / 0.38;
  } else if (age < 0.72) {
    startR = 0.43;
    startG = 0.16;
    startB = 0.69;
    endR = 0.72;
    endG = 0.1;
    endB = 0.5;
    fraction = (age - 0.38) / 0.34;
  } else {
    startR = 0.72;
    startG = 0.1;
    startB = 0.5;
    endR = 0.85;
    endG = 0.38;
    endB = 0.08;
    fraction = (age - 0.72) / 0.28;
  }
  target[offset] = THREE.MathUtils.lerp(startR, endR, fraction);
  target[offset + 1] = THREE.MathUtils.lerp(startG, endG, fraction);
  target[offset + 2] = THREE.MathUtils.lerp(startB, endB, fraction);
  target[offset + 3] = alpha;
}

/**
 * Fixed-pool sampler for the ridden ribbon and historical bike silhouettes.
 * Expensive BikePath evaluation is captured once; update() only mutates typed
 * arrays and scratch Three values retained by this instance.
 */
export class BikeTrailSampler {
  private readonly output: BikeTrailSample = {
    trailCount: 2,
    trailLength: MIN_TRAIL_LENGTH,
    trailPositions: new Float32Array(BIKE_TRAIL_MAX_SAMPLES * 6),
    trailAges: new Float32Array(BIKE_TRAIL_MAX_SAMPLES),
    trailDistances: new Float32Array(BIKE_TRAIL_MAX_SAMPLES),
    echoCount: 6,
    echoMatrices: new Float32Array(BIKE_ECHO_POOL_SIZE * 16),
    echoColors: new Float32Array(BIKE_ECHO_POOL_SIZE * 4),
    echoAges: new Float32Array(BIKE_ECHO_POOL_SIZE),
    echoDistances: new Float32Array(BIKE_ECHO_POOL_SIZE),
    echoSemantic: new Float32Array(BIKE_ECHO_POOL_SIZE),
    echoLeans: new Float32Array(BIKE_ECHO_POOL_SIZE),
    echoPitches: new Float32Array(BIKE_ECHO_POOL_SIZE),
  };

  private readonly position = new THREE.Vector3();
  private readonly routeQuaternion = new THREE.Quaternion();
  private readonly leanQuaternion = new THREE.Quaternion();
  private readonly pitchQuaternion = new THREE.Quaternion();
  private readonly posedQuaternion = new THREE.Quaternion();
  private readonly side = new THREE.Vector3();
  private readonly rear = new THREE.Vector3();
  private readonly rimBuffer = new Float64Array(BIKE_WHEEL_RIM_POINT_COUNT * 3);
  private readonly rimScratch = createBikeWheelRimTransformScratch();
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly axisZ = new THREE.Vector3(0, 0, 1);
  private sampledSemantic = 0;
  private sampledLean = 0;
  private sampledPitch = 0;
  private readonly history: BikeTrailHistory;

  constructor(path: BikePath = DEFAULT_BIKE_PATH) {
    this.history = bikeTrailHistoryFor(path);
  }

  private sampleHistory(distance: number): void {
    const totalDistance = routeDistanceAt(1);
    const clampedDistance = Math.max(0, Math.min(totalDistance, distance));
    const slot = Math.min(
      BIKE_TRAIL_HISTORY_BIN_COUNT - 1,
      Math.round(clampedDistance / HISTORY_DISTANCE_QUANTUM),
    );
    const positionOffset = slot * 3;
    const quaternionOffset = slot * 4;
    this.position.fromArray(this.history.positions, positionOffset);
    this.rear.fromArray(this.history.rear, positionOffset);
    this.routeQuaternion.fromArray(
      this.history.quaternions,
      quaternionOffset,
    );
    this.sampledSemantic = this.history.semantic[slot];
    this.sampledLean = this.history.leans[slot];
    this.sampledPitch = this.history.pitches[slot];
  }

  update(
    semanticT: number,
    finaleFade = 1,
    currentState?: BikeState,
  ): BikeTrailSample {
    if (!Number.isFinite(semanticT) || !Number.isFinite(finaleFade)) {
      throw new Error('Bike trail progress and finale fade must be finite');
    }
    const progress = clamp01(semanticT);
    const fade = clamp01(finaleFade);
    const currentDistance = routeDistanceAt(progress);
    const speedProbeStart = routeDistanceAt(Math.max(0, progress - 0.002));
    const speedProbeEnd = routeDistanceAt(Math.min(1, progress + 0.002));
    const physicalSpeed = speedProbeEnd - speedProbeStart;
    const boost = boostAt(progress);
    const trailLength = THREE.MathUtils.clamp(
      12 + physicalSpeed * 0.8 + boost * 28,
      MIN_TRAIL_LENGTH,
      MAX_TRAIL_LENGTH,
    );
    const trailCount = Math.min(
      BIKE_TRAIL_MAX_SAMPLES,
      Math.max(2, Math.ceil(trailLength / TRAIL_STEP_METERS) + 1),
    );
    this.output.trailCount = trailCount;
    this.output.trailLength = trailLength;

    for (let index = 0; index < trailCount; index += 1) {
      const age = index / (trailCount - 1);
      const distance = currentDistance - trailLength * age;
      if (index === 0 && currentState) {
        this.position.copy(currentState.pos);
        this.routeQuaternion.copy(currentState.quat);
        this.sampledSemantic = progress;
        this.sampledLean = currentState.pose.lean;
        this.sampledPitch = currentState.pose.pitch;
        mountedRearTireContactPoint(
          progress,
          currentState.pos,
          currentState.quat,
          currentState.pose,
          this.rear,
          this.rimBuffer,
          this.rimScratch,
        );
      } else {
        this.sampleHistory(distance);
      }
      this.leanQuaternion.setFromAxisAngle(this.axisX, this.sampledLean);
      this.pitchQuaternion.setFromAxisAngle(this.axisZ, this.sampledPitch);
      this.posedQuaternion.copy(this.routeQuaternion)
        .multiply(this.leanQuaternion)
        .multiply(this.pitchQuaternion);
      if (distance < 0) {
        this.side.set(-distance, 0, 0)
          .applyQuaternion(this.posedQuaternion);
        this.rear.sub(this.side);
      }
      this.side.set(0, 0, TRAIL_HALF_WIDTH)
        .applyQuaternion(this.posedQuaternion);
      const offset = index * 6;
      this.output.trailPositions[offset] = this.rear.x - this.side.x;
      this.output.trailPositions[offset + 1] = this.rear.y - this.side.y;
      this.output.trailPositions[offset + 2] = this.rear.z - this.side.z;
      this.output.trailPositions[offset + 3] = this.rear.x + this.side.x;
      this.output.trailPositions[offset + 4] = this.rear.y + this.side.y;
      this.output.trailPositions[offset + 5] = this.rear.z + this.side.z;
      this.output.trailAges[index] = age;
      this.output.trailDistances[index] = distance;
    }

    const echoCount = boost > 0.3 ? BIKE_ECHO_POOL_SIZE : 6;
    const echoSpacing = THREE.MathUtils.lerp(2.1, 1.05, boost);
    const baseAlpha = THREE.MathUtils.lerp(0.22, 0.31, boost) * fade;
    this.output.echoCount = echoCount;
    for (let index = 0; index < BIKE_ECHO_POOL_SIZE; index += 1) {
      const age = (index + 1) / (echoCount + 1);
      const distance = currentDistance - echoSpacing * (index + 1);
      this.sampleHistory(distance);
      this.leanQuaternion.setFromAxisAngle(this.axisX, this.sampledLean);
      this.pitchQuaternion.setFromAxisAngle(this.axisZ, this.sampledPitch);
      this.posedQuaternion.copy(this.routeQuaternion)
        .multiply(this.leanQuaternion)
        .multiply(this.pitchQuaternion);
      if (distance < 0) {
        this.side.set(distance, 0, 0).applyQuaternion(this.posedQuaternion);
        this.position.add(this.side);
      }
      this.side.set(0, BIKE_PITCH_PIVOT_Y, 0)
        .applyQuaternion(this.leanQuaternion)
        .applyQuaternion(this.routeQuaternion);
      this.rear.set(0, BIKE_PITCH_PIVOT_Y, 0)
        .applyQuaternion(this.posedQuaternion);
      this.position.add(this.side).sub(this.rear);
      this.matrix.compose(this.position, this.posedQuaternion, this.scale)
        .toArray(this.output.echoMatrices, index * 16);
      const visible = index < echoCount;
      const alpha = visible
        ? baseAlpha * THREE.MathUtils.lerp(1, 0.28, age)
        : 0;
      writeEchoColor(this.output.echoColors, index, age, alpha);
      this.output.echoAges[index] = age;
      this.output.echoDistances[index] = distance;
      this.output.echoSemantic[index] = this.sampledSemantic;
      this.output.echoLeans[index] = this.sampledLean;
      this.output.echoPitches[index] = this.sampledPitch;
    }
    return this.output;
  }
}

export function createBikeTrailSampler(path?: BikePath): BikeTrailSampler {
  return new BikeTrailSampler(path);
}
