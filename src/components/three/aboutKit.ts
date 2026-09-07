import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { ABOUT_HERO_RENDER_CONFIG } from './aboutRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the About hero billboard. The board texture is the
 * self-contained About poster (about.png) — a complete plate with its own frame,
 * portrait, and copy baked in — loaded by the caller (drei useTexture) and passed
 * in, since that requires a React Suspense boundary. It is used directly as the
 * screen map (no canvas compositing). The externally-loaded texture is NOT owned
 * here (drei's cache manages its lifecycle); only the materials/geometries are.
 */

export interface AboutHeroKitResources {
  texture: THREE.Texture;
  screenMaterial: THREE.MeshBasicMaterial;
  backingMaterial: THREE.MeshStandardMaterial;
  attachmentMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.MeshStandardMaterial;
  plane: THREE.PlaneGeometry;
  box: THREE.BoxGeometry;
  cylinder: THREE.CylinderGeometry;
}

export function createAboutHeroResources(
  { own }: ThreeResourceScope,
  poster: THREE.Texture,
): CommittedThreeAllocation<AboutHeroKitResources> {
  poster.colorSpace = ABOUT_HERO_RENDER_CONFIG.texture.colorSpace;
  poster.anisotropy = ABOUT_HERO_RENDER_CONFIG.texture.anisotropy;
  const screenMaterial = own(new THREE.MeshBasicMaterial({
    map: poster,
    // Neutral: the poster already carries its own baked neon; a colour overdrive
    // here would blow the photographic art out under the bloom pass.
    color: new THREE.Color(1, 1, 1),
    side: ABOUT_HERO_RENDER_CONFIG.screen.side,
    toneMapped: ABOUT_HERO_RENDER_CONFIG.screen.toneMapped,
    depthTest: ABOUT_HERO_RENDER_CONFIG.screen.depthTest,
    depthWrite: ABOUT_HERO_RENDER_CONFIG.screen.depthWrite,
    polygonOffset: ABOUT_HERO_RENDER_CONFIG.screen.polygonOffset,
    polygonOffsetFactor: ABOUT_HERO_RENDER_CONFIG.screen.polygonOffsetFactor,
    polygonOffsetUnits: ABOUT_HERO_RENDER_CONFIG.screen.polygonOffsetUnits,
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
  const value: AboutHeroKitResources = {
    texture: poster,
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
    // `poster` is intentionally omitted — it is owned by drei's texture cache.
    resources: [
      screenMaterial,
      backingMaterial,
      attachmentMaterial,
      glowMaterial,
      plane,
      box,
      cylinder,
    ],
  };
}
