import * as THREE from 'three';
import type { CamPose } from './cameraRig';
import {
  BRIDGE_DECK_HALF_WIDTH,
  buildBridgeLayout,
} from '../world/bridgeLayout';
import { MOON_POS, MOON_RADIUS } from '../world/route';
import { SCAFFOLD } from '../world/setpieces';
import { buildAboutHeroReveal } from '../world/aboutReveal';
import {
  buildingPlacementBounds,
  type OrientedBuildingBounds,
} from '../world/buildingCatalog';
import type { Placement } from '../world/cityLayout';

export type ProductionSubjectId =
  | 'about-hero-screen'
  | 'stunt-scaffold-pole'
  | 'task4-bridge-deck-top'
  | 'task4-moon-surface';

export interface ProductionSubjectFraming {
  subjectId: ProductionSubjectId;
  projectedPoints: Array<[number, number, number]>;
  pixelWidth: number;
  pixelHeight: number;
  visibleFraction: number;
  inViewport: boolean;
}

export interface ProductionSubjectOcclusion {
  subjectId: ProductionSubjectId;
  buildingId: string;
}

function cameraFromPose(
  pose: CamPose,
  viewport: { width: number; height: number },
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    pose.fov,
    viewport.width / viewport.height,
    0.05,
    9_000,
  );
  camera.position.copy(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function scaffoldPoints(): THREE.Vector3[] {
  const [x, y, z] = SCAFFOLD.deckCenter;
  return [
    new THREE.Vector3(x, y, z),
    ...([-1, 1] as const).flatMap((xSign) =>
    ([-1, 1] as const).flatMap((ySign) =>
      ([-1, 1] as const).map((zSign) => new THREE.Vector3(
        x + xSign * SCAFFOLD.deckWidth / 2,
        ySign < 0 ? 0 : y + 1.2,
        z + zSign * SCAFFOLD.deckLen / 2,
      )))),
  ];
}

function bridgePoints(): THREE.Vector3[] {
  const layout = buildBridgeLayout();
  return [layout.curve, layout.horizon.curve].flatMap((curve) =>
    Array.from({ length: 65 }, (_, index) => {
      const point = curve.getPointAt(index / 64);
      return [
        point,
        point.clone().add(new THREE.Vector3(BRIDGE_DECK_HALF_WIDTH, 0, 0)),
        point.clone().add(new THREE.Vector3(-BRIDGE_DECK_HALF_WIDTH, 0, 0)),
      ];
    }).flat());
}

function moonPoints(camera: THREE.Camera): THREE.Vector3[] {
  const right = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 0)
    .normalize();
  const up = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 1)
    .normalize();
  return [
    MOON_POS.clone(),
    MOON_POS.clone().addScaledVector(right, MOON_RADIUS),
    MOON_POS.clone().addScaledVector(right, -MOON_RADIUS),
    MOON_POS.clone().addScaledVector(up, MOON_RADIUS),
    MOON_POS.clone().addScaledVector(up, -MOON_RADIUS),
  ];
}

export function measureProductionSubjectFraming(
  pose: CamPose,
  subjectId: ProductionSubjectId,
  viewport: { width: number; height: number },
): ProductionSubjectFraming {
  if (subjectId === 'about-hero-screen') {
    throw new Error('About framing uses its protected screen contract');
  }
  const camera = cameraFromPose(pose, viewport);
  const worldPoints = subjectId === 'stunt-scaffold-pole'
    ? scaffoldPoints()
    : subjectId === 'task4-bridge-deck-top'
      ? bridgePoints()
      : moonPoints(camera);
  const projected = worldPoints.map((point) => point.clone().project(camera));
  const xs = projected.map(({ x }) => x);
  const ys = projected.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const fullWidth = Math.max(0, maxX - minX);
  const fullHeight = Math.max(0, maxY - minY);
  const visibleWidth = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
  const visibleHeight = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
  const visibleFraction = fullWidth > 0 && fullHeight > 0
    ? THREE.MathUtils.clamp(
        visibleWidth * visibleHeight / (fullWidth * fullHeight),
        0,
        1,
      )
    : 0;
  return {
    subjectId,
    projectedPoints: projected.map((point) => point.toArray()),
    pixelWidth: fullWidth / 2 * viewport.width,
    pixelHeight: fullHeight / 2 * viewport.height,
    visibleFraction,
    inViewport: projected.some(({ x, y, z }) =>
      x >= -1 && x <= 1 && y >= -1 && y <= 1 && z >= -1 && z <= 1),
  };
}

interface ProjectTextureMetadata {
  panelId: string;
  width: number;
  height: number;
  estimatedGpuBytes: number;
  typography?: {
    title: number;
    stack: number;
    body: number;
  };
}

export interface MountedSceneSubjectMeasurement {
  source: 'mounted-scene-bounds';
  subjectIds: string[];
  inViewport: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pixelWidth: number;
  pixelHeight: number;
  visibleFraction: number;
  mountedTextureCount: number;
  textureBytes: number;
  texturesIncludeMipmaps: boolean;
  textures: ProjectTextureMetadata[];
  readabilityProxy: {
    titleCssPx: number;
    stackCssPx: number;
    bodyCssPx: number;
  } | null;
}

function mountedSubjectMatches(
  object: THREE.Object3D,
  id: string,
): boolean {
  const aliases: Readonly<Record<string, string>> = {
    'about-hero-screen': 'task2-about-hero-screen',
  };
  return object.name === id
    || object.name === aliases[id]
    || object.userData.id === id;
}

function materialTextures(object: THREE.Object3D): THREE.Texture[] {
  if (!(object instanceof THREE.Mesh)) return [];
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.flatMap((material) => {
    const map = (material as THREE.Material & { map?: THREE.Texture }).map;
    return map ? [map] : [];
  });
}

export function measureMountedSceneSubjects(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  requestedIds: readonly string[],
): MountedSceneSubjectMeasurement {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const matchedIds: string[] = [];
  const objects: THREE.Object3D[] = [];
  for (const id of requestedIds) {
    const matches: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (mountedSubjectMatches(object, id)) matches.push(object);
    });
    if (matches.length > 0) {
      matchedIds.push(id);
      objects.push(...matches);
    }
  }
  const bounds = objects.reduce(
    (combined, object) => combined.union(new THREE.Box3().setFromObject(object)),
    new THREE.Box3(),
  );
  if (bounds.isEmpty()) {
    return {
      source: 'mounted-scene-bounds',
      subjectIds: [],
      inViewport: false,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      pixelWidth: 0,
      pixelHeight: 0,
      visibleFraction: 0,
      mountedTextureCount: 0,
      textureBytes: 0,
      texturesIncludeMipmaps: false,
      textures: [],
      readabilityProxy: null,
    };
  }
  const boundsCorners = ([-1, 1] as const).flatMap((x) =>
    ([-1, 1] as const).flatMap((y) =>
      ([-1, 1] as const).map((z) => new THREE.Vector3(
        x < 0 ? bounds.min.x : bounds.max.x,
        y < 0 ? bounds.min.y : bounds.max.y,
        z < 0 ? bounds.min.z : bounds.max.z,
      ).project(camera))));
  const geometryPoints = objects.flatMap((object) => {
    if (!(object instanceof THREE.Mesh)) return [];
    const position = object.geometry.getAttribute('position');
    if (!position) return [];
    return Array.from({ length: position.count }, (_, index) =>
      new THREE.Vector3()
        .fromBufferAttribute(position, index)
        .applyMatrix4(object.matrixWorld)
        .project(camera));
  });
  const projected = geometryPoints.length > 0 ? geometryPoints : boundsCorners;
  const depthVisible = projected.filter(({ z }) => z >= -1 && z <= 1);
  const measured = depthVisible.length > 0 ? depthVisible : projected;
  const xs = measured.map(({ x }) => x);
  const ys = measured.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const fullWidth = Math.max(0, maxX - minX);
  const fullHeight = Math.max(0, maxY - minY);
  const visibleWidth = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
  const visibleHeight = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
  const visibleFraction = depthVisible.length > 0 && fullWidth > 0 && fullHeight > 0
    ? THREE.MathUtils.clamp(
        visibleWidth * visibleHeight / (fullWidth * fullHeight),
        0,
        1,
      )
    : 0;
  const textures = [...new Set(objects.flatMap(materialTextures))];
  const metadata = textures.flatMap((texture) => {
    const value = texture.userData.projectGallery as
      | ProjectTextureMetadata
      | undefined;
    return value ? [value] : [];
  });
  const pixelHeight = fullHeight / 2 * viewport.height;
  const readability = metadata.flatMap((texture) =>
    texture.typography ? [{
      titleCssPx: texture.typography.title * pixelHeight / texture.height,
      stackCssPx: texture.typography.stack * pixelHeight / texture.height,
      bodyCssPx: texture.typography.body * pixelHeight / texture.height,
    }] : []);
  return {
    source: 'mounted-scene-bounds',
    subjectIds: matchedIds,
    inViewport: visibleFraction > 0,
    minX,
    maxX,
    minY,
    maxY,
    pixelWidth: fullWidth / 2 * viewport.width,
    pixelHeight,
    visibleFraction,
    mountedTextureCount: metadata.length,
    textureBytes: metadata.reduce(
      (total, texture) => total + texture.estimatedGpuBytes,
      0,
    ),
    texturesIncludeMipmaps:
      metadata.length > 0 && textures.every(({ generateMipmaps }) => generateMipmaps),
    textures: metadata.map((texture) => ({ ...texture })),
    readabilityProxy: readability.length > 0 ? {
      titleCssPx: Math.min(...readability.map(({ titleCssPx }) => titleCssPx)),
      stackCssPx: Math.min(...readability.map(({ stackCssPx }) => stackCssPx)),
      bodyCssPx: Math.min(...readability.map(({ bodyCssPx }) => bodyCssPx)),
    } : null,
  };
}

function segmentIntersectsBuilding(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): boolean {
  const inverse = new THREE.Matrix4().makeRotationY(-bounds.rotationY)
    .multiply(new THREE.Matrix4().makeTranslation(
      -bounds.center.x,
      0,
      -bounds.center.z,
    ));
  const origin = start.clone().applyMatrix4(inverse);
  const destination = end.clone().applyMatrix4(inverse);
  const direction = destination.sub(origin);
  let minimum = 0;
  let maximum = 1;
  for (const [value, delta, low, high] of [
    [origin.x, direction.x, -bounds.halfX, bounds.halfX],
    [origin.y, direction.y, 0, bounds.height],
    [origin.z, direction.z, -bounds.halfZ, bounds.halfZ],
  ] as const) {
    if (Math.abs(delta) < 1e-12) {
      if (value < low || value > high) return false;
      continue;
    }
    const first = (low - value) / delta;
    const second = (high - value) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 1e-5 && minimum < 1 - 1e-5;
}

export function measureProductionSubjectOcclusions(
  pose: CamPose,
  subjectId: ProductionSubjectId,
  buildings: Placement[],
): ProductionSubjectOcclusion[] {
  let point: THREE.Vector3;
  let parentId: string | undefined;
  if (subjectId === 'about-hero-screen') {
    const screen = buildAboutHeroReveal(buildings).screen;
    point = new THREE.Vector3(...screen.position);
    parentId = screen.parentId;
  } else if (subjectId === 'stunt-scaffold-pole') {
    point = new THREE.Vector3(...SCAFFOLD.deckCenter);
  } else if (subjectId === 'task4-bridge-deck-top') {
    point = buildBridgeLayout().curve.getPointAt(0.05);
  } else {
    point = MOON_POS.clone();
  }
  return buildings.flatMap((building, index) => {
    if (building.id === parentId) return [];
    return segmentIntersectsBuilding(
      pose.position,
      point,
      buildingPlacementBounds(building),
    ) ? [{
        subjectId,
        buildingId: building.id ?? `building:${index}`,
      }] : [];
  });
}
