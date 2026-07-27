import * as THREE from 'three';
import {
  BIKE_PITCH_PIVOT_Y,
  BIKE_WHEEL_AXLE_HEIGHT,
  BIKE_WHEEL_CENTERLINE_RADIUS,
  BIKE_WHEEL_RADIAL_SEGMENTS,
  BIKE_WHEEL_TIRE_RADIUS,
  BIKE_WHEEL_TUBULAR_SEGMENTS,
  BIKE_WHEELBASE_HALF,
  type BikePose,
} from '../assets/bike';

export type BikeWheelId = 'front' | 'rear';

export interface BikeWheelRimPoint {
  wheel: BikeWheelId;
  position: THREE.Vector3;
}

const LEAN_AXIS = new THREE.Vector3(1, 0, 0);
const PITCH_AXIS = new THREE.Vector3(0, 0, 1);
export const BIKE_WHEEL_RIM_POINT_COUNT =
  BIKE_WHEEL_TUBULAR_SEGMENTS * BIKE_WHEEL_RADIAL_SEGMENTS;

export interface BikeWheelRimTransformScratch {
  pitch: THREE.Quaternion;
  lean: THREE.Quaternion;
  position: THREE.Vector3;
}

export function createBikeWheelRimTransformScratch():
BikeWheelRimTransformScratch {
  return {
    pitch: new THREE.Quaternion(),
    lean: new THREE.Quaternion(),
    position: new THREE.Vector3(),
  };
}

/**
 * Writes the exact rendered tire-rim vertices for one wheel into a reusable
 * packed xyz buffer. This is the allocation-stable canonical wheel transform.
 */
export function mountedBikeWheelRimPositionsInto(
  target: Float64Array,
  wheel: BikeWheelId,
  root: THREE.Vector3,
  routeQuaternion: THREE.Quaternion,
  pose: Pick<BikePose, 'lean' | 'pitch'>,
  scratch = createBikeWheelRimTransformScratch(),
): Float64Array {
  if (target.length < BIKE_WHEEL_RIM_POINT_COUNT * 3) {
    throw new Error('Wheel rim target buffer is too small');
  }
  const pitch = scratch.pitch.setFromAxisAngle(PITCH_AXIS, pose.pitch);
  const lean = scratch.lean.setFromAxisAngle(LEAN_AXIS, pose.lean);
  const position = scratch.position;
  const wheelX = wheel === 'front'
    ? BIKE_WHEELBASE_HALF
    : -BIKE_WHEELBASE_HALF;
  for (let index = 0; index < BIKE_WHEEL_RIM_POINT_COUNT; index += 1) {
    const ringIndex = index % BIKE_WHEEL_TUBULAR_SEGMENTS;
    const tubeIndex = Math.floor(index / BIKE_WHEEL_TUBULAR_SEGMENTS);
    const ringAngle =
      ringIndex / BIKE_WHEEL_TUBULAR_SEGMENTS * Math.PI * 2;
    const tubeAngle =
      tubeIndex / BIKE_WHEEL_RADIAL_SEGMENTS * Math.PI * 2;
    const ringRadius =
      BIKE_WHEEL_CENTERLINE_RADIUS
      + BIKE_WHEEL_TIRE_RADIUS * Math.cos(tubeAngle);
    position.set(
      wheelX + ringRadius * Math.cos(ringAngle),
      BIKE_WHEEL_AXLE_HEIGHT
        + ringRadius * Math.sin(ringAngle)
        - BIKE_PITCH_PIVOT_Y,
      BIKE_WHEEL_TIRE_RADIUS * Math.sin(tubeAngle),
    )
      .applyQuaternion(pitch);
    position.y += BIKE_PITCH_PIVOT_Y;
    position
      .applyQuaternion(lean)
      .applyQuaternion(routeQuaternion)
      .add(root)
      .toArray(target, index * 3);
  }
  return target;
}

/**
 * Transforms rendered outer-tire rim points through bikeBody → pitchPivot →
 * chassisTilt → route mount, matching buildBike/applyBikeProgress.
 */
export function mountedBikeWheelRimPoints(
  root: THREE.Vector3,
  routeQuaternion: THREE.Quaternion,
  pose: Pick<BikePose, 'lean' | 'pitch'>,
): BikeWheelRimPoint[] {
  const buffer = new Float64Array(BIKE_WHEEL_RIM_POINT_COUNT * 3);
  const result: BikeWheelRimPoint[] = [];
  for (const wheel of ['front', 'rear'] as const) {
    mountedBikeWheelRimPositionsInto(
      buffer,
      wheel,
      root,
      routeQuaternion,
      pose,
    );
    for (let index = 0; index < BIKE_WHEEL_RIM_POINT_COUNT; index += 1) {
      result.push({
        wheel,
        position: new THREE.Vector3().fromArray(buffer, index * 3),
      });
    }
  }
  return result;
}
