import * as THREE from 'three';
import { BikePath } from '../choreography/bikePath';
import { CameraRig, type CamKey } from '../choreography/cameraRig';
import {
  buildingPlacementBounds,
  pointOrientedFootprintClearance,
  renderedPlacementBounds,
  segmentFootprintClearance,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import type {
  Cable,
  Lamp,
  Placement,
  Pole,
} from './cityLayout';
import type { SignPlacement } from './signLayout';

export const ABOUT_HERO_BACKDROP_ID = 'about-hero-backdrop';
export const ABOUT_REVEAL_SCREEN_ID = 'about-hero-screen';
export const ABOUT_REVEAL_SIGHTLINE_ID = 'about-reveal-sightline';
export const ABOUT_REVEAL_SCREENSHOT = 'scroll-task-2-about-reveal.png';

export const ABOUT_CAMERA_COMPOSITION_VIEWPORT = Object.freeze({
  width: 1322,
  height: 861,
});

export const ABOUT_CAMERA_CONSTRAINTS = Object.freeze({
  minimumScreenPixelWidth: ABOUT_CAMERA_COMPOSITION_VIEWPORT.width * 0.65,
  minimumScreenPixelHeight: ABOUT_CAMERA_COMPOSITION_VIEWPORT.height * 0.65,
  minimumViewportOccupancy: 0.65,
  maximumViewportOccupancy: 0.75,
  minimumViewAngleCosine: 0.85,
  maximumFovVariation: 5,
  lowerThirdNdcY: -1 / 3,
  maximumAdjacentPositionDelta: 0.5,
  maximumAdjacentTargetDelta: 0.75,
  maximumAdjacentFovDelta: 0.05,
});

interface AboutCameraContract {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
}

const PARENT_FILE = 'neocity/KB3D_NEC_BldgMD_C_Main.glb';
const SCREEN_WIDTH = 48;
const SCREEN_HEIGHT = 32;
const SCREEN_Y = 16;
const SCREEN_OFFSET = 0.5;
const BACKING_FRONT_GAP = 0.08;
const BACKING_DEPTH = 0.18;
const SIGHTLINE_SAMPLE_COUNT = 17;
const SIGHTLINE_HALF_WIDTH = SCREEN_WIDTH / (SIGHTLINE_SAMPLE_COUNT - 1) / 2;

interface FacadeFrame {
  center: [number, number];
  normal: [number, number];
  tangent: [number, number];
}

const PARENT_METRICS = buildingPlacementBounds({
  file: PARENT_FILE,
  position: [0, 0, 0],
  rotationY: 0,
});

function solveFacadeFrame(
  _cameraPosition: readonly [number, number, number],
): FacadeFrame {
  return {
    center: [-60, 112],
    normal: [0, -1],
    tangent: [1, 0],
  };
}

interface CameraCandidateMetrics {
  allCornersInViewport: boolean;
  viewAngleCosine: number;
  screenPixelWidth: number;
  screenPixelHeight: number;
  bikeNdc: [number, number, number];
  bikeInViewport: boolean;
  bikeDepth: number;
  screenDepth: number;
}

interface CameraCandidate {
  camera: Readonly<{
    id: typeof ABOUT_REVEAL_SIGHTLINE_ID;
    label: string;
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  }>;
  facadeFrame: FacadeFrame;
  metrics: CameraCandidateMetrics;
  score: number;
}

function evaluateCameraCandidate(
  position: [number, number, number],
  fov: number,
  targetY: number,
): CameraCandidate {
  const facadeFrame = solveFacadeFrame(position);
  const normal = new THREE.Vector3(
    facadeFrame.normal[0],
    0,
    facadeFrame.normal[1],
  );
  const tangent = new THREE.Vector3(
    facadeFrame.tangent[0],
    0,
    facadeFrame.tangent[1],
  );
  const screenPosition = new THREE.Vector3(
    facadeFrame.center[0],
    SCREEN_Y,
    facadeFrame.center[1],
  ).addScaledVector(normal, SCREEN_OFFSET);
  const target = screenPosition.toArray() as [number, number, number];
  target[1] = targetY;
  const camera = new THREE.PerspectiveCamera(
    fov,
    ABOUT_CAMERA_COMPOSITION_VIEWPORT.width
      / ABOUT_CAMERA_COMPOSITION_VIEWPORT.height,
    0.1,
    8000,
  );
  camera.position.set(...position);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const corners = ([-1, 1] as const).flatMap((horizontal) =>
    ([-1, 1] as const).map((vertical) => screenPosition.clone()
      .addScaledVector(tangent, horizontal * SCREEN_WIDTH / 2)
      .add(new THREE.Vector3(0, vertical * SCREEN_HEIGHT / 2, 0))
      .project(camera)));
  const minX = Math.min(...corners.map(({ x }) => x));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const bikeWorld = new BikePath().state(0.192).pos;
  const bikeNdc = bikeWorld.clone().project(camera);
  const towardCamera = camera.position.clone().sub(screenPosition).normalize();
  const screenPixelWidth = (maxX - minX) / 2
    * ABOUT_CAMERA_COMPOSITION_VIEWPORT.width;
  const screenPixelHeight = (maxY - minY) / 2
    * ABOUT_CAMERA_COMPOSITION_VIEWPORT.height;
  const metrics: CameraCandidateMetrics = {
    allCornersInViewport: corners.every(({ x, y, z }) =>
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1),
    viewAngleCosine: Math.abs(towardCamera.dot(normal)),
    screenPixelWidth,
    screenPixelHeight,
    bikeNdc: bikeNdc.toArray() as [number, number, number],
    bikeInViewport: Math.abs(bikeNdc.x) <= 1
      && Math.abs(bikeNdc.y) <= 1
      && bikeNdc.z >= -1
      && bikeNdc.z <= 1,
    bikeDepth: bikeWorld.distanceTo(camera.position),
    screenDepth: screenPosition.distanceTo(camera.position),
  };
  const preferred = new THREE.Vector3(-60, 3, -37.5);
  const score = camera.position.distanceTo(preferred)
    + Math.abs(fov - 18) * 4
    + Math.abs(targetY - 8.5) * 2
    + Math.abs(screenPixelWidth / ABOUT_CAMERA_COMPOSITION_VIEWPORT.width - 0.7)
      * 100;
  return {
    camera: Object.freeze({
      id: ABOUT_REVEAL_SIGHTLINE_ID,
      label: 'About reveal unified composition',
      position,
      target,
      fov,
    }),
    facadeFrame,
    metrics,
    score,
  };
}

function solveAboutCameraComposition(): {
  camera: CameraCandidate['camera'];
  facadeFrame: FacadeFrame;
  metrics: CameraCandidateMetrics;
  score: number;
  evaluatedCandidates: number;
  feasibleCandidates: number;
} {
  const candidates: CameraCandidate[] = [];
  for (const x of [-62, -60, -58]) {
    for (const z of [-40, -37.5, -35]) {
      for (const y of [2, 3]) {
        for (const fov of [18, 18.5, 19]) {
          for (const targetY of [8, 8.5, 9, 9.5, 10]) {
            candidates.push(evaluateCameraCandidate([x, y, z], fov, targetY));
          }
        }
      }
    }
  }
  const feasible = candidates.filter(({ camera, metrics }) =>
    Math.abs(camera.position[0] + 60) <= 2
    && camera.position[2] < -20
    && metrics.allCornersInViewport
    && metrics.viewAngleCosine >= ABOUT_CAMERA_CONSTRAINTS.minimumViewAngleCosine
    && metrics.screenPixelWidth / ABOUT_CAMERA_COMPOSITION_VIEWPORT.width
      >= ABOUT_CAMERA_CONSTRAINTS.minimumViewportOccupancy
    && metrics.screenPixelWidth / ABOUT_CAMERA_COMPOSITION_VIEWPORT.width
      <= ABOUT_CAMERA_CONSTRAINTS.maximumViewportOccupancy
    && metrics.screenPixelHeight / ABOUT_CAMERA_COMPOSITION_VIEWPORT.height
      >= ABOUT_CAMERA_CONSTRAINTS.minimumViewportOccupancy
    && metrics.screenPixelHeight / ABOUT_CAMERA_COMPOSITION_VIEWPORT.height
      <= ABOUT_CAMERA_CONSTRAINTS.maximumViewportOccupancy
    && metrics.bikeInViewport
    && metrics.bikeNdc[1] >= -0.75
    && metrics.bikeNdc[1] <= ABOUT_CAMERA_CONSTRAINTS.lowerThirdNdcY
    && metrics.bikeDepth < metrics.screenDepth);
  const selected = [...feasible].sort((left, right) =>
    left.score - right.score
    || left.camera.position[0] - right.camera.position[0]
    || left.camera.position[2] - right.camera.position[2]
    || left.camera.fov - right.camera.fov)[0];
  if (!selected) {
    throw new Error(
      `Unable to solve About camera composition after ${candidates.length} candidates`,
    );
  }
  return {
    ...selected,
    evaluatedCandidates: candidates.length,
    feasibleCandidates: feasible.length,
  };
}

export const ABOUT_CAMERA_SOLUTION = Object.freeze(
  solveAboutCameraComposition(),
);
export const ABOUT_REVEAL_CAMERA = ABOUT_CAMERA_SOLUTION.camera;
const FACADE_FRAME = ABOUT_CAMERA_SOLUTION.facadeFrame;
const PARENT_ROTATION_Y = Math.atan2(
  FACADE_FRAME.normal[0],
  FACADE_FRAME.normal[1],
);

export const ABOUT_HERO_BACKDROP_PLACEMENT = Object.freeze({
  id: ABOUT_HERO_BACKDROP_ID,
  file: PARENT_FILE,
  position: [
    FACADE_FRAME.center[0] - FACADE_FRAME.normal[0] * PARENT_METRICS.halfZ,
    0,
    FACADE_FRAME.center[1] - FACADE_FRAME.normal[1] * PARENT_METRICS.halfZ,
  ] as [number, number, number],
  rotationY: PARENT_ROTATION_Y,
  centerOffset: [0, 0] as [number, number],
  outDir: [
    -FACADE_FRAME.normal[0],
    -FACADE_FRAME.normal[1],
  ] as [number, number],
  layoutRole: ABOUT_HERO_BACKDROP_ID,
});

export interface AboutScreenCorner {
  x: number;
  y: number;
  z: number;
}

export interface AboutHeroScreen {
  id: typeof ABOUT_REVEAL_SCREEN_ID;
  parentId: typeof ABOUT_HERO_BACKDROP_ID;
  parentFile: string;
  parentKey: string;
  position: [number, number, number];
  facadeCenter: [number, number, number];
  normal: [number, number, number];
  tangent: [number, number, number];
  rotationY: number;
  width: number;
  height: number;
  corners: AboutScreenCorner[];
  facade: {
    renderedWidth: number;
    renderedHeight: number;
    horizontalMargin: number;
    screenOffset: number;
  };
  depth: {
    screenToBackingFront: number;
    backingDepth: number;
    backingRearToFacade: number;
  };
  attachments: Array<{
    id: string;
    kind: 'rail' | 'bracket' | 'brace';
    side: -1 | 1;
  }>;
}

export interface AboutHeroReveal {
  parent: Placement;
  parentBounds: OrientedBuildingBounds;
  screen: AboutHeroScreen;
}

export function buildAboutHeroReveal(
  layout: readonly Placement[],
): AboutHeroReveal {
  const matches = layout.filter(({ id }) => id === ABOUT_HERO_BACKDROP_ID);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${ABOUT_HERO_BACKDROP_ID} parent, received ${matches.length}`,
    );
  }
  const parent = matches[0];
  const parentBounds = buildingPlacementBounds(parent);
  const normal: [number, number, number] = [
    FACADE_FRAME.normal[0],
    0,
    FACADE_FRAME.normal[1],
  ];
  const tangent: [number, number, number] = [
    FACADE_FRAME.tangent[0],
    0,
    FACADE_FRAME.tangent[1],
  ];
  const facadeCenter: [number, number, number] = [
    FACADE_FRAME.center[0],
    SCREEN_Y,
    FACADE_FRAME.center[1],
  ];
  const position: [number, number, number] = [
    facadeCenter[0] + normal[0] * SCREEN_OFFSET,
    facadeCenter[1],
    facadeCenter[2] + normal[2] * SCREEN_OFFSET,
  ];
  const corners = ([-1, 1] as const).flatMap((horizontal) =>
    ([-1, 1] as const).map((vertical) => ({
      x: position[0] + tangent[0] * horizontal * SCREEN_WIDTH / 2,
      y: position[1] + vertical * SCREEN_HEIGHT / 2,
      z: position[2] + tangent[2] * horizontal * SCREEN_WIDTH / 2,
    })));
  const renderedWidth = parentBounds.halfX * 2;
  const screen: AboutHeroScreen = {
    id: ABOUT_REVEAL_SCREEN_ID,
    parentId: ABOUT_HERO_BACKDROP_ID,
    parentFile: parent.file,
    parentKey: `${ABOUT_HERO_BACKDROP_ID}:${parent.file}`,
    position,
    facadeCenter,
    normal,
    tangent,
    rotationY: Math.atan2(normal[0], normal[2]),
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    corners,
    facade: {
      renderedWidth,
      renderedHeight: parentBounds.height,
      horizontalMargin: (renderedWidth - SCREEN_WIDTH) / 2,
      screenOffset: SCREEN_OFFSET,
    },
    depth: {
      screenToBackingFront: BACKING_FRONT_GAP,
      backingDepth: BACKING_DEPTH,
      backingRearToFacade:
        SCREEN_OFFSET - BACKING_FRONT_GAP - BACKING_DEPTH,
    },
    attachments: [
      ...([-1, 1] as const).flatMap((side) => [
        { id: `${ABOUT_REVEAL_SCREEN_ID}:rail:${side}`, kind: 'rail' as const, side },
        { id: `${ABOUT_REVEAL_SCREEN_ID}:bracket:${side}`, kind: 'bracket' as const, side },
      ]),
      ...([-1, 1] as const).map((side) => ({
        id: `${ABOUT_REVEAL_SCREEN_ID}:brace:${side}`,
        kind: 'brace' as const,
        side,
      })),
    ],
  };
  return { parent, parentBounds, screen };
}

const cameraKey = (
  t: number,
  mode: CamKey['mode'],
  camera: AboutCameraContract = ABOUT_REVEAL_CAMERA,
): CamKey => ({
  t,
  position: new THREE.Vector3(...camera.position),
  target: new THREE.Vector3(...camera.target),
  fov: camera.fov,
  mode,
});

export const ABOUT_REVEAL_CAMERA_KEYS: readonly CamKey[] = [
  cameraKey(0.15, 'smooth'),
  cameraKey(0.192, 'smooth'),
  cameraKey(0.22, 'smooth'),
];

export function buildAboutCameraRig(): CameraRig {
  return new CameraRig(ABOUT_REVEAL_CAMERA_KEYS);
}

function aboutCamera(
  viewport: { width: number; height: number },
  contract: AboutCameraContract = ABOUT_REVEAL_CAMERA,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    contract.fov,
    viewport.width / viewport.height,
    0.1,
    8000,
  );
  camera.position.set(...contract.position);
  camera.lookAt(...contract.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return camera;
}

export interface AboutRevealFraming {
  allCornersInViewport: boolean;
  viewAngleCosine: number;
  occupancy: {
    width: number;
    height: number;
    area: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  projectedCorners: THREE.Vector3[];
}

function measureScreenFraming(
  screen: AboutHeroScreen,
  viewport: { width: number; height: number },
  camera: THREE.Camera,
): AboutRevealFraming {
  const projectedCorners = screen.corners.map(({ x, y, z }) =>
    new THREE.Vector3(x, y, z).project(camera));
  const minX = Math.min(...projectedCorners.map(({ x }) => x));
  const maxX = Math.max(...projectedCorners.map(({ x }) => x));
  const minY = Math.min(...projectedCorners.map(({ y }) => y));
  const maxY = Math.max(...projectedCorners.map(({ y }) => y));
  const width = (maxX - minX) / 2;
  const height = (maxY - minY) / 2;
  const towardCamera = camera.position.clone()
    .sub(new THREE.Vector3(...screen.position))
    .normalize();
  return {
    allCornersInViewport: projectedCorners.every(({ x, y, z }) =>
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1),
    viewAngleCosine: Math.abs(
      towardCamera.dot(new THREE.Vector3(...screen.normal)),
    ),
    occupancy: {
      width,
      height,
      area: width * height,
      pixelWidth: width * viewport.width,
      pixelHeight: height * viewport.height,
    },
    projectedCorners,
  };
}

export function measureAboutRevealFraming(
  screen: AboutHeroScreen,
  viewport: { width: number; height: number },
  camera: THREE.Camera = aboutCamera(viewport),
): AboutRevealFraming {
  return measureScreenFraming(screen, viewport, camera);
}

export interface AboutCameraComposition {
  framing: AboutRevealFraming;
  bike: {
    worldPosition: THREE.Vector3;
    ndc: THREE.Vector3;
    inViewport: boolean;
    depthFromCamera: number;
  };
  screenDepthFromCamera: number;
}

export function measureAboutCameraPose(
  pose: { position: THREE.Vector3; target: THREE.Vector3; fov: number },
  screen: AboutHeroScreen,
  bikeWorldPosition: THREE.Vector3,
  viewport: { width: number; height: number },
): AboutCameraComposition {
  const camera = aboutCamera(viewport, {
    position: pose.position.toArray() as [number, number, number],
    target: pose.target.toArray() as [number, number, number],
    fov: pose.fov,
  });
  const ndc = bikeWorldPosition.clone().project(camera);
  return {
    framing: measureScreenFraming(screen, viewport, camera),
    bike: {
      worldPosition: bikeWorldPosition.clone(),
      ndc,
      inViewport: Math.abs(ndc.x) <= 1
        && Math.abs(ndc.y) <= 1
        && ndc.z >= -1
        && ndc.z <= 1,
      depthFromCamera: bikeWorldPosition.distanceTo(camera.position),
    },
    screenDepthFromCamera: new THREE.Vector3(...screen.position)
      .distanceTo(camera.position),
  };
}

export interface AboutBikeCrossing {
  semanticT: 0.192;
  projectionOnly: true;
  pendingMountedBikeTask: 7;
  camera: typeof ABOUT_REVEAL_CAMERA;
  worldPosition: THREE.Vector3;
  ndc: THREE.Vector3;
  inViewport: boolean;
  depthFromCamera: number;
  screenDepthFromCamera: number;
  screenFraming: AboutRevealFraming;
}

export function measureAboutBikeCrossing(
  worldPosition = new BikePath().state(0.192).pos,
  screen: AboutHeroScreen,
  viewport: { width: number; height: number },
  camera: THREE.Camera = aboutCamera(viewport, ABOUT_REVEAL_CAMERA),
): AboutBikeCrossing {
  const ndc = worldPosition.clone().project(camera);
  return {
    semanticT: 0.192,
    projectionOnly: true,
    pendingMountedBikeTask: 7,
    camera: ABOUT_REVEAL_CAMERA,
    worldPosition: worldPosition.clone(),
    ndc,
    inViewport: Math.abs(ndc.x) <= 1
      && Math.abs(ndc.y) <= 1
      && ndc.z >= -1
      && ndc.z <= 1,
    depthFromCamera: worldPosition.distanceTo(camera.position),
    screenDepthFromCamera: new THREE.Vector3(...screen.position)
      .distanceTo(camera.position),
    screenFraming: measureScreenFraming(screen, viewport, camera),
  };
}

export const ABOUT_REVEAL_SIGHTLINE = Object.freeze({
  id: ABOUT_REVEAL_SIGHTLINE_ID,
  start: {
    x: ABOUT_REVEAL_CAMERA.position[0],
    z: ABOUT_REVEAL_CAMERA.position[2],
  },
  end: {
    x: FACADE_FRAME.center[0] + FACADE_FRAME.normal[0] * 0.75,
    z: FACADE_FRAME.center[1] + FACADE_FRAME.normal[1] * 0.75,
  },
  halfWidth: SIGHTLINE_HALF_WIDTH,
  targets: Object.freeze(Array.from(
    { length: SIGHTLINE_SAMPLE_COUNT },
    (_, index) => {
      const offset = THREE.MathUtils.lerp(
        -SCREEN_WIDTH / 2,
        SCREEN_WIDTH / 2,
        index / (SIGHTLINE_SAMPLE_COUNT - 1),
      );
      return Object.freeze({
        x: FACADE_FRAME.center[0] + FACADE_FRAME.tangent[0] * offset
          + FACADE_FRAME.normal[0] * 0.75,
        z: FACADE_FRAME.center[1] + FACADE_FRAME.tangent[1] * offset
          + FACADE_FRAME.normal[1] * 0.75,
      });
    },
  )),
});

export function aboutSightlineFootprintMargin(
  bounds: OrientedBuildingBounds,
): number {
  return Math.min(...ABOUT_REVEAL_SIGHTLINE.targets.map((target) =>
    segmentFootprintClearance(
      ABOUT_REVEAL_SIGHTLINE.start,
      target,
      bounds,
    ) - ABOUT_REVEAL_SIGHTLINE.halfWidth));
}

export function aboutSightlinePointMargin(
  point: { x: number; z: number },
  radius = 0,
): number {
  return Math.min(...ABOUT_REVEAL_SIGHTLINE.targets.map((target) => {
    const dx = target.x - ABOUT_REVEAL_SIGHTLINE.start.x;
    const dz = target.z - ABOUT_REVEAL_SIGHTLINE.start.z;
    const lengthSq = dx * dx + dz * dz;
    const t = THREE.MathUtils.clamp(
      ((point.x - ABOUT_REVEAL_SIGHTLINE.start.x) * dx
        + (point.z - ABOUT_REVEAL_SIGHTLINE.start.z) * dz) / lengthSq,
      0,
      1,
    );
    return Math.hypot(
      point.x - (ABOUT_REVEAL_SIGHTLINE.start.x + dx * t),
      point.z - (ABOUT_REVEAL_SIGHTLINE.start.z + dz * t),
    ) - ABOUT_REVEAL_SIGHTLINE.halfWidth - radius;
  }));
}

interface AboutObstructionInput {
  reveal: AboutHeroReveal;
  buildings: readonly Placement[];
  props: readonly Placement[];
  signs: readonly SignPlacement[];
  poles: readonly Pole[];
  lamps: readonly Lamp[];
  cables: readonly Cable[];
}

export function measureAboutSightlineObstructions({
  reveal,
  buildings,
  props,
  signs,
  poles,
  lamps,
  cables,
}: AboutObstructionInput): string[] {
  const obstructions: string[] = [];
  for (const placement of buildings) {
    if (placement.id === reveal.parent.id) continue;
    if (aboutSightlineFootprintMargin(buildingPlacementBounds(placement)) <= 0) {
      obstructions.push(`building:${placement.id ?? placement.file}`);
    }
  }
  for (const placement of props) {
    const bounds = renderedPlacementBounds(placement);
    if (aboutSightlineFootprintMargin(bounds) <= 0) {
      obstructions.push(`prop:${placement.file}`);
    }
  }
  for (const sign of signs) {
    const radius = sign.width / 2;
    if (aboutSightlinePointMargin({
      x: sign.position[0],
      z: sign.position[2],
    }, radius) <= 0) obstructions.push(`sign:${sign.id}`);
  }
  for (const pole of poles) {
    if (aboutSightlinePointMargin(pole.pos, 0.35) <= 0) {
      obstructions.push('pole');
    }
  }
  for (const lamp of lamps) {
    if (aboutSightlinePointMargin(lamp.pos, 0.4) <= 0) {
      obstructions.push('lamp');
    }
  }
  for (const cable of cables) {
    const blocked = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24;
      return aboutSightlinePointMargin({
        x: THREE.MathUtils.lerp(cable.a.x, cable.b.x, t),
        z: THREE.MathUtils.lerp(cable.a.z, cable.b.z, t),
      }, 0.1) <= 0;
    }).some(Boolean);
    if (blocked) obstructions.push('cable');
  }
  return obstructions.sort();
}

export function aboutParentTerminalClearance(
  bounds: OrientedBuildingBounds,
): number {
  return pointOrientedFootprintClearance(
    ABOUT_REVEAL_SIGHTLINE.end,
    bounds,
  );
}
