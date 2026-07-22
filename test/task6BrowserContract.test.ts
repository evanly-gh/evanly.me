import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Task 6 browser contract is native JavaScript.
import { TASK6_BROWSER_URL, TASK6_REQUIRED_RESOURCES, TASK6_SCREENSHOT_FILES, assertTask6MountedEvidence } from '../.superpowers/sdd/task-6-browser-contract.mjs';

const presetIds = Object.keys(TASK6_SCREENSHOT_FILES);
const screenshotRecords = Object.entries(TASK6_SCREENSHOT_FILES).map(
  ([preset, filename]) => ({
    preset,
    filename,
    width: 640,
    height: 400,
    bytes: 1024,
    sha256: 'a'.repeat(64),
    capturedAt: '2026-07-22T04:00:00.000Z',
  }),
);
const targetIds = ['a', 'b', 'c', 'd'];
const diagnostics = targetIds.flatMap((id, targetIndex) =>
  ['direct', 'grazing'].map((view, viewIndex) => {
    const minimum = 0.1 + targetIndex * 0.02 + viewIndex * 0.01;
    const maximum = minimum + 0.01;
    return {
      key: `${id}:${view}`,
      luminanceMinimum: minimum,
      luminanceMaximum: maximum,
      luminanceRange: maximum - minimum,
      maximumColorDelta: 0.02,
    };
  }));

const validEvidence = {
  version: 1,
  transport: 'playwright',
  capturedAt: '2026-07-22T04:00:00.000Z',
  url: TASK6_BROWSER_URL,
  browser: {
    product: 'Chrome/150',
    protocolVersion: '1.3',
    userAgent: 'HeadlessChrome/150',
    gpu: 'ANGLE',
  },
  canvas: { width: 640, height: 400 },
  consoleErrors: [],
  runtimeErrors: [],
  pageErrors: [],
  networkFailures: [],
  browserInterceptions: [{
    url: '/favicon.ico',
    action: 'fulfilled-204',
    reason: 'browser-generated request; application declares no favicon',
  }],
  sourceDigest: 'a'.repeat(64),
  buildDigest: 'b'.repeat(64),
  failedResources: [],
  resources: TASK6_REQUIRED_RESOURCES.map((url: string) => ({
    url,
    status: 200,
    loaded: true,
  })),
  loadedResources: [...TASK6_REQUIRED_RESOURCES],
  task4Passed: true,
  task4: {
    passed: true,
    snapshot: {
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
    },
  },
  task5TopologyPassed: true,
  task5DirectGrazingPassed: true,
  task5: {
    topologyPassed: true,
    framebufferPassed: true,
    targetIds,
    views: ['direct', 'grazing'],
    framesPerView: 12,
    topologyFrames: 96,
    pixelFrames: 12,
    pixelSamples: 96,
    tolerances: {
      luminance: 0.18,
      color: 0.28,
      regionRadius: 4,
    },
    diagnostics,
    signDrawObjectCount: 16,
    initialSnapshot: {
      facadeCount: 120,
      hologramCount: 16,
      mountedFacadeScreens: 120,
      mountedFacadeBackings: 120,
      mountedHologramScreens: 16,
      mountedHologramBackings: 0,
      minimumScreenBackingSeparation: 0.06,
      drawObjectCount: 16,
      visibleScreenIds: Array.from({ length: 136 }, (_, index) => `sign-${index}`),
      projectedTargets: [],
    },
  },
  frameTiming: {
    warmupFrames: 60,
    samples: 300,
    meanMs: 45,
    p95Ms: 45,
    maximumMs: 72,
    minimumMs: 34,
  },
  signDrawObjectCount: 16,
  facadeInspectionSubject: {
    id: 'facade-subject',
    inViewport: true,
    occupancy: { width: 0.5, height: 0.3, area: 0.15 },
  },
  presets: presetIds,
  screenshots: screenshotRecords,
};

describe('Task 6 mounted browser evidence contract', () => {
  it('accepts a complete structured Playwright evidence fixture', () => {
    expect(TASK6_BROWSER_URL).toContain('inspect');
    expect(assertTask6MountedEvidence(validEvidence)).toEqual(validEvidence);
    expect(assertTask6MountedEvidence({
      ...validEvidence,
      transport: 'playwright/strict',
    }).transport).toBe('playwright/strict');
  });

  it('rejects minimal fabricated evidence and malformed screenshot hashes', () => {
    expect(() => assertTask6MountedEvidence({
      version: 1,
      task4Passed: true,
      task5TopologyPassed: true,
      task5DirectGrazingPassed: true,
    })).toThrow(/transport|browser|evidence/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      screenshots: validEvidence.screenshots.map((record, index) => (
        index === 0 ? { ...record, sha256: 'not-a-hash' } : record
      )),
    })).toThrow(/hash|sha/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      transport: 'selenium',
    })).toThrow(/transport/i);
  });

  it('rejects incomplete resources, diagnostics, and frame series', () => {
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      loadedResources: validEvidence.loadedResources.slice(1),
    })).toThrow(/resource/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      runtimeErrors: ['boom'],
    })).toThrow(/runtime/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      task5: { ...validEvidence.task5, pixelSamples: 12 },
    })).toThrow(/frame|pixel/i);
    const { diagnostics: _diagnostics, ...withoutDiagnostics } = validEvidence.task5;
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      task5: withoutDiagnostics,
    })).toThrow(/diagnostic/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      task5: {
        ...validEvidence.task5,
        diagnostics: validEvidence.task5.diagnostics.map((diagnostic, index) =>
          index === 0
            ? { ...diagnostic, luminanceRange: diagnostic.luminanceRange + 0.1 }
            : diagnostic),
      },
    })).toThrow(/diagnostic|range/i);
  });

  it('requires representative viewport, current digests, and target timing', () => {
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      canvas: { width: 160, height: 100 },
    })).toThrow(/640|viewport|canvas/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      sourceDigest: undefined,
    })).toThrow(/digest/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      frameTiming: { ...validEvidence.frameTiming, p95Ms: 50.1 },
    })).toThrow(/p95|50/i);
  });

  it('permits only no interception or the exact favicon 204 record', () => {
    expect(assertTask6MountedEvidence({
      ...validEvidence,
      browserInterceptions: [],
    }).browserInterceptions).toEqual([]);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      browserInterceptions: [{
        url: '/models/props/ped_char.glb',
        action: 'fulfilled-200',
        reason: 'test shortcut',
      }],
    })).toThrow(/interception/i);
    expect(() => assertTask6MountedEvidence({
      ...validEvidence,
      browserInterceptions: [{
        ...validEvidence.browserInterceptions[0],
        action: 'continued',
      }],
    })).toThrow(/interception/i);
  });
});
