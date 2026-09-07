import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { STUNT_PROJECT_PANELS } from '../../world/stuntContent';
import { PROJECT_PANEL_RENDER_CONFIG } from './stuntRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the per-project panels. Each board's texture is the
 * self-contained project poster (rememberme / openchinese / rhetbench / ttt-e2e),
 * a complete plate with its own frame + copy baked in. The posters are loaded by
 * the caller (drei useTexture) in STUNT_PROJECT_PANELS order and passed in; used
 * directly as the screen map (no canvas compositing). Externally-loaded textures
 * are NOT owned here (drei's cache manages them); only materials/geometries are.
 */

export interface StuntPanelKitResources {
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
  // Poster textures in STUNT_PROJECT_PANELS order.
  posters: readonly THREE.Texture[],
): CommittedThreeAllocation<StuntPanelKitResources> {
  const screenMaterials = STUNT_PROJECT_PANELS.map((_panel, index) => {
    const map = posters[index];
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return own(new THREE.MeshBasicMaterial({
    map,
    // Neutral: posters carry their own baked neon; overdrive would blow them out.
    color: new THREE.Color(1, 1, 1),
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
    }));
  });
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
    // Poster textures are omitted — owned by drei's texture cache.
    resources: [
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
