import * as THREE from 'three';
import { BikePath } from '../choreography/bikePath';
import { CameraRig, type CamKey, type CamPose } from '../choreography/cameraRig';
import {
  buildingPlacementBounds,
  type BuildingPlacementLike,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import { sampleRoute } from './route';
import {
  STUNT_PROJECT_PANELS,
  measureProjectArtReadability,
  type ProjectArtReadability,
  type StuntProjectGroup,
} from './stuntContent';
import { STUNT_CAMERA_SIDE } from './stuntGeometry';
import { STUNT_ROUTE } from './stuntLayout';

export const STUNT_CAMERA_TIMES = Object.freeze({
  flip1: STUNT_ROUTE.flip1Apex.t,
  scaffoldStart: STUNT_ROUTE.scaffoldLanding.t,
  scaffoldMidpoint: 0.5,
  scaffoldEnd: STUNT_ROUTE.ramp2Base.t,
  flip2: STUNT_ROUTE.flip2Apex.t,
});

const cameraKey = (
  t: number,
  cameraY: number,
  targetY: number,
  z = stuntCameraBeatZ(t),
  fov = 46,
  mode: CamKey['mode'] = 'smooth',
): CamKey => {
  return {
    t,
    position: new THREE.Vector3(STUNT_CAMERA_SIDE.inspectionX, cameraY, z),
    target: new THREE.Vector3(STUNT_CAMERA_SIDE.targetX, targetY, z),
    fov,
    mode,
  };
};

export function stuntCameraBeatZ(t: number): number {
  return sampleRoute(t).pos.z;
}

export const STUNT_CAMERA_KEYS: readonly CamKey[] = Object.freeze([
  cameraKey(STUNT_ROUTE.ramp1Base.t, 26, 21, STUNT_ROUTE.ramp1Base.position[2], 48),
  cameraKey(
    STUNT_ROUTE.ramp1Lip.t,
    26,
    STUNT_ROUTE.flip1Apex.position[1],
    STUNT_ROUTE.flip1Apex.position[2],
    60,
    'hold',
  ),
  cameraKey(
    STUNT_CAMERA_TIMES.flip1,
    26,
    STUNT_ROUTE.flip1Apex.position[1],
    STUNT_ROUTE.flip1Apex.position[2],
    60,
    'hold',
  ),
  cameraKey(
    STUNT_CAMERA_TIMES.scaffoldStart,
    26,
    STUNT_ROUTE.flip1Apex.position[1],
    STUNT_ROUTE.flip1Apex.position[2],
  ),
  cameraKey(STUNT_CAMERA_TIMES.scaffoldMidpoint, 24, 20, -194, 48),
  cameraKey(STUNT_CAMERA_TIMES.scaffoldEnd, 24, 19, -224, 48),
  cameraKey(
    STUNT_ROUTE.ramp2Lip.t,
    29,
    STUNT_ROUTE.flip2Apex.position[1],
    STUNT_ROUTE.flip2Apex.position[2],
    58,
    'hold',
  ),
  cameraKey(
    STUNT_CAMERA_TIMES.flip2,
    29,
    STUNT_ROUTE.flip2Apex.position[1],
    STUNT_ROUTE.flip2Apex.position[2],
    58,
    'hold',
  ),
  cameraKey(
    STUNT_ROUTE.descentTop.t,
    29,
    STUNT_ROUTE.flip2Apex.position[1],
    STUNT_ROUTE.flip2Apex.position[2],
  ),
  cameraKey(STUNT_ROUTE.groundResume.t, 28, 23),
]);

export function buildStuntCameraRig(): CameraRig {
  return new CameraRig(STUNT_CAMERA_KEYS);
}

export interface StuntProjectedPoint {
  ndc: { x: number; y: number; z: number };
  depthFromCamera: number;
  inViewport: boolean;
  pitch: number;
}

export interface StuntProjectedPanel {
  id: string;
  group: StuntProjectGroup;
  projectedCorners: Array<{ x: number; y: number; z: number }>;
  allCornersInViewport: boolean;
  pixelWidth: number;
  pixelHeight: number;
  depthFromCamera: number;
  readability: ProjectArtReadability;
}

export interface StuntProjectedGroup {
  group: StuntProjectGroup;
  panelIds: string[];
  allCornersInViewport: boolean;
  pixelWidth: number;
  pixelHeight: number;
  occupancy: {
    width: number;
    height: number;
    area: number;
  };
  readability: ProjectArtReadability;
}

export interface StuntCameraFrame {
  semanticT: number;
  offsetTangentDot: number;
  sideSign: -1 | 0 | 1;
  bike: StuntProjectedPoint;
  panels: StuntProjectedPanel[];
  groups: StuntProjectedGroup[];
}

function projectPoint(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  pitch: number,
): StuntProjectedPoint {
  const ndc = point.clone().project(camera);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const depthFromCamera = point.clone().sub(camera.position).dot(forward);
  return {
    ndc: { x: ndc.x, y: ndc.y, z: ndc.z },
    depthFromCamera,
    pitch,
    inViewport:
      Math.abs(ndc.x) <= 1
      && Math.abs(ndc.y) <= 1
      && ndc.z >= -1
      && ndc.z <= 1,
  };
}

function panelCorners(panel: typeof STUNT_PROJECT_PANELS[number]): THREE.Vector3[] {
  const halfWidth = panel.width / 2;
  const halfHeight = panel.height / 2;
  const cos = Math.cos(panel.rotationY);
  const sin = Math.sin(panel.rotationY);
  return [-1, 1].flatMap((horizontal) =>
    [-1, 1].map((vertical) => new THREE.Vector3(
      panel.position[0] + cos * horizontal * halfWidth,
      panel.position[1] + vertical * halfHeight,
      panel.position[2] - sin * horizontal * halfWidth,
    )));
}

function projectPanel(
  panel: typeof STUNT_PROJECT_PANELS[number],
  camera: THREE.PerspectiveCamera,
  viewport: { width: number; height: number },
): StuntProjectedPanel {
  const corners = panelCorners(panel).map((corner) => corner.project(camera));
  const minX = Math.min(...corners.map(({ x }) => x));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const depthFromCamera = new THREE.Vector3(...panel.position)
    .sub(camera.position)
    .dot(forward);
  const pixelHeight = (maxY - minY) / 2 * viewport.height;
  return {
    id: panel.id,
    group: panel.group,
    projectedCorners: corners.map(({ x, y, z }) => ({ x, y, z })),
    allCornersInViewport: corners.every(({ x, y, z }) =>
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1),
    pixelWidth: (maxX - minX) / 2 * viewport.width,
    pixelHeight,
    depthFromCamera,
    readability: measureProjectArtReadability(pixelHeight, panel),
  };
}

function projectGroup(
  group: StuntProjectGroup,
  panels: readonly StuntProjectedPanel[],
  viewport: { width: number; height: number },
): StuntProjectedGroup {
  const members = panels.filter((panel) => panel.group === group);
  const corners = members.flatMap(({ projectedCorners }) => projectedCorners);
  const minX = Math.min(...corners.map(({ x }) => x));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const pixelWidth = (maxX - minX) / 2 * viewport.width;
  const pixelHeight = (maxY - minY) / 2 * viewport.height;
  const width = pixelWidth / viewport.width;
  const height = pixelHeight / viewport.height;
  return {
    group,
    panelIds: members.map(({ id }) => id),
    allCornersInViewport: members.every(({ allCornersInViewport }) =>
      allCornersInViewport),
    pixelWidth,
    pixelHeight,
    occupancy: {
      width,
      height,
      area: width * height,
    },
    readability: {
      titleCssPx: Math.min(...members.map(({ readability }) =>
        readability.titleCssPx)),
      stackCssPx: Math.min(...members.map(({ readability }) =>
        readability.stackCssPx)),
      bodyCssPx: Math.min(...members.map(({ readability }) =>
        readability.bodyCssPx)),
    },
  };
}

export function measureStuntCameraFrame(
  semanticT: number,
  viewport: { width: number; height: number },
): StuntCameraFrame {
  return measureStuntCameraPose(
    buildStuntCameraRig().sample(semanticT),
    semanticT,
    viewport,
  );
}

export function measureStuntCameraPose(
  pose: CamPose,
  semanticT: number,
  viewport: { width: number; height: number },
): StuntCameraFrame {
  const camera = new THREE.PerspectiveCamera(
    pose.fov,
    viewport.width / viewport.height,
    1,
    8000,
  );
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld(true);
  const route = sampleRoute(semanticT);
  const bike = new BikePath().state(semanticT);
  const offset = pose.position.clone().sub(route.pos).normalize();
  const binormal = new THREE.Vector3()
    .crossVectors(route.tangent, new THREE.Vector3(0, 1, 0))
    .normalize();
  const panels = STUNT_PROJECT_PANELS.map((panel) =>
    projectPanel(panel, camera, viewport));
  return {
    semanticT,
    offsetTangentDot: Math.abs(offset.dot(route.tangent)),
    sideSign: Math.sign(offset.dot(binormal)) as -1 | 0 | 1,
    bike: projectPoint(bike.pos, camera, bike.pose.pitch),
    panels,
    groups: (['flip-1', 'flip-2'] as const).map((group) =>
      projectGroup(group, panels, viewport)),
  };
}

function segmentIntersectsBuilding(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): boolean {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  const toLocal = (point: THREE.Vector3): THREE.Vector3 => {
    const x = point.x - bounds.center.x;
    const z = point.z - bounds.center.z;
    return new THREE.Vector3(
      x * cos - z * sin,
      point.y,
      x * sin + z * cos,
    );
  };
  const localStart = toLocal(start);
  const localEnd = toLocal(end);
  const delta = localEnd.clone().sub(localStart);
  let minimum = 0;
  let maximum = 1;
  const slabs = [
    [localStart.x, delta.x, -bounds.halfX, bounds.halfX],
    [localStart.y, delta.y, 0, bounds.height],
    [localStart.z, delta.z, -bounds.halfZ, bounds.halfZ],
  ] as const;
  for (const [origin, direction, low, high] of slabs) {
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
  return maximum > 1e-5 && minimum < 1 - 1e-5;
}

export interface StuntOcclusion {
  subjectId: string;
  buildingId: string;
}

export function measureStuntCameraOcclusions(
  semanticT: number,
  layout: Array<BuildingPlacementLike & {
    id?: string;
    layoutRole?: string;
  }>,
): StuntOcclusion[] {
  return measureStuntCameraPoseOcclusions(
    buildStuntCameraRig().sample(semanticT),
    semanticT,
    layout,
  );
}

export function measureStuntCameraPoseOcclusions(
  pose: CamPose,
  semanticT: number,
  layout: Array<BuildingPlacementLike & {
    id?: string;
    layoutRole?: string;
  }>,
): StuntOcclusion[] {
  const group = semanticT <= STUNT_CAMERA_TIMES.scaffoldStart
    ? 'flip-1'
    : semanticT >= STUNT_CAMERA_TIMES.scaffoldEnd
      ? 'flip-2'
      : undefined;
  const subjects = [
    {
      id: 'projected-bike',
      parentId: undefined,
      point: new BikePath().state(semanticT).pos,
    },
    ...STUNT_PROJECT_PANELS
      .filter((panel) => panel.group === group)
      .map((panel) => ({
        id: panel.id,
        parentId: panel.parentId,
        point: new THREE.Vector3(...panel.position),
      })),
  ];
  return subjects.flatMap((subject) =>
    layout.flatMap((placement, index) => {
      if (placement.id === subject.parentId) return [];
      if (placement.layoutRole === 'stunt-backdrop') return [];
      return segmentIntersectsBuilding(
        pose.position,
        subject.point,
        buildingPlacementBounds(placement),
      ) ? [{
          subjectId: subject.id,
          buildingId: placement.id ?? `building-${index}`,
        }] : [];
    }));
}

export const STUNT_CAMERA_SCREENSHOTS = Object.freeze([
  {
    id: 'projects-flip-1',
    preset: 'projects-flip-1',
    filename: 'scroll-task-3-flip-1.png',
    semanticT: STUNT_CAMERA_TIMES.flip1,
  },
  {
    id: 'projects-scaffold-midpoint',
    preset: 'projects-scaffold-midpoint',
    filename: 'scroll-task-3-scaffold-midpoint.png',
    semanticT: STUNT_CAMERA_TIMES.scaffoldMidpoint,
  },
  {
    id: 'projects-flip-2',
    preset: 'projects-flip-2',
    filename: 'scroll-task-3-flip-2.png',
    semanticT: STUNT_CAMERA_TIMES.flip2,
  },
] as const);
