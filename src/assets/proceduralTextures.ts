import { makeRng } from './rng';

export const PROCEDURAL_TEXTURE_SIZE = 256;
export const ASPHALT_TEXTURE_SEED = 0x41535048;
export const CONCRETE_TEXTURE_SEED = 0x434f4e43;

function createPixels(base: readonly [number, number, number]) {
  const pixels = new Uint8ClampedArray(
    PROCEDURAL_TEXTURE_SIZE * PROCEDURAL_TEXTURE_SIZE * 4,
  );
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = base[0];
    pixels[index + 1] = base[1];
    pixels[index + 2] = base[2];
    pixels[index + 3] = 255;
  }
  return pixels;
}

function blendPixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  color: readonly [number, number, number],
  alpha: number,
) {
  const px = Math.max(0, Math.min(PROCEDURAL_TEXTURE_SIZE - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(PROCEDURAL_TEXTURE_SIZE - 1, Math.floor(y)));
  const offset = (py * PROCEDURAL_TEXTURE_SIZE + px) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[offset + channel] = Math.round(
      pixels[offset + channel] * (1 - alpha) + color[channel] * alpha,
    );
  }
}

function speckle(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  color: readonly [number, number, number],
  alpha: number,
) {
  for (let offsetY = 0; offsetY < 2; offsetY += 1) {
    for (let offsetX = 0; offsetX < 2; offsetX += 1) {
      blendPixel(pixels, x + offsetX, y + offsetY, color, alpha);
    }
  }
}

function line(
  pixels: Uint8ClampedArray,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: readonly [number, number, number],
  alpha: number,
  width = 1,
) {
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(endX - startX), Math.abs(endY - startY))),
  );
  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    const x = startX + (endX - startX) * fraction;
    const y = startY + (endY - startY) * fraction;
    for (let offset = 0; offset < width; offset += 1) {
      blendPixel(pixels, x + offset, y, color, alpha);
    }
  }
}

export function buildAsphaltPixels(
  seed = ASPHALT_TEXTURE_SEED,
): Uint8ClampedArray {
  const rng = makeRng(seed);
  const pixels = createPixels([12, 14, 22]);
  for (let index = 0; index < 6000; index += 1) {
    const value = 8 + Math.floor(rng() * 26);
    speckle(
      pixels,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      [value, value, value + 4],
      rng() * 0.5,
    );
  }
  for (let index = 0; index < 10; index += 1) {
    line(
      pixels,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      [0, 0, 0],
      0.35,
      1 + Math.floor(rng() * 2),
    );
  }
  return pixels;
}

export function buildConcretePixels(
  seed = CONCRETE_TEXTURE_SEED,
): Uint8ClampedArray {
  const rng = makeRng(seed);
  const pixels = createPixels([35, 38, 46]);
  for (let index = 0; index < 9000; index += 1) {
    const value = 24 + Math.floor(rng() * 34);
    speckle(
      pixels,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      [value, value, value + 6],
      rng() * 0.5,
    );
  }
  for (let edge = 0; edge < PROCEDURAL_TEXTURE_SIZE; edge += 1) {
    for (const inset of [0, 1]) {
      blendPixel(pixels, edge, inset, [10, 10, 14], 0.6);
      blendPixel(
        pixels,
        edge,
        PROCEDURAL_TEXTURE_SIZE - 1 - inset,
        [10, 10, 14],
        0.6,
      );
      blendPixel(pixels, inset, edge, [10, 10, 14], 0.6);
      blendPixel(
        pixels,
        PROCEDURAL_TEXTURE_SIZE - 1 - inset,
        edge,
        [10, 10, 14],
        0.6,
      );
    }
  }
  for (let index = 0; index < 14; index += 1) {
    line(
      pixels,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      rng() * PROCEDURAL_TEXTURE_SIZE,
      [8, 8, 12],
      0.5,
    );
  }
  return pixels;
}
