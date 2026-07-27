import * as THREE from 'three';

const FACADE_BACKGROUND = [7, 16, 24, 255] as const;
const FACADE_ACCENTS = [
  [80, 214, 236, 255],
  [231, 72, 178, 255],
  [238, 171, 70, 255],
  [130, 110, 230, 255],
] as const;

export const SHIBUYA_WALL_LIGHTS = Object.freeze({
  warm: Object.freeze({
    position: [240, 58, 8] as [number, number, number],
    color: '#ffd3a1',
    intensity: 4600,
    distance: 150,
    decay: 2,
  }),
  magenta: Object.freeze({
    position: [205, 38, -24] as [number, number, number],
    color: '#d88cff',
    intensity: 2400,
    distance: 105,
    decay: 2,
  }),
  cyan: Object.freeze({
    position: [272, 18, 28] as [number, number, number],
    color: '#79dfff',
    intensity: 1100,
    distance: 80,
    decay: 2,
  }),
});

function fillPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  fillWidth: number,
  fillHeight: number,
  color: readonly [number, number, number, number],
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + fillWidth));
  const y1 = Math.min(height, Math.ceil(y + fillHeight));
  for (let row = y0; row < y1; row += 1) {
    for (let column = x0; column < x1; column += 1) {
      const offset = (row * width + column) * 4;
      pixels.set(color, offset);
    }
  }
}

export function buildShibuyaFacadePixels(
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  fillPixels(pixels, width, height, 0, 0, width, height, FACADE_BACKGROUND);
  const columns = 6;
  const rows = 14;
  const insetX = Math.max(3, Math.round(width * 0.06));
  const insetY = Math.max(3, Math.round(height * 0.03));
  const cellWidth = (width - insetX * 2) / columns;
  const cellHeight = (height - insetY * 2) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row * 7 + column * 11) % 5 === 0) continue;
      const accent = FACADE_ACCENTS[(row * 3 + column) % FACADE_ACCENTS.length];
      fillPixels(
        pixels,
        width,
        height,
        insetX + column * cellWidth + cellWidth * 0.18,
        insetY + row * cellHeight + cellHeight * 0.24,
        cellWidth * 0.58,
        cellHeight * 0.5,
        accent,
      );
    }
  }
  return pixels;
}

export function measureShibuyaFacadeColorMetrics(
  pixels: Uint8ClampedArray,
): {
  darkFacadeRatio: number;
  cyanPixelRatio: number;
  cyanHighlightRatio: number;
  cyanHighlights: number;
  magentaHighlights: number;
  amberHighlights: number;
  violetHighlights: number;
} {
  const totalPixels = pixels.length / 4;
  let darkPixels = 0;
  let cyanPixels = 0;
  let luminousPixels = 0;
  let cyanHighlights = 0;
  let magentaHighlights = 0;
  let amberHighlights = 0;
  let violetHighlights = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    if (Math.max(red, green, blue) < 72) {
      darkPixels += 1;
      continue;
    }
    luminousPixels += 1;
    if (green > red * 1.2 && blue > red * 1.35) {
      cyanPixels += 1;
      cyanHighlights += 1;
    } else if (red > green * 1.35 && blue > green * 1.15) {
      magentaHighlights += 1;
    } else if (red > blue * 1.6 && green > blue * 1.25) {
      amberHighlights += 1;
    } else if (blue > green * 1.2 && red > green * 1.05) {
      violetHighlights += 1;
    }
  }
  return {
    darkFacadeRatio: darkPixels / Math.max(1, totalPixels),
    cyanPixelRatio: cyanPixels / Math.max(1, totalPixels),
    cyanHighlightRatio: cyanHighlights / Math.max(1, luminousPixels),
    cyanHighlights,
    magentaHighlights,
    amberHighlights,
    violetHighlights,
  };
}

export function createShibuyaFacadePanelMaterial(
  texture: THREE.Texture,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.56,
    roughness: 0.76,
    metalness: 0.18,
    toneMapped: true,
    fog: true,
  });
  material.userData.role = 'shibuya-selective-facade-panel';
  return material;
}

export function styleShibuyaWallMaterial(
  material: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial;
export function styleShibuyaWallMaterial(material: THREE.Material): THREE.Material;
export function styleShibuyaWallMaterial(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.userData.role = 'shibuya-neutral-mapped-base';
  material.needsUpdate = true;
  return material;
}
