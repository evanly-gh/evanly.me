import { describe, it, expect } from 'vitest';
import { buildBike } from '../src/assets/bike';
import { makeRng } from '../src/assets/rng';

describe('buildBike', () => {
  it('builds a poseable bike group with ghost geometry', () => {
    const bike = buildBike(makeRng(1));
    expect(bike.group.name).toBe('bike');
    expect(bike.ghostGeometry.getAttribute('position').count).toBeGreaterThan(0);
    // pose() must not throw across the choreography envelope
    expect(() => bike.pose({ lean: 0.4, pitch: Math.PI, crouch: 1, wheelSpin: 3 })).not.toThrow();
  });
});
