import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { buildAboutArtLayout, renderAboutArt } from '../../content/aboutArt';
import { ABOUT_HERO_RENDER_CONFIG } from './aboutRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the About hero billboard. Lifted from <AboutHero>
 * in City.tsx so the shipping scene and the `?gallery` billboard catalog build
 * the same 3072x2048 composited canvas texture + materials + geometries. The
 * portrait image itself is still loaded by the caller (drei useTexture) and
 * passed in, since that requires a React Suspense boundary.
 */

export interface AboutHeroKitResources {
  texture: THREE.CanvasTexture;
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
  portrait: THREE.Texture,
  portraitSrc: string,
): CommittedThreeAllocation<AboutHeroKitResources> {
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
    color: new THREE.Color(1.35, 1.35, 1.35), // overdrive so neon art blooms
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
}
