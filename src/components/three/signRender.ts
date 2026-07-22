import * as THREE from 'three';
import {
  FACADE_SCREEN_OFFSET,
  type SignPlacement,
} from '../../world/signLayout';

export const FACADE_SIGN_RENDER_CONFIG = {
  texture: {
    background: 'opaque' as const,
    alpha: false,
  },
  screen: {
    facadeOffset: FACADE_SCREEN_OFFSET,
    side: THREE.FrontSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthTest: true,
    depthWrite: true,
    renderOrder: 32,
  },
  backing: {
    depth: 0.06,
    screenToFront: 0.06,
    renderOrder: 30,
  },
  attachment: {
    railHeight: 0.12,
    railDepth: 0.12,
    bracketWidth: 0.12,
    bracketDepth: FACADE_SCREEN_OFFSET,
  },
} as const;

export const HOLOGRAM_SIGN_RENDER_CONFIG = {
  hasBacking: false,
  texture: {
    background: 'transparent' as const,
    alpha: true,
  },
  screen: {
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    renderOrder: 34,
  },
  emitter: {
    visible: true,
    color: 0x151b2f,
    emissiveIntensity: 2.2,
  },
  beam: {
    visible: true,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    renderOrder: 33,
  },
} as const;

export interface FacadeDepthMetrics {
  screenZ: number;
  backingFrontZ: number;
  backingRearZ: number;
  backingCenterZ: number;
  screenToBackingFront: number;
}

export function facadeDepthMetrics(): FacadeDepthMetrics {
  const screenZ = 0;
  const backingFrontZ = -FACADE_SIGN_RENDER_CONFIG.backing.screenToFront;
  const backingRearZ = backingFrontZ - FACADE_SIGN_RENDER_CONFIG.backing.depth;
  return {
    screenZ,
    backingFrontZ,
    backingRearZ,
    backingCenterZ: (backingFrontZ + backingRearZ) / 2,
    screenToBackingFront: screenZ - backingFrontZ,
  };
}

export type SignRenderBatchKind =
  | 'facade-screen'
  | 'facade-backing'
  | 'facade-attachment'
  | 'hologram-screen'
  | 'hologram-emitter'
  | 'hologram-beam';

export interface SignRenderInstance {
  id: string;
  parentId?: string;
  matrix: THREE.Matrix4;
  position: [number, number, number];
  normal?: [number, number, number];
  tangent?: [number, number, number];
  width?: number;
  height?: number;
  screenToBackingFront?: number;
}

export interface SignRenderBatch {
  kind: SignRenderBatchKind;
  textureIndex?: number;
  instances: SignRenderInstance[];
}

export interface SignRenderBatches {
  facadeScreens: SignRenderBatch[];
  backings: SignRenderBatch;
  attachments: SignRenderBatch;
  hologramScreens: SignRenderBatch[];
  emitters: SignRenderBatch;
  beams: SignRenderBatch;
  drawObjectCount: number;
}

function instanceMatrix(
  position: readonly [number, number, number],
  rotationY: number,
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    new THREE.Vector3(...scale),
  );
}

function localInstanceMatrix(
  sign: Extract<SignPlacement, { mode: 'facade' }>,
  localPosition: readonly [number, number, number],
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  const parent = instanceMatrix(sign.position, sign.rotationY, [1, 1, 1]);
  const local = instanceMatrix(localPosition, 0, scale);
  return parent.multiply(local);
}

function groupByTexture(
  kind: 'facade-screen' | 'hologram-screen',
  textureCount: number,
  instances: Array<SignRenderInstance & { textureIndex: number }>,
): SignRenderBatch[] {
  return Array.from({ length: textureCount }, (_, textureIndex) => ({
    kind,
    textureIndex,
    instances: instances
      .filter((instance) => instance.textureIndex % textureCount === textureIndex)
      .map(({ textureIndex: _textureIndex, ...instance }) => instance),
  })).filter(({ instances: grouped }) => grouped.length > 0);
}

export function buildSignRenderBatches(
  signs: SignPlacement[],
): SignRenderBatches {
  const facade = signs.filter((sign) => sign.mode === 'facade');
  const holograms = signs.filter((sign) => sign.mode === 'hologram');
  const depth = facadeDepthMetrics();
  const facadeScreens = groupByTexture(
    'facade-screen',
    8,
    facade.map((sign) => ({
      id: sign.id,
      parentId: sign.parentId,
      textureIndex: sign.textureIndex,
      matrix: instanceMatrix(sign.position, sign.rotationY, [sign.width, sign.height, 1]),
      position: sign.position,
      normal: [Math.sin(sign.rotationY), 0, Math.cos(sign.rotationY)],
      tangent: [Math.cos(sign.rotationY), 0, -Math.sin(sign.rotationY)],
      width: sign.width,
      height: sign.height,
    })),
  );
  const backings: SignRenderBatch = {
    kind: 'facade-backing',
    instances: facade.map((sign) => ({
      id: sign.id,
      parentId: sign.parentId,
      matrix: localInstanceMatrix(
        sign,
        [0, 0, depth.backingCenterZ],
        [
          sign.width + 0.8,
          sign.height + 0.8,
          FACADE_SIGN_RENDER_CONFIG.backing.depth,
        ],
      ),
      position: sign.position,
      screenToBackingFront: depth.screenToBackingFront,
    })),
  };
  const attachments: SignRenderBatch = {
    kind: 'facade-attachment',
    instances: facade.flatMap((sign) => [
      ...([-1, 1] as const).map((side) => ({
        id: `${sign.id}:rail:${side}`,
        parentId: sign.parentId,
        matrix: localInstanceMatrix(
          sign,
          [
            0,
            side * (sign.height / 2 + 0.3),
            -FACADE_SIGN_RENDER_CONFIG.attachment.railDepth / 2,
          ],
          [
            sign.width + 0.9,
            FACADE_SIGN_RENDER_CONFIG.attachment.railHeight,
            FACADE_SIGN_RENDER_CONFIG.attachment.railDepth,
          ],
        ),
        position: sign.position,
      })),
      ...([-1, 1] as const).map((side) => ({
        id: `${sign.id}:bracket:${side}`,
        parentId: sign.parentId,
        matrix: localInstanceMatrix(
          sign,
          [
            side * (sign.width / 2 + 0.3),
            0,
            -FACADE_SIGN_RENDER_CONFIG.attachment.bracketDepth / 2,
          ],
          [
            FACADE_SIGN_RENDER_CONFIG.attachment.bracketWidth,
            sign.height + 0.8,
            FACADE_SIGN_RENDER_CONFIG.attachment.bracketDepth,
          ],
        ),
        position: sign.position,
      })),
    ]),
  };
  const hologramScreens = groupByTexture(
    'hologram-screen',
    4,
    holograms.map((sign) => ({
      id: sign.id,
      textureIndex: sign.textureIndex,
      matrix: instanceMatrix(sign.position, sign.rotationY, [sign.width, sign.height, 1]),
      position: sign.position,
      normal: [Math.sin(sign.rotationY), 0, Math.cos(sign.rotationY)],
      tangent: [Math.cos(sign.rotationY), 0, -Math.sin(sign.rotationY)],
      width: sign.width,
      height: sign.height,
    })),
  );
  const emitters: SignRenderBatch = {
    kind: 'hologram-emitter',
    instances: holograms.map((sign) => ({
      id: sign.id,
      matrix: instanceMatrix(
        sign.emitter.position,
        0,
        [sign.emitter.radius, sign.emitter.height, sign.emitter.radius],
      ),
      position: sign.emitter.position,
    })),
  };
  const beams: SignRenderBatch = {
    kind: 'hologram-beam',
    instances: holograms.map((sign) => ({
      id: sign.id,
      matrix: instanceMatrix(
        sign.beam.position,
        0,
        [sign.beam.radius, sign.beam.height, sign.beam.radius],
      ),
      position: sign.beam.position,
    })),
  };
  const drawObjectCount = facadeScreens.length
    + hologramScreens.length
    + 4;
  return {
    facadeScreens,
    backings,
    attachments,
    hologramScreens,
    emitters,
    beams,
    drawObjectCount,
  };
}

interface Disposable {
  dispose: () => void;
}

export interface OwnedSignResources {
  textures: Disposable[];
  materials: Disposable[];
  geometries?: Disposable[];
}

export function disposeOwnedSignResources(resources: OwnedSignResources): void {
  resources.textures.forEach((texture) => texture.dispose());
  resources.materials.forEach((material) => material.dispose());
  resources.geometries?.forEach((geometry) => geometry.dispose());
}

export const TASK5_SCENE_NAMES = {
  facadeScreen: 'task5-facade-screen',
  facadeBacking: 'task5-facade-backing',
  facadeAttachment: 'task5-facade-attachment',
  hologramScreen: 'task5-hologram-screen',
  hologramBacking: 'task5-hologram-backing',
  hologramEmitter: 'task5-hologram-emitter',
  hologramBeam: 'task5-hologram-beam',
} as const;

export interface Task5ProjectedTarget {
  id: string;
  x: number;
  y: number;
  inViewport: boolean;
  viewAngleCosine: number;
}

export interface Task5SceneSnapshot {
  facadeCount: number;
  hologramCount: number;
  mountedFacadeScreens: number;
  mountedFacadeBackings: number;
  mountedHologramScreens: number;
  mountedHologramBackings: number;
  minimumScreenBackingSeparation: number;
  drawObjectCount: number;
  visibleScreenIds: string[];
  projectedTargets: Task5ProjectedTarget[];
}

function materialVisible(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh)) return object.visible;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return object.visible && materials.every(({ visible }) => visible);
}

export function inspectTask5Scene(
  scene: THREE.Scene,
  facadeCount: number,
  hologramCount: number,
  camera?: THREE.Camera,
  viewport?: { width: number; height: number },
): Task5SceneSnapshot {
  const byName = (name: string): THREE.Object3D[] => {
    const matches: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.name === name) matches.push(object);
    });
    return matches;
  };
  const facadeScreens = byName(TASK5_SCENE_NAMES.facadeScreen);
  const facadeBackings = byName(TASK5_SCENE_NAMES.facadeBacking);
  const facadeAttachments = byName(TASK5_SCENE_NAMES.facadeAttachment);
  const hologramScreens = byName(TASK5_SCENE_NAMES.hologramScreen);
  const hologramBackings = byName(TASK5_SCENE_NAMES.hologramBacking);
  const hologramEmitters = byName(TASK5_SCENE_NAMES.hologramEmitter);
  const hologramBeams = byName(TASK5_SCENE_NAMES.hologramBeam);
  const instancesOf = (objects: THREE.Object3D[]): SignRenderInstance[] =>
    objects.flatMap((object) =>
      Array.isArray(object.userData.instances)
        ? object.userData.instances as SignRenderInstance[]
        : []);
  const facadeScreenInstances = instancesOf(facadeScreens);
  const facadeBackingInstances = instancesOf(facadeBackings);
  const hologramScreenInstances = instancesOf(hologramScreens);
  const separations = facadeBackingInstances.flatMap(({ screenToBackingFront }) =>
    screenToBackingFront === undefined ? [] : [screenToBackingFront]);
  const visibleScreenIds = [...facadeScreens, ...hologramScreens]
    .flatMap((screen) => materialVisible(screen)
      ? instancesOf([screen]).map(({ id }) => id)
      : []);
  const projectedTargets = camera && viewport
    ? facadeScreenInstances.map((instance) => {
      const world = new THREE.Vector3(...instance.position);
      const projected = world.clone().project(camera);
      const towardCamera = camera.position.clone().sub(world).normalize();
      const normal = new THREE.Vector3(...(instance.normal ?? [0, 0, 1]));
      return {
        id: instance.id,
        x: (projected.x * 0.5 + 0.5) * viewport.width,
        y: (-projected.y * 0.5 + 0.5) * viewport.height,
        inViewport: projected.z >= -1
          && projected.z <= 1
          && Math.abs(projected.x) <= 1
          && Math.abs(projected.y) <= 1,
        viewAngleCosine: Math.abs(normal.dot(towardCamera)),
      };
    })
    : [];
  const drawObjectCount = [
    ...facadeScreens,
    ...facadeBackings,
    ...facadeAttachments,
    ...hologramScreens,
    ...hologramBackings,
    ...hologramEmitters,
    ...hologramBeams,
  ].length;
  return {
    facadeCount,
    hologramCount,
    mountedFacadeScreens: facadeScreenInstances.length,
    mountedFacadeBackings: facadeBackingInstances.length,
    mountedHologramScreens: hologramScreenInstances.length,
    mountedHologramBackings: instancesOf(hologramBackings).length,
    minimumScreenBackingSeparation: separations.length > 0
      ? Math.min(...separations)
      : 0,
    drawObjectCount,
    visibleScreenIds,
    projectedTargets,
  };
}

export type Task5CameraView = 'direct' | 'grazing';

export interface Task5FacadeInspectionSubject {
  id: string;
  inViewport: boolean;
  occupancy: {
    width: number;
    height: number;
    area: number;
    pixelWidth: number;
    pixelHeight: number;
  };
}

function mountedFacadeScreens(scene: THREE.Scene): SignRenderInstance[] {
  return scene.getObjectsByProperty('name', TASK5_SCENE_NAMES.facadeScreen)
    .flatMap((object) =>
      Array.isArray(object.userData.instances)
        ? object.userData.instances as SignRenderInstance[]
        : []);
}

export function frameTask5FacadeInspectionSubject(
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
): Task5FacadeInspectionSubject {
  const subject = mountedFacadeScreens(scene)
    .filter(({ width, height, normal, tangent }) =>
      width !== undefined
      && height !== undefined
      && normal !== undefined
      && tangent !== undefined)
    .sort((left, right) =>
      (right.width! * right.height!) - (left.width! * left.height!)
      || left.id.localeCompare(right.id))[0];
  if (!subject) throw new Error('No mounted facade inspection subject');
  const target = new THREE.Vector3(...subject.position);
  const normal = new THREE.Vector3(...subject.normal!);
  camera.position.copy(target.clone()
    .addScaledVector(normal, 28)
    .add(new THREE.Vector3(0, 1.5, 0)));
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = 42;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const tangent = new THREE.Vector3(...subject.tangent!);
  const corners = [-1, 1].flatMap((horizontal) => [-1, 1].map((vertical) =>
    target.clone()
      .addScaledVector(tangent, horizontal * subject.width! / 2)
      .add(new THREE.Vector3(0, vertical * subject.height! / 2, 0))
      .project(camera)));
  const minX = Math.min(...corners.map(({ x }) => x));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const width = (maxX - minX) / 2;
  const height = (maxY - minY) / 2;
  return {
    id: subject.id,
    inViewport: corners.every(({ x, y, z }) =>
      Math.abs(x) <= 1 && Math.abs(y) <= 1 && z >= -1 && z <= 1),
    occupancy: {
      width,
      height,
      area: width * height,
      pixelWidth: width * viewport.width,
      pixelHeight: height * viewport.height,
    },
  };
}

export function setTask5CameraView(
  scene: THREE.Scene,
  camera: THREE.Camera,
  id: string,
  view: Task5CameraView,
): boolean {
  const screen = scene.getObjectsByProperty('name', TASK5_SCENE_NAMES.facadeScreen)
    .flatMap((object) =>
      Array.isArray(object.userData.instances)
        ? object.userData.instances as SignRenderInstance[]
        : [])
    .find((instance) => instance.id === id);
  if (!screen || !screen.normal || !screen.tangent) return false;
  const target = new THREE.Vector3(...screen.position);
  const normal = new THREE.Vector3(...screen.normal);
  const tangent = new THREE.Vector3(...screen.tangent);
  const position = view === 'direct'
    ? target.clone().addScaledVector(normal, 34).add(new THREE.Vector3(0, 2, 0))
    : target.clone()
      .addScaledVector(normal, 8)
      .addScaledVector(tangent, 30)
      .add(new THREE.Vector3(0, 2, 0));
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return true;
}
