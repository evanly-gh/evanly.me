import * as THREE from 'three';
import type { CamPose } from './cameraRig';
import { MOON_POS, sampleRoute } from '../world/route';
import {
  STUNT_CAMERA_SIDE,
} from '../world/stuntGeometry';
import {
  buildingPlacementBounds,
  type BuildingPlacementLike,
  type OrientedBuildingBounds,
} from '../world/buildingCatalog';
import { buildCityLayout } from '../world/cityLayout';

export interface CameraPoseSampler {
  sample(t: number): CamPose;
}

export interface ProductionCameraConstraintViolation {
  id: string;
  t: number;
  message: string;
}

export const PRODUCTION_CAMERA_CLEARANCE_DIVISIONS = 5000;

export interface ProductionCameraClearanceViolation {
  id:
    | 'camera-building-clearance'
    | 'bike-building-sightline'
    | 'road-building-sightline';
  t: number;
  buildingIndex: number;
}

export interface ProductionCameraClearanceProfile {
  sampleCount: number;
  minimumCameraBody: number;
  minimumBikeSightline: number;
  minimumRoadSightline: number;
  violations: ProductionCameraClearanceViolation[];
}

interface DetailedCameraClearance {
  cameraBody: number;
  cameraBodyBuildingIndex: number;
  bikeSightline: number;
  bikeSightlineBuildingIndex: number;
  roadSightline: number;
  roadSightlineBuildingIndex: number;
}

function toBuildingLocal(
  point: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): THREE.Vector3 {
  const x = point.x - bounds.center.x;
  const z = point.z - bounds.center.z;
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return new THREE.Vector3(
    x * cos - z * sin,
    point.y,
    x * sin + z * cos,
  );
}

function pointOrientedBoxClearance(
  point: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): number {
  const local = toBuildingLocal(point, bounds);
  const distances = new THREE.Vector3(
    Math.abs(local.x) - bounds.halfX,
    Math.abs(local.y - bounds.height / 2) - bounds.height / 2,
    Math.abs(local.z) - bounds.halfZ,
  );
  const outside = new THREE.Vector3(
    Math.max(0, distances.x),
    Math.max(0, distances.y),
    Math.max(0, distances.z),
  );
  return outside.length() > 0
    ? outside.length()
    : Math.max(distances.x, distances.y, distances.z);
}

function segmentIntersectsOrientedBox(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): boolean {
  const localStart = toBuildingLocal(start, bounds);
  const delta = toBuildingLocal(end, bounds).sub(localStart);
  let minimum = 0;
  let maximum = 1;
  for (const [origin, direction, low, high] of [
    [localStart.x, delta.x, -bounds.halfX, bounds.halfX],
    [localStart.y, delta.y, 0, bounds.height],
    [localStart.z, delta.z, -bounds.halfZ, bounds.halfZ],
  ] as const) {
    if (Math.abs(direction) < 1e-12) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const first = (low - origin) / direction;
    const second = (high - origin) / direction;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 1e-6 && minimum < 1 - 1e-6;
}

function measureDetailedCameraClearance(
  pose: CamPose,
  semanticT: number,
  buildings: readonly BuildingPlacementLike[],
): DetailedCameraClearance {
  const bike = sampleRoute(semanticT).pos.clone().add(new THREE.Vector3(0, 2, 0));
  const upcomingRoute = sampleRoute(Math.min(1, semanticT + 0.006));
  const upcomingRoad = upcomingRoute.pos.clone()
    .addScaledVector(upcomingRoute.tangent, 4)
    .add(new THREE.Vector3(0, 2, 0));
  const result: DetailedCameraClearance = {
    cameraBody: Number.POSITIVE_INFINITY,
    cameraBodyBuildingIndex: -1,
    bikeSightline: Number.POSITIVE_INFINITY,
    bikeSightlineBuildingIndex: -1,
    roadSightline: Number.POSITIVE_INFINITY,
    roadSightlineBuildingIndex: -1,
  };
  buildings.forEach((placement, buildingIndex) => {
    const bounds = buildingPlacementBounds(placement);
    const cameraBody = pointOrientedBoxClearance(pose.position, bounds);
    if (cameraBody < result.cameraBody) {
      result.cameraBody = cameraBody;
      result.cameraBodyBuildingIndex = buildingIndex;
    }
    const bikeSightline = segmentIntersectsOrientedBox(
      pose.position,
      bike,
      bounds,
    ) ? -1 : 1;
    if (bikeSightline < result.bikeSightline) {
      result.bikeSightline = bikeSightline;
      result.bikeSightlineBuildingIndex = buildingIndex;
    }
    const roadSightline = segmentIntersectsOrientedBox(
      pose.position,
      upcomingRoad,
      bounds,
    ) ? -1 : 1;
    if (roadSightline < result.roadSightline) {
      result.roadSightline = roadSightline;
      result.roadSightlineBuildingIndex = buildingIndex;
    }
  });
  return result;
}

export function measureCameraBodyAndRoadClearance(
  pose: CamPose,
  semanticT: number,
  buildings: readonly BuildingPlacementLike[],
): { cameraBody: number; bikeSightline: number; roadSightline: number } {
  const measured = measureDetailedCameraClearance(pose, semanticT, buildings);
  return {
    cameraBody: measured.cameraBody,
    bikeSightline: measured.bikeSightline,
    roadSightline: measured.roadSightline,
  };
}

export function profileProductionCameraClearance(
  rig: CameraPoseSampler,
  buildings: readonly BuildingPlacementLike[],
  divisions = PRODUCTION_CAMERA_CLEARANCE_DIVISIONS,
): ProductionCameraClearanceProfile {
  if (!Number.isInteger(divisions) || divisions < 1) {
    throw new Error('Production camera clearance divisions must be a positive integer');
  }
  const profile: ProductionCameraClearanceProfile = {
    sampleCount: divisions + 1,
    minimumCameraBody: Number.POSITIVE_INFINITY,
    minimumBikeSightline: Number.POSITIVE_INFINITY,
    minimumRoadSightline: Number.POSITIVE_INFINITY,
    violations: [],
  };
  const reported = new Set<string>();
  for (let index = 0; index <= divisions; index += 1) {
    const t = index / divisions;
    const measured = measureDetailedCameraClearance(
      rig.sample(t),
      t,
      buildings,
    );
    profile.minimumCameraBody = Math.min(
      profile.minimumCameraBody,
      measured.cameraBody,
    );
    profile.minimumBikeSightline = Math.min(
      profile.minimumBikeSightline,
      measured.bikeSightline,
    );
    profile.minimumRoadSightline = Math.min(
      profile.minimumRoadSightline,
      measured.roadSightline,
    );
    for (const [id, clearance, buildingIndex] of [
      [
        'camera-building-clearance',
        measured.cameraBody - 1,
        measured.cameraBodyBuildingIndex,
      ],
      [
        'bike-building-sightline',
        measured.bikeSightline,
        measured.bikeSightlineBuildingIndex,
      ],
      [
        'road-building-sightline',
        measured.roadSightline,
        measured.roadSightlineBuildingIndex,
      ],
    ] as const) {
      if (clearance > 0 || reported.has(id)) continue;
      reported.add(id);
      profile.violations.push({ id, t, buildingIndex });
    }
  }
  return profile;
}

export const PRODUCTION_CAMERA_SECTION_CONSTRAINTS = Object.freeze({
  intro: Object.freeze({
    maximumHeight: 38,
    minimumFov: 30,
    maximumFov: 56,
  }),
  about: Object.freeze({
    minimumX: -70,
    maximumX: -50,
    minimumZ: -45,
    maximumZ: -30,
    minimumHeight: 2,
    maximumHeight: 8,
    minimumFov: 18,
    maximumFov: 26,
  }),
  projects: Object.freeze({
    side: 'west' as const,
    minimumX: 160,
    maximumX: STUNT_CAMERA_SIDE.productionX + 8,
    minimumHeight: 20,
    maximumHeight: 35,
    minimumFov: 42,
    maximumFov: 50,
    maximumTangentDot: 0.08,
  }),
  research: Object.freeze({
    minimumHeight: 1.35,
    maximumHeight: 2.1,
    minimumFov: 36,
    maximumFov: 69,
    minimumForwardDot: 0.7,
    minimumLookAhead: 30,
    maximumLookAhead: 42,
    minimumPitchDegrees: 24,
  }),
  bridge: Object.freeze({
    minimumHeight: 28,
    maximumHeight: 32,
    minimumFov: 44,
    maximumFov: 56,
    minimumForwardDot: 0.85,
  }),
  finale: Object.freeze({
    minimumHeight: 28,
    maximumHeight: 32,
    minimumFov: 36,
    maximumFov: 50,
    maximumMoonTargetError: 1,
  }),
});

export const PRODUCTION_SHOT_EXPECTATIONS = Object.freeze([
  Object.freeze({
    id: 'about',
    semanticT: 0.192,
    subjectIds: Object.freeze(['about-hero-screen']),
    minimumBikeWidth: 56,
    minimumBikeHeight: 27,
  }),
  Object.freeze({
    id: 'projects-flip-1',
    semanticT: 0.41,
    subjectIds: Object.freeze(['project-ttt-e2e', 'project-rememberme']),
    minimumBikeWidth: 40,
    minimumBikeHeight: 20,
  }),
  Object.freeze({
    id: 'projects-scaffold',
    semanticT: 0.5,
    subjectIds: Object.freeze(['stunt-scaffold-pole']),
    minimumBikeWidth: 38,
    minimumBikeHeight: 18,
  }),
  Object.freeze({
    id: 'projects-flip-2',
    semanticT: 0.59,
    subjectIds: Object.freeze([
      'project-mandarin',
      'project-bellevue',
      'project-dubhacks',
    ]),
    minimumBikeWidth: 40,
    minimumBikeHeight: 20,
  }),
  Object.freeze({
    id: 'research-midpoint',
    semanticT: 0.76,
    subjectIds: Object.freeze([
      'research-gateway-2:face-panel',
      'research-gateway-2:facade-panel',
    ]),
    minimumBikeWidth: 55,
    minimumBikeHeight: 32,
  }),
  Object.freeze({
    id: 'research-end',
    semanticT: 0.84,
    subjectIds: Object.freeze(['research-end:facade-panel']),
    minimumBikeWidth: 55,
    minimumBikeHeight: 32,
  }),
  Object.freeze({
    id: 'bridge',
    semanticT: 0.89,
    subjectIds: Object.freeze(['task4-bridge-deck-top']),
    minimumBikeWidth: 4,
    minimumBikeHeight: 11,
  }),
  Object.freeze({
    id: 'finale',
    semanticT: 1,
    subjectIds: Object.freeze(['task4-moon-surface']),
    minimumBikeWidth: 3,
    minimumBikeHeight: 7,
  }),
]);

function inRange(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

export function evaluateProductionCameraConstraints(
  rig: CameraPoseSampler,
): ProductionCameraConstraintViolation[] {
  const violations: ProductionCameraConstraintViolation[] = [];
  const add = (id: string, t: number, message: string) => {
    if (!violations.some((violation) => violation.id === id)) {
      violations.push({ id, t, message });
    }
  };

  for (const t of [0, 0.06, 0.1]) {
    const pose = rig.sample(t);
    const route = sampleRoute(t);
    const cameraOffset = pose.position.clone().sub(route.pos);
    const look = pose.target.clone().sub(route.pos);
    if (
      pose.position.y > PRODUCTION_CAMERA_SECTION_CONSTRAINTS.intro.maximumHeight
      || !inRange(
        pose.fov,
        PRODUCTION_CAMERA_SECTION_CONSTRAINTS.intro.minimumFov,
        PRODUCTION_CAMERA_SECTION_CONSTRAINTS.intro.maximumFov,
      )
      || cameraOffset.dot(route.tangent) >= 0
      || look.dot(route.tangent) <= 0
    ) add('intro-chase', t, 'Intro camera must chase from behind and look ahead');
  }

  {
    const t = 0.192;
    const pose = rig.sample(t);
    const rule = PRODUCTION_CAMERA_SECTION_CONSTRAINTS.about;
    if (
      !inRange(pose.position.x, rule.minimumX, rule.maximumX)
      || !inRange(pose.position.z, rule.minimumZ, rule.maximumZ)
    ) {
      add('about-camera-side', t, 'About camera must look north down the side street');
    }
    if (
      !inRange(pose.position.y, rule.minimumHeight, rule.maximumHeight)
      || !inRange(pose.fov, rule.minimumFov, rule.maximumFov)
      || !inRange(pose.target.x, -70, -50)
      || !inRange(pose.target.y, 6, 18)
      || !inRange(pose.target.z, 100, 120)
    ) add('about-reveal-composition', t, 'About camera must frame the protected hero reveal');
  }

  for (let index = 0; index <= 140; index += 1) {
    const t = THREE.MathUtils.lerp(0.36, 0.64, index / 140);
    const pose = rig.sample(t);
    const rule = PRODUCTION_CAMERA_SECTION_CONSTRAINTS.projects;
    const view = pose.target.clone().sub(pose.position).setY(0).normalize();
    const route = sampleRoute(t).tangent.clone().setY(0).normalize();
    if (Math.abs(view.dot(route)) > rule.maximumTangentDot || view.x < 0.98) {
      add('projects-perpendicular', t, 'Projects must remain east-facing and perpendicular');
    }
    if (t <= 0.59 && (
      !inRange(pose.position.x, rule.minimumX, rule.maximumX)
      || !inRange(pose.position.y, rule.minimumHeight, rule.maximumHeight)
      || !inRange(pose.fov, rule.minimumFov, rule.maximumFov)
      || !inRange(
        pose.target.x,
        STUNT_CAMERA_SIDE.targetMinX,
        STUNT_CAMERA_SIDE.targetMaxX,
      )
    )) add('projects-west-side', t, 'Projects camera must remain on the west side');
  }

  for (const t of [0.712, 0.76, 0.775, 0.84]) {
    const pose = rig.sample(t);
    const rule = PRODUCTION_CAMERA_SECTION_CONSTRAINTS.research;
    const view = pose.target.clone().sub(pose.position);
    const horizontalLookAhead = view.clone().setY(0).length();
    const pitchDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(view.y, horizontalLookAhead),
    );
    const route = sampleRoute(t).tangent.clone().normalize();
    if (!inRange(pose.position.y, rule.minimumHeight, rule.maximumHeight)) {
      add('research-camera-height', t, 'Research camera must remain low');
    }
    if (
      !inRange(pose.fov, rule.minimumFov, rule.maximumFov)
      || !inRange(horizontalLookAhead, rule.minimumLookAhead, rule.maximumLookAhead)
      || view.normalize().dot(route) < rule.minimumForwardDot
      || pitchDegrees < rule.minimumPitchDegrees
    ) add('research-forward-grammar', t, 'Research camera must look low, forward, and steeply upward');
  }

  {
    const t = 0.89;
    const pose = rig.sample(t);
    const bike = sampleRoute(t);
    const rule = PRODUCTION_CAMERA_SECTION_CONSTRAINTS.bridge;
    const view = pose.target.clone().sub(pose.position).normalize();
    if (
      !inRange(pose.position.y, rule.minimumHeight, rule.maximumHeight)
      || !inRange(pose.fov, rule.minimumFov, rule.maximumFov)
      || pose.position.z <= bike.pos.z
      || pose.target.z >= bike.pos.z
      || view.dot(bike.tangent) < rule.minimumForwardDot
    ) add('bridge-chase', t, 'Bridge camera must chase from behind toward the deck');
  }

  {
    const t = 1;
    const pose = rig.sample(t);
    const rule = PRODUCTION_CAMERA_SECTION_CONSTRAINTS.finale;
    if (
      !inRange(pose.position.y, rule.minimumHeight, rule.maximumHeight)
      || !inRange(pose.fov, rule.minimumFov, rule.maximumFov)
      || pose.target.distanceTo(MOON_POS) > rule.maximumMoonTargetError
    ) add('finale-moon-target', t, 'Finale camera must resolve directly on the moon');
  }

  const clearance = profileProductionCameraClearance(rig, buildCityLayout());
  for (const violation of clearance.violations) {
    add(
      violation.id,
      violation.t,
      `Production camera clearance failed at building ${violation.buildingIndex}`,
    );
  }

  return violations;
}
