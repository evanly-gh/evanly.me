import * as THREE from 'three';
import {
  BIKE_PITCH_PIVOT_Y,
  BIKE_WHEEL_AXLE_HEIGHT,
  BIKE_WHEEL_CENTERLINE_RADIUS,
  BIKE_WHEEL_OUTER_RADIUS,
  BIKE_WHEEL_TIRE_RADIUS,
  BIKE_WHEEL_TUBULAR_SEGMENTS,
  BIKE_WHEELBASE_HALF,
  type BikePose,
} from '../assets/bike';
import {
  BIKE_WHEEL_RIM_POINT_COUNT,
  createBikeWheelRimTransformScratch,
  mountedBikeWheelRimPositionsInto,
  type BikeWheelRimTransformScratch,
  type BikeWheelId,
} from './bikeContact';
import {
  JUNK,
  RAMP_RIDE_PLATE_PROUD_HEIGHT,
  RAMP2,
  SCAFFOLD,
  rampProfileHeight,
  rampProfileSlope,
} from '../world/setpieces';
import { STUNT_ROUTE } from '../world/stuntLayout';

export type RideSurfacePhase =
  | 'ground'
  | 'ramp1-face'
  | 'ramp1-lip'
  | 'aerial-1'
  | 'scaffold-landing'
  | 'scaffold-deck'
  | 'ramp2-face'
  | 'ramp2-lip'
  | 'aerial-2'
  | 'descent'
  | 'landing';

export interface RideSurfaceSample {
  phase: RideSurfacePhase;
  rideable: boolean;
  surfaceY: number | null;
  bikeRootY: number | null;
  wheelContactY: number | null;
}

export const BIKE_WHEEL_CONTACT_LOCAL_Y =
  BIKE_WHEEL_AXLE_HEIGHT - BIKE_WHEEL_OUTER_RADIUS;
export const RIDE_SURFACE_RENDER_TOLERANCE = 0.005;
export const MOUNTED_TIRE_CONTACT_TOLERANCE = 0.005;
export const SCAFFOLD_CONTACT_CAPTURE_START_T =
  STUNT_ROUTE.scaffoldLanding.t - 0.005;
const MOUNTED_TIRE_SAFETY_CLEARANCE = 0.002;
const CONTACT_RIM_BUFFER =
  new Float64Array(BIKE_WHEEL_RIM_POINT_COUNT * 3);
const CONTACT_RIM_SCRATCH = createBikeWheelRimTransformScratch();
const CONTACT_WHEEL_CENTER = new THREE.Vector3();
const CONTACT_POSED_QUATERNION = new THREE.Quaternion();
const CONTACT_AXIS_X = new THREE.Vector3();
const CONTACT_AXIS_Y = new THREE.Vector3();

export function ridePlateCenterOffset(
  thickness: number,
  slopeAngle: number,
): number {
  return -thickness / 2 * Math.cos(slopeAngle)
    + RAMP_RIDE_PLATE_PROUD_HEIGHT;
}

export function wheelContactYForRoot(rootY: number): number {
  return rootY + BIKE_WHEEL_CONTACT_LOCAL_Y;
}

export function bikeRootYForSurface(surfaceY: number): number {
  return surfaceY - BIKE_WHEEL_CONTACT_LOCAL_Y;
}

function curvedRampSurfaceY(
  z: number,
  base: readonly [number, number, number],
  run: number,
  rise: number,
): number {
  return base[1] + rampProfileHeight((base[2] - z) / run, rise);
}

/** Physical surface beneath a transformed tire point in the Projects corridor. */
export function rideSurfaceYAt(
  _semanticT: number,
  z: number,
  x = JUNK.base[0],
): number {
  let surfaceY = 0;
  const insideRamp1X = Math.abs(x - JUNK.base[0]) <= JUNK.width / 2;
  if (
    insideRamp1X
    && z <= JUNK.base[2]
    && z >= JUNK.base[2] - JUNK.run
  ) {
    surfaceY = Math.max(
      surfaceY,
      curvedRampSurfaceY(z, JUNK.base, JUNK.run, JUNK.rise),
    );
  }

  const insideDeckX =
    Math.abs(x - SCAFFOLD.deckCenter[0]) <= SCAFFOLD.deckWidth / 2;
  if (
    insideDeckX
    && z <= SCAFFOLD.deckCenter[2] + SCAFFOLD.deckLen / 2
    && z >= SCAFFOLD.deckCenter[2] - SCAFFOLD.deckLen / 2
  ) {
    surfaceY = Math.max(surfaceY, SCAFFOLD.deckY);
  }

  const insideRamp2X = Math.abs(x - RAMP2.base[0]) <= RAMP2.width / 2;
  if (
    insideRamp2X
    && z <= RAMP2.base[2]
    && z >= RAMP2.base[2] - RAMP2.run
  ) {
    surfaceY = Math.max(
      surfaceY,
      curvedRampSurfaceY(z, RAMP2.base, RAMP2.run, RAMP2.rise),
    );
  }
  return surfaceY;
}

/**
 * Selects the transformed rendered rear-tire vertex nearest its ride surface.
 * In aerial phases, where no surface exists, it selects the lowest transformed
 * rear-tire vertex. Callers may provide the packed rim buffer to reuse it.
 */
export function mountedRearTireContactPoint(
  semanticT: number,
  root: THREE.Vector3,
  routeQuaternion: THREE.Quaternion,
  pose: Pick<BikePose, 'lean' | 'pitch'>,
  target = new THREE.Vector3(),
  rimBuffer = new Float64Array(BIKE_WHEEL_RIM_POINT_COUNT * 3),
  scratch: BikeWheelRimTransformScratch =
    createBikeWheelRimTransformScratch(),
): THREE.Vector3 {
  mountedBikeWheelRimPositionsInto(
    rimBuffer,
    'rear',
    root,
    routeQuaternion,
    pose,
    scratch,
  );
  let selectedOffset = 0;
  let selectedScore = Number.POSITIVE_INFINITY;
  let foundSurface = false;
  for (let index = 0; index < BIKE_WHEEL_RIM_POINT_COUNT; index += 1) {
    const offset = index * 3;
    const surfaceY = rideSurfaceYAt(
      semanticT,
      rimBuffer[offset + 2],
      rimBuffer[offset],
    );
    if (surfaceY !== null) {
      const score = rimBuffer[offset + 1] - surfaceY;
      if (!foundSurface || score < selectedScore) {
        foundSurface = true;
        selectedScore = score;
        selectedOffset = offset;
      }
    } else if (!foundSurface && rimBuffer[offset + 1] < selectedScore) {
      selectedScore = rimBuffer[offset + 1];
      selectedOffset = offset;
    }
  }
  return target.fromArray(rimBuffer, selectedOffset);
}

function rampContactTangent(
  semanticT: number,
  startT: number,
  endT: number,
  base: readonly [number, number, number],
  run: number,
  rise: number,
): THREE.Vector3 {
  const fraction = (semanticT - startT) / (endT - startT);
  const centerZ = base[2] - run * fraction;
  let angle = Math.atan(rampProfileSlope(fraction, run, rise));
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const minima = { front: Infinity, rear: Infinity };
    for (const wheel of ['front', 'rear'] as const) {
      const wheelX = wheel === 'front'
        ? BIKE_WHEELBASE_HALF
        : -BIKE_WHEELBASE_HALF;
      for (
        let ringIndex = 0;
        ringIndex < BIKE_WHEEL_TUBULAR_SEGMENTS;
        ringIndex += 1
      ) {
        const ringAngle =
          ringIndex / BIKE_WHEEL_TUBULAR_SEGMENTS * Math.PI * 2;
        const localX =
          wheelX + BIKE_WHEEL_OUTER_RADIUS * Math.cos(ringAngle);
        const localY =
          BIKE_WHEEL_AXLE_HEIGHT
          + BIKE_WHEEL_OUTER_RADIUS * Math.sin(ringAngle);
        const pointZ = centerZ - localX * cos + localY * sin;
        const surfaceY = rideSurfaceYAt(semanticT, pointZ, base[0]);
        if (surfaceY !== null) {
          minima[wheel] = Math.min(
            minima[wheel],
            localX * sin + localY * cos - surfaceY,
          );
        }
      }
    }
    if (!Number.isFinite(minima.front) || !Number.isFinite(minima.rear)) break;
    const correction = THREE.MathUtils.clamp(
      (minima.rear - minima.front)
        / (BIKE_WHEELBASE_HALF * 2 * Math.max(0.2, cos)),
      -0.08,
      0.08,
    );
    angle += correction;
  }
  return new THREE.Vector3(0, Math.sin(angle), -Math.cos(angle));
}

/** Contact-aware mounted orientation over each flat-to-ramp transition. */
export function mountedBikeTangent(
  semanticT: number,
  routeTangent: THREE.Vector3,
): THREE.Vector3 {
  if (
    semanticT >= STUNT_ROUTE.ramp1Base.t
    && semanticT <= STUNT_ROUTE.ramp1Lip.t
  ) {
    return rampContactTangent(
      semanticT,
      STUNT_ROUTE.ramp1Base.t,
      STUNT_ROUTE.ramp1Lip.t,
      JUNK.base,
      JUNK.run,
      JUNK.rise,
    );
  }
  if (
    semanticT >= STUNT_ROUTE.ramp2Base.t
    && semanticT <= STUNT_ROUTE.ramp2Lip.t
  ) {
    return rampContactTangent(
      semanticT,
      STUNT_ROUTE.ramp2Base.t,
      STUNT_ROUTE.ramp2Lip.t,
      RAMP2.base,
      RAMP2.run,
      RAMP2.rise,
    );
  }
  return routeTangent.clone();
}

export interface MountedBikeContactSolution {
  rootY: number;
  lift: number;
  minimumClearance: number | null;
  wheelClearances: Record<BikeWheelId, number | null>;
}

/**
 * Raises the mounted root by the minimum amount required for the rendered
 * outer tire to clear every physical ride surface under its transformed rim.
 */
export function solveMountedBikeContact(
  semanticT: number,
  nominalRoot: THREE.Vector3,
  routeQuaternion: THREE.Quaternion,
  pose: Pick<BikePose, 'lean' | 'pitch'>,
): MountedBikeContactSolution {
  if (semanticT < 0.32 || semanticT > 0.7) {
    return {
      rootY: nominalRoot.y,
      lift: 0,
      minimumClearance: null,
      wheelClearances: { front: null, rear: null },
    };
  }
  const minima: Record<BikeWheelId, number> = {
    front: Infinity,
    rear: Infinity,
  };
  for (const wheel of ['front', 'rear'] as const) {
    mountedBikeWheelRimPositionsInto(
      CONTACT_RIM_BUFFER,
      wheel,
      nominalRoot,
      routeQuaternion,
      pose,
      CONTACT_RIM_SCRATCH,
    );
    for (let index = 0; index < BIKE_WHEEL_RIM_POINT_COUNT; index += 1) {
      const offset = index * 3;
      const surfaceY = rideSurfaceYAt(
        semanticT,
        CONTACT_RIM_BUFFER[offset + 2],
        CONTACT_RIM_BUFFER[offset],
      );
      if (surfaceY === null) continue;
      minima[wheel] = Math.min(
        minima[wheel],
        CONTACT_RIM_BUFFER[offset + 1] - surfaceY,
      );
    }
    if (
      semanticT >= STUNT_ROUTE.descentTop.t
      && semanticT <= STUNT_ROUTE.groundResume.t
    ) {
      const wheelX = wheel === 'front'
        ? BIKE_WHEELBASE_HALF
        : -BIKE_WHEELBASE_HALF;
      CONTACT_WHEEL_CENTER.set(
        wheelX,
        BIKE_WHEEL_AXLE_HEIGHT - BIKE_PITCH_PIVOT_Y,
        0,
      )
        .applyQuaternion(CONTACT_RIM_SCRATCH.pitch);
      CONTACT_WHEEL_CENTER.y += BIKE_PITCH_PIVOT_Y;
      CONTACT_WHEEL_CENTER
        .applyQuaternion(CONTACT_RIM_SCRATCH.lean)
        .applyQuaternion(routeQuaternion)
        .add(nominalRoot);
      CONTACT_POSED_QUATERNION.copy(routeQuaternion)
        .multiply(CONTACT_RIM_SCRATCH.lean)
        .multiply(CONTACT_RIM_SCRATCH.pitch);
      CONTACT_AXIS_X.set(1, 0, 0)
        .applyQuaternion(CONTACT_POSED_QUATERNION);
      CONTACT_AXIS_Y.set(0, 1, 0)
        .applyQuaternion(CONTACT_POSED_QUATERNION);
      const verticalRadius =
        BIKE_WHEEL_CENTERLINE_RADIUS * Math.hypot(
          CONTACT_AXIS_X.y,
          CONTACT_AXIS_Y.y,
        )
        + BIKE_WHEEL_TIRE_RADIUS;
      minima[wheel] = Math.min(
        minima[wheel],
        CONTACT_WHEEL_CENTER.y - verticalRadius,
      );
    }
  }
  const minimum = Math.min(minima.front, minima.rear);
  if (!Number.isFinite(minimum)) {
    return {
      rootY: nominalRoot.y,
      lift: 0,
      minimumClearance: null,
      wheelClearances: { front: null, rear: null },
    };
  }
  const requestedCorrection = MOUNTED_TIRE_SAFETY_CLEARANCE - minimum;
  const lift = sampleRideSurface(semanticT).rideable
    ? requestedCorrection
    : Math.max(0, requestedCorrection);
  return {
    rootY: nominalRoot.y + lift,
    lift,
    minimumClearance: minimum + lift,
    wheelClearances: {
      front: Number.isFinite(minima.front) ? minima.front + lift : null,
      rear: Number.isFinite(minima.rear) ? minima.rear + lift : null,
    },
  };
}

function rideable(
  phase: RideSurfacePhase,
  surfaceY: number,
): RideSurfaceSample {
  const bikeRootY = bikeRootYForSurface(surfaceY);
  return Object.freeze({
    phase,
    rideable: true,
    surfaceY,
    bikeRootY,
    wheelContactY: wheelContactYForRoot(bikeRootY),
  });
}

function aerial(phase: RideSurfacePhase): RideSurfaceSample {
  return Object.freeze({
    phase,
    rideable: false,
    surfaceY: null,
    bikeRootY: null,
    wheelContactY: null,
  });
}

function rampHeight(
  t: number,
  startT: number,
  endT: number,
  startY: number,
  endY: number,
): number {
  const fraction = (t - startT) / (endT - startT);
  return startY + rampProfileHeight(fraction, endY - startY);
}

/** Pure Projects contact contract; aerial phases deliberately have no surface. */
export function sampleRideSurface(semanticT: number): RideSurfaceSample {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Ride-surface progress must be finite');
  }
  const t = Math.max(0, Math.min(1, semanticT));
  if (t < STUNT_ROUTE.ramp1Base.t) return rideable('ground', 0);
  if (t <= STUNT_ROUTE.ramp1Lip.t) {
    const phase = t === STUNT_ROUTE.ramp1Lip.t
      ? 'ramp1-lip'
      : 'ramp1-face';
    return rideable(phase, rampHeight(
      t,
      STUNT_ROUTE.ramp1Base.t,
      STUNT_ROUTE.ramp1Lip.t,
      STUNT_ROUTE.ramp1Base.position[1],
      STUNT_ROUTE.ramp1Lip.position[1],
    ));
  }
  if (t < STUNT_ROUTE.scaffoldLanding.t) return aerial('aerial-1');
  if (t === STUNT_ROUTE.scaffoldLanding.t) {
    return rideable('scaffold-landing', STUNT_ROUTE.scaffoldLanding.position[1]);
  }
  if (t < STUNT_ROUTE.ramp2Base.t) {
    return rideable('scaffold-deck', STUNT_ROUTE.scaffoldLanding.position[1]);
  }
  if (t <= STUNT_ROUTE.ramp2Lip.t) {
    const phase = t === STUNT_ROUTE.ramp2Lip.t
      ? 'ramp2-lip'
      : 'ramp2-face';
    return rideable(phase, rampHeight(
      t,
      STUNT_ROUTE.ramp2Base.t,
      STUNT_ROUTE.ramp2Lip.t,
      STUNT_ROUTE.ramp2Base.position[1],
      STUNT_ROUTE.ramp2Lip.position[1],
    ));
  }
  if (t < STUNT_ROUTE.descentTop.t) return aerial('aerial-2');
  if (t < STUNT_ROUTE.groundResume.t) return aerial('descent');
  if (t === STUNT_ROUTE.groundResume.t) return rideable('landing', 0);
  return rideable('ground', 0);
}
