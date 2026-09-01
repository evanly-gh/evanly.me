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

export const BIKE_TRAIL_MAX_SAMPLES = 128;

const TRAIL_STEP_METERS = 0.42;
const TRAIL_HALF_WIDTH = 0.14;
// The live ribbon is now just a SHORT streak right behind the bike — the long
// sandevistan smear was replaced by the persistent afterimage field (frozen
// silhouettes revealed along the whole route; see buildBikeAfterimageField). Kept
// short so it reads as a bright motion streak, not a trail the bike drags along.
const MIN_TRAIL_LENGTH = 6;
const MAX_TRAIL_LENGTH = 16;
const HISTORY_DISTANCE_QUANTUM = 0.5;
const DEFAULT_BIKE_PATH = new BikePath();
export const BIKE_TRAIL_HISTORY_BIN_COUNT =
  Math.floor(SEMANTIC_ROUTE_LENGTH / HISTORY_DISTANCE_QUANTUM + 0.5) + 1;
const HISTORY_VALUES_PER_BIN = 13;
export const BIKE_TRAIL_HISTORY_BYTES =
  BIKE_TRAIL_HISTORY_BIN_COUNT
  * HISTORY_VALUES_PER_BIN
  * Float64Array.BYTES_PER_ELEMENT;

// Persistent afterimage field: frozen bike silhouettes placed every
// BIKE_AFTERIMAGE_SPACING metres along the ENTIRE route, invisible until the bike
// reaches each spot, then revealed and LEFT in place (the reveal distance is
// latched to the max reached, so a silhouette never disappears once passed). Each
// silhouette steps through an alternating cyberpunk gradient by index. ~640 ghost
// instances (~300 tris each) ≈ 190k tris in a single instanced draw — cheap
// against the scene's triangle budget.
export const BIKE_AFTERIMAGE_SPACING = 3.4;
export const BIKE_AFTERIMAGE_MAX = 640;
const AFTERIMAGE_FEATHER_METERS = 2.6;
const AFTERIMAGE_BASE_ALPHA = 0.4;
// Silhouettes step through this five-shade spectrum (green → blue → indigo →
// purple → magenta, then wrap), one full loop every AFTERIMAGE_COLOR_CYCLE
// silhouettes, so the frozen field flows through the whole spectrum instead of
// just ping-ponging cyan↔pink.
const AFTERIMAGE_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.20, 1.00, 0.45], // green
  [0.05, 0.60, 1.00], // blue
  [0.32, 0.26, 1.00], // indigo
  [0.62, 0.20, 1.00], // purple
  [1.00, 0.20, 0.78], // magenta
];
const AFTERIMAGE_COLOR_CYCLE = 22;

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

// ---------------------------------------------------------------------------
// Persistent afterimage field
// ---------------------------------------------------------------------------

export interface BikeAfterimageField {
  /** Number of frozen silhouettes placed along the route. */
  readonly count: number;
  /** count * 16 — static local transform of each silhouette. */
  readonly matrices: Float32Array;
  /** count * 3 — static cyberpunk gradient colour of each silhouette. */
  readonly colors: Float32Array;
  /** count — route arc-distance at which each silhouette sits. */
  readonly distances: Float32Array;
}

function writeAfterimageColor(
  target: Float32Array,
  index: number,
  colorIndex: number,
): void {
  const offset = index * 3;
  // Walk the palette continuously: phase 0..1 spans all five shades and wraps, so
  // consecutive silhouettes flow green → blue → indigo → purple → magenta → green.
  const phase = (colorIndex % AFTERIMAGE_COLOR_CYCLE) / AFTERIMAGE_COLOR_CYCLE;
  const scaled = phase * AFTERIMAGE_PALETTE.length;
  const startIndex = Math.floor(scaled) % AFTERIMAGE_PALETTE.length;
  const endIndex = (startIndex + 1) % AFTERIMAGE_PALETTE.length;
  const fraction = scaled - Math.floor(scaled);
  const start = AFTERIMAGE_PALETTE[startIndex];
  const end = AFTERIMAGE_PALETTE[endIndex];
  target[offset] = THREE.MathUtils.lerp(start[0], end[0], fraction);
  target[offset + 1] = THREE.MathUtils.lerp(start[1], end[1], fraction);
  target[offset + 2] = THREE.MathUtils.lerp(start[2], end[2], fraction);
}

/**
 * Precompute the frozen silhouette transforms + colours for the whole route.
 * Called once; the result is static (only per-instance alpha changes at runtime).
 */
export function buildBikeAfterimageField(
  path: BikePath = DEFAULT_BIKE_PATH,
): BikeAfterimageField {
  const history = bikeTrailHistoryFor(path);
  const total = routeDistanceAt(1);
  const count = Math.min(
    BIKE_AFTERIMAGE_MAX,
    Math.max(1, Math.floor(total / BIKE_AFTERIMAGE_SPACING) + 1),
  );
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 3);
  const distances = new Float32Array(count);

  const position = new THREE.Vector3();
  const routeQuaternion = new THREE.Quaternion();
  const leanQuaternion = new THREE.Quaternion();
  const pitchQuaternion = new THREE.Quaternion();
  const posedQuaternion = new THREE.Quaternion();
  const lift = new THREE.Vector3();
  const rear = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3(1, 1, 1);
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  for (let index = 0; index < count; index += 1) {
    const distance = Math.min(total, index * BIKE_AFTERIMAGE_SPACING);
    const slot = Math.min(
      BIKE_TRAIL_HISTORY_BIN_COUNT - 1,
      Math.round(distance / HISTORY_DISTANCE_QUANTUM),
    );
    position.fromArray(history.positions, slot * 3);
    routeQuaternion.fromArray(history.quaternions, slot * 4);
    const lean = history.leans[slot];
    const pitch = history.pitches[slot];
    leanQuaternion.setFromAxisAngle(axisX, lean);
    pitchQuaternion.setFromAxisAngle(axisZ, pitch);
    posedQuaternion.copy(routeQuaternion)
      .multiply(leanQuaternion)
      .multiply(pitchQuaternion);
    // Same pivot alignment the old moving echoes used, so the posed silhouette
    // sits on the bike's centre rather than floating off it.
    lift.set(0, BIKE_PITCH_PIVOT_Y, 0)
      .applyQuaternion(leanQuaternion)
      .applyQuaternion(routeQuaternion);
    rear.set(0, BIKE_PITCH_PIVOT_Y, 0).applyQuaternion(posedQuaternion);
    position.add(lift).sub(rear);
    matrix.compose(position, posedQuaternion, scale)
      .toArray(matrices, index * 16);
    writeAfterimageColor(colors, index, index);
    distances[index] = distance;
  }
  return Object.freeze({ count, matrices, colors, distances });
}

/**
 * Fill `out` (length >= field.count) with each silhouette's alpha for the given
 * revealed distance. Because `revealedDistance` is latched to the max reached, an
 * alpha only ever rises: a silhouette fades in as the bike passes it and then
 * stays. `globalFade` folds in the finale fade-out.
 */
export function writeAfterimageAlphas(
  field: BikeAfterimageField,
  revealedDistance: number,
  globalFade: number,
  out: Float32Array,
): void {
  const fade = clamp01(globalFade);
  for (let index = 0; index < field.count; index += 1) {
    const reveal = clamp01(
      (revealedDistance - field.distances[index]) / AFTERIMAGE_FEATHER_METERS,
    );
    out[index] = reveal * AFTERIMAGE_BASE_ALPHA * fade;
  }
}

/** Route arc-distance the bike has reached at the given semantic progress. */
export function bikeAfterimageDistanceAt(semanticT: number): number {
  return routeDistanceAt(clamp01(semanticT));
}

/**
 * Fixed-pool sampler for the short ridden ribbon. Expensive BikePath evaluation is
 * captured once (shared history); update() only mutates typed arrays and scratch
 * Three values retained by this instance.
 */
export class BikeTrailSampler {
  private readonly output: BikeTrailSample = {
    trailCount: 2,
    trailLength: MIN_TRAIL_LENGTH,
    trailPositions: new Float32Array(BIKE_TRAIL_MAX_SAMPLES * 6),
    trailAges: new Float32Array(BIKE_TRAIL_MAX_SAMPLES),
    trailDistances: new Float32Array(BIKE_TRAIL_MAX_SAMPLES),
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
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly axisZ = new THREE.Vector3(0, 0, 1);
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
    const currentDistance = routeDistanceAt(progress);
    const speedProbeStart = routeDistanceAt(Math.max(0, progress - 0.002));
    const speedProbeEnd = routeDistanceAt(Math.min(1, progress + 0.002));
    const physicalSpeed = speedProbeEnd - speedProbeStart;
    const boost = boostAt(progress);
    const trailLength = THREE.MathUtils.clamp(
      8 + physicalSpeed * 0.6 + boost * 8,
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
      // Clamp to the route start: the streak exists only from where the bike began
      // (distance 0) back from the head — never synthesized *before* the start.
      const distance = Math.max(0, currentDistance - trailLength * age);
      if (index === 0 && currentState) {
        this.position.copy(currentState.pos);
        this.routeQuaternion.copy(currentState.quat);
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
      // No pre-start extension: samples before the route origin clamp to it, so
      // the ribbon collapses to a point there instead of reaching onto the road.
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

    return this.output;
  }
}

export function createBikeTrailSampler(path?: BikePath): BikeTrailSampler {
  return new BikeTrailSampler(path);
}
