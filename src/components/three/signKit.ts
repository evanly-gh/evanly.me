import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { buildSignPixelArt, type SignArtVariant } from './signArt';
import {
  FACADE_SIGN_RENDER_CONFIG,
  HOLOGRAM_SIGN_RENDER_CONFIG,
} from './signRender';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the generic facade signs + holograms. The texture
 * wrapper, materials, and geometries used to live inline in <Signs> in City.tsx;
 * they were lifted here so both the shipping scene and the `?gallery` billboard
 * catalog build byte-identical resources from one source of truth.
 */

/** Wrap a deterministic sign pixel-art (index + variant) as an sRGB CanvasTexture. */
export function makeSignTexture(
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

export interface SignKitResources {
  textures: THREE.CanvasTexture[];
  facadeMaterials: THREE.MeshBasicMaterial[];
  hologramMaterials: THREE.MeshBasicMaterial[];
  backingMaterial: THREE.MeshStandardMaterial;
  attachmentMaterial: THREE.MeshStandardMaterial;
  emitterMaterial: THREE.MeshStandardMaterial;
  beamMaterial: THREE.MeshBasicMaterial;
  planeGeometry: THREE.PlaneGeometry;
  boxGeometry: THREE.BoxGeometry;
  emitterGeometry: THREE.CylinderGeometry;
  beamGeometry: THREE.CylinderGeometry;
}

/** Build the 8 facade + 4 hologram textures/materials + shared geometries. */
export function createSignResources(
  { own }: ThreeResourceScope,
): CommittedThreeAllocation<SignKitResources> {
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
  const value: SignKitResources = {
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
}
