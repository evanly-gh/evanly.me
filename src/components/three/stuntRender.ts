import * as THREE from 'three';
import {
  measureStuntCameraPose,
  measureStuntCameraPoseOcclusions,
} from '../../world/stuntCamera';
import { buildProductionCameraRig } from '../../choreography/productionCameraRig';
import { buildCityLayout } from '../../world/cityLayout';
import {
  STUNT_PROJECT_PANELS,
  type ProjectArtRegion,
  type StuntProjectPanel,
} from '../../world/stuntContent';
import {
  STUNT_BACKDROP,
  buildScaffoldStructure,
} from '../../world/stuntLayout';
import {
  PROJECTS_MAIN_ROAD,
  STUNT_CENTER_X,
  STUNT_RAMP1,
  STUNT_RAMP2,
  STUNT_SCAFFOLD,
} from '../../world/stuntGeometry';
import {
  buildingPlacementBounds,
  orientedFootprintCorners,
} from '../../world/buildingCatalog';

export const PROJECT_PANEL_RENDER_CONFIG = {
  screen: {
    side: THREE.FrontSide,
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    renderOrder: 38,
    transparent: false,
    opacity: 1,
    blending: THREE.NormalBlending,
  },
  backing: {
    depth: 0.08,
    screenToFront: 0.08,
    renderOrder: 36,
  },
  attachment: {
    rail: 0.18,
    depth: 0.32,
  },
  hologram: {
    emitterEmissiveIntensity: 1.05,
    emitterToneMapped: true,
    beamOpacity: 0.07,
  },
} as const;

export const STUNT_SCENE_NAMES = {
  panelScreen: 'stunt-project-screen',
  panelBacking: 'stunt-project-backing',
  panelAttachment: 'stunt-project-attachment',
  panelEmitter: 'stunt-project-emitter',
  panelBeam: 'stunt-project-beam',
  panelSupport: 'stunt-project-support',
  scaffoldPole: 'stunt-scaffold-pole',
  scaffoldBrace: 'stunt-scaffold-brace',
  scaffoldTie: 'stunt-scaffold-building-tie',
  ramp1: 'stunt-ramp-1',
  ramp2: 'stunt-ramp-2',
  backdropReadyFile: 'stunt-backdrop-ready-file',
} as const;

const MATERIAL_MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
] as const;

export interface StuntRenderInstance {
  id: string;
  parentId: string;
  matrix: THREE.Matrix4;
  screenToBackingFront?: number;
}

export interface StuntPanelRenderAssembly {
  screens: StuntRenderInstance[];
  backings: StuntRenderInstance[];
  attachments: StuntRenderInstance[];
  emitters: StuntRenderInstance[];
  beams: StuntRenderInstance[];
  supports: StuntRenderInstance[];
}

export interface ProjectRasterAuditInput {
  panelId: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray | readonly number[];
  regions: readonly Pick<
    ProjectArtRegion,
    'id' | 'x' | 'y' | 'width' | 'height'
  >[];
}

export interface ProjectRasterRegionAudit {
  id: string;
  sampledPixels: number;
  dominantPixelFraction: number;
  maximumContrastRatio: number;
  contrastingPixelFraction: number;
  horizontalIntrusionFraction: number;
  verticalIntrusionFraction: number;
}

export interface ProjectRasterPanelAudit {
  panelId: string;
  source: 'mounted-canvas-texture';
  width: number;
  height: number;
  sampledPixels: number;
  opaqueCoverage: number;
  decorativeLineIntrusions: number;
  regions: ProjectRasterRegionAudit[];
}

const relativeLuminance = (
  red: number,
  green: number,
  blue: number,
): number => {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return (
    linear(red) * 0.2126
    + linear(green) * 0.7152
    + linear(blue) * 0.0722
  );
};

const contrastRatio = (first: number, second: number): number =>
  (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

export function analyzeProjectRasterPixels(
  input: ProjectRasterAuditInput,
): ProjectRasterPanelAudit {
  const { panelId, width, height, pixels } = input;
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || pixels.length < width * height * 4
  ) {
    throw new Error(`Invalid project raster pixels for ${panelId}`);
  }
  const colorAt = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    return {
      red,
      green,
      blue,
      alpha,
      key: `${red},${green},${blue},${alpha}`,
      luminance: relativeLuminance(red, green, blue),
    };
  };
  let opaquePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (colorAt(x, y).alpha >= 250) opaquePixels += 1;
    }
  }
  const regions = input.regions
    .filter(({ id }) => id !== 'background')
    .map((region): ProjectRasterRegionAudit => {
      const x0 = Math.max(0, Math.floor(region.x));
      const y0 = Math.max(0, Math.floor(region.y));
      const x1 = Math.min(width, Math.ceil(region.x + region.width));
      const y1 = Math.min(height, Math.ceil(region.y + region.height));
      const sampledPixels = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      if (sampledPixels === 0) {
        throw new Error(`Empty project raster region ${panelId}:${region.id}`);
      }
      const counts = new Map<string, {
        count: number;
        luminance: number;
      }>();
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const color = colorAt(x, y);
          const entry = counts.get(color.key);
          if (entry) entry.count += 1;
          else counts.set(color.key, { count: 1, luminance: color.luminance });
        }
      }
      const [dominantKey, dominant] = [...counts.entries()].reduce(
        (largest, candidate) =>
          candidate[1].count > largest[1].count ? candidate : largest,
      );
      let maximumContrastRatio = 1;
      let contrastingPixels = 0;
      const isForeground = (x: number, y: number) => {
        const color = colorAt(x, y);
        const ratio = contrastRatio(color.luminance, dominant.luminance);
        maximumContrastRatio = Math.max(maximumContrastRatio, ratio);
        if (ratio >= 4.5) contrastingPixels += 1;
        return color.key !== dominantKey && ratio >= 1.25;
      };
      let longestHorizontal = 0;
      for (let y = y0; y < y1; y += 1) {
        let run = 0;
        for (let x = x0; x < x1; x += 1) {
          run = isForeground(x, y) ? run + 1 : 0;
          longestHorizontal = Math.max(longestHorizontal, run);
        }
      }
      let longestVertical = 0;
      for (let x = x0; x < x1; x += 1) {
        let run = 0;
        for (let y = y0; y < y1; y += 1) {
          const color = colorAt(x, y);
          const ratio = contrastRatio(color.luminance, dominant.luminance);
          run = color.key !== dominantKey && ratio >= 1.25 ? run + 1 : 0;
          longestVertical = Math.max(longestVertical, run);
        }
      }
      return {
        id: region.id,
        sampledPixels,
        dominantPixelFraction: dominant.count / sampledPixels,
        maximumContrastRatio,
        contrastingPixelFraction: contrastingPixels / sampledPixels,
        horizontalIntrusionFraction: longestHorizontal / Math.max(1, x1 - x0),
        verticalIntrusionFraction: longestVertical / Math.max(1, y1 - y0),
      };
    });
  const decorativeLineIntrusions = regions.filter((region) =>
    region.horizontalIntrusionFraction >= 0.9
    || region.verticalIntrusionFraction >= 0.9).length;
  return {
    panelId,
    source: 'mounted-canvas-texture',
    width,
    height,
    sampledPixels: width * height,
    opaqueCoverage: opaquePixels / (width * height),
    decorativeLineIntrusions,
    regions,
  };
}

export function inspectStuntProjectRasterAudit(scene: THREE.Scene) {
  const panels: ProjectRasterPanelAudit[] = [];
  scene.traverse((object) => {
    if (
      object.name !== STUNT_SCENE_NAMES.panelScreen
      || !(object instanceof THREE.Mesh)
    ) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const texture = materials.flatMap((material) => {
      const map = (material as THREE.Material & { map?: THREE.Texture }).map;
      return map ? [map] : [];
    })[0];
    const metadata = texture?.userData.projectGallery as {
      panelId?: string;
      artAudit?: {
        regions?: ProjectRasterAuditInput['regions'];
      };
    } | undefined;
    const canvas = texture?.image as {
      width?: number;
      height?: number;
      getContext?: (
        contextId: '2d',
        options?: { willReadFrequently?: boolean },
      ) => {
        getImageData: (
          sx: number,
          sy: number,
          sw: number,
          sh: number,
        ) => { data: Uint8ClampedArray };
      } | null;
    } | undefined;
    const width = Number(canvas?.width ?? 0);
    const height = Number(canvas?.height ?? 0);
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    const regions = metadata?.artAudit?.regions;
    const panelId = String(object.userData.id ?? metadata?.panelId ?? '');
    if (!context || !regions || !panelId || width <= 0 || height <= 0) {
      throw new Error(`Mounted project raster is unavailable: ${panelId || 'unknown'}`);
    }
    panels.push(analyzeProjectRasterPixels({
      panelId,
      width,
      height,
      pixels: context.getImageData(0, 0, width, height).data,
      regions,
    }));
  });
  const order = new Map(STUNT_PROJECT_PANELS.map(({ id }, index) => [id, index]));
  panels.sort((left, right) =>
    (order.get(left.panelId) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(right.panelId) ?? Number.MAX_SAFE_INTEGER));
  return {
    source: 'mounted-canvas-texture' as const,
    panelCount: panels.length,
    panels,
  };
}

function matrix(
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

function localMatrix(
  panel: StuntProjectPanel,
  localPosition: readonly [number, number, number],
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  return matrix(panel.position, panel.rotationY, [1, 1, 1])
    .multiply(matrix(localPosition, 0, scale));
}

function segmentMatrix(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  thickness: number,
): THREE.Matrix4 {
  const first = new THREE.Vector3(...start);
  const second = new THREE.Vector3(...end);
  const direction = second.clone().sub(first);
  const length = direction.length();
  return new THREE.Matrix4().compose(
    first.add(second).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction.normalize(),
    ),
    new THREE.Vector3(length, thickness, thickness),
  );
}

export function buildStuntPanelRenderAssembly(
  panels: readonly StuntProjectPanel[] = STUNT_PROJECT_PANELS,
): StuntPanelRenderAssembly {
  const screens = panels.map((panel) => ({
    id: panel.id,
    parentId: panel.parentId,
    matrix: matrix(
      panel.position,
      panel.rotationY,
      [panel.width, panel.height, 1],
    ),
    screenToBackingFront: PROJECT_PANEL_RENDER_CONFIG.backing.screenToFront,
  }));
  const backDepth = PROJECT_PANEL_RENDER_CONFIG.backing.depth;
  const backOffset = (
    PROJECT_PANEL_RENDER_CONFIG.backing.screenToFront + backDepth / 2
  );
  const backings = panels
    .filter(({ mount }) => mount !== 'hologram')
    .map((panel) => ({
    id: `${panel.id}:backing`,
    parentId: panel.parentId,
    matrix: localMatrix(
      panel,
      [0, 0, -backOffset],
      [panel.width + 0.8, panel.height + 0.8, backDepth],
    ),
  }));
  const attachments = panels.flatMap((panel) => {
    if (panel.mount === 'hologram') return [];
    if (panel.mount === 'hanging') {
      return ([-1, 1] as const).flatMap((side) => [
        {
          id: `${panel.id}:hanger:${side}`,
          parentId: panel.parentId,
          matrix: localMatrix(
            panel,
            [side * panel.width * 0.38, panel.height / 2 + 4.5, -0.18],
            [0.18, 9, 0.18],
          ),
        },
        {
          id: `${panel.id}:clamp:${side}`,
          parentId: panel.parentId,
          matrix: localMatrix(
            panel,
            [side * panel.width * 0.38, panel.height / 2 + 9, -0.18],
            [1.2, 0.35, 0.5],
          ),
        },
      ]);
    }
    return [
      ...([-1, 1] as const).map((side) => ({
      id: `${panel.id}:rail:${side}`,
      parentId: panel.parentId,
      matrix: localMatrix(
        panel,
        [0, side * (panel.height / 2 + 0.3), -0.14],
        [
          panel.width + 1,
          PROJECT_PANEL_RENDER_CONFIG.attachment.rail,
          PROJECT_PANEL_RENDER_CONFIG.attachment.depth,
        ],
      ),
    })),
    ...([-1, 1] as const).map((side) => ({
      id: `${panel.id}:bracket:${side}`,
      parentId: panel.parentId,
      matrix: localMatrix(
        panel,
        [side * (panel.width / 2 - 0.7), 0, -0.14],
        [
          PROJECT_PANEL_RENDER_CONFIG.attachment.rail,
          panel.height + 1,
          PROJECT_PANEL_RENDER_CONFIG.attachment.depth,
        ],
      ),
    })),
    ];
  });
  const hologram = panels.find(
    ({ mount }) => mount === 'hologram',
  );
  const emitters = hologram ? [{
    id: `${hologram.id}:emitter`,
    parentId: hologram.parentId,
    matrix: localMatrix(
      hologram,
      [0, -11.8, 0],
      [3.2, 1.2, 3.2],
    ),
  }] : [];
  const beams = hologram ? [{
    id: `${hologram.id}:beam`,
    parentId: hologram.parentId,
    matrix: localMatrix(
      hologram,
      [0, -9.35, 0],
      [2.6, 3.7, 2.6],
    ),
  }] : [];
  const hanging = panels.find(
    ({ mount }) => mount === 'hanging',
  );
  const supports = hanging ? (() => {
    const scaffoldX = STUNT_SCAFFOLD.outerEdgeX + 0.3;
    const panelX = hanging.position[0] + 0.18;
    const topY = hanging.position[1] + hanging.height / 2 + 9;
    const sideZ = hanging.width * 0.38;
    const parentId = hanging.parentId;
    return [
      {
        id: `${hanging.id}:support:scaffold-connector`,
        parentId,
        matrix: segmentMatrix(
          [
            STUNT_SCAFFOLD.outerEdgeX,
            STUNT_SCAFFOLD.deckY,
            hanging.position[2] - 6,
          ],
          [scaffoldX, topY, hanging.position[2]],
          0.3,
        ),
      },
      {
        id: `${hanging.id}:support:cross-member`,
        parentId,
        matrix: segmentMatrix(
          [scaffoldX, topY, hanging.position[2] - sideZ - 0.8],
          [scaffoldX, topY, hanging.position[2] + sideZ + 0.8],
          0.4,
        ),
      },
      ...([-1, 1] as const).map((side) => ({
        id: `${hanging.id}:support:outrigger:${side}`,
        parentId,
        matrix: segmentMatrix(
          [scaffoldX, topY, hanging.position[2] + side * sideZ],
          [panelX, topY, hanging.position[2] + side * sideZ],
          0.3,
        ),
      })),
      {
        id: `${hanging.id}:support:diagonal`,
        parentId,
        matrix: segmentMatrix(
          [scaffoldX, topY - 7, hanging.position[2]],
          [panelX, topY, hanging.position[2]],
          0.24,
        ),
      },
    ];
  })() : [];
  return { screens, backings, attachments, emitters, beams, supports };
}

function transformedUnitBounds(instance: StuntRenderInstance): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
  ).applyMatrix4(instance.matrix);
}

function boundsGap(first: THREE.Box3, second: THREE.Box3): number {
  const axisGap = (
    firstMin: number,
    firstMax: number,
    secondMin: number,
    secondMax: number,
  ) => Math.max(0, firstMin - secondMax, secondMin - firstMax);
  return Math.hypot(
    axisGap(first.min.x, first.max.x, second.min.x, second.max.x),
    axisGap(first.min.y, first.max.y, second.min.y, second.max.y),
    axisGap(first.min.z, first.max.z, second.min.z, second.max.z),
  );
}

export function traceStuntHungSupportPath() {
  const assembly = buildStuntPanelRenderAssembly();
  const hanging = STUNT_PROJECT_PANELS.find(({ mount }) =>
    mount === 'hanging');
  if (!hanging) {
    return {
      connected: false,
      path: [],
      panelAnchorX: Number.NaN,
      scaffoldAnchorX: Number.NaN,
      scaffoldMemberId: null,
      scaffoldGeometryGap: Number.POSITIVE_INFINITY,
      maximumGap: 0,
      minimumBikeRideEnvelopeClearance: Number.POSITIVE_INFINITY,
    };
  }
  const hangingId = hanging.id;
  const members = [
    ...assembly.attachments.filter(({ id }) => id.startsWith(hangingId)),
    ...assembly.supports,
  ];
  const bounds = members.map(transformedUnitBounds);
  const starts = members.map(({ id }, index) => ({ id, index }))
    .filter(({ id }) => id.includes(':clamp:'));
  const goal = members.findIndex(({ id }) =>
    id.endsWith(':support:scaffold-connector'));
  const queue = starts.map(({ index }) => [index]);
  const visited = new Set(queue.flat());
  let path: number[] = [];
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    const current = candidate.at(-1)!;
    if (current === goal) {
      path = candidate;
      break;
    }
    for (let index = 0; index < members.length; index += 1) {
      if (visited.has(index) || boundsGap(bounds[current], bounds[index]) > 0.05) {
        continue;
      }
      visited.add(index);
      queue.push([...candidate, index]);
    }
  }
  const supportBounds = assembly.supports.map(transformedUnitBounds);
  const bikeRideEnvelope = new THREE.Box3(
    new THREE.Vector3(
      STUNT_CENTER_X - 3,
      STUNT_SCAFFOLD.deckY - 0.5,
      STUNT_SCAFFOLD.southZ,
    ),
    new THREE.Vector3(
      STUNT_CENTER_X + 3,
      STUNT_SCAFFOLD.deckY + 3,
      STUNT_SCAFFOLD.northZ,
    ),
  );
  const scaffoldMembers = buildScaffoldStructure().poles.map((member) => ({
    id: member.id,
    bounds: new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.5),
      new THREE.Vector3(0.5, 0.5, 0.5),
    ).applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...member.center),
      new THREE.Quaternion(),
      new THREE.Vector3(...member.scale),
    )),
  }));
  const scaffoldContacts = assembly.supports.flatMap((support) => {
    const supportBounds = transformedUnitBounds(support);
    return scaffoldMembers.map((member) => ({
      supportId: support.id,
      memberId: member.id,
      gap: boundsGap(supportBounds, member.bounds),
    }));
  }).sort((left, right) => left.gap - right.gap);
  return {
    connected: path.length > 0,
    path: path.map((index) => members[index].id),
    panelAnchorX: path.length > 0
      ? bounds[path[0]].getCenter(new THREE.Vector3()).x
      : Number.NaN,
    scaffoldAnchorX: goal >= 0
      ? STUNT_SCAFFOLD.outerEdgeX
      : Number.NaN,
    scaffoldMemberId: scaffoldContacts[0]?.memberId ?? null,
    scaffoldGeometryGap: scaffoldContacts[0]?.gap ?? Number.POSITIVE_INFINITY,
    maximumGap: path.slice(1).reduce(
      (maximum, index, pathIndex) =>
        Math.max(maximum, boundsGap(bounds[path[pathIndex]], bounds[index])),
      0,
    ),
    minimumBikeRideEnvelopeClearance: Math.min(
      ...supportBounds.map((support) => boundsGap(support, bikeRideEnvelope)),
    ),
  };
}

export interface StuntGallerySafety {
  id: string;
  roadMargin: number;
  bikePathMargin: number;
  rampMargin: number;
  scaffoldDeckMargin: number;
}

export function measureStuntGallerySafety(): StuntGallerySafety[] {
  const rampHalfWidth = Math.max(STUNT_RAMP1.width, STUNT_RAMP2.width) / 2;
  return STUNT_PROJECT_PANELS.map((panel) => {
    const protectedWestX = panel.position[0] - panel.protectedRadius;
    return {
      id: panel.id,
      roadMargin: protectedWestX - PROJECTS_MAIN_ROAD.eastEdgeX,
      bikePathMargin: protectedWestX - (STUNT_CENTER_X + 3),
      rampMargin: protectedWestX - (STUNT_CENTER_X + rampHalfWidth),
      scaffoldDeckMargin: protectedWestX - STUNT_SCAFFOLD.outerEdgeX,
    };
  });
}

const countByName = (scene: THREE.Scene, name: string): number => {
  let count = 0;
  scene.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
};

export interface StuntBackdropFileReadiness {
  sourceFile: string;
  placementCount: number;
  meshCount: number;
  sourceMapCount: number;
  mountedMapCount: number;
  pbrMaterialCount: number;
  finiteMatrices: boolean;
  finiteBounds: boolean;
}

export interface StuntBackdropReadiness {
  ready: boolean;
  placementCount: number;
  fileCount: number;
  uniqueSourceFiles: string[];
  files: StuntBackdropFileReadiness[];
}

const expectedBackdropCounts = new Map<string, number>();
for (const placement of STUNT_BACKDROP) {
  expectedBackdropCounts.set(
    placement.file,
    (expectedBackdropCounts.get(placement.file) ?? 0) + 1,
  );
}
const expectedBackdropFiles = [...expectedBackdropCounts.keys()].sort();

function materialList(
  material: THREE.Material | THREE.Material[],
): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function mountedMapCount(materials: THREE.Material[]): number {
  return [...new Set(materials)].reduce(
    (count, material) => count + MATERIAL_MAP_KEYS.filter((key) =>
      (material as unknown as Record<string, unknown>)[key] instanceof THREE.Texture,
    ).length,
    0,
  );
}

export function inspectStuntBackdropReadiness(
  scene: THREE.Scene,
): StuntBackdropReadiness {
  const groups = scene.getObjectsByProperty(
    'name',
    STUNT_SCENE_NAMES.backdropReadyFile,
  );
  const files = groups.map((group): StuntBackdropFileReadiness => {
    const sourceFile = String(group.userData.sourceFile ?? '');
    const placementCount = Number(group.userData.placementCount ?? 0);
    const sourceMapCount = Number(group.userData.sourceMapCount ?? 0);
    const meshes: THREE.InstancedMesh[] = [];
    group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) meshes.push(object);
    });
    const materials = meshes.flatMap((mesh) => materialList(mesh.material));
    let finiteMatrices = meshes.length > 0;
    let finiteBounds = meshes.length > 0;
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      const sourceBounds = mesh.geometry.boundingBox;
      if (!sourceBounds) finiteBounds = false;
      for (let index = 0; index < mesh.count; index += 1) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(index, matrix);
        finiteMatrices &&= matrix.elements.every(Number.isFinite);
        if (sourceBounds) {
          const bounds = sourceBounds.clone().applyMatrix4(matrix);
          finiteBounds &&= [
            ...bounds.min.toArray(),
            ...bounds.max.toArray(),
          ].every(Number.isFinite);
        }
      }
    }
    return {
      sourceFile,
      placementCount,
      meshCount: meshes.length,
      sourceMapCount,
      mountedMapCount: mountedMapCount(materials),
      pbrMaterialCount: [...new Set(materials)].filter((material) =>
        material instanceof THREE.MeshStandardMaterial
        || material instanceof THREE.MeshPhysicalMaterial).length,
      finiteMatrices,
      finiteBounds,
    };
  }).sort((left, right) => left.sourceFile.localeCompare(right.sourceFile));
  const uniqueSourceFiles = [...new Set(files.map(({ sourceFile }) => sourceFile))]
    .sort();
  const placementCount = files.reduce(
    (total, file) => total + file.placementCount,
    0,
  );
  return {
    ready:
      placementCount === STUNT_BACKDROP.length
      && files.length === expectedBackdropFiles.length
      && uniqueSourceFiles.length === expectedBackdropFiles.length
      && uniqueSourceFiles.every((file, index) =>
        file === expectedBackdropFiles[index])
      && files.every((file) =>
        file.placementCount === expectedBackdropCounts.get(file.sourceFile)
        && file.meshCount > 0
        && file.pbrMaterialCount > 0
        && file.finiteMatrices
        && file.finiteBounds
        && (
          file.sourceMapCount === 0
          || file.mountedMapCount > 0
        )),
    placementCount,
    fileCount: files.length,
    uniqueSourceFiles,
    files,
  };
}

export interface StuntBackdropProjection {
  id: string;
  sourceFile: string;
  inViewport: boolean;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export function measureStuntBackdropProjections(
  semanticT: number,
  viewport: { width: number; height: number },
): StuntBackdropProjection[] {
  const pose = buildProductionCameraRig().sample(semanticT);
  const camera = new THREE.PerspectiveCamera(
    pose.fov,
    viewport.width / viewport.height,
    1,
    8000,
  );
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld(true);
  return STUNT_BACKDROP.map((placement) => {
    const bounds = buildingPlacementBounds(placement);
    const projected = orientedFootprintCorners(bounds).flatMap(({ x, z }) =>
      [0, bounds.height].map((y) =>
        new THREE.Vector3(x, y, z).project(camera)));
    const left = (Math.min(...projected.map(({ x }) => x)) * 0.5 + 0.5)
      * viewport.width;
    const right = (Math.max(...projected.map(({ x }) => x)) * 0.5 + 0.5)
      * viewport.width;
    const top = (-Math.max(...projected.map(({ y }) => y)) * 0.5 + 0.5)
      * viewport.height;
    const bottom = (-Math.min(...projected.map(({ y }) => y)) * 0.5 + 0.5)
      * viewport.height;
    return {
      id: placement.id,
      sourceFile: placement.file,
      inViewport:
        right > 0
        && left < viewport.width
        && bottom > 0
        && top < viewport.height,
      rect: { left, top, right, bottom },
    };
  });
}

export interface StuntSceneSnapshot {
  ready: boolean;
  mountedScreens: number;
  mountedBackings: number;
  mountedAttachments: number;
  mountedEmitters: number;
  mountedBeams: number;
  mountedSupports: number;
  mountedScaffoldPoles: number;
  mountedScaffoldBraces: number;
  mountedScaffoldTies: number;
  mountedRamps: number;
  projectionOnly: true;
  pendingMountedBikeTask: 7;
  backdropReadiness: StuntBackdropReadiness;
  backdropProjections: StuntBackdropProjection[];
  cameraFrame: ReturnType<typeof measureStuntCameraPose>;
  generatedObbOcclusions: ReturnType<typeof measureStuntCameraPoseOcclusions>;
}

export function inspectStuntScene(
  scene: THREE.Scene,
  semanticT: number,
  viewport: { width: number; height: number },
): StuntSceneSnapshot {
  const mountedScreens = countByName(scene, STUNT_SCENE_NAMES.panelScreen);
  const mountedBackings = countByName(scene, STUNT_SCENE_NAMES.panelBacking);
  const mountedAttachments = countByName(scene, STUNT_SCENE_NAMES.panelAttachment);
  const mountedEmitters = countByName(scene, STUNT_SCENE_NAMES.panelEmitter);
  const mountedBeams = countByName(scene, STUNT_SCENE_NAMES.panelBeam);
  const mountedSupports = countByName(scene, STUNT_SCENE_NAMES.panelSupport);
  const mountedScaffoldPoles = countByName(scene, STUNT_SCENE_NAMES.scaffoldPole);
  const mountedScaffoldBraces = countByName(scene, STUNT_SCENE_NAMES.scaffoldBrace);
  const mountedScaffoldTies = countByName(scene, STUNT_SCENE_NAMES.scaffoldTie);
  const mountedRamps =
    countByName(scene, STUNT_SCENE_NAMES.ramp1)
    + countByName(scene, STUNT_SCENE_NAMES.ramp2);
  const backdropReadiness = inspectStuntBackdropReadiness(scene);
  const productionPose = buildProductionCameraRig().sample(semanticT);
  return {
    ready:
      mountedScreens === 5
      && mountedBackings === 5
      && mountedAttachments === 20
      && mountedEmitters === 0
      && mountedBeams === 0
      && mountedSupports === 0
      && mountedScaffoldPoles >= 14
      && mountedScaffoldBraces >= 12
      && mountedScaffoldTies >= 5
      && mountedRamps === 2
      && backdropReadiness.ready,
    mountedScreens,
    mountedBackings,
    mountedAttachments,
    mountedEmitters,
    mountedBeams,
    mountedSupports,
    mountedScaffoldPoles,
    mountedScaffoldBraces,
    mountedScaffoldTies,
    mountedRamps,
    projectionOnly: true,
    pendingMountedBikeTask: 7,
    backdropReadiness,
    backdropProjections: measureStuntBackdropProjections(semanticT, viewport),
    cameraFrame: measureStuntCameraPose(
      productionPose,
      semanticT,
      viewport,
    ),
    generatedObbOcclusions: measureStuntCameraPoseOcclusions(
      productionPose,
      semanticT,
      buildCityLayout(),
    ),
  };
}
