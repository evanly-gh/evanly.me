import { describe, expect, it } from 'vitest';
import {
  FACADE_SCREEN_OFFSET,
  HOLOGRAM_ANCHOR_IDS,
  buildSignLayout,
  hologramComponentFootprints,
  measureHologramFootprintSafety,
  roadFacingFacade,
  type FacadeSignPlacement,
} from '../src/world/signLayout';
import { buildCityLayout } from '../src/world/cityLayout';
import { buildingPlacementBounds } from '../src/world/buildingCatalog';
import {
  groundRoadMemberships,
  keepClear,
  protectedFootprintClearance,
} from '../src/world/roads';
import { buildShibuyaSightCorridors } from '../src/world/intersections';

const dot2 = (
  a: readonly [number, number],
  b: readonly [number, number],
): number => a[0] * b[0] + a[1] * b[1];

describe('environment-integrated sign layout', () => {
  it('selects the road-facing face independently from raw rotated OBB axes', () => {
    const rotationY = Math.PI / 3;
    const zAxis: [number, number] = [Math.sin(rotationY), Math.cos(rotationY)];
    const bounds = {
      file: 'synthetic',
      center: { x: 13, z: -9 },
      rotationY,
      scale: 1,
      radius: Math.hypot(7, 3),
      halfX: 7,
      halfZ: 3,
      height: 22,
    };
    const face = roadFacingFacade(bounds, [-zAxis[0], -zAxis[1]]);

    expect(face.normal).toEqual([
      expect.closeTo(zAxis[0], 10),
      expect.closeTo(zAxis[1], 10),
    ]);
    expect(face.normalHalfExtent).toBe(3);
    expect(face.tangentHalfExtent).toBe(7);
    expect([
      bounds.center.x + face.normal[0] * face.normalHalfExtent,
      bounds.center.z + face.normal[1] * face.normalHalfExtent,
    ]).toEqual([
      expect.closeTo(13 + zAxis[0] * 3, 10),
      expect.closeTo(-9 + zAxis[1] * 3, 10),
    ]);
  });

  it('uses exact centerOffset before deriving a rotated road-facing plane', () => {
    const rotationY = -Math.PI / 4;
    const xAxis: [number, number] = [Math.cos(rotationY), -Math.sin(rotationY)];
    const placement = {
      file: 'neocity/KB3D_NEC_BldgMD_B_Main.glb',
      position: [20, 0, -30] as [number, number, number],
      rotationY,
      foot: 16,
      centerOffset: [4.5, -7.25] as [number, number],
      outDir: [-xAxis[0], -xAxis[1]] as [number, number],
    };
    const bounds = buildingPlacementBounds(placement);
    const face = roadFacingFacade(bounds, placement.outDir);
    const plane = [
      bounds.center.x + face.normal[0] * face.normalHalfExtent,
      bounds.center.z + face.normal[1] * face.normalHalfExtent,
    ];

    expect(bounds.center).toEqual({ x: 24.5, z: -37.25 });
    expect(face.normal).toEqual([
      expect.closeTo(xAxis[0], 10),
      expect.closeTo(xAxis[1], 10),
    ]);
    expect(plane).toEqual([
      expect.closeTo(24.5 + xAxis[0] * bounds.halfX, 10),
      expect.closeTo(-37.25 + xAxis[1] * bounds.halfX, 10),
    ]);
  });

  it('is deterministic and preserves the requested sign density and mode ratio', () => {
    const first = buildSignLayout();
    const second = buildSignLayout();
    const facade = first.filter((sign) => sign.mode === 'facade');
    const hologram = first.filter((sign) => sign.mode === 'hologram');

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(100);
    expect(first.length).toBeLessThanOrEqual(150);
    expect(facade.length / first.length).toBeGreaterThanOrEqual(0.8);
    expect(facade.length / first.length).toBeLessThanOrEqual(0.9);
    expect(hologram.length).toBeGreaterThanOrEqual(12);
  });

  it('links every solid sign to a real default-layout parent and unique facade band', () => {
    const buildings = buildCityLayout();
    const facade = buildSignLayout().filter(
      (sign): sign is FacadeSignPlacement => sign.mode === 'facade',
    );
    const occupiedBands = new Set<string>();

    for (const sign of facade) {
      const parent = buildings[sign.parentIndex];
      expect(parent, JSON.stringify(sign)).toBeDefined();
      expect(sign.parentId).toBe(`building-${sign.parentIndex}`);
      expect(sign.parentKey).toBe(`${sign.parentIndex}:${parent.file}`);
      expect(sign.parentFile).toBe(parent.file);
      expect(parent.outDir, JSON.stringify({ sign, parent })).toBeDefined();

      const bandKey = `${sign.parentId}:${sign.facade.band}`;
      expect(occupiedBands.has(bandKey), bandKey).toBe(false);
      occupiedBands.add(bandKey);
    }
  });

  it('derives the exact rendered OBB facade plane, orientation, and roadward offset', () => {
    const buildings = buildCityLayout();
    const facade = buildSignLayout().filter(
      (sign): sign is FacadeSignPlacement => sign.mode === 'facade',
    );

    for (const sign of facade) {
      const parent = buildings[sign.parentIndex];
      const bounds = buildingPlacementBounds(parent);
      const normal = sign.facade.normal;
      const tangent = sign.facade.tangent;
      const planeDelta: [number, number] = [
        sign.facade.planeCenter[0] - bounds.center.x,
        sign.facade.planeCenter[2] - bounds.center.z,
      ];
      const screenDelta: [number, number] = [
        sign.position[0] - sign.facade.planeCenter[0],
        sign.position[2] - sign.facade.planeCenter[2],
      ];

      expect(Math.hypot(...normal), JSON.stringify(sign)).toBeCloseTo(1, 10);
      expect(Math.hypot(...tangent), JSON.stringify(sign)).toBeCloseTo(1, 10);
      expect(dot2(normal, tangent), JSON.stringify(sign)).toBeCloseTo(0, 10);
      expect(dot2(planeDelta, normal), JSON.stringify(sign))
        .toBeCloseTo(sign.facade.normalHalfExtent, 8);
      expect(Math.abs(dot2(planeDelta, tangent)), JSON.stringify(sign)).toBeLessThan(1e-8);
      expect(dot2(screenDelta, normal), JSON.stringify(sign))
        .toBeCloseTo(FACADE_SCREEN_OFFSET, 8);
      expect(Math.abs(dot2(screenDelta, tangent)), JSON.stringify(sign)).toBeLessThan(1e-8);
      expect(sign.facade.screenOffset).toBe(FACADE_SCREEN_OFFSET);

      const screenNormal: [number, number] = [
        Math.sin(sign.rotationY),
        Math.cos(sign.rotationY),
      ];
      expect(dot2(screenNormal, normal), JSON.stringify(sign)).toBeCloseTo(1, 10);
    }
  });

  it('fits every facade sign inside catalog-derived width and safe height bands', () => {
    const facade = buildSignLayout().filter(
      (sign): sign is FacadeSignPlacement => sign.mode === 'facade',
    );

    for (const sign of facade) {
      expect(sign.width + 2 * sign.facade.horizontalMargin, JSON.stringify(sign))
        .toBeLessThanOrEqual(sign.facade.renderedWidth + 1e-8);
      expect(sign.facade.bandBottom, JSON.stringify(sign)).toBeGreaterThanOrEqual(
        sign.facade.safeBottom,
      );
      expect(sign.facade.bandTop, JSON.stringify(sign)).toBeLessThanOrEqual(
        sign.facade.safeTop,
      );
      expect(sign.position[1] - sign.height / 2, JSON.stringify(sign))
        .toBeCloseTo(sign.facade.bandBottom, 8);
      expect(sign.position[1] + sign.height / 2, JSON.stringify(sign))
        .toBeCloseTo(sign.facade.bandTop, 8);
    }
  });

  it('keeps facade screens outside road, plaza, and bridge keep-clear geometry', () => {
    for (const sign of buildSignLayout()) {
      if (sign.mode !== 'facade') continue;
      const memberships = groundRoadMemberships(sign.position[0], sign.position[2]);
      expect(
        memberships.some(({ withinRoadOrSidewalk }) => withinRoadOrSidewalk),
        JSON.stringify({ sign, memberships }),
      ).toBe(false);
      expect(keepClear(sign.position[0], sign.position[2]), JSON.stringify(sign)).toBe(false);
      expect(
        protectedFootprintClearance(sign.position[0], sign.position[2], sign.width / 2),
        JSON.stringify(sign),
      ).toBeGreaterThan(0);
      expect(sign.position[2], JSON.stringify(sign)).toBeGreaterThanOrEqual(-560);
    }
  });

  it('uses only curated rooftop emitters clear of roads, sightlines, and bridge route', () => {
    const holograms = buildSignLayout().filter((sign) => sign.mode === 'hologram');
    const expectedIds = new Set(HOLOGRAM_ANCHOR_IDS);
    const sightlines = buildShibuyaSightCorridors();

    expect(new Set(holograms.map(({ anchorId }) => anchorId))).toEqual(expectedIds);
    for (const sign of holograms) {
      expect(['shibuya', 'bridge-shoulder']).toContain(sign.zone);
      expect(sign.emitter.kind).toBe('roof');
      expect(sign.position[1] - sign.height / 2)
        .toBeGreaterThan(sign.emitter.position[1] + sign.beam.height - 1e-8);
      expect(
        groundRoadMemberships(sign.emitter.position[0], sign.emitter.position[2])
          .some(({ withinRoadOrSidewalk }) => withinRoadOrSidewalk),
        JSON.stringify(sign),
      ).toBe(false);
      expect(keepClear(sign.emitter.position[0], sign.emitter.position[2]), JSON.stringify(sign))
        .toBe(false);
      for (const corridor of sightlines) {
        const dx = corridor.end.x - corridor.start.x;
        const dz = corridor.end.z - corridor.start.z;
        const lengthSq = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1,
          ((sign.emitter.position[0] - corridor.start.x) * dx
            + (sign.emitter.position[2] - corridor.start.z) * dz) / lengthSq));
        const clearance = Math.hypot(
          sign.emitter.position[0] - (corridor.start.x + dx * t),
          sign.emitter.position[2] - (corridor.start.z + dz * t),
        ) - corridor.halfWidth;
        expect(clearance, JSON.stringify({ sign, corridor })).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every complete hologram component footprint clear', () => {
    const holograms = buildSignLayout().filter((sign) => sign.mode === 'hologram');

    for (const sign of holograms) {
      const footprints = hologramComponentFootprints(sign);
      const safety = measureHologramFootprintSafety(sign);
      expect(footprints.map(({ component }) => component))
        .toEqual(['emitter', 'beam', 'panel']);
      expect(footprints[0].radius).toBeCloseTo(sign.emitter.radius * 1.14, 10);
      expect(footprints[1].radius).toBe(sign.beam.radius);
      expect(footprints[2].radius).toBe(sign.width / 2);
      expect(safety).toHaveLength(3);
      for (const margins of safety) {
        expect(margins.roadMargin, JSON.stringify({ sign, margins })).toBeGreaterThan(0);
        expect(margins.protectedMargin, JSON.stringify({ sign, margins })).toBeGreaterThan(0);
        expect(margins.bridgeMargin, JSON.stringify({ sign, margins })).toBeGreaterThan(0);
        expect(margins.sightlineMargin, JSON.stringify({ sign, margins })).toBeGreaterThan(0);
      }
    }
  });
});
