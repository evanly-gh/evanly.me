export const SIGN_ART_SIZE = 128;

export type SignArtVariant = 'facade' | 'hologram';

export interface SignPixelArt {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SignPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

const COLORS = [
  [255, 61, 166],
  [43, 253, 249],
  [255, 200, 87],
  [138, 108, 255],
  [157, 255, 87],
  [255, 77, 94],
  [77, 140, 255],
] as const;

function makeRng(index: number): () => number {
  let state = (index + 1) * 99991;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function putPixel(
  art: SignPixelArt,
  x: number,
  y: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= art.width || y >= art.height) return;
  const offset = (Math.floor(y) * art.width + Math.floor(x)) * 4;
  art.data[offset] = color[0];
  art.data[offset + 1] = color[1];
  art.data[offset + 2] = color[2];
  art.data[offset + 3] = alpha;
}

function fillRect(
  art: SignPixelArt,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) putPixel(art, px, py, color, alpha);
  }
}

function drawBorder(
  art: SignPixelArt,
  color: readonly [number, number, number],
  alpha: number,
): void {
  const inset = 6;
  const thickness = 3;
  fillRect(art, inset, inset, art.width - inset * 2, thickness, color, alpha);
  fillRect(
    art,
    inset,
    art.height - inset - thickness,
    art.width - inset * 2,
    thickness,
    color,
    alpha,
  );
  fillRect(art, inset, inset, thickness, art.height - inset * 2, color, alpha);
  fillRect(
    art,
    art.width - inset - thickness,
    inset,
    thickness,
    art.height - inset * 2,
    color,
    alpha,
  );
}

function drawGlyph(
  art: SignPixelArt,
  rng: () => number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  // A deterministic block-glyph: a guaranteed centre cross plus seeded side
  // strokes. It remains crisp and testable without relying on system fonts.
  fillRect(art, 60, 36, 8, 56, color, alpha);
  fillRect(art, 40, 60, 48, 8, color, alpha);
  for (let row = 0; row < 4; row++) {
    const y = 38 + row * 14;
    const left = rng() < 0.5;
    fillRect(art, left ? 42 : 76, y, 10, 8, color, alpha);
  }
  for (let column = 0; column < 3; column++) {
    if (rng() < 0.45) continue;
    fillRect(art, 42 + column * 17, 82, 10, 8, color, alpha);
  }
}

export function buildSignPixelArt(
  index: number,
  variant: SignArtVariant,
): SignPixelArt {
  const art: SignPixelArt = {
    width: SIGN_ART_SIZE,
    height: SIGN_ART_SIZE,
    data: new Uint8ClampedArray(SIGN_ART_SIZE * SIGN_ART_SIZE * 4),
  };
  const rng = makeRng(index);
  const primary = COLORS[Math.floor(rng() * COLORS.length)];
  const secondary = COLORS[Math.floor(rng() * COLORS.length)];

  if (variant === 'facade') {
    for (let y = 0; y < art.height; y++) {
      const t = y / (art.height - 1);
      const base: [number, number, number] = [
        Math.round(7 + primary[0] * t * 0.08),
        Math.round(6 + primary[1] * t * 0.06),
        Math.round(15 + secondary[2] * t * 0.07),
      ];
      fillRect(art, 0, y, art.width, 1, base, 255);
    }
  }

  drawBorder(art, primary, variant === 'hologram' ? 220 : 255);
  drawGlyph(art, rng, secondary, 255);
  fillRect(art, 24, 104, 80, 5, primary, variant === 'hologram' ? 176 : 255);
  fillRect(art, 34, 114, 60, 3, secondary, variant === 'hologram' ? 128 : 255);
  return art;
}

export function sampleSignPixel(
  art: SignPixelArt,
  x: number,
  y: number,
): SignPixel {
  const px = Math.max(0, Math.min(art.width - 1, Math.floor(x)));
  const py = Math.max(0, Math.min(art.height - 1, Math.floor(y)));
  const offset = (py * art.width + px) * 4;
  return {
    r: art.data[offset],
    g: art.data[offset + 1],
    b: art.data[offset + 2],
    a: art.data[offset + 3],
  };
}
