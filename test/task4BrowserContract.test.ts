import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The Task 6 browser contract is native JavaScript.
import { TASK4_BROWSER_URL, assertTask4BrowserSnapshot, verifyTask4Browser } from '../.superpowers/sdd/task-4-browser-contract.mjs';

const validSnapshot = {
  version: 1,
  ready: true,
  bridge: {
    mounted: true,
    deckVertexCount: 1282,
    routeStartError: 0,
    routeEndError: 0,
    horizonMounted: true,
    horizonJoinError: 0,
    horizonEndZ: -2300,
  },
  water: {
    mounted: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  },
  moon: {
    surfaceMounted: true,
    haloMounted: true,
    widthSegments: 128,
    heightSegments: 128,
    albedoColorSpace: THREE.SRGBColorSpace,
    bumpColorSpace: THREE.NoColorSpace,
    haloBlending: THREE.AdditiveBlending,
    haloDepthWrite: false,
    surfaceFog: false,
    surfaceEmissiveIntensity: 0.32,
    haloFog: false,
    haloOpacity: 0.18,
  },
};

describe('Task 4 browser verification contract', () => {
  it('targets the inspect-enabled city and accepts complete mounted evidence', () => {
    expect(TASK4_BROWSER_URL).toBe('http://localhost:5173/?city&inspect&task4=1');
    expect(typeof verifyTask4Browser).toBe('function');
    expect(assertTask4BrowserSnapshot(validSnapshot)).toEqual(validSnapshot);
  });

  it('rejects water depth writes and a missing moon halo', () => {
    expect(() => assertTask4BrowserSnapshot({
      ...validSnapshot,
      water: { ...validSnapshot.water, depthWrite: true },
    })).toThrow(/water[\s\S]*depthWrite/i);
    expect(() => assertTask4BrowserSnapshot({
      ...validSnapshot,
      moon: { ...validSnapshot.moon, haloMounted: false },
    })).toThrow(/halo/i);
  });

  it('rejects a horizon join gap and fogged or dim moon materials', () => {
    expect(() => assertTask4BrowserSnapshot({
      ...validSnapshot,
      bridge: { ...validSnapshot.bridge, horizonJoinError: 0.2 },
    })).toThrow(/horizon|join/i);
    expect(() => assertTask4BrowserSnapshot({
      ...validSnapshot,
      moon: { ...validSnapshot.moon, surfaceFog: true },
    })).toThrow(/moon|fog/i);
    expect(() => assertTask4BrowserSnapshot({
      ...validSnapshot,
      moon: { ...validSnapshot.moon, surfaceEmissiveIntensity: 0.08 },
    })).toThrow(/moon|emissive|bright/i);
  });
});
