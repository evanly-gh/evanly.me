import { describe, it, expect } from 'vitest';
import { sampleRoute, roadFrame, ZONES, ROUTE_LENGTH } from '../src/world/route';

describe('route', () => {
  it('has a sane arc length', () => {
    expect(ROUTE_LENGTH).toBeGreaterThan(1000);
    expect(Number.isFinite(ROUTE_LENGTH)).toBe(true);
  });

  it('sampleRoute is deterministic and unit-tangent', () => {
    for (const t of [0, 0.1, 0.33, 0.5, 0.87, 1]) {
      const a = sampleRoute(t);
      const b = sampleRoute(t);
      expect(a.pos.toArray()).toEqual(b.pos.toArray());
      expect(a.tangent.length()).toBeCloseTo(1, 5);
    }
  });

  it('advances monotonically along the path (no backtracking)', () => {
    let prev = sampleRoute(0).pos;
    let dist = 0;
    for (let i = 1; i <= 200; i++) {
      const p = sampleRoute(i / 200).pos;
      dist += p.distanceTo(prev);
      prev = p;
    }
    // total travelled ≈ route length (within remap sampling tolerance)
    expect(dist).toBeGreaterThan(ROUTE_LENGTH * 0.9);
  });

  it('roadFrame is orthonormal with a horizontal binormal', () => {
    for (const t of [0, 0.2, 0.32, 0.41, 0.57, 0.7, 0.95]) {
      const f = roadFrame(t);
      expect(f.tangent.length()).toBeCloseTo(1, 5);
      expect(f.normal.length()).toBeCloseTo(1, 5);
      expect(f.binormal.length()).toBeCloseTo(1, 5);
      expect(f.tangent.dot(f.binormal)).toBeCloseTo(0, 5);
      expect(f.tangent.dot(f.normal)).toBeCloseTo(0, 5);
      expect(f.binormal.dot(f.normal)).toBeCloseTo(0, 5);
      expect(f.binormal.y).toBeCloseTo(0, 5); // binormal stays horizontal
    }
  });

  it('turns right at Shibuya (tangent rotates from +X to −Z)', () => {
    const intro = sampleRoute(0.05).tangent;
    const afterTurn = sampleRoute(0.45).tangent;
    expect(intro.x).toBeGreaterThan(0.7);      // heading +X in the intro
    expect(afterTurn.z).toBeLessThan(-0.7);    // heading −Z after the turn
  });

  it('zones tile [0,1] contiguously', () => {
    const ranges = Object.values(ZONES).sort((a, b) => a[0] - b[0]);
    expect(ranges[0][0]).toBe(0);
    expect(ranges[ranges.length - 1][1]).toBe(1);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i][0]).toBeCloseTo(ranges[i - 1][1], 5);
    }
  });
});
