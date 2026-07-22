import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildingPlacementBounds,
  pointOrientedFootprintClearance,
} from '../src/world/buildingCatalog';
import {
  buildCityLayout,
  buildSkyline,
  buildSkylineWithSafety,
  resolveDeckSafePlacement,
  SKYLINE_ATTEMPT_BUDGET,
  SKYLINE_TARGET_COUNT,
  skylineBoxBounds,
} from '../src/world/cityLayout';
import {
  BUILDING_DECK_VERTICAL_MARGIN,
  DECK_UNDERSIDE_OFFSET,
  ELEVATED_DECK_HALF_WIDTH_PADDING,
  ELEVATED_DECK_SAMPLE_COUNT,
  ELEVATED_HIGHWAY_ID,
  ROADS,
  curveDeckBuildingClearance,
  elevatedDeckBuildingClearance,
  elevatedDeckProfileAt,
  groundRoadEdgePoints,
  groundRoadMemberships,
  protectedFootprintClearance,
  sampledCurveErrorBound,
} from '../src/world/roads';
import {
  buildHighwayPillarLayout,
  evaluateHighwayPillarCandidate,
  type HighwayPillarCandidate,
} from '../src/world/highwayLayout';

const V = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, y, z);

const OLD_HIGHWAY = new THREE.CatmullRomCurve3([
  V(-380, 58, -420),
  V(-120, 62, -240),
  V(160, 66, -60),
  V(360, 58, -260),
], false, 'centripetal', 0.5);

function oldDeckConflicts(): number {
  return buildCityLayout().map(buildingPlacementBounds).filter((bounds) => {
    const clearance = curveDeckBuildingClearance(OLD_HIGHWAY, bounds, {
      roadId: 'former-elevated-highway',
      deckHalfWidth: 8 + ELEVATED_DECK_HALF_WIDTH_PADDING,
      undersideOffset: DECK_UNDERSIDE_OFFSET,
      sampleCount: ELEVATED_DECK_SAMPLE_COUNT,
    });
    return clearance.horizontalMargin <= 0
      && clearance.verticalMargin < BUILDING_DECK_VERTICAL_MARGIN;
  }).length;
}

describe('elevated highway layout', () => {
  it('retains a reproducible conflict in the former highway alignment', () => {
    // The Task 4 shoreline split intentionally removes former far-road facade
    // iterations and their RNG effects; the historical alignment remains
    // demonstrably unsafe against the new deterministic city layout.
    expect(oldDeckConflicts()).toBe(6);
  });

  it('gives every road a stable id and semantic kind', () => {
    expect(new Set(ROADS.map(({ id }) => id)).size).toBe(ROADS.length);
    expect(ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID)).toMatchObject({
      kind: 'elevated-highway',
      ground: false,
    });
    expect(ROADS.find(({ kind }) => kind === 'main-route')?.source)
      .toBe('route-ground-projection');
    for (const membership of groundRoadMemberships(-60, 0)) {
      expect(membership.roadId).toBe(ROADS[membership.roadIndex].id);
    }
    for (const edge of groundRoadEdgePoints(40)) {
      expect(edge.roadId).toBe(ROADS[edge.roadIndex].id);
    }
  });

  it('keeps the rerouted highway north of the dense core at modest height', () => {
    const highway = ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID)!;
    const points = Array.from({ length: 401 }, (_, index) =>
      highway.curve.getPointAt(index / 400));
    const central = points.filter(({ x }) => x >= -400 && x <= 400);

    expect(points[0].x).toBeLessThan(-400);
    expect(points.at(-1)!.x).toBeGreaterThan(400);
    expect(Math.min(...central.map(({ z }) => z))).toBeGreaterThan(150);
    expect(Math.min(...points.map(({ y }) => y))).toBeGreaterThanOrEqual(70);
    expect(Math.max(...points.map(({ y }) => y))).toBeLessThanOrEqual(80);
  });

  it('returns a deterministic accurate nearest sampled deck profile', () => {
    const first = elevatedDeckProfileAt(71, 231);
    const second = elevatedDeckProfileAt(71, 231);
    const highway = ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID)!;
    let denseDistance = Infinity;
    let denseU = 0;
    for (let index = 0; index <= 20_000; index++) {
      const u = index / 20_000;
      const point = highway.curve.getPointAt(u);
      const distance = Math.hypot(point.x - 71, point.z - 231);
      if (distance < denseDistance) {
        denseDistance = distance;
        denseU = u;
      }
    }

    expect(first).toEqual(second);
    expect(first.roadId).toBe(ELEVATED_HIGHWAY_ID);
    expect(first.u).toBeCloseTo(denseU, 3);
    expect(Math.abs(first.lateralClearance + highway.halfWidth))
      .toBeCloseTo(denseDistance, 1);
    expect(first.center.y).toBeCloseTo(first.deckY, 10);
    expect(first.tangent.y).toBe(0);
    expect(first.binormal.y).toBe(0);
    expect(Math.abs(first.tangent.dot(first.binormal))).toBeLessThan(1e-10);
  });

  it('bounds broad deck-profile error across representative offsets', () => {
    const highway = ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID)!;
    const maxAllowedPositionError = 0.02;
    let maximumPositionError = 0;
    let maximumLateralError = 0;

    for (const sourceU of [0.03, 0.17, 0.38, 0.61, 0.82, 0.97]) {
      const center = highway.curve.getPointAt(sourceU);
      const tangent = highway.curve.getTangentAt(sourceU).setY(0).normalize();
      const binormal = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize();
      for (const offset of [-35, -12, 0, 9, 28]) {
        const query = center.clone().addScaledVector(binormal, offset);
        const profile = elevatedDeckProfileAt(query.x, query.z);
        let denseDistance = Infinity;
        let denseU = 0;
        let densePoint = highway.curve.getPointAt(0);
        for (let index = 0; index <= 40_000; index++) {
          const u = index / 40_000;
          const point = highway.curve.getPointAt(u);
          const distance = Math.hypot(point.x - query.x, point.z - query.z);
          if (distance < denseDistance) {
            denseDistance = distance;
            denseU = u;
            densePoint = point;
          }
        }
        const refineStart = Math.max(0, denseU - 1 / 40_000);
        const refineEnd = Math.min(1, denseU + 1 / 40_000);
        for (let index = 0; index <= 200; index++) {
          const u = THREE.MathUtils.lerp(refineStart, refineEnd, index / 200);
          const point = highway.curve.getPointAt(u);
          const distance = Math.hypot(point.x - query.x, point.z - query.z);
          if (distance < denseDistance) {
            denseDistance = distance;
            densePoint = point;
          }
        }
        maximumPositionError = Math.max(
          maximumPositionError,
          Math.hypot(profile.center.x - densePoint.x, profile.center.z - densePoint.z),
        );
        maximumLateralError = Math.max(
          maximumLateralError,
          Math.abs(profile.lateralClearance + highway.halfWidth - denseDistance),
        );
      }
    }

    expect(maximumPositionError).toBeLessThanOrEqual(maxAllowedPositionError);
    expect(maximumLateralError).toBeLessThanOrEqual(maxAllowedPositionError);
    expect(sampledCurveErrorBound(highway.curve, ELEVATED_DECK_SAMPLE_COUNT))
      .toBeGreaterThan(0);
  });

  it('keeps every complete rendered building OBB outside or below the deck', () => {
    for (const placement of buildCityLayout()) {
      const bounds = buildingPlacementBounds(placement);
      const clearance = elevatedDeckBuildingClearance(bounds);
      expect(
        clearance.horizontalMargin > 0
          || clearance.verticalMargin >= BUILDING_DECK_VERTICAL_MARGIN,
        JSON.stringify({ placement, bounds, clearance }),
      ).toBe(true);
    }
  });

  it('allows a complete low OBB below the slab and rejects a tall one', () => {
    const highway = ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID)!;
    const center = highway.curve.getPointAt(0.5);
    const underside = center.y - DECK_UNDERSIDE_OFFSET;
    const low = {
      file: 'synthetic-low',
      center: { x: center.x, z: center.z },
      rotationY: 0,
      scale: 1,
      radius: Math.SQRT2,
      halfX: 1,
      halfZ: 1,
      height: underside - BUILDING_DECK_VERTICAL_MARGIN - 2,
    };
    const lowClearance = elevatedDeckBuildingClearance(low);
    const tallClearance = elevatedDeckBuildingClearance({
      ...low,
      file: 'synthetic-tall',
      height: underside - BUILDING_DECK_VERTICAL_MARGIN + 0.5,
    });

    expect(lowClearance.horizontalMargin).toBeLessThan(0);
    expect(lowClearance.verticalMargin)
      .toBeGreaterThanOrEqual(BUILDING_DECK_VERTICAL_MARGIN);
    expect(tallClearance.horizontalMargin).toBeLessThan(0);
    expect(tallClearance.verticalMargin).toBeLessThan(BUILDING_DECK_VERTICAL_MARGIN);
  });

  it('subtracts a conservative vertical bound for an unsampled curve dip', () => {
    const dippingCurve = new THREE.CatmullRomCurve3([
      V(-10, 10, 0),
      V(0, 0, 0),
      V(10, 10, 0),
    ], false, 'centripetal', 0.5);
    const building = {
      file: 'dip-witness',
      center: { x: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      radius: Math.hypot(12, 2),
      halfX: 12,
      halfZ: 2,
      height: 5,
    };
    const clearance = curveDeckBuildingClearance(dippingCurve, building, {
      roadId: 'dipping-deck',
      deckHalfWidth: 1,
      undersideOffset: 0,
      sampleCount: 1,
    });

    expect(dippingCurve.getPointAt(0).y).toBe(10);
    expect(dippingCurve.getPointAt(1).y).toBe(10);
    expect(dippingCurve.getPointAt(0.5).y).toBeCloseTo(0, 10);
    expect(clearance.horizontalMargin).toBeLessThan(0);
    expect(clearance.verticalMargin).toBeLessThan(BUILDING_DECK_VERTICAL_MARGIN);
  });

  it('falls back to a safe low placement and rejects an unsafe fallback', () => {
    const deck = new THREE.LineCurve3(V(-5, 10, 0), V(5, 10, 0));
    const candidate = (file: string, height: number) => ({
      file,
      bounds: {
        file,
        center: { x: 0, z: 0 },
        rotationY: 0,
        scale: 1,
        radius: Math.SQRT2,
        halfX: 1,
        halfZ: 1,
        height,
      },
    });
    const isSafe = (choice: ReturnType<typeof candidate>): boolean => {
      const clearance = curveDeckBuildingClearance(deck, choice.bounds, {
        roadId: 'fallback-deck',
        deckHalfWidth: 2,
        undersideOffset: 0,
        sampleCount: 16,
      });
      return clearance.horizontalMargin > 0
        || clearance.verticalMargin >= BUILDING_DECK_VERTICAL_MARGIN;
    };
    const tall = candidate('tall-model', 6);
    const low = candidate('low-model', 4);

    expect(resolveDeckSafePlacement(tall, () => low, isSafe)).toMatchObject({
      outcome: 'fallback',
      placement: { file: 'low-model' },
    });
    expect(resolveDeckSafePlacement(tall, () => tall, isSafe)).toEqual({
      outcome: 'rejected',
    });
  });

  it('accepts only pillars clear of roads, protected regions, and building OBBs', () => {
    const buildings = buildCityLayout().map(buildingPlacementBounds);
    const pillars = buildHighwayPillarLayout(buildings);

    expect(pillars.length).toBeGreaterThanOrEqual(8);
    for (const pillar of pillars) {
      expect(
        groundRoadMemberships(pillar.x, pillar.z).every((membership) =>
          membership.clearance >= 9 + pillar.radius),
        JSON.stringify(pillar),
      ).toBe(true);
      expect(
        protectedFootprintClearance(pillar.x, pillar.z, pillar.radius),
        JSON.stringify(pillar),
      ).toBeGreaterThan(0);
      for (const bounds of buildings) {
        expect(
          pointOrientedFootprintClearance(
            { x: pillar.x, z: pillar.z },
            bounds,
          ) - pillar.radius,
          JSON.stringify({ pillar, bounds }),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('classifies each independent pillar rejection path and an accepted point', () => {
    const candidate = (x: number, z: number): HighwayPillarCandidate => ({
      roadId: ELEVATED_HIGHWAY_ID,
      u: 0.5,
      x,
      z,
      deckY: 74,
      radius: 3,
    });
    const main = ROADS.find(({ id }) => id === 'main-route')!;
    const roadPoint = main.curve.getPointAt(0.2);
    const building = {
      file: 'synthetic-pillar-blocker',
      center: { x: 900, z: 900 },
      rotationY: Math.PI / 6,
      scale: 1,
      radius: Math.hypot(5, 4),
      halfX: 5,
      halfZ: 4,
      height: 20,
    };

    expect(evaluateHighwayPillarCandidate(
      candidate(roadPoint.x, roadPoint.z),
      [],
    ).reason).toBe('ground-road-or-sidewalk');
    expect(evaluateHighwayPillarCandidate(
      candidate(218, 25),
      [],
    ).reason).toBe('protected-region');
    expect(evaluateHighwayPillarCandidate(
      candidate(900, 900),
      [building],
    ).reason).toBe('building-obb');
    expect(evaluateHighwayPillarCandidate(
      candidate(-1500, 1500),
      [building],
    )).toMatchObject({ accepted: true, reason: 'accepted' });
  });

  it('keeps far skyline boxes outside deck and pillar volumes', () => {
    const buildings = buildCityLayout().map(buildingPlacementBounds);
    const pillars = buildHighwayPillarLayout(buildings);
    const skyline = buildSkyline();

    expect(skyline).toHaveLength(150);
    for (const box of skyline) {
      const bounds = skylineBoxBounds(box);
      const deck = elevatedDeckBuildingClearance(bounds);
      expect(
        deck.horizontalMargin > 0
          || deck.verticalMargin >= BUILDING_DECK_VERTICAL_MARGIN,
        JSON.stringify({ bounds, deck }),
      ).toBe(true);
      for (const pillar of pillars) {
        expect(
          pointOrientedFootprintClearance(
            { x: pillar.x, z: pillar.z },
            bounds,
          ) - pillar.radius,
          JSON.stringify({ pillar, bounds }),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('guarantees the skyline target across seeds or throws after its budget', () => {
    for (const seed of [0, 1, 4242, 99_999]) {
      expect(buildSkyline(seed)).toHaveLength(SKYLINE_TARGET_COUNT);
    }
    expect(SKYLINE_ATTEMPT_BUDGET).toBeGreaterThan(SKYLINE_TARGET_COUNT);
    expect(() => buildSkylineWithSafety(
      7,
      () => false,
      { targetCount: 2, attemptBudget: 3 },
    )).toThrow(
      'Unable to generate 2 safe skyline boxes after 3 attempts (accepted 0, seed 7)',
    );
  });

  it('restores regular-scale south Shibuya placements without miniatures', () => {
    const south = buildCityLayout().filter((placement) =>
      placement.shibuyaApproach === 'south');

    expect(south.length).toBeGreaterThan(1);
    expect(south.some(({ layoutRole }) => layoutRole === 'shibuya-front')).toBe(true);
    expect(south.every(({ foot }) => (foot ?? 0) >= 14)).toBe(true);
  });
});
