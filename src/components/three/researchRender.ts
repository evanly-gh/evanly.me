import * as THREE from 'three';
import {
  activeResearchPanelIds,
  measureResearchCameraFrame,
  measureResearchLayerFraming,
  measureResearchMoonCompetition,
} from '../../world/researchCamera';
import { RESEARCH_PANELS } from '../../world/researchContent';
import { buildResearchOcclusionReport } from '../../world/researchOcclusion';

export const RESEARCH_PANEL_RENDER_CONFIG = {
  screen: {
    side: THREE.FrontSide,
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    renderOrder: 42,
  },
  backing: {
    depth: 0.12,
    screenToFront: 0.08,
    renderOrder: 40,
  },
  attachment: {
    mount: 0.24,
    depth: 0.36,
  },
} as const;

export const RESEARCH_SCENE_NAMES = {
  gatewayBeam: 'research-gateway-beam',
  gatewaySupport: 'research-gateway-support',
  gatewayTie: 'research-gateway-building-tie',
  panelScreen: 'research-panel-screen',
  panelBacking: 'research-panel-backing',
  panelAttachment: 'research-panel-attachment',
  wallReadyFile: 'research-wall-ready-file',
} as const;

export interface ResearchRenderInstance {
  id: string;
  parentId: string;
  matrix: THREE.Matrix4;
  textureIndex?: 0 | 1 | 2;
  screenToBackingFront?: number;
}

export interface ResearchRenderAssembly {
  beams: ResearchRenderInstance[];
  supports: ResearchRenderInstance[];
  ties: ResearchRenderInstance[];
  screens: ResearchRenderInstance[];
  backings: ResearchRenderInstance[];
  attachments: ResearchRenderInstance[];
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

function panelLocalMatrix(
  panel: typeof RESEARCH_PANELS[number],
  localPosition: readonly [number, number, number],
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  return matrix(panel.parentPosition, panel.parentRotationY, [1, 1, 1])
    .multiply(matrix(
      panel.localPosition,
      panel.localRotationY,
      [1, 1, 1],
    ))
    .multiply(matrix(localPosition, 0, scale));
}

export function buildResearchRenderAssembly(): ResearchRenderAssembly {
  // The entire gateway structure was removed: the overhead beam spanning the road
  // + horizontal ties briefly blocked the whole view onto the bridge, and the
  // vertical side posts flanking the road clipped into the front-row buildings.
  // Nothing structural is emitted anymore — the research content shows purely on
  // the side tower-facade panels.
  const beams: ResearchRenderInstance[] = [];
  const supports: ResearchRenderInstance[] = [];
  const ties: ResearchRenderInstance[] = [];
  const panels = RESEARCH_PANELS.filter((panel) => panel.mount !== 'gateway-face');
  const screens = panels.map((panel) => ({
    id: panel.id,
    parentId: panel.parentId,
    matrix: panelLocalMatrix(
      panel,
      [0, 0, 0],
      [panel.width, panel.height, 1],
    ),
    textureIndex: panel.contentIndex,
    screenToBackingFront:
      RESEARCH_PANEL_RENDER_CONFIG.backing.screenToFront,
  }));
  const backingDepth = RESEARCH_PANEL_RENDER_CONFIG.backing.depth;
  const backOffset =
    RESEARCH_PANEL_RENDER_CONFIG.backing.screenToFront + backingDepth / 2;
  const backings = panels.map((panel) => ({
    id: `${panel.id}:backing`,
    parentId: panel.parentId,
    matrix: panelLocalMatrix(
      panel,
      [0, 0, -backOffset],
      [panel.width + 0.8, panel.height + 0.8, backingDepth],
    ),
  }));
  const attachments = panels.flatMap((panel) =>
    ([-1, 1] as const).flatMap((horizontal) =>
      ([-1, 1] as const).map((vertical) => ({
      id: `${panel.id}:mount:${horizontal}:${vertical}`,
      parentId: panel.parentId,
      matrix: panelLocalMatrix(
        panel,
        [
          horizontal * panel.width * 0.43,
          vertical * panel.height * 0.43,
          -(backOffset + RESEARCH_PANEL_RENDER_CONFIG.attachment.depth / 2),
        ],
        [
          RESEARCH_PANEL_RENDER_CONFIG.attachment.mount,
          RESEARCH_PANEL_RENDER_CONFIG.attachment.mount,
          RESEARCH_PANEL_RENDER_CONFIG.attachment.depth,
        ],
      ),
    }))));
  return { beams, supports, ties, screens, backings, attachments };
}

const countByName = (scene: THREE.Scene, name: string): number => {
  let count = 0;
  scene.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
};

export interface ResearchSceneSnapshot {
  ready: boolean;
  semanticT: number;
  mountedGatewayBeams: number;
  mountedGatewaySupports: number;
  mountedGatewayTies: number;
  mountedScreens: number;
  mountedBackings: number;
  mountedAttachments: number;
  mountedWallReadyFiles: number;
  mountedWallPlacements: number;
  mountedPanelIds: string[];
  activePanelIds: string[];
  activePanels: ReturnType<typeof measureResearchCameraFrame>['panels'];
  generatedObbOcclusions: ReturnType<typeof buildResearchOcclusionReport>['occlusions'];
  occlusionCategoryCounts:
    ReturnType<typeof buildResearchOcclusionReport>['categoryCounts'];
  projectionOnly: true;
  pendingMountedBikeTask: 7;
  cameraFrame: ReturnType<typeof measureResearchCameraFrame>;
  layerFraming: ReturnType<typeof measureResearchLayerFraming>;
  moonCompetition: ReturnType<typeof measureResearchMoonCompetition> | null;
}

export function inspectResearchScene(
  scene: THREE.Scene,
  semanticT: number,
  viewport: { width: number; height: number },
): ResearchSceneSnapshot {
  const assembly = buildResearchRenderAssembly();
  const mountedGatewayBeams = countByName(
    scene,
    RESEARCH_SCENE_NAMES.gatewayBeam,
  );
  const mountedGatewaySupports = countByName(
    scene,
    RESEARCH_SCENE_NAMES.gatewaySupport,
  );
  const mountedGatewayTies = countByName(
    scene,
    RESEARCH_SCENE_NAMES.gatewayTie,
  );
  const mountedScreens = countByName(scene, RESEARCH_SCENE_NAMES.panelScreen);
  const mountedBackings = countByName(scene, RESEARCH_SCENE_NAMES.panelBacking);
  const mountedAttachments = countByName(
    scene,
    RESEARCH_SCENE_NAMES.panelAttachment,
  );
  const wallGroups = scene.getObjectsByProperty(
    'name',
    RESEARCH_SCENE_NAMES.wallReadyFile,
  );
  const mountedWallReadyFiles = wallGroups.length;
  const mountedWallPlacements = wallGroups.reduce(
    (total, group) => total + Number(group.userData.placementCount ?? 0),
    0,
  );
  const groupHasInstancedMesh = (group: THREE.Object3D): boolean => {
    let found = false;
    group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) found = true;
    });
    return found;
  };
  const wallsReady = mountedWallReadyFiles === 3
    && mountedWallPlacements === 38
    && wallGroups.every(groupHasInstancedMesh);
  const mountedPanelIds = scene
    .getObjectsByProperty('name', RESEARCH_SCENE_NAMES.panelScreen)
    .map((object) => String(object.userData.id ?? ''))
    .filter(Boolean)
    .sort();
  const expectedPanelIds = RESEARCH_PANELS.map(({ id }) => id).sort();
  const panelIdsReady = mountedPanelIds.length === expectedPanelIds.length
    && mountedPanelIds.every((id, index) => id === expectedPanelIds[index]);
  const cameraFrame = measureResearchCameraFrame(semanticT, viewport);
  const activePanelIds = activeResearchPanelIds(semanticT);
  const activeIdSet = new Set(activePanelIds);
  const activePanels = cameraFrame.panels.filter(({ id }) => activeIdSet.has(id));
  const occlusionReport = buildResearchOcclusionReport(semanticT);
  const generatedObbOcclusions = occlusionReport.occlusions;
  return {
    ready:
      mountedGatewayBeams === assembly.beams.length
      && mountedGatewaySupports === assembly.supports.length
      && mountedGatewayTies === assembly.ties.length
      && mountedScreens === assembly.screens.length
      && mountedBackings === assembly.backings.length
      && mountedAttachments === assembly.attachments.length
      && wallsReady
      && panelIdsReady
      && activePanels.length === activePanelIds.length
      && generatedObbOcclusions.length === 0,
    semanticT,
    mountedGatewayBeams,
    mountedGatewaySupports,
    mountedGatewayTies,
    mountedScreens,
    mountedBackings,
    mountedAttachments,
    mountedWallReadyFiles,
    mountedWallPlacements,
    mountedPanelIds,
    activePanelIds,
    activePanels,
    generatedObbOcclusions,
    occlusionCategoryCounts: occlusionReport.categoryCounts,
    projectionOnly: true,
    pendingMountedBikeTask: 7,
    cameraFrame,
    layerFraming: measureResearchLayerFraming(
      semanticT,
      viewport,
    ),
    moonCompetition: activePanelIds.length > 0
      ? measureResearchMoonCompetition(semanticT, viewport)
      : null,
  };
}
