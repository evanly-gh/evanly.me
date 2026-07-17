import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { validateManifest } from '../src/viewer/manifest';

const sample = JSON.parse(readFileSync(new URL('./fixtures/manifest.sample.json', import.meta.url), 'utf8'));

describe('validateManifest', () => {
  it('returns typed entries sorted by name', () => {
    const out = validateManifest(sample);
    expect(out.map(p => p.name)).toEqual(['BldgLG_C_Main', 'BldgSM_A_Main']);
    expect(out[0].bbox).toHaveLength(3);
    expect(out[0].category).toBe('LG');
    expect(typeof out[0].tris).toBe('number');
  });

  it('throws on malformed data', () => {
    expect(() => validateManifest([{ name: 'x' }])).toThrow();
    expect(() => validateManifest({})).toThrow();
  });
});
