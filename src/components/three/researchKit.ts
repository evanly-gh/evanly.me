import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { RESEARCH_PANELS } from '../../world/researchContent';
import { RESEARCH_PANEL_RENDER_CONFIG } from './researchRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the research canyon panels. Each board's texture is
 * the self-contained project poster (slm-factory / rl-on-hrm / sd-on-qwen), a
 * complete plate with its own frame + copy baked in. The posters are loaded by the
 * caller (drei useTexture) and passed in by contentIndex; used directly as the
 * screen map (no canvas compositing). Externally-loaded textures are NOT owned
 * here (drei's cache manages them); only materials/geometries are.
 */

export interface ResearchKitResources {
  screenMaterialById: Record<string, THREE.MeshBasicMaterial>;
  structureMaterial: THREE.MeshStandardMaterial;
  backingMaterial: THREE.MeshStandardMaterial;
  planeGeometry: THREE.PlaneGeometry;
  boxGeometry: THREE.BoxGeometry;
}

export function createResearchResources(
  { own }: ThreeResourceScope,
  // Poster textures indexed by panel.contentIndex (0=SLM, 1=RL, 2=SD).
  posters: readonly THREE.Texture[],
): CommittedThreeAllocation<ResearchKitResources> {
  const screenMaterialById: Record<string, THREE.MeshBasicMaterial> = {};
  for (const panel of RESEARCH_PANELS) {
    const poster = posters[panel.contentIndex];
    poster.colorSpace = THREE.SRGBColorSpace;
    poster.anisotropy = 8;
    screenMaterialById[panel.id] = own(new THREE.MeshBasicMaterial({
      map: poster,
      // Neutral: posters carry their own baked neon; overdrive would blow them out.
      color: new THREE.Color(1, 1, 1),
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
      screenMaterialById,
      structureMaterial,
      backingMaterial,
      planeGeometry,
      boxGeometry,
    },
    // Poster textures are omitted — owned by drei's texture cache.
    resources: [
      ...Object.values(screenMaterialById),
      structureMaterial,
      backingMaterial,
      planeGeometry,
      boxGeometry,
    ],
  };
}
