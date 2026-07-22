import { describe, expect, it } from 'vitest';
import * as streetDressing from '../src/world/streetDressing';
import { shibuyaPlazaClearance } from '../src/world/intersections';
import { groundRoadMemberships } from '../src/world/roads';

interface TestSpot {
  kind: 'manhole' | 'can' | 'cone';
  surface: 'road' | 'sidewalk';
  x: number;
  z: number;
  radius: number;
  roadIndex: number;
}

interface TestLayout {
  manholes: TestSpot[];
  cans: TestSpot[];
  cones: TestSpot[];
}

const footprintSamples = (spot: TestSpot): Array<{ x: number; z: number }> => [
  { x: spot.x, z: spot.z },
  ...Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI * 2 / 16;
    return {
      x: spot.x + Math.cos(angle) * spot.radius,
      z: spot.z + Math.sin(angle) * spot.radius,
    };
  }),
];

describe('street dressing layout', () => {
  it('builds deterministic pure placements outside plaza and unintended roads', () => {
    const api = streetDressing as typeof streetDressing & {
      buildStreetDressingLayout(seed?: number): TestLayout;
    };
    expect(typeof api.buildStreetDressingLayout).toBe('function');

    const layout = api.buildStreetDressingLayout();
    expect(layout).toEqual(api.buildStreetDressingLayout());
    expect(layout.manholes.length).toBeGreaterThan(0);
    expect(layout.cans.length).toBeGreaterThan(0);
    expect(layout.cones.length).toBeGreaterThan(0);

    for (const spot of [...layout.manholes, ...layout.cans, ...layout.cones]) {
      expect(
        shibuyaPlazaClearance(spot.x, spot.z) - spot.radius,
        JSON.stringify(spot),
      ).toBeGreaterThan(0);
      const centerMemberships = groundRoadMemberships(spot.x, spot.z);
      const centerSource = centerMemberships.find(({ roadIndex }) =>
        roadIndex === spot.roadIndex);
      expect(centerSource?.endpointCap, JSON.stringify(spot)).toBe(false);
      if (spot.surface === 'road') {
        expect(centerSource?.clearance, JSON.stringify(spot))
          .toBeLessThanOrEqual(-spot.radius);
      } else {
        expect(centerSource?.clearance, JSON.stringify(spot))
          .toBeGreaterThanOrEqual(1 + spot.radius);
        expect(centerSource?.clearance, JSON.stringify(spot))
          .toBeLessThanOrEqual(9 - spot.radius);
      }
      for (const membership of centerMemberships) {
        if (membership.roadIndex === spot.roadIndex) continue;
        expect(
          membership.clearance,
          JSON.stringify({ spot, membership }),
        ).toBeGreaterThan(9 + spot.radius);
      }

      for (const point of footprintSamples(spot)) {
        expect(
          shibuyaPlazaClearance(point.x, point.z),
          JSON.stringify({ spot, point }),
        ).toBeGreaterThan(0);
        const memberships = groundRoadMemberships(point.x, point.z);
        const source = memberships.find(({ roadIndex }) => roadIndex === spot.roadIndex);
        expect(source, JSON.stringify({ spot, point })).toBeDefined();
        expect(source?.endpointCap, JSON.stringify({ spot, point, source })).toBe(false);
        if (spot.surface === 'road') {
          expect(source?.clearance, JSON.stringify({ spot, point, source }))
            .toBeLessThanOrEqual(0);
        } else {
          expect(source?.withinSidewalkWidth, JSON.stringify({ spot, point, source }))
            .toBe(true);
        }
        expect(
          memberships.some(({ roadIndex, withinRoadOrSidewalk }) =>
            roadIndex !== spot.roadIndex && withinRoadOrSidewalk),
          JSON.stringify({ spot, point, memberships }),
        ).toBe(false);
      }
    }
  });
});
