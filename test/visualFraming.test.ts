import { describe, expect, it } from 'vitest';
import { buildCityLayout } from '../src/world/cityLayout';
import { getInspectionPreset } from '../src/world/inspectionPresets';
import {
  buildingPlacementBounds,
  orientedFootprintGap,
  orientedFootprintPerimeterPoints,
  segmentFootprintClearance,
} from '../src/world/buildingCatalog';
import {
  groundRoadMemberships,
  protectedOrientedFootprintClearance,
  protectedFootprintClearance,
} from '../src/world/roads';
import { buildShibuyaSightCorridors } from '../src/world/intersections';
import {
  buildShibuyaFacadePanels,
  measureShibuyaWallFraming,
} from '../src/world/visualFraming';
import { roadFacingFacade } from '../src/world/signLayout';

describe('Shibuya visual framing contract', () => {
  it('projects walls across both inspection cameras', () => {
    const walls = buildCityLayout().filter(({ layoutRole }) =>
      layoutRole?.startsWith('shibuya-'));
    const overhead = measureShibuyaWallFraming(
      walls,
      getInspectionPreset('shibuya-overhead'),
      1.6,
    );
    const street = measureShibuyaWallFraming(
      walls,
      getInspectionPreset('shibuya-street-level'),
      1.6,
    );
    expect(overhead.visibleWalls).toBeGreaterThanOrEqual(16);
    expect(overhead.projectedCoverage).toBeGreaterThanOrEqual(0.14);
    expect(overhead.maximumHorizontalAngularGapDeg).toBeLessThanOrEqual(18);
    expect(street.visibleWalls).toBeGreaterThanOrEqual(10);
    expect(street.projectedCoverage).toBeGreaterThanOrEqual(0.2);
    expect(street.maximumHorizontalAngularGapDeg).toBeLessThanOrEqual(20);
    for (const approach of ['west', 'north', 'east', 'south'] as const) {
      expect(overhead.visibleByApproach[approach]).toBeGreaterThan(0);
      expect(street.visibleByApproach[approach]).toBeGreaterThan(0);
    }
  });

  it('keeps close frontage safe with a real chain gap', () => {
    const corners = buildCityLayout().filter(({ layoutRole }) =>
      layoutRole === 'shibuya-corner');
    expect(corners.length).toBeGreaterThanOrEqual(5);
    const southCorners = corners.filter(({ shibuyaApproach }) =>
      shibuyaApproach === 'south');
    expect(Math.max(...southCorners.map(({ position }) =>
      Math.hypot(position[0] - 240, position[2])))).toBeLessThanOrEqual(90);
    const corridors = buildShibuyaSightCorridors();
    for (const placement of corners) {
      const bounds = buildingPlacementBounds(placement);
      expect(protectedOrientedFootprintClearance(bounds)).toBeGreaterThanOrEqual(1);
      for (const point of orientedFootprintPerimeterPoints(bounds, 8)) {
        for (const membership of groundRoadMemberships(point.x, point.z)) {
          expect(membership.clearance).toBeGreaterThanOrEqual(10 - 1e-6);
        }
      }
      for (const corridor of corridors) {
        expect(
          segmentFootprintClearance(corridor.start, corridor.end, bounds),
        ).toBeGreaterThan(corridor.halfWidth);
      }
    }
    const chained = corners.filter(({ file }) => file.includes('BldgMD_C_Main'))
      .map(buildingPlacementBounds);
    expect(chained).toHaveLength(2);
    const gap = orientedFootprintGap(chained[0], chained[1]);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(6);
  });

  it('uses textured regular-scale towers around the plaza', () => {
    const textured = buildCityLayout().filter(({ layoutRole, position, file }) =>
      layoutRole === 'shibuya-corner'
      && (file.includes('BldgLG_A_Main') || file.includes('BldgLG_A_BuildingB'))
      && Math.hypot(position[0] - 240, position[2]) <= 150);
    expect(textured.length).toBeGreaterThanOrEqual(2);
    for (const placement of textured) {
      expect(buildingPlacementBounds(placement).height).toBeGreaterThanOrEqual(55);
    }
    expect(new Set(textured.map(({ shibuyaApproach }) => shibuyaApproach)))
      .toEqual(new Set(['west', 'east']));
  });

  it('attaches visible facade panels to production wall footprints', () => {
    const walls = buildCityLayout().filter(({ layoutRole }) =>
      layoutRole?.startsWith('shibuya-'));
    const panels = buildShibuyaFacadePanels(walls);
    expect(panels.length).toBeGreaterThanOrEqual(12);
    for (const panel of panels) {
      const bound = panel as typeof panel & {
        parentIndex: number;
        parentFile: string;
        parentKey: string;
        normal: [number, number];
        tangent: [number, number];
      };
      const parent = walls[bound.parentIndex];
      const bounds = buildingPlacementBounds(parent);
      const face = roadFacingFacade(bounds, parent.outDir!);
      const planeCenter = {
        x: bounds.center.x + face.normal[0] * face.normalHalfExtent,
        z: bounds.center.z + face.normal[1] * face.normalHalfExtent,
      };
      const planeDelta = {
        x: panel.position[0] - planeCenter.x,
        z: panel.position[2] - planeCenter.z,
      };
      expect(bound.parentFile).toBe(parent.file);
      expect(bound.parentKey).toBe(`${bound.parentIndex}:${parent.file}`);
      expect(bound.normal).toEqual(face.normal);
      expect(bound.tangent).toEqual(face.tangent);
      expect(planeDelta.x * face.normal[0] + planeDelta.z * face.normal[1])
        .toBeCloseTo(panel.surfaceOffset, 8);
      expect(Math.abs(
        planeDelta.x * face.tangent[0] + planeDelta.z * face.tangent[1],
      )).toBeLessThan(1e-8);
      expect(panel.width).toBeLessThanOrEqual(face.tangentHalfExtent * 2 - 1.2 + 1e-8);
      expect(panel.position[1] - panel.height / 2).toBeGreaterThanOrEqual(3);
      expect(panel.position[1] + panel.height / 2).toBeLessThanOrEqual(bounds.height * 0.9);
      expect(panel.surfaceOffset).toBeCloseTo(0.08, 8);
      expect(panel.width).toBeGreaterThan(6);
      expect(panel.height).toBeGreaterThan(16);
      expect(panel.parentRole).toMatch(/^shibuya-/);
      expect(panel.corners).toHaveLength(4);
      for (const corner of panel.corners) {
        expect(groundRoadMemberships(corner.x, corner.z)
          .every(({ withinRoadOrSidewalk }) => !withinRoadOrSidewalk)).toBe(true);
        expect(protectedFootprintClearance(corner.x, corner.z, 0)).toBeGreaterThan(0);
        for (const corridor of buildShibuyaSightCorridors()) {
          const dx = corridor.end.x - corridor.start.x;
          const dz = corridor.end.z - corridor.start.z;
          const lengthSq = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, (
            (corner.x - corridor.start.x) * dx
            + (corner.z - corridor.start.z) * dz
          ) / lengthSq));
          const distance = Math.hypot(
            corner.x - (corridor.start.x + dx * t),
            corner.z - (corridor.start.z + dz * t),
          );
          expect(distance).toBeGreaterThan(corridor.halfWidth);
        }
      }
    }
  });
});
