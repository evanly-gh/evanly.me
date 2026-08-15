import * as THREE from 'three';
import { PALETTE } from '../../theme';
import {
  STUNT_PROJECT_PANELS,
  buildProjectArtLayout,
  estimateProjectGalleryTextureBytes,
  renderProjectArt,
} from '../../world/stuntContent';
import { PROJECT_PANEL_RENDER_CONFIG } from './stuntRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the per-project panels. Lifted from
 * <ProjectsPanels> in City.tsx so the shipping scene and the `?gallery`
 * billboard catalog build the same 5 canvas textures + materials + geometries.
 */

export interface StuntPanelKitResources {
  textures: THREE.CanvasTexture[];
  screenMaterials: THREE.MeshBasicMaterial[];
  backingMaterial: THREE.MeshStandardMaterial;
  attachmentMaterial: THREE.MeshStandardMaterial;
  emitterMaterial: THREE.MeshStandardMaterial;
  beamMaterial: THREE.MeshBasicMaterial;
  planeGeometry: THREE.PlaneGeometry;
  boxGeometry: THREE.BoxGeometry;
  emitterGeometry: THREE.CylinderGeometry;
  beamGeometry: THREE.CylinderGeometry;
}

export function createProjectPanelResources(
  { own }: ThreeResourceScope,
): CommittedThreeAllocation<StuntPanelKitResources> {
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
    color: new THREE.Color(1.45, 1.45, 1.45), // overdrive so neon art blooms
    side: PROJECT_PANEL_RENDER_CONFIG.screen.side,
    toneMapped: PROJECT_PANEL_RENDER_CONFIG.screen.toneMapped,
    depthTest: PROJECT_PANEL_RENDER_CONFIG.screen.depthTest,
    polygonOffset: PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffset,
    polygonOffsetFactor: PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffsetFactor,
    polygonOffsetUnits: PROJECT_PANEL_RENDER_CONFIG.screen.polygonOffsetUnits,
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
    emissiveIntensity: PROJECT_PANEL_RENDER_CONFIG.hologram.emitterEmissiveIntensity,
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
}
