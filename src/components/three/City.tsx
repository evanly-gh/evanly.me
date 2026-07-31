import {
  Suspense,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls, PointerLockControls, useEnvironment, useGLTF, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../../theme';
import {
  buildAsphaltPixels,
  buildConcretePixels,
  PROCEDURAL_TEXTURE_SIZE,
} from '../../assets/proceduralTextures';
import {
  boulevardWalkClipAtCrossStreet,
  buildCrossStreetCrossings,
  buildShibuyaIntersection,
  buildStraightRoadCrossings,
  crossStreetInfraClipAtBoulevard,
  shibuyaPlazaContains,
} from '../../world/intersections';
import {
  ROADS,
  ELEVATED_HIGHWAY_ID,
  buildCurveRibbon,
  buildRoadGeometry,
  buildCurveBoxBeam,
} from '../../world/roads';
import {
  INSPECTION_PRESET_IDS,
  applyInspectionPreset,
  getInspectionPreset,
  shouldEnableInspection,
  type InspectionPreset,
  type InspectionPresetId,
} from '../../world/inspectionPresets';

const URL_PARAMS = new URLSearchParams(location.search);
const FREECAM = URL_PARAMS.has('freecam');
const VISIBILITY_RESIZE_DEBOUNCE_MS = 180;
const IS_DEVELOPMENT = (
  import.meta as ImportMeta & {
    env: { DEV: boolean; VITE_ENABLE_INSPECTION?: string };
  }
).env.DEV || (
  import.meta as ImportMeta & {
    env: { DEV: boolean; VITE_ENABLE_INSPECTION?: string };
  }
).env.VITE_ENABLE_INSPECTION === '1';
const INSPECT_ENABLED = shouldEnableInspection(IS_DEVELOPMENT, location.search);
const REQUESTED_VISIBILITY_PROFILE = resolveVisibilityProfile(location.search);
export const VisibilityLayoutContext =
  createContext<VisibilityLayout | null>(null);

function useVisibilityLayout(): VisibilityLayout {
  const layout = useContext(VisibilityLayoutContext);
  if (!layout) throw new Error('Visibility layout context is unavailable');
  return layout;
}

/** Small procedural asphalt texture: dark base + noise speckle + patches. */
function makeAsphaltTexture(): THREE.CanvasTexture {
  const s = PROCEDURAL_TEXTURE_SIZE;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const image = ctx.createImageData(s, s);
  image.data.set(buildAsphaltPixels());
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}
import { MOON_POS, MOON_RADIUS } from '../../world/route';
import {
  buildCityLayout,
  type Placement as CityPlacement,
} from '../../world/cityLayout';
import {
  buildRampGeometry,
  JUNK,
  RAMP2,
  SCAFFOLD,
  rampProfileHeight,
  rampProfileSlope,
  rampRidePlateTransform,
} from '../../world/setpieces';
import { ridePlateCenterOffset } from '../../choreography/rideSurface';
import { KitPiece } from './KitPiece';
import {
  InstancedPieces,
  pedestrianInstanceColor,
  stylePedestrianMaterial,
} from './InstancedPieces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  HUMAN_FILE,
  ROBOT_FILES,
  type RobotSpot,
} from '../../world/crowdLayout';
import { buildingPlacementBounds } from '../../world/buildingCatalog';
import { buildHighwayPillarLayout } from '../../world/highwayLayout';
import { styleRobotMaterial } from './robotMaterial';
import { useCommittedThreeResource } from './useCommittedThreeResources';
import {
  SHIBUYA_WALL_LIGHTS,
  buildShibuyaFacadePixels,
  createShibuyaFacadePanelMaterial,
  styleShibuyaWallMaterial,
} from './shibuyaMaterial';
import { buildShibuyaFacadePanels } from '../../world/visualFraming';
import type { ProgressStore } from '../../choreography/progressStore';
import { remapScroll } from '../../choreography/scrollRemap';
import { sceneAnimationTime } from '../../scroll/scrollRuntime';
import { BikeRider, type BikeRiderHandle } from './BikeRider';
import { ProductionDirector } from './ProductionDirector';
import {
  BRIDGE_RENDER_CONFIG,
  FINALE_ATMOSPHERE_CONFIG,
  MOON_KEYLIGHT_FLOOR_FRACTION,
  MOON_RENDER_CONFIG,
  TASK4_SCENE_NAMES,
  WATER_RENDER_CONFIG,
  buildFinaleAtmospherePositions,
  buildBridgeRenderGeometry,
  inspectTask4Scene,
  moonPresenceAt,
  type Task4SceneSnapshot,
} from '../../world/finaleRender';
import {
  buildShorelineGeometry,
  buildShorelineProfile,
} from '../../world/shoreline';
import { FACADE_SIGN_TARGET, HOLOGRAM_ANCHOR_IDS } from '../../world/signLayout';
import {
  FACADE_SIGN_RENDER_CONFIG,
  HOLOGRAM_SIGN_RENDER_CONFIG,
  TASK5_SCENE_NAMES,
  buildSignRenderBatches,
  frameTask5FacadeInspectionSubject,
  inspectTask5Scene,
  setTask5CameraView,
  type SignRenderBatch,
  type Task5CameraView,
  type Task5FacadeInspectionSubject,
  type Task5SceneSnapshot,
} from './signRender';
import { buildSignPixelArt, type SignArtVariant } from './signArt';
import {
  buildAboutArtLayout,
  renderAboutArt,
  resolveAboutPortraitSrc,
} from '../../content/aboutArt';
import { RESUME } from '../../content/resume';
import { buildAboutHeroReveal } from '../../world/aboutReveal';
import {
  ABOUT_HERO_RENDER_CONFIG,
  TASK2_SCENE_NAMES,
  buildAboutHeroRenderAssembly,
  buildAboutPlazaDressing,
  inspectTask2Scene,
  type Task2SceneSnapshot,
} from './aboutRender';
import {
  STUNT_PROJECT_PANELS,
  buildProjectArtLayout,
  estimateProjectGalleryTextureBytes,
  renderProjectArt,
} from '../../world/stuntContent';
import { buildScaffoldStructure } from '../../world/stuntLayout';
import {
  PROJECT_PANEL_RENDER_CONFIG,
  STUNT_SCENE_NAMES,
  buildStuntPanelRenderAssembly,
  inspectStuntProjectRasterAudit,
  inspectStuntScene,
  type StuntSceneSnapshot,
} from './stuntRender';
import {
  RESEARCH_PANELS,
  buildResearchArtLayout,
  renderResearchArt,
} from '../../world/researchContent';
import {
  RESEARCH_PANEL_RENDER_CONFIG,
  RESEARCH_SCENE_NAMES,
  buildResearchRenderAssembly,
  inspectResearchScene,
  type ResearchSceneSnapshot,
} from './researchRender';
import {
  buildInitialVisibilityLayout,
  buildVisibilityLayouts,
  estimateVisibilityBudget,
  resolveVisibilityProfile,
  type VisibilityLayout,
  type VisibilityLayouts,
} from '../../world/visibilityProfile';
import {
  CITY_ZONE_IDS,
  createCityZoneLoadController,
  partitionCityZones,
  type CityZoneLoadController,
  type CityZoneId,
} from '../../scroll/cityLoading';

declare global {
  interface Window {
    __EVANLY_INSPECTION__?: {
      version: 1;
      listPresets: () => InspectionPreset[];
      setPreset: (id: InspectionPresetId) => InspectionPreset & {
        subject?: Task5FacadeInspectionSubject;
      };
    };
    __EVANLY_TASK4_INSPECTION__?: {
      version: 1;
      snapshot: () => Task4SceneSnapshot;
      setReflectionIntensityForMeasurement: (intensity: number) => void;
    };
    __EVANLY_TASK5_INSPECTION__?: {
      version: 1;
      snapshot: () => Task5SceneSnapshot;
      setView: (id: string, view: Task5CameraView) => boolean;
    };
    __EVANLY_TASK2_INSPECTION__?: {
      version: 1;
      snapshot: () => Task2SceneSnapshot;
    };
    __EVANLY_TASK3_INSPECTION__?: {
      version: 1;
      snapshot: (semanticT: number) => StuntSceneSnapshot;
      projectArtRasterAudit: () => ReturnType<
        typeof inspectStuntProjectRasterAudit
      >;
    };
    __EVANLY_SCROLL_TASK4_INSPECTION__?: {
      version: 1;
      snapshot: (semanticT: number) => ResearchSceneSnapshot;
    };
    __EVANLY_VISIBILITY__?: {
      version: 1;
      setProfile: (profile: VisibilityLayout['profile']) => boolean;
      snapshot: () => {
        profile: VisibilityLayout['profile'];
        budget: ReturnType<typeof estimateVisibilityBudget>;
        completeWorldBudget: {
          triangles: number;
          instances: number;
          drawObjects: number;
        };
        audit: {
          removed: VisibilityLayouts['audit']['removed'];
          retained: VisibilityLayouts['audit']['retained'];
          antiVoid: VisibilityLayouts['audit']['antiVoid'];
          canyonFillers: VisibilityLayouts['audit']['canyonFillers'];
          sweep: VisibilityLayouts['sweep']['bounds'] & {
            sources: string[];
            samples: number;
            keys: number;
            interpolationSamples: number;
            aspect: number;
          };
        };
        counts: {
          buildings: number;
          props: number;
          skyline: number;
          signs: number;
        };
      };
    };
    __EVANLY_CITY_LOADING__?: {
      version: 1;
      snapshot: () => {
        activeZones: CityZoneId[];
        readyZones: CityZoneId[];
        zoneFiles: Record<CityZoneId, string[]>;
      };
    };
  }
}

/** Procedural concrete texture for the ground (grime + cracks + faint blocks). */
function makeConcreteTexture(): THREE.CanvasTexture {
  const s = PROCEDURAL_TEXTURE_SIZE;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const image = ctx.createImageData(s, s);
  image.data.set(buildConcretePixels());
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 4;
  return tex;
}

function makeSignTexture(
  i: number,
  variant: SignArtVariant,
): THREE.CanvasTexture {
  const art = buildSignPixelArt(i, variant);
  const cv = document.createElement('canvas');
  cv.width = art.width;
  cv.height = art.height;
  const ctx = cv.getContext('2d')!;
  const image = ctx.createImageData(art.width, art.height);
  image.data.set(art.data);
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function SignBatchMesh({
  batch,
  name,
  geometry,
  material,
  renderOrder = 0,
}: {
  batch: SignRenderBatch;
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  renderOrder?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    batch.instances.forEach(({ matrix }, index) => mesh.setMatrixAt(index, matrix));
    mesh.count = batch.instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, batch.instances.length]}
      userData={{ instances: batch.instances }}
      renderOrder={renderOrder}
      frustumCulled={false}
    />
  );
}

export function Signs() {
  const layout = useVisibilityLayout();
  const signs = layout.signs;
  const batches = useMemo(() => buildSignRenderBatches(signs), [signs]);
  const resources = useCommittedThreeResource('signs', ({ own }) => {
    const facadeTextures = Array.from({ length: 8 }, (_, index) =>
      own(makeSignTexture(index, 'facade')));
    const hologramTextures = Array.from({ length: 4 }, (_, index) =>
      own(makeSignTexture(index, 'hologram')));
    const facadeMaterials = facadeTextures.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: FACADE_SIGN_RENDER_CONFIG.screen.side,
      toneMapped: FACADE_SIGN_RENDER_CONFIG.screen.toneMapped,
      polygonOffset: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetUnits,
      depthTest: FACADE_SIGN_RENDER_CONFIG.screen.depthTest,
      depthWrite: FACADE_SIGN_RENDER_CONFIG.screen.depthWrite,
    })));
    const hologramMaterials = hologramTextures.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: HOLOGRAM_SIGN_RENDER_CONFIG.screen.side,
      toneMapped: HOLOGRAM_SIGN_RENDER_CONFIG.screen.toneMapped,
      transparent: HOLOGRAM_SIGN_RENDER_CONFIG.screen.transparent,
      opacity: HOLOGRAM_SIGN_RENDER_CONFIG.screen.opacity,
      depthWrite: HOLOGRAM_SIGN_RENDER_CONFIG.screen.depthWrite,
      depthTest: HOLOGRAM_SIGN_RENDER_CONFIG.screen.depthTest,
      blending: HOLOGRAM_SIGN_RENDER_CONFIG.screen.blending,
    })));
    const backingMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x05060c,
      roughness: 0.8,
      metalness: 0.65,
    }));
    const attachmentMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x20283a,
      roughness: 0.45,
      metalness: 0.85,
    }));
    const emitterMaterial = own(new THREE.MeshStandardMaterial({
      color: HOLOGRAM_SIGN_RENDER_CONFIG.emitter.color,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: HOLOGRAM_SIGN_RENDER_CONFIG.emitter.emissiveIntensity,
      roughness: 0.35,
      metalness: 0.8,
      toneMapped: false,
    }));
    const beamMaterial = own(new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: HOLOGRAM_SIGN_RENDER_CONFIG.beam.transparent,
      opacity: HOLOGRAM_SIGN_RENDER_CONFIG.beam.opacity,
      depthWrite: HOLOGRAM_SIGN_RENDER_CONFIG.beam.depthWrite,
      depthTest: HOLOGRAM_SIGN_RENDER_CONFIG.beam.depthTest,
      blending: HOLOGRAM_SIGN_RENDER_CONFIG.beam.blending,
      side: HOLOGRAM_SIGN_RENDER_CONFIG.beam.side,
      toneMapped: false,
    }));
    const value = {
      textures: [...facadeTextures, ...hologramTextures],
      facadeMaterials,
      hologramMaterials,
      backingMaterial,
      attachmentMaterial,
      emitterMaterial,
      beamMaterial,
      planeGeometry: own(new THREE.PlaneGeometry(1, 1)),
      boxGeometry: own(new THREE.BoxGeometry(1, 1, 1)),
      emitterGeometry: own(new THREE.CylinderGeometry(1, 1.14, 1, 20)),
      beamGeometry: own(new THREE.CylinderGeometry(0.16, 1, 1, 20, 1, true)),
    };
    return {
      value,
      resources: [
        ...value.textures,
        ...value.facadeMaterials,
        ...value.hologramMaterials,
        value.backingMaterial,
        value.attachmentMaterial,
        value.emitterMaterial,
        value.beamMaterial,
        value.planeGeometry,
        value.boxGeometry,
        value.emitterGeometry,
        value.beamGeometry,
      ],
    };
  }, []);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {batches.facadeScreens.map((batch) => (
        <SignBatchMesh
          key={`facade-${batch.textureIndex}`}
          batch={batch}
          name={TASK5_SCENE_NAMES.facadeScreen}
          geometry={resources.planeGeometry}
          material={resources.facadeMaterials[batch.textureIndex!]}
          renderOrder={FACADE_SIGN_RENDER_CONFIG.screen.renderOrder}
        />
      ))}
      <SignBatchMesh
        batch={batches.backings}
        name={TASK5_SCENE_NAMES.facadeBacking}
        geometry={resources.boxGeometry}
        material={resources.backingMaterial}
        renderOrder={FACADE_SIGN_RENDER_CONFIG.backing.renderOrder}
      />
      <SignBatchMesh
        batch={batches.attachments}
        name={TASK5_SCENE_NAMES.facadeAttachment}
        geometry={resources.boxGeometry}
        material={resources.attachmentMaterial}
      />
      {batches.hologramScreens.map((batch) => (
        <SignBatchMesh
          key={`hologram-${batch.textureIndex}`}
          batch={batch}
          name={TASK5_SCENE_NAMES.hologramScreen}
          geometry={resources.planeGeometry}
          material={resources.hologramMaterials[batch.textureIndex!]}
          renderOrder={HOLOGRAM_SIGN_RENDER_CONFIG.screen.renderOrder}
        />
      ))}
      <SignBatchMesh
        batch={batches.emitters}
        name={TASK5_SCENE_NAMES.hologramEmitter}
        geometry={resources.emitterGeometry}
        material={resources.emitterMaterial}
      />
      <SignBatchMesh
        batch={batches.beams}
        name={TASK5_SCENE_NAMES.hologramBeam}
        geometry={resources.beamGeometry}
        material={resources.beamMaterial}
        renderOrder={HOLOGRAM_SIGN_RENDER_CONFIG.beam.renderOrder}
      />
    </group>
  );
}

export function ProjectsPanels() {
  const assembly = useMemo(() => buildStuntPanelRenderAssembly(), []);
  const resources = useCommittedThreeResource('stunt-project-panels', ({ own }) => {
    const textureEstimate = estimateProjectGalleryTextureBytes();
    const textures = STUNT_PROJECT_PANELS.map((panel) => {
      const art = buildProjectArtLayout(panel);
      const canvas = document.createElement('canvas');
      canvas.width = art.size.width;
      canvas.height = art.size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(`Project art canvas unavailable: ${panel.id}`);
      renderProjectArt(context, art);
      const texture = own(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const estimate = textureEstimate.textures.find(
        ({ panelId }) => panelId === panel.id,
      );
      if (!estimate) throw new Error(`Project texture estimate missing: ${panel.id}`);
      texture.userData.projectGallery = {
        ...estimate,
        artAudit: {
          regions: art.regions.filter(({ id }) => id !== 'background'),
        },
      };
      return texture;
    });
    const screenMaterials = textures.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: PROJECT_PANEL_RENDER_CONFIG.screen.side,
      toneMapped: PROJECT_PANEL_RENDER_CONFIG.screen.toneMapped,
      depthTest: PROJECT_PANEL_RENDER_CONFIG.screen.depthTest,
      polygonOffset: PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor:
        PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits:
        PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffsetUnits,
      transparent: PROJECT_PANEL_RENDER_CONFIG.screen.transparent,
      opacity: PROJECT_PANEL_RENDER_CONFIG.screen.opacity,
      blending: PROJECT_PANEL_RENDER_CONFIG.screen.blending,
      depthWrite: PROJECT_PANEL_RENDER_CONFIG.screen.depthWrite,
    })));
    const backingMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x050913,
      emissive: new THREE.Color(0x07111f),
      emissiveIntensity: 0.25,
      roughness: 0.72,
      metalness: 0.66,
    }));
    const attachmentMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x1c2b3d,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.16,
      roughness: 0.48,
      metalness: 0.82,
    }));
    const emitterMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x241344,
      emissive: new THREE.Color(0xbca2ff),
      emissiveIntensity:
        PROJECT_PANEL_RENDER_CONFIG.hologram.emitterEmissiveIntensity,
      roughness: 0.32,
      metalness: 0.82,
      toneMapped: PROJECT_PANEL_RENDER_CONFIG.hologram.emitterToneMapped,
    }));
    const beamMaterial = own(new THREE.MeshBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: PROJECT_PANEL_RENDER_CONFIG.hologram.beamOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    const planeGeometry = own(new THREE.PlaneGeometry(1, 1));
    const boxGeometry = own(new THREE.BoxGeometry(1, 1, 1));
    const emitterGeometry = own(new THREE.CylinderGeometry(1, 1.2, 1, 20));
    const beamGeometry = own(new THREE.CylinderGeometry(0.3, 1, 1, 20, 1, true));
    return {
      value: {
        textures,
        screenMaterials,
        backingMaterial,
        attachmentMaterial,
        emitterMaterial,
        beamMaterial,
        planeGeometry,
        boxGeometry,
        emitterGeometry,
        beamGeometry,
      },
      resources: [
        ...textures,
        ...screenMaterials,
        backingMaterial,
        attachmentMaterial,
        emitterMaterial,
        beamMaterial,
        planeGeometry,
        boxGeometry,
        emitterGeometry,
        beamGeometry,
      ],
    };
  }, []);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {assembly.screens.map((instance, index) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelScreen}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.planeGeometry}
          material={resources.screenMaterials[index]}
          renderOrder={PROJECT_PANEL_RENDER_CONFIG.screen.renderOrder}
          userData={{
            id: instance.id,
            parentId: instance.parentId,
            screenToBackingFront: instance.screenToBackingFront,
          }}
          dispose={null}
        />
      ))}
      {assembly.backings.map((instance) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelBacking}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.boxGeometry}
          material={resources.backingMaterial}
          renderOrder={PROJECT_PANEL_RENDER_CONFIG.backing.renderOrder}
          userData={{ id: instance.id, parentId: instance.parentId }}
          dispose={null}
        />
      ))}
      {assembly.attachments.map((instance) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelAttachment}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.boxGeometry}
          material={resources.attachmentMaterial}
          userData={{ id: instance.id, parentId: instance.parentId }}
          dispose={null}
        />
      ))}
      {assembly.supports.map((instance) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelSupport}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.boxGeometry}
          material={resources.attachmentMaterial}
          userData={{ id: instance.id, parentId: instance.parentId }}
          dispose={null}
        />
      ))}
      {assembly.emitters.map((instance) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelEmitter}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.emitterGeometry}
          material={resources.emitterMaterial}
          userData={{ id: instance.id, parentId: instance.parentId }}
          dispose={null}
        />
      ))}
      {assembly.beams.map((instance) => (
        <mesh
          key={instance.id}
          name={STUNT_SCENE_NAMES.panelBeam}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.beamGeometry}
          material={resources.beamMaterial}
          renderOrder={PROJECT_PANEL_RENDER_CONFIG.screen.renderOrder - 1}
          userData={{ id: instance.id, parentId: instance.parentId }}
          dispose={null}
        />
      ))}
    </group>
  );
}

export function ResearchGateways() {
  const assembly = useMemo(() => buildResearchRenderAssembly(), []);
  const resources = useCommittedThreeResource('research-gateways', ({ own }) => {
    const artPool = ([0, 1] as const).map((contentIndex) => {
      const panel = RESEARCH_PANELS.find((candidate) =>
        candidate.contentIndex === contentIndex);
      if (!panel) {
        throw new Error(`Research art pool is missing content ${contentIndex}`);
      }
      const art = buildResearchArtLayout(panel);
      const canvas = document.createElement('canvas');
      canvas.width = art.size.width;
      canvas.height = art.size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error(`Research art canvas unavailable: ${panel.id}`);
      renderResearchArt(context, art);
      const texture = own(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    });
    const screenMaterials = artPool.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: RESEARCH_PANEL_RENDER_CONFIG.screen.side,
      toneMapped: RESEARCH_PANEL_RENDER_CONFIG.screen.toneMapped,
      depthTest: RESEARCH_PANEL_RENDER_CONFIG.screen.depthTest,
      depthWrite: RESEARCH_PANEL_RENDER_CONFIG.screen.depthWrite,
      polygonOffset: RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor:
        RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits:
        RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffsetUnits,
    })));
    const structureMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x172235,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.12,
      roughness: 0.48,
      metalness: 0.82,
    }));
    const backingMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x030811,
      emissive: new THREE.Color(0x061321),
      emissiveIntensity: 0.3,
      roughness: 0.72,
      metalness: 0.7,
    }));
    const planeGeometry = own(new THREE.PlaneGeometry(1, 1));
    const boxGeometry = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: {
        textures: artPool,
        screenMaterials,
        structureMaterial,
        backingMaterial,
        planeGeometry,
        boxGeometry,
      },
      resources: [
        ...artPool,
        ...screenMaterials,
        structureMaterial,
        backingMaterial,
        planeGeometry,
        boxGeometry,
      ],
    };
  }, []);
  if (!resources) return null;
  const renderBoxes = (
    instances: typeof assembly.beams,
    name: string,
    material: THREE.Material,
  ) => instances.map((instance) => (
    <mesh
      key={instance.id}
      name={name}
      matrix={instance.matrix}
      matrixAutoUpdate={false}
      geometry={resources.boxGeometry}
      material={material}
      userData={{ id: instance.id, parentId: instance.parentId }}
      dispose={null}
    />
  ));
  return (
    <group name="research-gateways-owned" dispose={null}>
      {renderBoxes(
        assembly.beams,
        RESEARCH_SCENE_NAMES.gatewayBeam,
        resources.structureMaterial,
      )}
      {renderBoxes(
        assembly.supports,
        RESEARCH_SCENE_NAMES.gatewaySupport,
        resources.structureMaterial,
      )}
      {renderBoxes(
        assembly.ties,
        RESEARCH_SCENE_NAMES.gatewayTie,
        resources.structureMaterial,
      )}
      {assembly.screens.map((instance) => (
        <mesh
          key={instance.id}
          name={RESEARCH_SCENE_NAMES.panelScreen}
          matrix={instance.matrix}
          matrixAutoUpdate={false}
          geometry={resources.planeGeometry}
          material={resources.screenMaterials[instance.textureIndex ?? 0]}
          renderOrder={RESEARCH_PANEL_RENDER_CONFIG.screen.renderOrder}
          userData={{
            id: instance.id,
            parentId: instance.parentId,
            screenToBackingFront: instance.screenToBackingFront,
          }}
          dispose={null}
        />
      ))}
      {renderBoxes(
        assembly.backings,
        RESEARCH_SCENE_NAMES.panelBacking,
        resources.backingMaterial,
      )}
      {renderBoxes(
        assembly.attachments,
        RESEARCH_SCENE_NAMES.panelAttachment,
        resources.structureMaterial,
      )}
    </group>
  );
}

export function AboutHero() {
  const layout = useVisibilityLayout();
  const reveal = useMemo(
    () => buildAboutHeroReveal(layout.buildings),
    [layout.buildings],
  );
  const assembly = useMemo(
    () => buildAboutHeroRenderAssembly(reveal.screen),
    [reveal],
  );
  const dressing = useMemo(
    () => buildAboutPlazaDressing(reveal.screen),
    [reveal],
  );
  const portraitSrc = resolveAboutPortraitSrc(RESUME.about.faceImage);
  const portrait = useTexture(portraitSrc);
  const resources = useCommittedThreeResource('about-hero', ({ own }) => {
    const art = buildAboutArtLayout(portraitSrc);
    const canvas = document.createElement('canvas');
    canvas.width = art.size.width;
    canvas.height = art.size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('About hero canvas context is unavailable');
    renderAboutArt(context, portrait.image as CanvasImageSource, art);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = ABOUT_HERO_RENDER_CONFIG.texture.colorSpace;
    texture.anisotropy = ABOUT_HERO_RENDER_CONFIG.texture.anisotropy;
    const screenMaterial = own(new THREE.MeshBasicMaterial({
      map: texture,
      side: ABOUT_HERO_RENDER_CONFIG.screen.side,
      toneMapped: ABOUT_HERO_RENDER_CONFIG.screen.toneMapped,
      depthTest: ABOUT_HERO_RENDER_CONFIG.screen.depthTest,
      depthWrite: ABOUT_HERO_RENDER_CONFIG.screen.depthWrite,
      polygonOffset: ABOUT_HERO_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor:
        ABOUT_HERO_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits:
        ABOUT_HERO_RENDER_CONFIG.screen.polygonOffsetUnits,
    }));
    const backingMaterial = own(new THREE.MeshStandardMaterial({
      color: ABOUT_HERO_RENDER_CONFIG.backing.color,
      roughness: ABOUT_HERO_RENDER_CONFIG.backing.roughness,
      metalness: ABOUT_HERO_RENDER_CONFIG.backing.metalness,
    }));
    const attachmentMaterial = own(new THREE.MeshStandardMaterial({
      color: ABOUT_HERO_RENDER_CONFIG.attachment.color,
      roughness: ABOUT_HERO_RENDER_CONFIG.attachment.roughness,
      metalness: ABOUT_HERO_RENDER_CONFIG.attachment.metalness,
    }));
    const plane = own(new THREE.PlaneGeometry(1, 1));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    const glowMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x081a20,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 2.2,
      toneMapped: false,
    }));
    const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 12));
    const value = {
      texture,
      screenMaterial,
      backingMaterial,
      attachmentMaterial,
      glowMaterial,
      plane,
      box,
      cylinder,
    };
    return {
      value,
      resources: [
        texture,
        screenMaterial,
        backingMaterial,
        attachmentMaterial,
        glowMaterial,
        plane,
        box,
        cylinder,
      ],
    };
  }, [portrait, portraitSrc]);
  if (!resources) return null;
  return (
    <group name="about-hero-owned" dispose={null}>
      <mesh
        name={TASK2_SCENE_NAMES.screen}
        matrix={assembly.screen.matrix}
        matrixAutoUpdate={false}
        geometry={resources.plane}
        material={resources.screenMaterial}
        userData={{ contract: assembly.screen }}
        renderOrder={ABOUT_HERO_RENDER_CONFIG.screen.renderOrder}
        dispose={null}
      />
      <mesh
        name={TASK2_SCENE_NAMES.backing}
        matrix={assembly.backing.matrix}
        matrixAutoUpdate={false}
        geometry={resources.box}
        material={resources.backingMaterial}
        userData={{ contract: assembly.backing }}
        renderOrder={ABOUT_HERO_RENDER_CONFIG.backing.renderOrder}
        dispose={null}
      />
      {assembly.attachments.map((attachment) => (
        <mesh
          key={attachment.id}
          name={TASK2_SCENE_NAMES.attachment}
          matrix={attachment.matrix}
          matrixAutoUpdate={false}
          geometry={resources.box}
          material={resources.attachmentMaterial}
          userData={{ contract: attachment }}
          dispose={null}
        />
      ))}
      {/* Plaza dressing — a low mounting plinth + approach light poles. Real
          surrounding buildings/trees/signs come from the city layout. */}
      {dressing.structure.map((matrix, index) => (
        <mesh
          key={`about-struct-${index}`}
          matrix={matrix}
          matrixAutoUpdate={false}
          geometry={resources.box}
          material={resources.attachmentMaterial}
          dispose={null}
        />
      ))}
      {dressing.poles.map((matrix, index) => (
        <mesh
          key={`about-pole-${index}`}
          matrix={matrix}
          matrixAutoUpdate={false}
          geometry={resources.cylinder}
          material={resources.attachmentMaterial}
          dispose={null}
        />
      ))}
      {dressing.lamps.map((matrix, index) => (
        <mesh
          key={`about-lamp-${index}`}
          matrix={matrix}
          matrixAutoUpdate={false}
          geometry={resources.box}
          material={resources.glowMaterial}
          dispose={null}
        />
      ))}
    </group>
  );
}

function EnvMap() {
  const texture = useEnvironment({ preset: 'night' });
  const { scene } = useThree();
  useEffect(() => {
    scene.environment = texture;
    scene.environmentIntensity = LIGHTING.envIntensity;
    return () => { scene.environment = null; };
  }, [scene, texture]);
  return null;
}

function ExposureSync() {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = LIGHTING.exposure; }, [gl]);
  return null;
}

/**
 * FPS-style fly camera: pointer-lock mouse-look (yaw/pitch only, no roll) +
 * frame-rate-independent WASD movement, Q/E for down/up, Shift to boost.
 */
// Mutable, non-reactive store so the DOM telemetry readout (outside the R3F
// Canvas) can be updated every frame without triggering React re-renders.
const freeCamTelemetry = { x: 0, y: 0, z: 0, headingDeg: 0, pitchDeg: 0 };

// Compass rose: heading convention is 0°=+Z, 90°=+X, 180°=-Z, 270°=-X, so +Z
// reads as North, +X as East (matches the world axes + GizmoViewport HUD).
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
function compassCardinal(headingDeg: number): string {
  const normalized = ((headingDeg % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length];
}

function FreeCam() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    // Releasing pointer lock (Esc) must stop the fly camera dead. Drop every
    // held key on release so a movement key still physically down across the
    // transition can't keep nudging the camera after it's been "released".
    const onLockChange = () => {
      if (!document.pointerLockElement) keys.current = {};
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, []);
  const dir = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const k = keys.current;
    // Only fly while the pointer is captured. Once Esc releases the lock the
    // camera holds its pose instead of drifting on a lingering keypress.
    const flying = document.pointerLockElement != null;
    const speed = (k['ShiftLeft'] || k['ShiftRight'] ? 520 : 170) * Math.min(dt, 0.05);
    camera.getWorldDirection(dir.current).normalize();
    right.current.crossVectors(dir.current, camera.up).normalize();
    if (flying) {
      if (k['KeyW']) camera.position.addScaledVector(dir.current, speed);
      if (k['KeyS']) camera.position.addScaledVector(dir.current, -speed);
      if (k['KeyD']) camera.position.addScaledVector(right.current, speed);
      if (k['KeyA']) camera.position.addScaledVector(right.current, -speed);
      if (k['KeyE'] || k['Space']) camera.position.y += speed;
      if (k['KeyQ']) camera.position.y -= speed;
    }
    freeCamTelemetry.x = camera.position.x;
    freeCamTelemetry.y = camera.position.y;
    freeCamTelemetry.z = camera.position.z;
    // 0°=+Z, 90°=+X, 180°=-Z, 270°=-X (matches the world axes drawn by the
    // GizmoViewport HUD, so heading + gizmo agree on the same convention)
    freeCamTelemetry.headingDeg = (THREE.MathUtils.radToDeg(Math.atan2(dir.current.x, dir.current.z)) + 360) % 360;
    freeCamTelemetry.pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.current.y, -1, 1)));
  });
  return (
    <>
      <PointerLockControls makeDefault pointerSpeed={0.9} />
      <GizmoHelper alignment="top-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ff5d7a', '#7dffb2', '#5dd8ff']} labelColor="black" />
      </GizmoHelper>
    </>
  );
}

/** Live position/heading readout for FreeCam — polls the telemetry store via
 * rAF and writes straight to the DOM, bypassing React state so a 60fps
 * update doesn't force a React re-render of the whole overlay. */
function FreeCamHud() {
  const textRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    const t = freeCamTelemetry;
    const line = `x ${t.x.toFixed(2)}, y ${t.y.toFixed(2)}, z ${t.z.toFixed(2)}, hdg ${t.headingDeg.toFixed(0)}, pitch ${t.pitchDeg.toFixed(0)}`;
    navigator.clipboard?.writeText(line).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'KeyC') copy(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copy]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = textRef.current;
      if (el) {
        const t = freeCamTelemetry;
        el.textContent =
          `x ${t.x.toFixed(1)}  y ${t.y.toFixed(1)}  z ${t.z.toFixed(1)}   `
          + `hdg ${t.headingDeg.toFixed(0)}° ${compassCardinal(t.headingDeg)}`
          + `  pitch ${t.pitchDeg.toFixed(0)}°`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      style={{
        position: 'fixed', bottom: 44, left: 12, zIndex: 10,
        font: '12px/1.5 ui-monospace, monospace', color: PALETTE.cyan,
        background: 'rgba(10,11,30,0.8)', border: `1px solid ${PALETTE.panel}`,
        padding: '8px 12px', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span ref={textRef} style={{ pointerEvents: 'none' }} />
      <button
        // Stop the click from bubbling to drei's document-level listener, which
        // otherwise calls PointerLockControls.lock() and yanks us into camera view.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); copy(); }}
        style={{
          pointerEvents: 'auto', cursor: 'pointer', font: 'inherit',
          color: copied ? '#7dffb2' : PALETTE.cyan, background: 'transparent',
          border: `1px solid ${PALETTE.panel}`, borderRadius: 4, padding: '2px 8px',
        }}
      >
        {copied ? 'copied' : 'copy (C)'}
      </button>
    </div>
  );
}

// ── Roads: deck + sidewalks (raised curbs) + glowing edge/centre lines ──
// Monorail guideway + train-car sizing. The safety systems in roads.ts /
// highwayLayout.ts guarantee buildings clear at least BUILDING_DECK_VERTICAL_MARGIN
// (4m) below the deck underside offset (curve.y - DECK_UNDERSIDE_OFFSET), i.e. a
// solid clear volume from the beam top down to curve.y - DECK_UNDERSIDE_OFFSET -
// BUILDING_DECK_VERTICAL_MARGIN = curve.y - 5.4. The beam + strut + car stack
// below must stay within that.
const MONORAIL_BEAM_HEIGHT = 1.6;
const MONORAIL_STRUT_DROP = 0.8;
const MONORAIL_CAR_HEIGHT = 2.2;
const MONORAIL_CAR_WIDTH = 3;
const MONORAIL_CAR_LENGTH = 8;
const MONORAIL_CAR_GAP = 1.2;
const MONORAIL_CAR_COUNT = 3;

export function Pillars() {
  const pillars = useMemo(() => buildHighwayPillarLayout(
    buildCityLayout().map(buildingPlacementBounds),
  ), []);
  const resources = useCommittedThreeResource('pillars', ({ own }) => {
    const material = own(new THREE.MeshStandardMaterial({
      color: 0x0d0f18,
      roughness: 0.7,
      metalness: 0.4,
    }));
    const geometries = pillars.map((pillar) =>
      own(new THREE.CylinderGeometry(2.2, pillar.radius, pillar.height, 8)));
    return {
      value: { material, geometries },
      resources: [material, ...geometries],
    };
  }, [pillars]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {pillars.map((p, i) => (
        <mesh
          key={i}
          geometry={resources.geometries[i]}
          material={resources.material}
          position={[p.x, p.height / 2, p.z]}
          dispose={null}
        />
      ))}
    </group>
  );
}

export function MonorailTrain() {
  const road = useMemo(() => ROADS.find((r) => r.id === ELEVATED_HIGHWAY_ID)!, []);
  const curveLength = useMemo(() => road.curve.getLength(), [road]);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const phaseRef = useRef(0);
  const resources = useCommittedThreeResource('monorail-train', ({ own }) => {
    const carGeometry = own(new THREE.BoxGeometry(MONORAIL_CAR_LENGTH, MONORAIL_CAR_HEIGHT, MONORAIL_CAR_WIDTH));
    const strutGeometry = own(new THREE.BoxGeometry(0.3, MONORAIL_STRUT_DROP, 0.3));
    const carMat = own(new THREE.MeshStandardMaterial({
      color: 0x181a24,
      roughness: 0.4,
      metalness: 0.5,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.18,
    }));
    const strutMat = own(new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: 0.6, metalness: 0.5 }));
    return {
      value: { carGeometry, strutGeometry, carMat, strutMat },
      resources: [carGeometry, strutGeometry, carMat, strutMat],
    };
  }, []);

  useFrame((_, delta) => {
    phaseRef.current = (phaseRef.current + delta * 6) % curveLength;
    const spacing = MONORAIL_CAR_LENGTH + MONORAIL_CAR_GAP;
    for (let i = 0; i < MONORAIL_CAR_COUNT; i++) {
      const group = groupRefs.current[i];
      if (!group) continue;
      const s = (phaseRef.current - i * spacing + curveLength * 100) % curveLength;
      const u = s / curveLength;
      const p = road.curve.getPointAt(u);
      const tangent = road.curve.getTangentAt(u);
      const carTopY = p.y + road.level - MONORAIL_BEAM_HEIGHT - MONORAIL_STRUT_DROP;
      group.position.set(p.x, carTopY - MONORAIL_CAR_HEIGHT / 2, p.z);
      group.rotation.y = Math.atan2(-tangent.z, tangent.x);
    }
  });

  if (!resources) return null;
  const { carGeometry, strutGeometry, carMat, strutMat } = resources;
  return (
    <group dispose={null}>
      {Array.from({ length: MONORAIL_CAR_COUNT }).map((_, i) => (
        <group key={i} ref={(el) => { groupRefs.current[i] = el; }} dispose={null}>
          <mesh geometry={carGeometry} material={carMat} dispose={null} />
          <mesh
            geometry={strutGeometry}
            material={strutMat}
            position={[0, MONORAIL_CAR_HEIGHT / 2 + MONORAIL_STRUT_DROP / 2, 0]}
            dispose={null}
          />
        </group>
      ))}
    </group>
  );
}

export function Roads() {
  const resources = useCommittedThreeResource('roads', ({ own }) => {
    const asphalt = own(makeAsphaltTexture());
    const deckMat = own(new THREE.MeshStandardMaterial({ color: 0x14161f, map: asphalt, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }));
    const underMat = own(new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.85, metalness: 0.35, side: THREE.DoubleSide }));
    const walkMat = own(new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9, metalness: 0.08 }));
    const curbMat = own(new THREE.MeshStandardMaterial({ color: 0x4c525f, roughness: 0.85, metalness: 0.1 }));
    const magenta = own(new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.2, toneMapped: false }));
    const amber = own(new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.8, toneMapped: false }));
    const teal = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const monorailMat = own(new THREE.MeshStandardMaterial({ color: 0x12131c, roughness: 0.5, metalness: 0.6 }));
    const monorailGlow = own(new THREE.MeshStandardMaterial({ color: 0x160c22, emissive: new THREE.Color(PALETTE.violet), emissiveIntensity: 2, toneMapped: false }));
    const crossingMat = own(new THREE.MeshStandardMaterial({ color: 0xd8dbe6, roughness: 0.7, emissive: new THREE.Color(0x8891a6), emissiveIntensity: 0.25 }));
    const indicatorMat = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 2.1, toneMapped: false }));
    const intersection = buildShibuyaIntersection();
    const straightRoadCrossings = buildStraightRoadCrossings();
    const crossStreetCrossings = buildCrossStreetCrossings();
    const shape = new THREE.Shape();
    intersection.plaza.outline.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    shape.closePath();
    const geometry = own(new THREE.ExtrudeGeometry(shape, {
      depth: intersection.plaza.thickness,
      bevelEnabled: false,
    }));
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, intersection.plaza.surfaceY, 0);
    const plazaGeometry = geometry;
    const nodes = ROADS.map((r, roadIndex) => {
      const service = r.surface === 'service-concrete';
      const isMonorail = r.id === ELEVATED_HIGHWAY_ID;
      if (isMonorail) {
        // a straddle-beam monorail guideway: a solid box-beam (not a flat
        // deck) with a lit fascia pinstripe along its lower edges
        const beam = own(buildCurveBoxBeam(r.curve, r.halfWidth, MONORAIL_BEAM_HEIGHT, { lift: r.level }));
        const edgeGlowL = own(buildCurveRibbon(r.curve, 0.22, { offset: r.halfWidth - 0.3, lift: r.level - MONORAIL_BEAM_HEIGHT + 0.05 }));
        const edgeGlowR = own(buildCurveRibbon(r.curve, 0.22, { offset: -(r.halfWidth - 0.3), lift: r.level - MONORAIL_BEAM_HEIGHT + 0.05 }));
        return {
          deck: null, beam, edgeGlowL, edgeGlowR, centre: null,
          walkL: null, walkR: null, curbL: null, curbR: null, underDeck: null,
          main: false, service: false, isMonorail: true,
        };
      }
      const deck = own(buildRoadGeometry(roadIndex));
      // Junction-aware clips at the boulevard × cross-street 4-way. The boulevard
      // is the through-road: its edge + centre lines stay continuous, only its
      // raised sidewalk/curb are notched out of the cross-street mouth. The cross
      // street stops all of its infrastructure at the boulevard edge so nothing
      // overlaps the roadway; the zebra crosswalk bands carry the crossing.
      const isBoulevard = r.id === 'main-route';
      const isCrossStreet = r.id === 'cross-street';
      const combineClip = (
        extra?: (x: number, z: number) => boolean,
      ): ((x: number, z: number) => boolean) | undefined => {
        if (!r.ground) return undefined;
        if (!extra) return shibuyaPlazaContains;
        return (x, z) => shibuyaPlazaContains(x, z) || extra(x, z);
      };
      const edgeClip = combineClip(
        isCrossStreet ? crossStreetInfraClipAtBoulevard : undefined,
      );
      const walkClip = combineClip(
        isBoulevard
          ? boulevardWalkClipAtCrossStreet
          : isCrossStreet
            ? crossStreetInfraClipAtBoulevard
            : undefined,
      );
      const edgeGlowL = own(buildCurveRibbon(r.curve, 0.3, { offset: r.halfWidth - 0.4, lift: r.level + 0.06, clip: edgeClip }));
      const edgeGlowR = own(buildCurveRibbon(r.curve, 0.3, { offset: -(r.halfWidth - 0.4), lift: r.level + 0.06, clip: edgeClip }));
      const centre = service
        ? null
        : own(buildCurveRibbon(r.curve, 0.14, { lift: r.level + 0.06, clip: edgeClip }));
      // wide raised sidewalks (half-width 4.5 → 9 m) + a raised curb lip at the road edge
      const walkL = r.ground && !service ? own(buildCurveRibbon(r.curve, 4.5, { offset: r.halfWidth + 4.5, lift: 0.45, clip: walkClip })) : null;
      const walkR = r.ground && !service ? own(buildCurveRibbon(r.curve, 4.5, { offset: -(r.halfWidth + 4.5), lift: 0.45, clip: walkClip })) : null;
      const curbL = r.ground && !service ? own(buildCurveRibbon(r.curve, 0.4, { offset: r.halfWidth + 0.4, lift: 0.5, clip: walkClip })) : null;
      const curbR = r.ground && !service ? own(buildCurveRibbon(r.curve, 0.4, { offset: -(r.halfWidth + 0.4), lift: 0.5, clip: walkClip })) : null;
      // elevated decks get a dark under-slab (slightly wider, dropped down) so
      // the highway reads as a solid deck when viewed from underneath
      const underDeck = r.ground ? null : own(buildCurveRibbon(r.curve, r.halfWidth + 0.8, { lift: r.level - 1.4 }));
      return {
        deck, beam: null, edgeGlowL, edgeGlowR, centre, walkL, walkR, curbL, curbR, underDeck,
        main: r.halfWidth > 10, service, isMonorail: false,
      };
    });
    const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
    const indicatorCylinder = own(new THREE.CylinderGeometry(1, 1, 1, 10));
    const nodeGeometries = nodes.flatMap((node) => [
      node.deck,
      node.beam,
      node.edgeGlowL,
      node.edgeGlowR,
      node.centre,
      node.walkL,
      node.walkR,
      node.curbL,
      node.curbR,
      node.underDeck,
    ].filter((candidate): candidate is THREE.BufferGeometry => Boolean(candidate)));
    const value = {
      asphalt,
      deckMat,
      underMat,
      walkMat,
      curbMat,
      magenta,
      amber,
      teal,
      monorailMat,
      monorailGlow,
      crossingMat,
      indicatorMat,
      intersection,
      straightRoadCrossings,
      crossStreetCrossings,
      plazaGeometry,
      nodes,
      unitBox,
      indicatorCylinder,
    };
    return {
      value,
      resources: [
        asphalt,
        deckMat,
        underMat,
        walkMat,
        curbMat,
        magenta,
        amber,
        teal,
        monorailMat,
        monorailGlow,
        crossingMat,
        indicatorMat,
        plazaGeometry,
        unitBox,
        indicatorCylinder,
        ...nodeGeometries,
      ],
    };
  }, []);
  if (!resources) return null;
  const {
    deckMat,
    underMat,
    walkMat,
    curbMat,
    magenta,
    amber,
    teal,
    monorailMat,
    monorailGlow,
    crossingMat,
    indicatorMat,
    intersection,
    straightRoadCrossings,
    crossStreetCrossings,
    plazaGeometry,
    nodes,
    unitBox,
    indicatorCylinder,
  } = resources;

  return (
    <group dispose={null}>
      {nodes.map((n, i) => (
        <group key={i}>
          {n.isMonorail ? (
            <mesh geometry={n.beam!} material={monorailMat} />
          ) : (
            <>
              {n.underDeck && <mesh geometry={n.underDeck} material={underMat} />}
              <mesh geometry={n.deck!} material={n.service ? walkMat : deckMat} />
              {n.walkL && <mesh geometry={n.walkL} material={walkMat} />}
              {n.walkR && <mesh geometry={n.walkR} material={walkMat} />}
              {n.curbL && <mesh geometry={n.curbL} material={curbMat} />}
              {n.curbR && <mesh geometry={n.curbR} material={curbMat} />}
            </>
          )}
          <mesh geometry={n.edgeGlowL} material={n.isMonorail ? monorailGlow : n.main ? magenta : teal} />
          <mesh geometry={n.edgeGlowR} material={n.isMonorail ? monorailGlow : n.main ? magenta : teal} />
          {n.centre && <mesh geometry={n.centre} material={amber} />}
        </group>
      ))}
      <mesh geometry={plazaGeometry} material={deckMat} />
      {[
        ...intersection.crossings,
        ...straightRoadCrossings.crossings,
        ...crossStreetCrossings.crossings,
      ].flatMap((crossing) =>
        crossing.stripes.map((stripe, index) => (
          <mesh
            key={`${crossing.id}-${index}`}
            geometry={unitBox}
            material={crossingMat}
            position={stripe.center}
            rotation={[0, Math.atan2(-stripe.longAxis.z, stripe.longAxis.x), 0]}
            scale={[stripe.length, 0.025, stripe.width]}
            dispose={null}
          />
        )))}
      {[
        ...intersection.indicators,
        ...straightRoadCrossings.indicators,
        ...crossStreetCrossings.indicators,
      ].map((indicator) => (
        <group
          key={indicator.id}
          position={indicator.center}
          rotation={[0, Math.atan2(-indicator.longAxis.z, indicator.longAxis.x), 0]}
        >
          <mesh
            geometry={unitBox}
            material={indicatorMat}
            scale={[indicator.length, indicator.height, indicator.width]}
            dispose={null}
          />
          {[-0.9, 0, 0.9].map((x) => (
            <mesh
              key={x}
              geometry={indicatorCylinder}
              material={indicatorMat}
              position={[x, 0.085, 0]}
              scale={[0.12, 0.09, 0.12]}
              dispose={null}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function CanyonFillers() {
  const { canyonFillers } = useVisibilityLayout();
  const resources = useCommittedThreeResource('cinematic-canyon-fillers', ({ own }) => {
    const geometry = own(new THREE.BoxGeometry(1, 1, 1));
    const material = own(new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix
            * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 base = vec3(0.022, 0.032, 0.052);
          float verticalFace = 1.0 - step(0.8, abs(vNormal.y));
          vec2 grid = fract(vUv * vec2(8.0, 18.0));
          float pane = step(0.18, grid.x) * step(grid.x, 0.78)
            * step(0.2, grid.y) * step(grid.y, 0.72);
          float variation = step(0.48, fract(
            floor(vUv.x * 8.0) * 0.37 + floor(vUv.y * 18.0) * 0.61
          ));
          vec3 windowColor = mix(
            vec3(0.025, 0.12, 0.18),
            vec3(0.16, 0.38, 0.46),
            variation
          );
          gl_FragColor = vec4(mix(base, windowColor, pane * verticalFace), 1.0);
        }
      `,
      fog: false,
    }));
    return {
      value: { geometry, material },
      resources: [geometry, material],
    };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    canyonFillers.forEach((filler, index) => {
      quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        filler.rotationY,
      );
      matrix.compose(
        position.set(
          filler.position[0],
          filler.size[1] / 2,
          filler.position[2],
        ),
        quaternion,
        scale.set(...filler.size),
      );
      ref.current?.setMatrixAt(index, matrix);
    });
    ref.current.count = canyonFillers.length;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [canyonFillers, resources]);
  if (!resources || canyonFillers.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      name="cinematic-canyon-filler"
      args={[resources.geometry, resources.material, canyonFillers.length]}
      userData={{ role: 'cinematic-canyon-filler' }}
      dispose={null}
    />
  );
}

function ZoneReady({
  id,
  onReady,
}: {
  id: CityZoneId;
  onReady: (id: CityZoneId) => void;
}) {
  useEffect(() => onReady(id), [id, onReady]);
  return null;
}

function BuildingZone({
  layout,
  props,
  id,
  onReady,
}: {
  layout: CityPlacement[];
  props: CityPlacement[];
  id: CityZoneId;
  onReady: (id: CityZoneId) => void;
}) {
  const [backdrop, walls, research, ordinary] = useMemo(() => [
      layout.filter(({ layoutRole }) => layoutRole === 'stunt-backdrop'),
      layout.filter(({ layoutRole }) => layoutRole?.startsWith('shibuya-')),
      layout.filter(({ layoutRole }) => layoutRole?.startsWith('research-')),
      layout.filter(({ layoutRole }) =>
        !layoutRole?.startsWith('shibuya-')
        && !layoutRole?.startsWith('research-')
        && layoutRole !== 'stunt-backdrop'),
    ], [layout]);
  return (
    <>
      <InstancedPieces placements={ordinary} />
      <InstancedPieces
        placements={backdrop}
        inspectionGroupName={
          INSPECT_ENABLED ? STUNT_SCENE_NAMES.backdropReadyFile : undefined
        }
      />
      <InstancedPieces
        placements={walls}
        materialTransform={styleShibuyaWallMaterial}
      />
      <InstancedPieces
        placements={research}
        inspectionGroupName={
          INSPECT_ENABLED ? RESEARCH_SCENE_NAMES.wallReadyFile : undefined
        }
      />
      <InstancedPieces placements={props} />
      <ZoneReady id={id} onReady={onReady} />
    </>
  );
}

function ProceduralBuildingShells({
  placements,
}: {
  placements: CityPlacement[];
}) {
  const resources = useCommittedThreeResource(
    'progressive-building-shells',
    ({ own }) => {
      const geometry = own(new THREE.BoxGeometry(1, 1, 1));
      const material = own(new THREE.MeshStandardMaterial({
          color: 0x101827,
          emissive: new THREE.Color(0x071522),
          emissiveIntensity: 0.18,
          roughness: 0.88,
          metalness: 0.22,
      }));
      return {
        value: { geometry, material },
        resources: [geometry, material],
      };
    },
    [],
  );
  const shells = useMemo(() => placements.map((placement) => {
    const bounds = buildingPlacementBounds(placement);
    return {
      position: new THREE.Vector3(
        bounds.center.x,
        bounds.height / 2,
        bounds.center.z,
      ),
      rotation: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        bounds.rotationY,
      ),
      scale: new THREE.Vector3(
        bounds.halfX * 2,
        Math.max(1, bounds.height),
        bounds.halfZ * 2,
      ),
    };
  }), [placements]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    shells.forEach((shell, index) => {
      matrix.compose(shell.position, shell.rotation, shell.scale);
      ref.current?.setMatrixAt(index, matrix);
    });
    ref.current.count = shells.length;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [resources, shells]);
  if (!resources || shells.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      name="progressive-building-shell"
      args={[resources.geometry, resources.material, shells.length]}
      dispose={null}
    />
  );
}

function DeferredScene({ children }: { children: ReactNode }) {
  const marked = useRef(false);
  const [ready, setReady] = useState(false);
  useFrame(() => {
    if (marked.current) return;
    marked.current = true;
    performance.mark('evanly-first-three-procedural-frame');
    if (!performance.getEntriesByName('evanly-first-meaningful-frame').length) {
      performance.mark('evanly-first-meaningful-frame');
    }
    setReady(true);
  });
  return ready ? children : null;
}

function ProceduralMoonShell() {
  return (
    <mesh name="progressive-moon-shell" position={MOON_POS}>
      <sphereGeometry args={[MOON_RADIUS, 24, 16]} />
      <meshBasicMaterial color={0xc5d2e5} />
    </mesh>
  );
}

function ShibuyaWallLighting() {
  const { warm, magenta, cyan } = SHIBUYA_WALL_LIGHTS;
  return (
    <group>
      <pointLight
        position={warm.position}
        color={warm.color}
        intensity={warm.intensity}
        distance={warm.distance}
        decay={warm.decay}
      />
      <pointLight
        position={magenta.position}
        color={magenta.color}
        intensity={magenta.intensity}
        distance={magenta.distance}
        decay={magenta.decay}
      />
      <pointLight
        position={cyan.position}
        color={cyan.color}
        intensity={cyan.intensity}
        distance={cyan.distance}
        decay={cyan.decay}
      />
    </group>
  );
}

function makeShibuyaFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(buildShibuyaFacadePixels(canvas.width, canvas.height));
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function ShibuyaFacadePanels() {
  const layout = useVisibilityLayout();
  const panels = useMemo(() => buildShibuyaFacadePanels(
    layout.buildings.filter(({ layoutRole }) =>
      layoutRole?.startsWith('shibuya-')),
  ), [layout.buildings]);
  const resources = useCommittedThreeResource('shibuya-panels', ({ own }) => {
    const texture = own(makeShibuyaFacadeTexture());
    const material = own(createShibuyaFacadePanelMaterial(texture));
    const geometry = own(new THREE.PlaneGeometry(1, 1));
    return {
      value: { material, geometry },
      resources: [texture, material, geometry],
    };
  }, []);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {panels.map((panel, index) => (
        <mesh
          key={`shibuya-facade-${index}`}
          name="shibuya-facade-panel"
          position={panel.position}
          rotation={[0, panel.rotationY, 0]}
          scale={[panel.width, panel.height, 1]}
          geometry={resources.geometry}
          material={resources.material}
          userData={{
            role: 'shibuya-selective-facade-panel',
            parentKey: panel.parentKey,
          }}
          dispose={null}
        />
      ))}
    </group>
  );
}

export function Ground() {
  const resources = useCommittedThreeResource('ground', ({ own }) => {
    const texture = own(makeConcreteTexture());
    const assembly = buildShorelineGeometry(buildShorelineProfile());
    const geometry = own(assembly.ground);
    own(assembly.water);
    own(assembly.retaining);
    const material = own(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.05,
    }));
    return {
      value: { geometry, material },
      resources: [texture, geometry, material],
    };
  }, []);
  if (!resources) return null;
  return (
    <mesh
      name={TASK4_SCENE_NAMES.shorelineGround}
      geometry={resources.geometry}
      material={resources.material}
      dispose={null}
    />
  );
}

/** Lamp posts + powerline poles/cables along the roads. */
export function StreetFurniture() {
  const { furniture: { lamps, poles, cables } } = useVisibilityLayout();
  const resources = useCommittedThreeResource('street-furniture', ({ own }) => {
    const poleGeometry = own(new THREE.CylinderGeometry(0.2, 0.26, 9, 6));
    const headGeometry = own(new THREE.BoxGeometry(0.7, 0.28, 0.5));
    const powerPoleGeometry = own(new THREE.CylinderGeometry(0.28, 0.34, 13, 6));
    const poleMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x14161f,
      roughness: 0.6,
      metalness: 0.5,
    }));
    const headMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x201607,
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 2.4,
      toneMapped: false,
    }));
    const powerPoleMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x121420,
      roughness: 0.6,
      metalness: 0.5,
    }));
    const cableMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0a0a0e,
      roughness: 0.9,
    }));
    const cableParts = cables.map((cable) => {
      const midpoint = cable.a.clone().add(cable.b).multiplyScalar(0.5);
      midpoint.y -= 2.2;
      return own(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([cable.a, midpoint, cable.b]),
        10,
        0.1,
        4,
        false,
      ));
    });
    const cableGeometry = cableParts.length > 0
      ? own(mergeGeometries(cableParts))
      : null;
    return {
      value: {
        poleGeometry,
        headGeometry,
        powerPoleGeometry,
        cableGeometry,
        poleMaterial,
        headMaterial,
        powerPoleMaterial,
        cableMaterial,
      },
      resources: [
        poleGeometry,
        headGeometry,
        powerPoleGeometry,
        ...cableParts,
        ...(cableGeometry ? [cableGeometry] : []),
        poleMaterial,
        headMaterial,
        powerPoleMaterial,
        cableMaterial,
      ],
    };
  }, [cables]);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const ppoleRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(1, 1, 1); const v = new THREE.Vector3();
    lamps.forEach((l, i) => {
      m.compose(v.set(l.pos.x, 4.5, l.pos.z), q, s); poleRef.current?.setMatrixAt(i, m);
      m.compose(v.set(l.pos.x + Math.sin(l.rotationY) * 1.5, 9, l.pos.z + Math.cos(l.rotationY) * 1.5), q, s); headRef.current?.setMatrixAt(i, m);
    });
    poles.forEach((p, i) => {
      m.compose(v.set(p.pos.x, 6.5, p.pos.z), q, s);
      ppoleRef.current?.setMatrixAt(i, m);
    });
    for (const r of [poleRef, headRef, ppoleRef]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [lamps, poles, resources]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      <instancedMesh ref={poleRef} args={[resources.poleGeometry, resources.poleMaterial, lamps.length]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={headRef} args={[resources.headGeometry, resources.headMaterial, lamps.length]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={ppoleRef} args={[resources.powerPoleGeometry, resources.powerPoleMaterial, poles.length]} frustumCulled={false} dispose={null} />
      {resources.cableGeometry && (
        <mesh
          geometry={resources.cableGeometry}
          material={resources.cableMaterial}
          dispose={null}
        />
      )}
    </group>
  );
}

// ── Cheap far-field skyline: two InstancedMeshes (dark + emissive) ──
export function Skyline() {
  const { skyline: boxes } = useVisibilityLayout();
  const dark = useMemo(() => boxes.filter((b) => !b.emissive), [boxes]);
  const lit = useMemo(() => boxes.filter((b) => b.emissive), [boxes]);
  const resources = useCommittedThreeResource('skyline', ({ own }) => {
    const geometry = own(new THREE.BoxGeometry());
    const darkMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0b0e18,
      roughness: 0.8,
      metalness: 0.3,
    }));
    const litMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0c0e1a,
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 0.14,
      toneMapped: true,
    }));
    return {
      value: { geometry, darkMaterial, litMaterial },
      resources: [geometry, darkMaterial, litMaterial],
    };
  }, []);
  const darkRef = useRef<THREE.InstancedMesh>(null);
  const litRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    dark.forEach((b, i) => darkRef.current?.setMatrixAt(i, b.matrix));
    lit.forEach((b, i) => litRef.current?.setMatrixAt(i, b.matrix));
    if (darkRef.current) darkRef.current.instanceMatrix.needsUpdate = true;
    if (litRef.current) litRef.current.instanceMatrix.needsUpdate = true;
  }, [dark, lit, resources]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      <instancedMesh
        ref={darkRef}
        args={[resources.geometry, resources.darkMaterial, dark.length]}
        dispose={null}
      />
      <instancedMesh
        ref={litRef}
        args={[resources.geometry, resources.litMaterial, lit.length]}
        dispose={null}
      />
    </group>
  );
}

/** Ramp 1 — an improvised junk pile: a rusty truck-bed wedge dressed with
 *  crates, a dumpster and wood planks. Rises 0 → 12 over the run (toward −Z). */
const JUNK_RAMP_CITY_FILES = [
  '/models/neocity/KB3D_NEC_BldgSM_C_Containers.glb',
  '/models/neocity/KB3D_NEC_BldgSM_C_CratesA.glb',
  '/models/neocity/KB3D_NEC_BldgSM_C_CratesB.glb',
  '/models/neocity/KB3D_NEC_BldgSM_C_Boxes.glb',
] as const;

export function JunkRamp({ loadAssets = true }: { loadAssets?: boolean }) {
  const { run, width, rise } = JUNK;
  const resources = useCommittedThreeResource('junk-ramp', ({ own }) => {
    const plank = own(new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.92, metalness: 0.04 }));
    const rust = own(new THREE.MeshStandardMaterial({ color: 0x5a3428, roughness: 0.85, metalness: 0.35 }));
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.7, metalness: 0.4 }));
    const wedge = own(buildRampGeometry(run, width, rise));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: { plank, rust, dark, wedge, box },
      resources: [plank, rust, dark, wedge, box],
    };
  }, [run, width, rise]);
  const crates: [string, number, number, number, number][] = [
    ['BldgSM_C_Containers', 4, 0, width / 2 + 2.5, 0.2],
    ['BldgSM_C_CratesA', 9, 0, -width / 2 - 2, -0.3],
    ['BldgSM_C_CratesB', 15, 3, width / 2 + 2, 0.15],
    ['BldgSM_C_Boxes', 2.5, 0, -width / 2 - 3, 0.1],
  ];
  if (!resources) return null;
  return (
    <group
      name={STUNT_SCENE_NAMES.ramp1}
      position={JUNK.base}
      rotation={[0, JUNK.rotationY, 0]}
    >
      {/* rusty wedge (the "truck bed" you ride up) */}
      <mesh geometry={resources.wedge} material={resources.rust} dispose={null} />
      {/* wood planks laid along the ride surface */}
      {[-0.28, 0.28].flatMap((side, sideIndex) =>
        Array.from({ length: 8 }, (_, index) => {
          const fraction = (index + 0.5) / 8;
          const transform = rampRidePlateTransform(
            fraction,
            run,
            rise,
            0.22,
          );
          const segment = run / 8 * 1.08;
          return (
            <mesh
              key={`${sideIndex}-${index}`}
              geometry={resources.box}
              material={resources.plank}
              position={[
                transform.x,
                transform.centerY,
                width * side,
              ]}
              rotation={[0, 0, transform.angle]}
              scale={[
                segment / Math.cos(transform.angle),
                0.22,
                width * 0.42,
              ]}
              dispose={null}
            />
          );
        }))}
      {/* dumpster shoved against the base */}
      <mesh
        geometry={resources.box}
        material={resources.dark}
        position={[2, 1.4, width / 2 + 1]}
        scale={[4.5, 2.8, 3]}
        dispose={null}
      />
      {/* KitBash crates / containers dressing the pile */}
      {loadAssets && <Suspense fallback={null}>
        {crates.map(([f, x, y, z, r], i) => (
          <KitPiece key={i} file={`neocity/KB3D_NEC_${f}.glb`} position={[x, y, z]} rotationY={r} center />
        ))}
      </Suspense>}
    </group>
  );
}

/** Ramp 2 — a thin metal kicker off the end of the deck (y13 → 23). */
export function Ramp2() {
  const { run, width, rise } = RAMP2;
  const resources = useCommittedThreeResource('ramp-2', ({ own }) => {
    const deckMaterial = own(new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.45, metalness: 0.7 }));
    const stripeMaterial = own(new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.9, toneMapped: false }));
    const railMaterial = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const geometry = own(buildRampGeometry(run, width, rise));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: {
        deckMaterial,
        stripeMaterial,
        railMaterial,
        geometry,
        box,
      },
      resources: [
        deckMaterial,
        stripeMaterial,
        railMaterial,
        geometry,
        box,
      ],
    };
  }, [run, width, rise]);
  if (!resources) return null;
  return (
    <group
      name={STUNT_SCENE_NAMES.ramp2}
      position={RAMP2.base}
      rotation={[0, RAMP2.rotationY, 0]}
    >
      <mesh geometry={resources.geometry} material={resources.deckMaterial} dispose={null} />
      {/* thin ride plate + amber centre stripes */}
      {[0.3, 0.6, 0.9].map((fraction, index) => {
        const transform = rampRidePlateTransform(
          fraction,
          run,
          rise,
          0.05,
        );
        return (
          <mesh
            key={index}
            geometry={resources.box}
            material={resources.stripeMaterial}
            position={[transform.x, transform.centerY, 0]}
            rotation={[0, 0, transform.angle]}
            scale={[0.4, 0.05, width * 0.8]}
            dispose={null}
          />
        );
      })}
      {/* cyan side rails running up the slope */}
      {[1, -1].flatMap((s) =>
        Array.from({ length: 8 }, (_, index) => {
          const fraction = (index + 0.5) / 8;
          const angle = Math.atan(rampProfileSlope(fraction, run, rise));
          return (
            <mesh
              key={`${s}-${index}`}
              geometry={resources.box}
              material={resources.railMaterial}
              position={[
                run * fraction,
                rampProfileHeight(fraction, rise) + 0.4,
                s * (width / 2),
              ]}
              rotation={[0, 0, angle]}
              scale={[run / 8 / Math.cos(angle), 0.12, 0.12]}
              dispose={null}
            />
          );
        }))}
    </group>
  );
}

/** 120 m flat scaffold lattice tied into several protected east-wall towers. */
export function Scaffold() {
  const S = SCAFFOLD;
  const structure = useMemo(() => buildScaffoldStructure(), []);
  const resources = useCommittedThreeResource('scaffold', ({ own }) => {
    const metal = own(new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.55, metalness: 0.6 }));
    const plank = own(new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.8, metalness: 0.3 }));
    const rail = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: { metal, plank, rail, box },
      resources: [metal, plank, rail, box],
    };
  }, []);
  const [cx, y, cz] = S.deckCenter;
  const l = S.deckLen, w = S.deckWidth;
  const ex = [cx - w / 2, cx + w / 2]; // deck edges (support pole lines)
  if (!resources) return null;
  const { metal, plank, rail, box } = resources;
  return (
    <group>
      {/* deck slab + plank strips */}
      <mesh geometry={box} material={metal} position={[cx, y - S.deckThick / 2, cz]} scale={[w, S.deckThick, l]} dispose={null} />
      {[-w / 3, 0, w / 3].map((dx) => (
        <mesh key={dx} geometry={box} material={plank} position={[cx + dx, y + ridePlateCenterOffset(0.08, 0), cz]} scale={[w / 4, 0.08, l - 1]} dispose={null} />
      ))}
      {/* support pole lattice (both deck edges → ground) */}
      {structure.poles.map((member) => (
        <mesh
          key={member.id}
          name={STUNT_SCENE_NAMES.scaffoldPole}
          geometry={box}
          material={metal}
          position={member.center}
          scale={member.scale}
          dispose={null}
        />
      ))}
      {structure.transverseTies.map((member) => (
        <mesh
          key={member.id}
          geometry={box}
          material={metal}
          position={member.center}
          scale={member.scale}
          dispose={null}
        />
      ))}
      {/* long horizontal ledgers at two heights on both edges */}
      {structure.ledgers.map((member) => (
        <mesh
          key={member.id}
          geometry={box}
          material={metal}
          position={member.center}
          scale={member.scale}
          dispose={null}
        />
      ))}
      {/* diagonal braces up each edge (scaffolding lattice) */}
      {structure.braces.map((member) => (
        <mesh
          key={member.id}
          name={STUNT_SCENE_NAMES.scaffoldBrace}
          geometry={box}
          material={metal}
          position={member.center}
          rotation={[member.rotationX ?? 0, 0, 0]}
          scale={member.scale}
          dispose={null}
        />
      ))}
      {/* cyan guard rails along the two long edges (parallel to travel) */}
      {ex.map((px) => (
        <group key={'r' + px}>
          <mesh geometry={box} material={rail} position={[px, y + 0.9, cz]} scale={[0.12, 0.12, l]} dispose={null} />
          <mesh geometry={box} material={metal} position={[px, y + 0.45, cz]} scale={[0.18, 0.9, l]} dispose={null} />
        </group>
      ))}
      {/* exact beams bolt the east edge into five locations on three+ towers */}
      {structure.tieBeams.map((tie) => (
        <mesh
          key={tie.id}
          name={STUNT_SCENE_NAMES.scaffoldTie}
          geometry={box}
          material={metal}
          position={tie.center}
          scale={tie.scale}
          userData={{ buildingId: tie.buildingId }}
          dispose={null}
        />
      ))}
    </group>
  );
}

export function FinaleBridge() {
  const owned = useCommittedThreeResource('finale-bridge', ({ own }) => {
    const render = buildBridgeRenderGeometry();
    const shoreline = buildShorelineGeometry(buildShorelineProfile());
    const retainingGeometry = own(shoreline.retaining);
    own(shoreline.ground);
    own(shoreline.water);
    const renderGeometries = [
      render.deckTop,
      render.underSlab,
      render.centreLine,
      ...render.edges.map(({ geometry }) => geometry),
      ...render.rails.map(({ geometry }) => geometry),
      ...render.cableGeometries,
      render.horizon.deckTop,
      render.horizon.underSlab,
      render.horizon.centreLine,
      ...render.horizon.edges.map(({ geometry }) => geometry),
      ...render.horizon.rails.map(({ geometry }) => geometry),
    ];
    renderGeometries.forEach(own);
    const deckMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x111722,
      roughness: BRIDGE_RENDER_CONFIG.deckMaterial.roughness,
      metalness: BRIDGE_RENDER_CONFIG.deckMaterial.metalness,
      side: THREE.DoubleSide,
    }));
    const underMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x080b12,
      roughness: 0.82,
      metalness: 0.58,
      side: THREE.DoubleSide,
    }));
    const structureMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.78,
    }));
    const cyanMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x05252c,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 2.2,
      toneMapped: false,
    }));
    const magentaMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x28051d,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 2.2,
      toneMapped: false,
    }));
    const amberMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x2a1804,
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 2,
      toneMapped: false,
    }));
    const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
    const pierCylinder = own(new THREE.CylinderGeometry(1, 1.18, 1, 12));
    const pylonCylinder = own(new THREE.CylinderGeometry(1, 1.35, 1, 12));
    const value = {
      render,
      retainingGeometry,
      deckMaterial,
      underMaterial,
      structureMaterial,
      cyanMaterial,
      magentaMaterial,
      amberMaterial,
      unitBox,
      pierCylinder,
      pylonCylinder,
    };
    return {
      value,
      resources: [
        ...renderGeometries,
        unitBox,
        pierCylinder,
        pylonCylinder,
        deckMaterial,
        underMaterial,
        structureMaterial,
        cyanMaterial,
        magentaMaterial,
        amberMaterial,
      ],
    };
  }, []);
  if (!owned) return null;
  const {
    render,
    retainingGeometry,
    deckMaterial,
    underMaterial,
    structureMaterial,
    cyanMaterial,
    magentaMaterial,
    amberMaterial,
    unitBox,
    pierCylinder,
    pylonCylinder,
  } = owned;
  const { layout } = render;
  const accentMaterials = { cyan: cyanMaterial, magenta: magentaMaterial };

  return (
    <group
      name="lifecycle-finale-bridge-owned"
      dispose={null}
    >
      <mesh geometry={render.underSlab} material={underMaterial} />
      <mesh
        name={TASK4_SCENE_NAMES.bridgeDeck}
        geometry={render.deckTop}
        material={deckMaterial}
      />
      <mesh geometry={render.centreLine} material={amberMaterial} />
      {render.edges.map(({ geometry, definition }, index) => (
        <mesh
          key={`bridge-edge-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.rails.map(({ geometry, definition }, index) => (
        <mesh
          key={`bridge-rail-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      <mesh geometry={render.horizon.underSlab} material={underMaterial} />
      <mesh
        name={TASK4_SCENE_NAMES.horizonDeck}
        geometry={render.horizon.deckTop}
        material={deckMaterial}
      />
      <mesh geometry={render.horizon.centreLine} material={amberMaterial} />
      {render.horizon.edges.map(({ geometry, definition }, index) => (
        <mesh
          key={`horizon-edge-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.horizon.rails.map(({ geometry, definition }, index) => (
        <mesh
          key={`horizon-rail-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.railPosts.map((post, index) => (
        <mesh
          key={`bridge-post-${index}`}
          position={post.position}
          scale={[
            BRIDGE_RENDER_CONFIG.railPostWidth,
            post.height,
            BRIDGE_RENDER_CONFIG.railPostWidth,
          ]}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {render.horizon.railPosts.map((post, index) => (
        <mesh
          key={`horizon-post-${index}`}
          position={post.position}
          scale={[
            BRIDGE_RENDER_CONFIG.railPostWidth,
            post.height,
            BRIDGE_RENDER_CONFIG.railPostWidth,
          ]}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.piers.map((pier) => {
        const height = pier.topY - pier.bottomY;
        return (
          <mesh
            key={`pier-${pier.u}`}
            position={[pier.position.x, pier.bottomY + height / 2, pier.position.z]}
            scale={[pier.radius, height, pier.radius]}
            geometry={pierCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.pierCaps.map((cap) => (
        <mesh
          key={`pier-cap-${cap.u}`}
          position={cap.position}
          scale={cap.size}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.horizon.piers.map((pier) => {
        const height = pier.topY - pier.bottomY;
        return (
          <mesh
            key={`horizon-pier-${pier.u}`}
            position={[pier.position.x, pier.bottomY + height / 2, pier.position.z]}
            scale={[pier.radius, height, pier.radius]}
            geometry={pierCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.horizon.pierCaps.map((cap) => (
        <mesh
          key={`horizon-pier-cap-${cap.u}`}
          position={cap.position}
          scale={cap.size}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.pylons.map((pylon) => {
        const height = pylon.top.y - pylon.base.y;
        return (
          <mesh
            key={`pylon-${pylon.t}-${pylon.side}`}
            position={[
              pylon.base.x,
              pylon.base.y + height / 2,
              pylon.base.z,
            ]}
            scale={[pylon.radius, height, pylon.radius]}
            geometry={pylonCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.cableGeometries.map((geometry, index) => (
        <mesh key={`bridge-cable-${index}`} geometry={geometry} material={cyanMaterial} />
      ))}
      <mesh
        name={TASK4_SCENE_NAMES.shorelineRetaining}
        geometry={retainingGeometry}
        material={structureMaterial}
      />
    </group>
  );
}

const WATER_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec3 transformed = position;
    float broad = sin(position.x * 0.018 + uTime * 0.34) * 0.42;
    float cross = sin(position.z * 0.031 - uTime * 0.48) * 0.24;
    vWave = broad + cross;
    transformed.y += vWave * smoothstep(0.0, 0.12, vUv.y);
    vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const WATER_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uReflectionX;
  uniform float uReflectionHalfWidth;
  uniform float uReflectionIntensity;
  varying vec2 vUv;
  varying float vWave;
  varying vec3 vWorldPosition;
  void main() {
    float streak = pow(abs(sin(vUv.y * 420.0 + uTime * 0.7)), 28.0);
    float ripple = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 90.0 - uTime);
    vec3 deep = vec3(0.004, 0.012, 0.032);
    vec3 cyan = vec3(0.02, 0.22, 0.31);
    vec3 color = mix(deep, cyan, 0.16 + max(vWave, 0.0) * 0.12);
    color += cyan * streak * ripple * 0.34;
    float lateral = exp(
      -pow(abs(vWorldPosition.x - uReflectionX) / uReflectionHalfWidth, 1.65)
    );
    float openWater = 1.0 - smoothstep(-860.0, -620.0, vWorldPosition.z);
    float brokenPath = 0.22 + streak * 0.58 + ripple * 0.16
      + max(vWave, 0.0) * 0.12;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - clamp(viewDirection.y, 0.0, 1.0), 3.0);
    vec3 moonlight = vec3(0.52, 0.70, 0.94);
    color += moonlight * lateral * openWater * brokenPath
      * uReflectionIntensity;
    color += cyan * (0.08 + fresnel * 0.28) * (0.35 + ripple * 0.2);
    gl_FragColor = vec4(color, 0.9 + fresnel * 0.08);
  }
`;

export function WaterBasin() {
  const waterResources = useCommittedThreeResource('water', ({ own }) => {
    const assembly = buildShorelineGeometry(buildShorelineProfile());
    const geometry = own(assembly.water);
    own(assembly.ground);
    own(assembly.retaining);
    const material = own(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReflectionX: {
          value: WATER_RENDER_CONFIG.reflection.centerX,
        },
        uReflectionHalfWidth: {
          value: WATER_RENDER_CONFIG.reflection.halfWidth,
        },
        uReflectionIntensity: {
          value: WATER_RENDER_CONFIG.reflection.intensity,
        },
      },
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      side: WATER_RENDER_CONFIG.side,
      transparent: WATER_RENDER_CONFIG.transparent,
      depthWrite: WATER_RENDER_CONFIG.depthWrite,
      blending: WATER_RENDER_CONFIG.blending,
    }));
    return {
      value: { geometry, material },
      resources: [geometry, material],
    };
  }, []);
  useFrame(({ clock, scene }) => {
    if (waterResources) {
      waterResources.material.uniforms.uTime.value = sceneAnimationTime(
        location.search,
        Number(scene.userData.fxProgress ?? 0),
        clock.getElapsedTime(),
      );
    }
  });
  if (!waterResources) return null;
  return (
    <mesh
      name={TASK4_SCENE_NAMES.water}
      geometry={waterResources.geometry}
      material={waterResources.material}
      dispose={null}
    />
  );
}

export function FinaleAtmosphere() {
  const pointsRef = useRef<THREE.Points>(null);
  const resources = useCommittedThreeResource(
    'finale-atmosphere',
    ({ own }) => {
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(buildFinaleAtmospherePositions(), 3),
      );
      const material = own(new THREE.PointsMaterial({
        color: 0x9fc9ef,
        size: FINALE_ATMOSPHERE_CONFIG.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: FINALE_ATMOSPHERE_CONFIG.opacity,
        depthWrite: false,
        blending: THREE.NormalBlending,
        fog: true,
      }));
      return {
        value: { geometry, material },
        resources: [geometry, material],
      };
    },
    [],
  );
  useFrame(({ clock, scene }) => {
    if (!resources || !pointsRef.current) return;
    const time = sceneAnimationTime(
      location.search,
      Number(scene.userData.fxProgress ?? 0),
      clock.getElapsedTime(),
    );
    pointsRef.current.rotation.y = Math.sin(time * 0.03) * 0.02;
    resources.material.opacity = FINALE_ATMOSPHERE_CONFIG.opacity
      * (0.92 + Math.sin(time * 0.17) * 0.08);
  });
  if (!resources) return null;
  return (
    <points
      ref={pointsRef}
      name={TASK4_SCENE_NAMES.atmosphere}
      geometry={resources.geometry}
      material={resources.material}
      frustumCulled={false}
      dispose={null}
    />
  );
}

function createMoonGlowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.16,
    size / 2, size / 2, size / 2,
  );
  // Bright soft core fading to nothing — a wide atmospheric bloom.
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(210,230,255,0.72)');
  gradient.addColorStop(0.5, 'rgba(150,200,255,0.28)');
  gradient.addColorStop(0.78, 'rgba(110,170,255,0.08)');
  gradient.addColorStop(1, 'rgba(90,150,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Current story progress written each frame by ProductionDirector; 1 (full)
 * when inspecting the raw city with no director running. */
function sceneContentProgress(scene: THREE.Scene): number {
  const value = scene.userData.contentProgress;
  return typeof value === 'number' ? value : 1;
}

/** Scene-wide moonlight, ramped down through the city so the moon doesn't spill
 * over everything until the ride lifts toward the finale. */
function MoonKeyLight() {
  const { scene } = useThree();
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (!ref.current) return;
    const presence = moonPresenceAt(sceneContentProgress(scene));
    ref.current.intensity = MOON_RENDER_CONFIG.keyLight.intensity
      * THREE.MathUtils.lerp(MOON_KEYLIGHT_FLOOR_FRACTION, 1, presence);
  });
  return (
    <directionalLight
      ref={ref}
      position={MOON_POS}
      intensity={
        MOON_RENDER_CONFIG.keyLight.intensity * MOON_KEYLIGHT_FLOOR_FRACTION
      }
      color={MOON_RENDER_CONFIG.keyLight.color}
    />
  );
}

export function Moon() {
  const { scene } = useThree();
  const [albedo, height] = useTexture([
    MOON_RENDER_CONFIG.textures.albedo.url,
    MOON_RENDER_CONFIG.textures.bump.url,
  ]);
  albedo.colorSpace = MOON_RENDER_CONFIG.textures.albedo.colorSpace;
  height.colorSpace = MOON_RENDER_CONFIG.textures.bump.colorSpace;
  const glowTexture = useMemo(createMoonGlowTexture, []);
  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const surfaceMat = useRef<THREE.MeshStandardMaterial>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const rake = useRef<THREE.PointLight>(null);
  // Ramp all of the moon's own light-emitting parts by story progress so it is
  // effectively invisible through the city (no glow bleeding past the skyline)
  // and only becomes a character as the finale approaches.
  useFrame(() => {
    const presence = moonPresenceAt(sceneContentProgress(scene));
    if (glowMat.current) {
      glowMat.current.opacity = MOON_RENDER_CONFIG.glow.opacity * presence;
    }
    if (haloMat.current) {
      haloMat.current.opacity = MOON_RENDER_CONFIG.halo.opacity * presence;
    }
    if (surfaceMat.current) {
      surfaceMat.current.emissiveIntensity =
        MOON_RENDER_CONFIG.surface.emissiveIntensity * presence;
    }
    if (rake.current) {
      rake.current.intensity = MOON_RENDER_CONFIG.rakeLight.intensity * presence;
    }
  });
  return (
    <group position={MOON_POS}>
      {/* Large soft atmospheric glow behind the moon (camera-facing). */}
      <sprite
        name="task4-moon-glow"
        scale={[
          MOON_RADIUS * 2 * MOON_RENDER_CONFIG.glow.scale,
          MOON_RADIUS * 2 * MOON_RENDER_CONFIG.glow.scale,
          1,
        ]}
      >
        <spriteMaterial
          ref={glowMat}
          map={glowTexture}
          color={MOON_RENDER_CONFIG.glow.color}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
        />
      </sprite>
      {/* Grazing light sculpting crater relief on the camera-facing side. */}
      <pointLight
        ref={rake}
        position={MOON_RENDER_CONFIG.rakeLight.offset}
        color={MOON_RENDER_CONFIG.rakeLight.color}
        intensity={0}
        distance={MOON_RENDER_CONFIG.rakeLight.distance}
        decay={MOON_RENDER_CONFIG.rakeLight.decay}
      />
      <mesh name={TASK4_SCENE_NAMES.moonSurface}>
        <sphereGeometry
          args={[
            MOON_RADIUS,
            MOON_RENDER_CONFIG.surface.widthSegments,
            MOON_RENDER_CONFIG.surface.heightSegments,
          ]}
        />
        <meshStandardMaterial
          ref={surfaceMat}
          map={albedo}
          emissiveMap={albedo}
          bumpMap={height}
          bumpScale={MOON_RENDER_CONFIG.surface.bumpScale}
          color={MOON_RENDER_CONFIG.surface.color}
          roughness={MOON_RENDER_CONFIG.surface.roughness}
          metalness={MOON_RENDER_CONFIG.surface.metalness}
          emissive={MOON_RENDER_CONFIG.surface.emissive}
          emissiveIntensity={0}
          fog={MOON_RENDER_CONFIG.surface.fog}
        />
      </mesh>
      <mesh
        name={TASK4_SCENE_NAMES.moonHalo}
        scale={MOON_RENDER_CONFIG.halo.radiusScale}
      >
        <sphereGeometry
          args={[
            MOON_RADIUS,
            MOON_RENDER_CONFIG.surface.widthSegments,
            MOON_RENDER_CONFIG.surface.heightSegments,
          ]}
        />
        <meshBasicMaterial
          ref={haloMat}
          color={MOON_RENDER_CONFIG.halo.color}
          transparent
          opacity={0}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Task2SceneInspection() {
  const { scene, camera, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: () => inspectTask2Scene(scene, camera, size),
    };
    window.__EVANLY_TASK2_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK2_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK2_INSPECTION__;
      }
    };
  }, [camera, scene, size.height, size.width]);
  return null;
}

function Task4SceneInspection() {
  const { scene } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: () => inspectTask4Scene(scene),
      setReflectionIntensityForMeasurement: (intensity: number) => {
        const water = scene.getObjectByName(TASK4_SCENE_NAMES.water);
        if (!(water instanceof THREE.Mesh)) return;
        const material = Array.isArray(water.material)
          ? water.material[0]
          : water.material;
        if (!(material instanceof THREE.ShaderMaterial)) return;
        material.uniforms.uReflectionIntensity.value = Math.max(0, intensity);
      },
    };
    window.__EVANLY_TASK4_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK4_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK4_INSPECTION__;
      }
    };
  }, [scene]);
  return null;
}

function Task3SceneInspection() {
  const { scene, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: (semanticT: number) =>
        inspectStuntScene(scene, semanticT, size),
      projectArtRasterAudit: () =>
        inspectStuntProjectRasterAudit(scene),
    };
    window.__EVANLY_TASK3_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK3_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK3_INSPECTION__;
      }
    };
  }, [scene, size.height, size.width]);
  return null;
}

function ScrollTask4SceneInspection() {
  const { scene, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: (semanticT: number) =>
        inspectResearchScene(scene, semanticT, size),
    };
    window.__EVANLY_SCROLL_TASK4_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_SCROLL_TASK4_INSPECTION__ === inspection) {
        delete window.__EVANLY_SCROLL_TASK4_INSPECTION__;
      }
    };
  }, [scene, size.height, size.width]);
  return null;
}

function Task5SceneInspection() {
  const { scene, camera, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: () => inspectTask5Scene(
        scene,
        FACADE_SIGN_TARGET,
        HOLOGRAM_ANCHOR_IDS.length,
        camera,
        size,
      ),
      setView: (id: string, view: Task5CameraView) =>
        setTask5CameraView(scene, camera, id, view),
    };
    window.__EVANLY_TASK5_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK5_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK5_INSPECTION__;
      }
    };
  }, [camera, scene, size.height, size.width]);
  return null;
}

function VisibilityInspection({
  setProfile,
  layouts,
}: {
  setProfile: (profile: VisibilityLayout['profile']) => void;
  layouts: VisibilityLayouts;
}) {
  const layout = useVisibilityLayout();
  const { scene } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      setProfile: (profile: VisibilityLayout['profile']) => {
        if (profile !== 'full' && profile !== 'cinematic') return false;
        setProfile(profile);
        return true;
      },
      snapshot: () => ({
        profile: layout.profile,
        budget: estimateVisibilityBudget(layout),
        completeWorldBudget: (() => {
          let triangles = 0;
          let instances = 0;
          let drawObjects = 0;
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const position = object.geometry.getAttribute('position');
            const geometryTriangles = (
              object.geometry.getIndex()?.count ?? position?.count ?? 0
            ) / 3;
            const count = object instanceof THREE.InstancedMesh
              ? object.count
              : 1;
            triangles += geometryTriangles * count;
            instances += count;
            drawObjects += 1;
          });
          return { triangles, instances, drawObjects };
        })(),
        audit: {
          removed: layouts.audit.removed,
          retained: layouts.audit.retained,
          antiVoid: layouts.audit.antiVoid,
          canyonFillers: layouts.audit.canyonFillers,
          sweep: {
            ...layouts.sweep.bounds,
            sources: [...new Set(layouts.sweep.samples.map(
              ({ source }) => source,
            ))],
            samples: layouts.sweep.samples.length,
            keys: layouts.sweep.samples.filter(
              ({ kind }) => kind === 'key',
            ).length,
            interpolationSamples: layouts.sweep.samples.filter(
              ({ kind }) => kind === 'interpolation',
            ).length,
            aspect: layouts.sweep.aspect,
          },
        },
        counts: {
          buildings: layout.buildings.length,
          props: layout.props.length,
          skyline: layout.skyline.length,
          signs: layout.signs.length,
        },
      }),
    };
    window.__EVANLY_VISIBILITY__ = inspection;
    return () => {
      if (window.__EVANLY_VISIBILITY__ === inspection) {
        delete window.__EVANLY_VISIBILITY__;
      }
    };
  }, [layout, layouts, scene, setProfile]);
  return null;
}

function SceneInspectionPresets() {
  const { camera, scene, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      listPresets: () => INSPECTION_PRESET_IDS.map(getInspectionPreset),
      setPreset: (id: InspectionPresetId) => {
        const selected = applyInspectionPreset(camera, id);
        return id === 'facade-sign-close'
          ? {
              ...selected,
              subject: frameTask5FacadeInspectionSubject(scene, camera, size),
            }
          : selected;
      },
    };
    window.__EVANLY_INSPECTION__ = inspection;
    // Dev-only free scouting camera: OrbitControls is disabled under INSPECT_ENABLED
    // so a pose set here holds across frames. Used to art-direct camera shots.
    const scout = {
      view: (
        px: number, py: number, pz: number,
        tx: number, ty: number, tz: number,
        fov = 55,
      ) => {
        camera.position.set(px, py, pz);
        camera.up.set(0, 1, 0);
        camera.lookAt(tx, ty, tz);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld(true);
      },
    };
    (window as unknown as { __EVANLY_SCOUT__?: typeof scout }).__EVANLY_SCOUT__ = scout;
    return () => {
      if (window.__EVANLY_INSPECTION__ === inspection) {
        delete window.__EVANLY_INSPECTION__;
      }
      delete (window as unknown as { __EVANLY_SCOUT__?: typeof scout }).__EVANLY_SCOUT__;
    };
  }, [camera, scene, size.height, size.width]);
  return null;
}

// ── Crowd: instanced humans on sidewalks with a sparse robot minority ──
useGLTF.preload(`/models/${HUMAN_FILE}`);
ROBOT_FILES.forEach((file) => useGLTF.preload(`/models/${file}`));

function Pedestrians() {
  const { crowd: layout } = useVisibilityLayout();
  const humanPlacements = useMemo(() => layout.humans.map((human) => ({
    file: HUMAN_FILE,
    materialVariant: human.materialVariant,
    position: [human.x, 0, human.z] as [number, number, number],
    rotationY: human.r,
    scale: human.height / 1.8,
    buildScale: human.buildScale,
  })), [layout.humans]);
  return (
    <group>
      <InstancedPieces
        placements={humanPlacements}
        targetHeight={1.8}
        materialTransform={stylePedestrianMaterial}
        instanceColor={pedestrianInstanceColor}
      />
      {layout.robots.map((robot, i) => <RobotCharacter key={`${robot.file}-${i}`} spot={robot} />)}
    </group>
  );
}

export function RobotCharacter({ spot }: { spot: RobotSpot }) {
  const { scene } = useGLTF(`/models/${spot.file}`);
  const owned = useCommittedThreeResource(`robot:${spot.file}`, ({ own }) => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const height = bounds.max.y - bounds.min.y || 1;
    const accent = spot.file.includes('recon') ? PALETTE.amber : PALETTE.cyan;
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) =>
            own(styleRobotMaterial(material, new THREE.Color(accent))))
        : own(styleRobotMaterial(object.material, new THREE.Color(accent)));
    });
    clone.position.y = -bounds.min.y;
    const materials: THREE.Material[] = [];
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      materials.push(...(
        Array.isArray(object.material) ? object.material : [object.material]
      ));
    });
    return {
      value: { proto: clone, scale: 1.5 / height },
      resources: materials,
    };
  }, [scene, spot.file]);
  if (!owned) return null;
  const { proto, scale } = owned;
  return (
    <group
      name="lifecycle-robot-clone"
      position={[spot.x, 0, spot.z]}
      rotation={[0, spot.r, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={proto} dispose={null} />
    </group>
  );
}

// ── Procedural street dressing: crosswalks, manholes, cones, trashcans ──
export function StreetDressing() {
  const { streetDressing: layout } = useVisibilityLayout();
  const resources = useCommittedThreeResource('street-dressing', ({ own }) => {
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.6, metalness: 0.6 }));
    const cone = own(new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.8, toneMapped: false }));
    const can = own(new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6, metalness: 0.5 }));
    const manholeGeometries = layout.manholes.map((spot) =>
      own(new THREE.CircleGeometry(spot.radius, 16)));
    const coneGeometries = layout.cones.map((spot) =>
      own(new THREE.ConeGeometry(spot.radius, 1, 8)));
    const canGeometries = layout.cans.map((spot) =>
      own(new THREE.CylinderGeometry(0.5, spot.radius, 1.2, 10)));
    return {
      value: {
        dark,
        cone,
        can,
        manholeGeometries,
        coneGeometries,
        canGeometries,
      },
      resources: [
        dark,
        cone,
        can,
        ...manholeGeometries,
        ...coneGeometries,
        ...canGeometries,
      ],
    };
  }, [layout]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {layout.manholes.map((spot, i) => (
        <mesh key={'mh' + i} geometry={resources.manholeGeometries[i]} material={resources.dark} position={[spot.x, 0.04, spot.z]} rotation={[-Math.PI / 2, 0, 0]} dispose={null} />
      ))}
      {layout.cones.map((spot, i) => (
        <mesh key={'cn' + i} geometry={resources.coneGeometries[i]} material={resources.cone} position={[spot.x, 0.5, spot.z]} dispose={null} />
      ))}
      {layout.cans.map((spot, i) => (
        <mesh key={'tc' + i} geometry={resources.canGeometries[i]} material={resources.can} position={[spot.x, 0.6, spot.z]} rotation={[0, spot.rotationY, 0]} dispose={null} />
      ))}
    </group>
  );
}

function scheduleCityIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 1_500 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 250);
  return () => window.clearTimeout(handle);
}

export interface CityProps {
  production?: boolean;
  progressStore?: ProgressStore;
  inspect?: boolean;
  onZoneReady?: (zone: CityZoneId) => void;
  onZoneActive?: (zone: CityZoneId) => void;
}

function City({
  production = false,
  progressStore,
  inspect = INSPECT_ENABLED,
  onZoneReady,
  onZoneActive,
}: CityProps) {
  const [activeProfile, setActiveProfile] = useState(
    REQUESTED_VISIBILITY_PROFILE,
  );
  const [visibilityViewport, setVisibilityViewport] = useState(() => ({
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  }));
  useEffect(() => {
    let timeout = 0;
    const update = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setVisibilityViewport({
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      }), VISIBILITY_RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('resize', update);
    };
  }, []);
  const [initialVisibilityLayout] = useState(buildInitialVisibilityLayout);
  const [visibilityLayouts, setVisibilityLayouts] =
    useState<VisibilityLayouts | null>(null);
  const bikeRef = useRef<BikeRiderHandle>(null);
  const [activeZones, setActiveZones] = useState<CityZoneId[]>(['route']);
  const [readyZones, setReadyZones] = useState<CityZoneId[]>([]);
  const routeZoneReady = readyZones.includes('route');
  useEffect(() => {
    if (!routeZoneReady) return undefined;
    return scheduleCityIdle(() => {
      setVisibilityLayouts(buildVisibilityLayouts(visibilityViewport));
    });
  }, [routeZoneReady, visibilityViewport]);
  const [moonReady, setMoonReady] = useState(false);
  const onZoneActiveRef = useRef(onZoneActive);
  onZoneActiveRef.current = onZoneActive;
  const loadingControllerRef = useRef<CityZoneLoadController | null>(null);
  if (!loadingControllerRef.current) {
    loadingControllerRef.current = createCityZoneLoadController({
      scheduleIdle: scheduleCityIdle,
      onActivate: (zones) => {
        zones.forEach((zone) => {
          if (!performance.getEntriesByName(
            `evanly-city-zone-${zone}-activated`,
          ).length) {
            performance.mark(`evanly-city-zone-${zone}-activated`);
          }
          onZoneActiveRef.current?.(zone);
        });
        setActiveZones(loadingControllerRef.current!.activeZones());
      },
    });
  }
  const activeLayout = visibilityLayouts?.[activeProfile]
    ?? initialVisibilityLayout;
  const cityZones = useMemo(
    () => partitionCityZones(activeLayout.buildings),
    [activeLayout.buildings],
  );
  const propZones = useMemo(
    () => partitionCityZones(activeLayout.props),
    [activeLayout.props],
  );
  const reportZoneReady = useCallback((zone: CityZoneId) => {
    setReadyZones((current) =>
      current.includes(zone) ? current : [...current, zone]);
    loadingControllerRef.current?.ready(zone);
    onZoneReady?.(zone);
  }, [onZoneReady]);
  useEffect(() => {
    if (!performance.getEntriesByName(
      'evanly-city-zone-route-activated',
    ).length) {
      performance.mark('evanly-city-zone-route-activated');
    }
    onZoneActiveRef.current?.('route');
    if (!production || !progressStore) return undefined;
    loadingControllerRef.current?.progress(remapScroll(progressStore.read().raw));
    return progressStore.subscribe(({ raw }) => {
      loadingControllerRef.current?.progress(remapScroll(raw));
    });
  }, [production, progressStore]);
  useEffect(() => () => {
    loadingControllerRef.current?.dispose();
  }, []);
  const zoneFiles = useMemo(() => Object.fromEntries(
    CITY_ZONE_IDS.map((zone) => [zone, [...new Set([
      ...cityZones[zone].map(({ file }) => `/models/${file}`),
      ...propZones[zone].map(({ file }) => `/models/${file}`),
      ...(zone === 'projects' ? JUNK_RAMP_CITY_FILES : []),
    ])].sort()]),
  ) as Record<CityZoneId, string[]>, [cityZones, propZones]);
  useEffect(() => {
    const api = {
      version: 1 as const,
      snapshot: () => ({
        activeZones: [...activeZones],
        readyZones: [...readyZones],
        zoneFiles,
      }),
    };
    window.__EVANLY_CITY_LOADING__ = api;
    return () => {
      if (window.__EVANLY_CITY_LOADING__ === api) {
        delete window.__EVANLY_CITY_LOADING__;
      }
    };
  }, [activeZones, readyZones, zoneFiles]);
  const pendingShells = useMemo(
    () => CITY_ZONE_IDS
      .filter((zone) =>
        activeZones.includes(zone) && !readyZones.includes(zone))
      .flatMap((zone) => cityZones[zone]),
    [activeZones, cityZones, readyZones],
  );
  return (
    <>
    <Canvas
      // dpr capped at 1.5: on HiDPI/Retina the uncapped devicePixelRatio (2–3)
      // meant the whole forward pass AND every Bloom composite ran at 4–9× the
      // fragment count. 1.5 keeps edges crisp while roughly halving GPU load.
      // antialias:false because the EffectComposer resolves separately
      // (multisampling={0}), so an MSAA backbuffer here was pure waste.
      // high-performance steers multi-GPU laptops off the integrated chip.
      dpr={[1, 1.5]}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
      camera={{ position: [-30, 92, 250], fov: 58, near: 1, far: 8000 }}
    >
      <VisibilityLayoutContext.Provider value={activeLayout}>
      <color attach="background" args={['#05060f']} />
      <fog attach="fog" args={['#0a0a1c', 260, 2100]} />
      <ExposureSync />
      <DeferredScene>
      <ambientLight intensity={LIGHTING.ambientIntensity} />
      {/* cool moonlit key from the moon's direction — ramped by progress so it
          only fully spills over the scene at the finale */}
      <MoonKeyLight />
      {/* violet sky / dark ground bounce */}
      <hemisphereLight args={[PALETTE.violet, '#050510', 0.18]} />
      {/* subtle neon fills: magenta from one flank, cyan from the other */}
      <directionalLight position={[-320, 90, 120]} intensity={0.28} color={PALETTE.magenta} />
      <directionalLight position={[340, 80, -280]} intensity={0.3} color={PALETTE.cyan} />
      {/* 3 point lights shaded per-fragment on every PBR surface city-wide;
          only meaningful at the Shibuya crossing, so mount them with that zone
          instead of paying for them across the whole ride. */}
      {activeZones.includes('shibuya') && <ShibuyaWallLighting />}
      <Suspense fallback={null}><EnvMap /></Suspense>
      {production && progressStore && (
        <>
          <BikeRider ref={bikeRef} />
          <ProductionDirector
            store={progressStore}
            bikeRef={bikeRef}
            inspect={inspect}
          />
        </>
      )}
      <Ground />
      <WaterBasin />
      <FinaleAtmosphere />
      <Roads />
      <ProceduralBuildingShells placements={pendingShells} />
      {!moonReady && <ProceduralMoonShell />}
      <FinaleBridge />
      <Pillars />
      <MonorailTrain />
      <StreetFurniture />
      <JunkRamp loadAssets={activeZones.includes('projects')} />
      <Ramp2 />
      <CanyonFillers />
      {activeZones.map((zone) => (
        <Suspense fallback={null} key={zone}>
          <BuildingZone
            id={zone}
            layout={cityZones[zone]}
            props={propZones[zone]}
            onReady={reportZoneReady}
          />
        </Suspense>
      ))}
      <Suspense fallback={null}><AboutHero /></Suspense>
      <ShibuyaFacadePanels />
      <Suspense fallback={null}><Scaffold /></Suspense>
      {activeZones.includes('projects') && <ProjectsPanels />}
      <ResearchGateways />
      <Signs />
      <StreetDressing />
      <Suspense fallback={null}><Pedestrians /></Suspense>
      <Skyline />
      <Suspense fallback={null}>
        <Moon />
        <ZoneReady
          id="finale"
          onReady={() => setMoonReady(true)}
        />
      </Suspense>
      <SceneInspectionPresets />
      <Task2SceneInspection />
      <Task3SceneInspection />
      <ScrollTask4SceneInspection />
      <Task4SceneInspection />
      <Task5SceneInspection />
      {visibilityLayouts && (
        <VisibilityInspection
          setProfile={setActiveProfile}
          layouts={visibilityLayouts}
        />
      )}
      {!production && (FREECAM
        ? <FreeCam />
        : <OrbitControls
            makeDefault
            enabled={!INSPECT_ENABLED}
            target={[40, 18, -130]}
            maxDistance={4000}
          />)}
      <EffectComposer multisampling={0}>
        <Bloom intensity={LIGHTING.bloomIntensity} luminanceThreshold={LIGHTING.bloomThreshold} radius={LIGHTING.bloomRadius} mipmapBlur />
      </EffectComposer>
      </DeferredScene>
      </VisibilityLayoutContext.Provider>
    </Canvas>
    {FREECAM && (
      <>
        <FreeCamHud />
        <div style={{
          position: 'fixed', bottom: 12, left: 12, zIndex: 10,
          font: '12px/1.5 ui-monospace, monospace', color: PALETTE.cyan,
          background: 'rgba(10,11,30,0.8)', border: `1px solid ${PALETTE.panel}`,
          padding: '8px 12px', borderRadius: 6, pointerEvents: 'none',
        }}>
          click to look · <b>WASD</b> move · <b>Q/E</b> down/up · <b>Shift</b> boost · <b>Esc</b> release
        </div>
      </>
    )}
    </>
  );
}

// Memoized so a re-render of the parent ScrollExperience never drags this whole
// scene graph through reconciliation. Props are stable (store + useCallback
// handlers), so the scene only re-renders when they actually change.
export default memo(City);
