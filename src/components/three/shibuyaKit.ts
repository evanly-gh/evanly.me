import * as THREE from 'three';
import {
  buildShibuyaFacadePixels,
  createShibuyaFacadePanelMaterial,
} from './shibuyaMaterial';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the Shibuya selective-facade panels. Lifted from
 * <ShibuyaFacadePanels> in City.tsx so the shipping scene and the `?gallery`
 * billboard catalog share one texture/material definition.
 */

/** Build the 128x256 neon-cell facade texture (sRGB CanvasTexture). */
export function makeShibuyaFacadeTexture(): THREE.CanvasTexture {
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

export interface ShibuyaPanelKitResources {
  material: THREE.MeshStandardMaterial;
  geometry: THREE.PlaneGeometry;
}

export function createShibuyaPanelResources(
  { own }: ThreeResourceScope,
): CommittedThreeAllocation<ShibuyaPanelKitResources> {
  const texture = own(makeShibuyaFacadeTexture());
  const material = own(createShibuyaFacadePanelMaterial(texture));
  const geometry = own(new THREE.PlaneGeometry(1, 1));
  return {
    value: { material, geometry },
    resources: [texture, material, geometry],
  };
}
