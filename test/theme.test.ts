import { describe, it, expect } from 'vitest';
import { PALETTE, COLORS, LIGHTING } from '../src/theme';

describe('theme', () => {
  it('every palette value is a 6-digit hex string', () => {
    for (const v of Object.values(PALETTE)) {
      expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('cyan is reserved for the bike and matches the COLORS shim', () => {
    expect(PALETTE.cyan.toLowerCase()).toBe('#2bfdf9');
    // COLORS.tronCyan (numeric) must equal PALETTE.cyan
    expect(COLORS.tronCyan).toBe(parseInt(PALETTE.cyan.slice(1), 16));
  });

  it('lighting constants are present and finite', () => {
    for (const key of ['ambientIntensity','keyIntensity','fillIntensity','rimIntensity','bloomIntensity','bloomThreshold','bloomRadius','exposure'] as const) {
      expect(Number.isFinite(LIGHTING[key])).toBe(true);
    }
    expect(LIGHTING.bloomThreshold).toBeGreaterThanOrEqual(0);
    expect(LIGHTING.bloomThreshold).toBeLessThanOrEqual(1);
  });
});
