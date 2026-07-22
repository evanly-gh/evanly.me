import { describe, expect, it } from 'vitest';
import {
  SIGN_ART_SIZE,
  buildSignPixelArt,
  sampleSignPixel,
} from '../src/components/three/signArt';

describe('procedural sign pixel art', () => {
  it('leaves hologram corners and non-art background pixels truly transparent', () => {
    const art = buildSignPixelArt(3, 'hologram');
    const backgroundSamples = [
      [0, 0],
      [SIGN_ART_SIZE - 1, 0],
      [0, SIGN_ART_SIZE - 1],
      [SIGN_ART_SIZE - 1, SIGN_ART_SIZE - 1],
      [16, 16],
      [SIGN_ART_SIZE / 2, 24],
    ] as const;

    for (const [x, y] of backgroundSamples) {
      expect(sampleSignPixel(art, x, y).a, `${x},${y}`).toBe(0);
    }
  });

  it('retains nonzero alpha only on border, glyph, and accent art', () => {
    const art = buildSignPixelArt(3, 'hologram');

    expect(sampleSignPixel(art, 6, SIGN_ART_SIZE / 2).a).toBeGreaterThan(0);
    expect(sampleSignPixel(art, SIGN_ART_SIZE / 2, SIGN_ART_SIZE / 2).a)
      .toBeGreaterThan(0);
    expect(sampleSignPixel(art, 24, 104).a).toBeGreaterThan(0);
    expect(sampleSignPixel(art, 16, 16).a).toBe(0);
  });

  it('keeps facade art opaque while sharing the deterministic art pattern', () => {
    const first = buildSignPixelArt(5, 'facade');
    const second = buildSignPixelArt(5, 'facade');

    expect(first.data).toEqual(second.data);
    expect(sampleSignPixel(first, 0, 0).a).toBe(255);
    expect(sampleSignPixel(first, SIGN_ART_SIZE / 2, SIGN_ART_SIZE / 2).a).toBe(255);
  });
});
