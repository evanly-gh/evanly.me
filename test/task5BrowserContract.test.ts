import { describe, expect, it } from 'vitest';
// @ts-expect-error The Task 6 browser contract is native JavaScript.
import { TASK5_BROWSER_FRAME_COUNT, TASK5_BROWSER_URL, TASK5_PIXEL_COLOR_TOLERANCE, TASK5_PIXEL_LUMINANCE_TOLERANCE, assertTask5FrameSeries, assertTask5PixelSeries, buildTask5FramebufferSummary, verifyTask5Browser } from '../.superpowers/sdd/task-5-browser-contract.mjs';

const frame = {
  facadeCount: 120,
  hologramCount: 16,
  mountedFacadeScreens: 120,
  mountedFacadeBackings: 120,
  mountedHologramScreens: 16,
  mountedHologramBackings: 0,
  minimumScreenBackingSeparation: 0.06,
  drawObjectCount: 16,
  visibleScreenIds: Array.from({ length: 136 }, (_, index) => `sign-${index}`),
  projectedTargets: [
    { id: 'sign-0', x: 320, y: 240, inViewport: true },
    { id: 'sign-1', x: 480, y: 300, inViewport: true },
  ],
};

describe('Task 5 multi-frame browser verification contract', () => {
  it('targets the inspect-enabled city and accepts stable multi-frame evidence', () => {
    expect(TASK5_BROWSER_URL).toBe('http://localhost:5173/?city&inspect&task5=1');
    expect(TASK5_BROWSER_FRAME_COUNT).toBeGreaterThanOrEqual(8);
    expect(TASK5_PIXEL_LUMINANCE_TOLERANCE).toBeGreaterThan(0);
    expect(TASK5_PIXEL_COLOR_TOLERANCE).toBeGreaterThan(0);
    expect(typeof verifyTask5Browser).toBe('function');
    expect(verifyTask5Browser.toString()).toContain('page.screenshot');
    const frames = Array.from({ length: TASK5_BROWSER_FRAME_COUNT }, () => ({
      ...frame,
      visibleScreenIds: [...frame.visibleScreenIds],
    }));
    expect(assertTask5FrameSeries(frames)).toEqual(frames);
  });

  it('rejects coplanar geometry, hologram backings, and frame-to-frame flicker', () => {
    const frames = Array.from({ length: TASK5_BROWSER_FRAME_COUNT }, () => ({
      ...frame,
      visibleScreenIds: [...frame.visibleScreenIds],
    }));
    expect(() => assertTask5FrameSeries(frames.map((entry) => ({
      ...entry,
      minimumScreenBackingSeparation: 0,
    })))).toThrow(/separation/i);
    expect(() => assertTask5FrameSeries(frames.map((entry) => ({
      ...entry,
      mountedHologramBackings: 1,
    })))).toThrow(/hologram[\s\S]*backing/i);
    const flicker = frames.map((entry, index) => ({
      ...entry,
      visibleScreenIds: index === 3 ? entry.visibleScreenIds.slice(1) : entry.visibleScreenIds,
    }));
    expect(() => assertTask5FrameSeries(flicker)).toThrow(/flicker|stable/i);
  });

  it('accepts stable direct and grazing framebuffer pixel samples', () => {
    const series = Array.from({ length: TASK5_BROWSER_FRAME_COUNT }, (_, frameIndex) => ({
      samples: [
        {
          id: 'facade-a',
          view: 'direct',
          luminance: 0.46 + (frameIndex % 2) * 0.01,
          color: [0.42, 0.62, 0.8],
        },
        {
          id: 'facade-a',
          view: 'grazing',
          luminance: 0.31 + (frameIndex % 3) * 0.008,
          color: [0.34, 0.48, 0.57],
        },
        {
          id: 'facade-b',
          view: 'direct',
          luminance: 0.52,
          color: [0.68, 0.44, 0.57],
        },
        {
          id: 'facade-b',
          view: 'grazing',
          luminance: 0.29,
          color: [0.43, 0.31, 0.49],
        },
      ],
    }));

    expect(assertTask5PixelSeries(series)).toEqual(series);
    const summary = buildTask5FramebufferSummary(series);
    expect(summary.diagnostics).toHaveLength(4);
    expect(summary.tolerances).toEqual({
      luminance: TASK5_PIXEL_LUMINANCE_TOLERANCE,
      color: TASK5_PIXEL_COLOR_TOLERANCE,
      regionRadius: 4,
    });
  });

  it('rejects synthetic black-to-image framebuffer flicker', () => {
    const series = Array.from({ length: TASK5_BROWSER_FRAME_COUNT }, (_, frameIndex) => ({
      samples: [{
        id: 'facade-a',
        view: 'grazing',
        luminance: frameIndex % 2 === 0 ? 0.03 : 0.72,
        color: frameIndex % 2 === 0 ? [0.02, 0.02, 0.02] : [0.7, 0.55, 0.8],
      }],
    }));

    expect(() => assertTask5PixelSeries(series)).toThrow(/pixel|luminance|flicker/i);
  });
});
