import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildShibuyaIntersection,
  buildShibuyaSightCorridors,
  buildStraightRoadCrossings,
} from '../src/world/intersections';
import * as intersectionGeometry from '../src/world/intersections';
import { groundRoadMemberships, ROADS } from '../src/world/roads';

function nearestCurveFrame(
  curve: THREE.Curve<THREE.Vector3>,
  target: THREE.Vector3,
): { distance: number; tangent: THREE.Vector3 } {
  let bestDistance = Infinity;
  let bestU = 0;
  for (let i = 0; i <= 4000; i++) {
    const u = i / 4000;
    const point = curve.getPointAt(u);
    const distance = Math.hypot(point.x - target.x, point.z - target.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestU = u;
    }
  }
  const start = Math.max(0, bestU - 1 / 4000);
  const end = Math.min(1, bestU + 1 / 4000);
  for (let i = 0; i <= 1000; i++) {
    const u = THREE.MathUtils.lerp(start, end, i / 1000);
    const point = curve.getPointAt(u);
    const distance = Math.hypot(point.x - target.x, point.z - target.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestU = u;
    }
  }
  return {
    distance: bestDistance,
    tangent: curve.getTangentAt(bestU).setY(0).normalize(),
  };
}

describe('Shibuya intersection geometry', () => {
  it('reports signed plaza clearance and containment from the plaza polygon', () => {
    const api = intersectionGeometry as typeof intersectionGeometry & {
      shibuyaPlazaClearance(x: number, z: number): number;
      shibuyaPlazaContains(x: number, z: number): boolean;
    };

    expect(typeof api.shibuyaPlazaClearance).toBe('function');
    expect(typeof api.shibuyaPlazaContains).toBe('function');
    expect(api.shibuyaPlazaClearance(240, 0)).toBeLessThan(-20);
    expect(api.shibuyaPlazaClearance(212, 0)).toBeCloseTo(0, 6);
    expect(api.shibuyaPlazaClearance(200, 0)).toBeCloseTo(12, 6);
    expect(api.shibuyaPlazaContains(240, 0)).toBe(true);
    expect(api.shibuyaPlazaContains(200, 0)).toBe(false);
  });

  it('builds four approaches with west-to-south bike flow and two side-road legs', () => {
    const intersection = buildShibuyaIntersection();

    expect(intersection.approaches.map(({ id }) => id)).toEqual([
      'west',
      'north',
      'east',
      'south',
    ]);
    expect(intersection.bikeRoute).toEqual({ entry: 'west', exit: 'south' });
    expect(intersection.sideRoads.map(({ id }) => id)).toEqual(['north', 'east']);

    for (const road of intersection.sideRoads) {
      const plazaEnd = road.curve.getPoint(0);
      const dx = Math.abs(plazaEnd.x - intersection.plaza.center.x);
      const dz = Math.abs(plazaEnd.z - intersection.plaza.center.z);
      expect(Math.max(dx, dz)).toBeCloseTo(intersection.plaza.halfExtent, 6);
      expect(Math.min(dx, dz)).toBeLessThan(1e-6);
    }
    expect(intersection.plaza.surfaceY).toBeGreaterThan(intersection.plaza.roadSurfaceY);
  });

  it('creates four approach and two diagonal frame-aligned crossings', () => {
    const intersection = buildShibuyaIntersection();
    const approaches = intersection.crossings.filter(({ kind }) => kind === 'approach');
    const diagonals = intersection.crossings.filter(({ kind }) => kind === 'diagonal');

    expect(approaches).toHaveLength(4);
    expect(diagonals).toHaveLength(2);

    for (const crossing of intersection.crossings) {
      expect(crossing.stripes.length).toBeGreaterThanOrEqual(5);
      for (const stripe of crossing.stripes) {
        expect(Math.abs(stripe.longAxis.dot(crossing.streetTangent))).toBeGreaterThan(0.999999);
        expect(stripe.center.y).toBeGreaterThan(intersection.plaza.surfaceY);
      }

      const centers = crossing.stripes
        .map(({ center }) => center.dot(crossing.spacingAxis))
        .sort((a, b) => a - b);
      for (let i = 1; i < centers.length; i++) {
        expect(centers[i] - centers[i - 1]).toBeGreaterThanOrEqual(2.3);
        expect(centers[i] - centers[i - 1]).toBeLessThanOrEqual(2.5);
      }
    }
  });

  it('derives six pure 2D sight corridors from shared crossing endpoints', () => {
    const intersection = buildShibuyaIntersection();
    const indicators = new Map(intersection.indicators.map((item) => [item.id, item]));
    const corridors = buildShibuyaSightCorridors();

    expect(corridors).toHaveLength(6);
    expect(corridors.map(({ id }) => id)).toEqual(
      intersection.crossings.map(({ id }) => id),
    );
    for (const corridor of corridors) {
      const crossing = intersection.crossings.find(({ id }) => id === corridor.id)!;
      const [start, end] = crossing.endpointIndicatorIds.map((id) => indicators.get(id)!);
      expect(corridor.start).toEqual({ x: start.center.x, z: start.center.z });
      expect(corridor.end).toEqual({ x: end.center.x, z: end.center.z });
      expect(corridor.halfWidth).toBeGreaterThan(0);
    }
  });

  it('derives every approach crossing frame from its production road curve', () => {
    const intersection = buildShibuyaIntersection();
    const sourceRoadIndex = { west: 0, north: 3, east: 4, south: 0 } as const;
    const approaches = intersection.crossings.filter(({ kind }) => kind === 'approach');

    for (const crossing of approaches) {
      const id = crossing.id.replace('-approach', '') as keyof typeof sourceRoadIndex;
      const nearest = nearestCurveFrame(ROADS[sourceRoadIndex[id]].curve, crossing.center);
      const angle = Math.acos(THREE.MathUtils.clamp(
        Math.abs(nearest.tangent.dot(crossing.streetTangent)),
        -1,
        1,
      ));
      expect(nearest.distance, crossing.id).toBeLessThan(0.05);
      expect(THREE.MathUtils.radToDeg(angle), crossing.id).toBeLessThan(0.5);
    }
  });

  it('attaches approach endpoints to shared illuminated corner indicators', () => {
    const intersection = buildShibuyaIntersection();
    const indicators = new Map(intersection.indicators.map((indicator) => [indicator.id, indicator]));
    const approaches = intersection.crossings.filter(({ kind }) => kind === 'approach');
    const diagonals = intersection.crossings.filter(({ kind }) => kind === 'diagonal');

    expect(intersection.indicators).toHaveLength(8);
    for (const crossing of approaches) {
      expect(crossing.endpointIndicatorIds).toHaveLength(2);
      for (const indicatorId of crossing.endpointIndicatorIds) {
        const indicator = indicators.get(indicatorId);
        expect(indicator).toBeDefined();
        expect(indicator?.tactile).toBe(true);
        expect(indicator?.illuminated).toBe(true);
      }
    }

    const approachIndicatorIds = new Set(approaches.flatMap(({ endpointIndicatorIds }) =>
      endpointIndicatorIds));
    const diagonalIndicatorIds = new Set(diagonals.flatMap(({ endpointIndicatorIds }) =>
      endpointIndicatorIds));
    expect(diagonalIndicatorIds.size).toBe(4);
    expect([...diagonalIndicatorIds].every((id) => approachIndicatorIds.has(id))).toBe(true);

    for (const diagonal of diagonals) {
      const [start, end] = diagonal.endpointIndicatorIds.map((id) => indicators.get(id)!);
      const endpointAxis = end.center.clone().sub(start.center).setY(0).normalize();
      const endpointProjections = diagonal.endpointIndicatorIds
        .map((id) => indicators.get(id)!.center.dot(diagonal.spacingAxis))
        .sort((a, b) => a - b);
      const stripeProjections = diagonal.stripes
        .map(({ center }) => center.dot(diagonal.spacingAxis))
        .sort((a, b) => a - b);
      expect(Math.abs(endpointAxis.dot(diagonal.spacingAxis))).toBeGreaterThan(0.999999);
      expect(Math.abs(stripeProjections[0] - endpointProjections[0])).toBeLessThanOrEqual(2.4);
      expect(Math.abs(endpointProjections[1] - stripeProjections.at(-1)!)).toBeLessThanOrEqual(2.4);
    }
  });

  it('rests tactile indicator bottoms directly on sidewalk top', () => {
    const shibuya = buildShibuyaIntersection();
    const straight = buildStraightRoadCrossings();
    const indicators = [...shibuya.indicators, ...straight.indicators] as Array<
      (typeof shibuya.indicators)[number] & { height: number }
    >;

    expect(typeof indicators[0].height).toBe('number');
    for (const indicator of indicators) {
      expect(indicator.center.y - indicator.height / 2).toBeCloseTo(0.45, 6);
    }
  });

  it('places every tactile pad corner outside plaza asphalt on its source sidewalk', () => {
    const intersection = buildShibuyaIntersection();
    const sourceRoadIndex = { west: 0, north: 3, east: 4, south: 0 } as const;

    for (const indicator of intersection.indicators) {
      const approachId = indicator.id.split('-')[0] as keyof typeof sourceRoadIndex;
      const sideAxis = new THREE.Vector3()
        .crossVectors(indicator.longAxis, new THREE.Vector3(0, 1, 0))
        .normalize();
      for (const along of [-1, 1]) {
        for (const side of [-1, 1]) {
          const corner = indicator.center.clone()
            .addScaledVector(indicator.longAxis, along * indicator.length / 2)
            .addScaledVector(sideAxis, side * indicator.width / 2);
          expect(
            intersectionGeometry.shibuyaPlazaClearance(corner.x, corner.z),
            JSON.stringify({ indicator, corner }),
          ).toBeGreaterThan(0);
          const memberships = groundRoadMemberships(corner.x, corner.z);
          const source = memberships.find(({ roadIndex }) =>
            roadIndex === sourceRoadIndex[approachId]);
          expect(source?.withinSidewalkWidth, JSON.stringify({ indicator, corner, source }))
            .toBe(true);
          expect(source?.endpointCap, JSON.stringify({ indicator, corner, source }))
            .toBe(false);
          expect(
            memberships.some(({ roadIndex, withinRoadOrSidewalk }) =>
              roadIndex !== sourceRoadIndex[approachId] && withinRoadOrSidewalk),
            JSON.stringify({ indicator, corner, memberships }),
          ).toBe(false);
        }
      }
    }
  });

  it('is deterministic and returns independent mutable vectors', () => {
    const first = buildShibuyaIntersection();
    const second = buildShibuyaIntersection();
    expect(first).toEqual(second);

    first.crossings[0].stripes[0].center.add(new THREE.Vector3(100, 0, 0));
    expect(first.crossings[0].stripes[0].center).not.toEqual(
      second.crossings[0].stripes[0].center,
    );
  });

  it('keeps straight-road crossings on route frames at the wider pitch', () => {
    const { crossings, indicators } = buildStraightRoadCrossings();

    expect(crossings).toHaveLength(3);
    expect(indicators).toHaveLength(6);
    expect(crossings.map(({ center }) => center.x)).toEqual(
      expect.arrayContaining([
        expect.closeTo(-170, 0),
        expect.closeTo(-60, 0),
        expect.closeTo(120, 0),
      ]),
    );
    for (const crossing of crossings) {
      expect(crossing.endpointIndicatorIds).toHaveLength(2);
      expect(Math.abs(crossing.streetTangent.x)).toBeGreaterThan(0.999);
      for (const stripe of crossing.stripes) {
        expect(Math.abs(stripe.longAxis.dot(crossing.streetTangent))).toBeGreaterThan(0.999999);
      }
    }
  });
});
