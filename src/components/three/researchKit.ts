import * as THREE from 'three';
import { PALETTE } from '../../theme';
import {
  RESEARCH_PANELS,
  buildResearchArtLayout,
  renderResearchArt,
  renderResearchPlaceholderImage,
} from '../../world/researchContent';
import { RESEARCH_PANEL_RENDER_CONFIG } from './researchRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the research gateway panels. Lifted from
 * <ResearchGateways> in City.tsx so the shipping scene and the `?gallery`
 * billboard catalog build the same 2 art textures (one per contentIndex) +
 * materials + geometries.
 */

export interface ResearchKitResources {
  textures: THREE.CanvasTexture[];
  screenMaterialById: Record<string, THREE.MeshBasicMaterial>;
  structureMaterial: THREE.MeshStandardMaterial;
  backingMaterial: THREE.MeshStandardMaterial;
  planeGeometry: THREE.PlaneGeometry;
  boxGeometry: THREE.BoxGeometry;
}

// Overdrive the artwork so its neon blooms like the ad billboards.
const RESEARCH_SCREEN_BOOST = new THREE.Color(1.45, 1.45, 1.45);

export function createResearchResources(
  { own }: ThreeResourceScope,
): CommittedThreeAllocation<ResearchKitResources> {
  // One aspect-correct texture PER panel (was 2 shared 2:1 textures stretched
  // onto portrait panels → warped). Keyed by panel id.
  const textures: THREE.CanvasTexture[] = [];
  const screenMaterialById: Record<string, THREE.MeshBasicMaterial> = {};
  for (const panel of RESEARCH_PANELS) {
    const art = buildResearchArtLayout(panel);
    const canvas = document.createElement('canvas');
    canvas.width = art.size.width;
    canvas.height = art.size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Research art canvas unavailable: ${panel.id}`);
    if (panel.kind === 'image') {
      renderResearchPlaceholderImage(context, art);
    } else {
      renderResearchArt(context, art);
    }
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textures.push(texture);
    screenMaterialById[panel.id] = own(new THREE.MeshBasicMaterial({
      map: texture,
      color: RESEARCH_SCREEN_BOOST,
      side: RESEARCH_PANEL_RENDER_CONFIG.screen.side,
      toneMapped: RESEARCH_PANEL_RENDER_CONFIG.screen.toneMapped,
      depthTest: RESEARCH_PANEL_RENDER_CONFIG.screen.depthTest,
      depthWrite: RESEARCH_PANEL_RENDER_CONFIG.screen.depthWrite,
      polygonOffset: RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor: RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits: RESEARCH_PANEL_RENDER_CONFIG.screen.polygonOffsetUnits,
    }));
  }
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
      textures,
      screenMaterialById,
      structureMaterial,
      backingMaterial,
      planeGeometry,
      boxGeometry,
    },
    resources: [
      ...textures,
      ...Object.values(screenMaterialById),
      structureMaterial,
      backingMaterial,
      planeGeometry,
      boxGeometry,
    ],
  };
}
