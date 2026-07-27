import * as THREE from 'three';
import { BikePath } from '../choreography/bikePath';
import { CameraRig, type CamKey, type CamPose } from '../choreography/cameraRig';
import {
  buildingPlacementBounds,
  orientedFootprintCorners,
  type BuildingPlacementLike,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import {
  RESEARCH_PANELS,
  measureResearchArtReadability,
  type ResearchArtReadability,
  type ResearchPanel,
} from './researchContent';
import { RESEARCH_ROUTE, RESEARCH_WALLS } from './researchLayout';
import { MOON_POS, MOON_RADIUS, sampleRoute } from './route';

export const RESEARCH_CAMERA_TIMES = Object.freeze({
  start: RESEARCH_ROUTE.startT,
  gateway1: 0.712,
  midpoint: 0.76,
  gateway2: 0.775,
  end: RESEARCH_ROUTE.endT,
});

const cameraHeight = (t: number): number => THREE.MathUtils.lerp(
  1.4,
  2,
  (t - RESEARCH_ROUTE.startT) / (RESEARCH_ROUTE.endT - RESEARCH_ROUTE.startT),
);

const cameraFov = (t: number): number => THREE.MathUtils.lerp(
  68,
  58,
  (t - RESEARCH_ROUTE.startT) / (RESEARCH_ROUTE.endT - RESEARCH_ROUTE.startT),
);

const cameraLift = (t: number): number => THREE.MathUtils.lerp(
  20,
  18.5,
  (t - RESEARCH_ROUTE.startT) / (RESEARCH_ROUTE.endT - RESEARCH_ROUTE.startT),
);

const CAMERA_ROUTE_OFFSET = 16;
const MERGE_CAMERA_ROUTE_OFFSET = 16;
const CAMERA_FORWARD_LOOK = 32;
// Pan further toward the research billboard wall (+binormal / building side) so
// the facades fill the frame instead of the empty canal side on the left.
const CAMERA_TARGET_LATERAL = 33;

function cameraKey(t: number): CamKey {
  const route = sampleRoute(t);
  const routeForward = route.tangent.clone().setY(0).normalize();
  const mergeHeading = sampleRoute(
    (RESEARCH_ROUTE.startT + RESEARCH_ROUTE.straightStartT) / 2,
  ).tangent.clone().setY(0).normalize();
  const horizontalForward = t <= RESEARCH_ROUTE.straightStartT
    ? mergeHeading
    : routeForward;
  const routeOffset = t <= RESEARCH_CAMERA_TIMES.gateway1
    ? MERGE_CAMERA_ROUTE_OFFSET
    : CAMERA_ROUTE_OFFSET;
  const binormal = new THREE.Vector3()
    .crossVectors(horizontalForward, new THREE.Vector3(0, 1, 0))
    .normalize();
  const position = route.pos.clone()
    .addScaledVector(horizontalForward, -16)
    .addScaledVector(binormal, -routeOffset)
    .setY(cameraHeight(t));
  return {
    t,
    position,
    target: position.clone()
      .addScaledVector(horizontalForward, CAMERA_FORWARD_LOOK)
      .addScaledVector(binormal, CAMERA_TARGET_LATERAL)
      .setY(position.y + cameraLift(t)),
    fov: cameraFov(t),
    mode: 'dolly',
  };
}

const KEY_TIMES = [
  ...Array.from({ length: 21 }, (_, index) =>
    RESEARCH_CAMERA_TIMES.start + index * 0.0005),
  RESEARCH_CAMERA_TIMES.gateway1,
  RESEARCH_CAMERA_TIMES.midpoint,
  RESEARCH_CAMERA_TIMES.gateway2,
  RESEARCH_CAMERA_TIMES.end,
] as const;

export const RESEARCH_CAMERA_KEYS: readonly CamKey[] = Object.freeze(
  KEY_TIMES.map(cameraKey),
);

export function buildResearchCameraRig(): CameraRig {
  return new CameraRig(RESEARCH_CAMERA_KEYS);
}

export interface ResearchProjectedPoint {
  ndc: { x: number; y: number; z: number };
  depthFromCamera: number;
  inViewport: boolean;
  pitch: number;
}

export interface ResearchProjectedPanel {
  id: string;
  projectedCorners: Array<{ x: number; y: number; z: number }>;
  inViewport: boolean;
  pixelWidth: number;
  pixelHeight: number;
  depthFromCamera: number;
  readability: ResearchArtReadability;
}

export interface ResearchCameraFrame {
  semanticT: number;
  cameraRoll: number;
  lookAhead: number;
  upperSightlineY: number;
  forwardTangentDot: number;
  moonNdc: { x: number; y: number; z: number };
  visibleWallSides: ResearchSidePair;
  bike: ResearchProjectedPoint;
  panels: ResearchProjectedPanel[];
}

type ResearchSidePair = ResearchWallSide[];
type ResearchWallSide = -1 | 1;

interface NdcRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function perspectiveCamera(
  semanticT: number,
  viewport: { width: number; height: number },
): THREE.PerspectiveCamera {
  return perspectiveCameraFromPose(
    buildResearchCameraRig().sample(semanticT),
    viewport,
  );
}

function perspectiveCameraFromPose(
  pose: CamPose,
  viewport: { width: number; height: number },
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    pose.fov,
    viewport.width / viewport.height,
    0.1,
    8000,
  );
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld(true);
  return camera;
}

function projectPoint(
  point: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  pitch: number,
): ResearchProjectedPoint {
  const ndc = point.clone().project(camera);
  const depthFromCamera = point.clone().sub(camera.position)
    .dot(camera.getWorldDirection(new THREE.Vector3()));
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

function panelCorners(panel: ResearchPanel): THREE.Vector3[] {
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
  panel: ResearchPanel,
  camera: THREE.PerspectiveCamera,
  viewport: { width: number; height: number },
): ResearchProjectedPanel {
  const corners = panelCorners(panel).map((corner) => corner.project(camera));
  const minX = Math.min(...corners.map(({ x }) => x));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const pixelHeight = (maxY - minY) / 2 * viewport.height;
  const forward = camera.getWorldDirection(new THREE.Vector3());
  return {
    id: panel.id,
    projectedCorners: corners.map(({ x, y, z }) => ({ x, y, z })),
    inViewport: corners.every(({ x, y, z }) =>
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1),
    pixelWidth: (maxX - minX) / 2 * viewport.width,
    pixelHeight,
    depthFromCamera: new THREE.Vector3(...panel.position)
      .sub(camera.position)
      .dot(forward),
    readability: measureResearchArtReadability(pixelHeight),
  };
}

function rectFromProjected(
  projected: Array<{ x: number; y: number }>,
): NdcRect {
  return {
    left: Math.min(...projected.map(({ x }) => x)),
    right: Math.max(...projected.map(({ x }) => x)),
    top: Math.max(...projected.map(({ y }) => y)),
    bottom: Math.min(...projected.map(({ y }) => y)),
  };
}

function rectsOverlap(first: NdcRect, second: NdcRect): boolean {
  return first.left <= second.right
    && first.right >= second.left
    && first.bottom <= second.top
    && first.top >= second.bottom;
}

interface ProjectedResearchWall {
  wall: typeof RESEARCH_WALLS[number];
  rect: NdcRect;
  roofNdcY: number;
  depth: number;
  visible: boolean;
}

function projectResearchWall(
  wall: typeof RESEARCH_WALLS[number],
  camera: THREE.PerspectiveCamera,
): ProjectedResearchWall {
  const bounds = buildingPlacementBounds(wall);
  const corners = orientedFootprintCorners(bounds);
  const projected = corners.flatMap(({ x, z }) =>
    [0, bounds.height].map((y) =>
      new THREE.Vector3(x, y, z).project(camera)));
  const roof = corners.map(({ x, z }) =>
    new THREE.Vector3(x, bounds.height, z).project(camera));
  const rect = rectFromProjected(projected);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const depth = new THREE.Vector3(bounds.center.x, bounds.height / 2, bounds.center.z)
    .sub(camera.position)
    .dot(forward);
  return {
    wall,
    rect,
    roofNdcY: Math.max(...roof.map(({ y }) => y)),
    depth,
    visible:
      depth > 0
      && rect.right >= -1
      && rect.left <= 1
      && rect.top >= -1
      && rect.bottom <= 1,
  };
}

export interface ResearchLayerSideFraming {
  side: ResearchWallSide;
  visibleFrontCount: number;
  visibleBackCount: number;
  visibleBackModels: string[];
  minimumWorldRoofRise: number;
  projectedRoofRiseNdc: number;
}

export interface ResearchLayerFraming {
  semanticT: number;
  sides: ResearchLayerSideFraming[];
}

export function measureResearchLayerFraming(
  semanticT: number,
  viewport: { width: number; height: number },
): ResearchLayerFraming {
  const camera = perspectiveCamera(semanticT, viewport);
  const projected = RESEARCH_WALLS.map((wall) =>
    projectResearchWall(wall, camera));
  const sides = ([-1, 1] as const).map((side): ResearchLayerSideFraming => {
    const front = projected.filter(({ wall, visible }) =>
      visible && wall.side === side && wall.row === 'front');
    const back = projected.filter(({ wall, visible }) =>
      visible && wall.side === side && wall.row === 'back');
    const roofRises = back.flatMap((backWall) => {
      const nearest = front
        .map((frontWall) => ({
          frontWall,
          distance: Math.abs(
            frontWall.wall.position[2] - backWall.wall.position[2],
          ),
        }))
        .sort((first, second) => first.distance - second.distance)[0];
      return nearest
        ? [backWall.roofNdcY - nearest.frontWall.roofNdcY]
        : [];
    });
    const frontHeights = front.map(({ wall }) =>
      buildingPlacementBounds(wall).height);
    const backHeights = back.map(({ wall }) =>
      buildingPlacementBounds(wall).height);
    return {
      side,
      visibleFrontCount: front.length,
      visibleBackCount: back.length,
      visibleBackModels: [...new Set(back.map(({ wall }) => wall.file))].sort(),
      minimumWorldRoofRise:
        backHeights.length > 0 && frontHeights.length > 0
          ? Math.min(...backHeights) - Math.max(...frontHeights)
          : Number.NEGATIVE_INFINITY,
      projectedRoofRiseNdc:
        roofRises.length > 0 ? Math.max(...roofRises) : Number.NEGATIVE_INFINITY,
    };
  });
  return { semanticT, sides };
}

export function activeResearchPanelIds(semanticT: number): string[] {
  if (semanticT >= 0.81) {
    return RESEARCH_PANELS
      .filter(({ gatewayId }) => gatewayId === 'research-end')
      .map(({ id }) => id);
  }
  const gatewayNumber = Math.abs(semanticT - RESEARCH_CAMERA_TIMES.gateway1)
    <= Math.abs(semanticT - RESEARCH_CAMERA_TIMES.gateway2) ? 1 : 2;
  const gatewayPanels = RESEARCH_PANELS
    .filter(({ gatewayId }) => gatewayId === `research-gateway-${gatewayNumber}`)
    .map(({ id }) => id);
  if (gatewayNumber === 1) return gatewayPanels;
  return [
    ...gatewayPanels,
    ...RESEARCH_PANELS
      .filter(({ gatewayId }) => gatewayId === 'research-end')
      .map(({ id }) => id),
  ];
}

export interface ResearchMoonCompetition {
  semanticT: number;
  diskSampleCount: number;
  diskRect: NdcRect;
  centralContentRect: NdcRect;
  fullyOutsideCentralContent: boolean;
  occludedFraction: number;
  visibleCentralOverlapFraction: number;
}

export function measureResearchMoonCompetition(
  semanticT: number,
  viewport: { width: number; height: number },
): ResearchMoonCompetition {
  const camera = perspectiveCamera(semanticT, viewport);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    .normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    .normalize();
  const diskPoints: THREE.Vector3[] = [];
  const divisions = 32;
  for (let y = -divisions; y <= divisions; y += 1) {
    for (let x = -divisions; x <= divisions; x += 1) {
      const nx = x / divisions;
      const ny = y / divisions;
      if (nx * nx + ny * ny > 1) continue;
      diskPoints.push(MOON_POS.clone()
        .addScaledVector(right, nx * MOON_RADIUS)
        .addScaledVector(up, ny * MOON_RADIUS));
    }
  }
  const projectedDisk = diskPoints.map((point) => point.clone().project(camera));
  const diskRect = rectFromProjected(projectedDisk);
  const activeIds = new Set(activeResearchPanelIds(semanticT));
  const panels = RESEARCH_PANELS
    .filter(({ id }) => activeIds.has(id))
    .map((panel) => projectPanel(panel, camera, viewport));
  if (panels.length === 0) {
    throw new Error(`No active Research panels at t=${semanticT}`);
  }
  const panelCorners = panels.flatMap(({ projectedCorners }) => projectedCorners);
  const rawContentRect = rectFromProjected(panelCorners);
  const centralContentRect = {
    left: rawContentRect.left - 0.02,
    right: rawContentRect.right + 0.02,
    top: rawContentRect.top + 0.02,
    bottom: rawContentRect.bottom - 0.02,
  };
  let occluded = 0;
  let visibleCentral = 0;
  diskPoints.forEach((point, index) => {
    const isOccluded = RESEARCH_WALLS.some((wall) =>
      segmentIntersectsBuilding(
        camera.position,
        point,
        buildingPlacementBounds(wall),
      ));
    if (isOccluded) occluded += 1;
    const projected = projectedDisk[index];
    if (
      !isOccluded
      && projected.x >= centralContentRect.left
      && projected.x <= centralContentRect.right
      && projected.y >= centralContentRect.bottom
      && projected.y <= centralContentRect.top
    ) visibleCentral += 1;
  });
  return {
    semanticT,
    diskSampleCount: diskPoints.length,
    diskRect,
    centralContentRect,
    fullyOutsideCentralContent: !rectsOverlap(diskRect, centralContentRect),
    occludedFraction: occluded / diskPoints.length,
    visibleCentralOverlapFraction: visibleCentral / diskPoints.length,
  };
}

function visibleWallSides(camera: THREE.PerspectiveCamera): ResearchSidePair {
  return ([-1, 1] as const).filter((side) =>
    RESEARCH_WALLS
      .filter((wall) => wall.row === 'front' && wall.side === side)
      .some((wall) => {
        const bounds = buildingPlacementBounds(wall);
        const projected = orientedFootprintCorners(bounds).flatMap(({ x, z }) =>
          [0, bounds.height].map((y) =>
            new THREE.Vector3(x, y, z).project(camera)));
        return projected.some(({ z }) => z >= -1 && z <= 1)
          && Math.min(...projected.map(({ x }) => x)) <= 1
          && Math.max(...projected.map(({ x }) => x)) >= -1
          && Math.min(...projected.map(({ y }) => y)) <= 1
          && Math.max(...projected.map(({ y }) => y)) >= -1;
      }));
}

export function measureResearchCameraFrame(
  semanticT: number,
  viewport: { width: number; height: number },
): ResearchCameraFrame {
  return measureResearchCameraPose(
    buildResearchCameraRig().sample(semanticT),
    semanticT,
    viewport,
  );
}

export function measureResearchCameraPose(
  pose: CamPose,
  semanticT: number,
  viewport: { width: number; height: number },
): ResearchCameraFrame {
  const camera = perspectiveCameraFromPose(pose, viewport);
  const bike = new BikePath().state(semanticT);
  const horizontal = pose.target.clone().sub(pose.position).setY(0).length();
  const pitch = Math.atan2(
    pose.target.y - pose.position.y,
    horizontal,
  );
  const upperAngle = pitch + THREE.MathUtils.degToRad(pose.fov / 2);
  const cameraForward = pose.target.clone().sub(pose.position).normalize();
  const routeForward = sampleRoute(semanticT).tangent.normalize();
  const moonNdc = MOON_POS.clone().project(camera);
  return {
    semanticT,
    cameraRoll: 0,
    lookAhead: horizontal,
    upperSightlineY: pose.position.y + Math.tan(upperAngle) * horizontal,
    forwardTangentDot: cameraForward.dot(routeForward),
    moonNdc: { x: moonNdc.x, y: moonNdc.y, z: moonNdc.z },
    visibleWallSides: visibleWallSides(camera),
    bike: projectPoint(bike.pos, camera, bike.pose.pitch),
    panels: RESEARCH_PANELS.map((panel) =>
      projectPanel(panel, camera, viewport)),
  };
}

function segmentIntersectsBuilding(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): boolean {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  const local = (point: THREE.Vector3): THREE.Vector3 => {
    const x = point.x - bounds.center.x;
    const z = point.z - bounds.center.z;
    return new THREE.Vector3(
      x * cos - z * sin,
      point.y,
      x * sin + z * cos,
    );
  };
  const origin = local(start);
  const delta = local(end).sub(origin);
  let minimum = 0;
  let maximum = 1;
  for (const [value, direction, low, high] of [
    [origin.x, delta.x, -bounds.halfX, bounds.halfX],
    [origin.y, delta.y, 0, bounds.height],
    [origin.z, delta.z, -bounds.halfZ, bounds.halfZ],
  ] as const) {
    if (Math.abs(direction) < 1e-12) {
      if (value < low || value > high) return false;
      continue;
    }
    const first = (low - value) / direction;
    const second = (high - value) / direction;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 1e-5 && minimum < 1 - 1e-5;
}

export interface ResearchOcclusion {
  subjectId: string;
  buildingId: string;
}

export function measureResearchCameraOcclusions(
  semanticT: number,
  layout: Array<BuildingPlacementLike & {
    id?: string;
    layoutRole?: string;
  }>,
): ResearchOcclusion[] {
  return measureResearchCameraPoseOcclusions(
    buildResearchCameraRig().sample(semanticT),
    semanticT,
    layout,
  );
}

export function measureResearchCameraPoseOcclusions(
  pose: CamPose,
  semanticT: number,
  layout: Array<BuildingPlacementLike & {
    id?: string;
    layoutRole?: string;
  }>,
  subjectPanelIds: readonly string[] = activeResearchPanelIds(semanticT),
): ResearchOcclusion[] {
  const forward = pose.target.clone().sub(pose.position).normalize();
  const bike = new BikePath().state(semanticT);
  const activeIds = new Set(subjectPanelIds);
  const subjects = [
    { id: 'projected-bike', parentId: undefined, point: bike.pos },
    ...RESEARCH_PANELS
      .filter(({ id }) => activeIds.has(id))
      .map((panel) => ({
        id: panel.id,
        parentId: panel.parentId,
        point: new THREE.Vector3(...panel.position),
      })),
  ].filter(({ point }) => {
    const depth = point.clone().sub(pose.position).dot(forward);
    return depth > 0 && depth < 100;
  });
  return subjects.flatMap((subject) =>
    layout.flatMap((placement, index) => {
      if (placement.id === subject.parentId) return [];
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

export const RESEARCH_CAMERA_SCREENSHOTS = Object.freeze([
  {
    id: 'research-canyon-low',
    preset: 'research-canyon-low',
    filename: 'scroll-task-4-research-midpoint.png',
    semanticT: RESEARCH_CAMERA_TIMES.midpoint,
  },
  {
    id: 'research-canyon-end',
    preset: 'research-canyon-end',
    filename: 'scroll-task-4-research-end.png',
    semanticT: RESEARCH_CAMERA_TIMES.end,
  },
  {
    id: 'research-gateway-1',
    preset: 'research-gateway-1',
    filename: 'scroll-task-4-research-gateway-1.png',
    semanticT: RESEARCH_CAMERA_TIMES.gateway1,
  },
  {
    id: 'research-gateway-2',
    preset: 'research-gateway-2',
    filename: 'scroll-task-4-research-gateway-2.png',
    semanticT: RESEARCH_CAMERA_TIMES.gateway2,
  },
] as const);
