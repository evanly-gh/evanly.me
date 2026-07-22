import { describe, expect, it } from 'vitest';
import manifest from '../public/models/neocity/manifest.json';
import propManifest from '../public/models/props/manifest.json';
import * as catalog from '../src/world/buildingCatalog';
import {
  BUILDING_CATALOG,
  buildingPlacementBounds,
  calculateRenderedScale,
  getBuildingMetrics,
  orientedFootprintGap,
  orientedFootprintsOverlap,
  segmentFootprintClearance,
} from '../src/world/buildingCatalog';

describe('building catalog and rendered metrics', () => {
  it('is derived exactly from the published NeoCity manifest', () => {
    expect(BUILDING_CATALOG.size).toBe(manifest.length);
    for (const entry of manifest) {
      const metrics = getBuildingMetrics(entry.file);
      expect(metrics.name).toBe(entry.name);
      expect(metrics.file).toBe(entry.file);
      expect(metrics.size).toEqual({
        x: entry.bbox[0],
        y: entry.bbox[1],
        z: entry.bbox[2],
      });
    }
  });

  it('catalogs every rendered NeoCity and processed prop footprint', () => {
    const renderedCatalog = (
      catalog as typeof catalog & {
        RENDERED_ASSET_CATALOG: Map<string, {
          size: { x: number; y: number; z: number };
        }>;
      }
    ).RENDERED_ASSET_CATALOG;
    expect(renderedCatalog).toBeInstanceOf(Map);
    expect(renderedCatalog.size).toBe(manifest.length + propManifest.length);
    for (const entry of [...manifest, ...propManifest]) {
      const metrics = renderedCatalog.get(entry.file);
      expect(metrics?.size, entry.file).toEqual({
        x: entry.bbox[0],
        y: entry.bbox[1],
        z: entry.bbox[2],
      });
    }
  });

  it('matches InstancedPieces uniform footprint and height scaling rules', () => {
    const metrics = getBuildingMetrics('neocity/KB3D_NEC_BldgLG_B_Main.glb');
    const expectedRadius = 0.5 * Math.hypot(metrics.size.x, metrics.size.z);
    const scale = calculateRenderedScale(metrics, {
      scale: 1,
      foot: 22,
    });

    expect(metrics.sourceRadius).toBeCloseTo(expectedRadius, 12);
    expect(scale).toBeCloseTo(22 / expectedRadius, 12);

    const bounds = buildingPlacementBounds({
      file: metrics.file,
      position: [10, 0, 20],
      rotationY: Math.PI / 2,
      foot: 22,
      outDir: [1, 0],
    });
    expect(bounds.scale).toBeCloseTo(scale, 12);
    expect(bounds.radius).toBeCloseTo(22, 12);
    expect(bounds.center).toEqual({
      x: expect.closeTo(32, 10),
      z: expect.closeTo(20, 10),
    });
    expect(bounds.halfX).toBeCloseTo(metrics.size.x * scale / 2, 12);
    expect(bounds.halfZ).toBeCloseTo(metrics.size.z * scale / 2, 12);
    expect(bounds.height).toBeCloseTo(metrics.size.y * scale, 12);

    const anchored = buildingPlacementBounds({
      file: metrics.file,
      position: [10, 0, 20],
      rotationY: 0,
      foot: 22,
      outDir: [1, 0],
      centerOffset: [3, -4],
    });
    expect(anchored.center).toEqual({ x: 13, z: 16 });
  });

  it('measures visible gaps from oriented model bounds instead of radius caps', () => {
    const first = buildingPlacementBounds({
      file: 'neocity/KB3D_NEC_BldgMD_B_Main.glb',
      position: [0, 0, 0],
      rotationY: 0,
      foot: 16,
    });
    const second = buildingPlacementBounds({
      file: 'neocity/KB3D_NEC_BldgMD_B_Main.glb',
      position: [30, 0, 0],
      rotationY: 0,
      foot: 16,
    });

    expect(orientedFootprintGap(first, second)).toBeCloseTo(
      30 - first.halfX - second.halfX,
      10,
    );
    expect(orientedFootprintGap(first, second)).not.toBeCloseTo(
      30 - first.radius - second.radius,
      3,
    );
  });

  it('uses oriented rectangles for overlap and sight-corridor clearance', () => {
    const bounds = buildingPlacementBounds({
      file: 'neocity/KB3D_NEC_BldgMD_B_Main.glb',
      position: [0, 0, 0],
      rotationY: 0,
      foot: 16,
    });
    const separated = {
      ...bounds,
      center: { x: bounds.halfX * 2 + 2.1, z: 0 },
    };

    expect(orientedFootprintsOverlap(bounds, separated, 2)).toBe(false);
    expect(orientedFootprintsOverlap(bounds, {
      ...separated,
      center: { x: bounds.halfX * 2 + 1.9, z: 0 },
    }, 2)).toBe(true);
    expect(segmentFootprintClearance(
      { x: -20, z: bounds.halfZ + 3 },
      { x: 20, z: bounds.halfZ + 3 },
      bounds,
    )).toBeCloseTo(3, 8);
    expect(segmentFootprintClearance(
      { x: -20, z: 0 },
      { x: 20, z: 0 },
      bounds,
    )).toBe(0);
    expect(segmentFootprintClearance(
      { x: bounds.halfX + 5, z: bounds.halfZ },
      { x: bounds.halfX + 10, z: bounds.halfZ },
      bounds,
    )).toBeCloseTo(5, 8);
  });

  it('reports signed segment clearance for contained, crossing, and tangent cases', () => {
    const bounds = {
      file: 'synthetic',
      center: { x: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      radius: Math.hypot(4, 2),
      halfX: 4,
      halfZ: 2,
      height: 10,
    };

    expect(segmentFootprintClearance(
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      bounds,
    )).toBeLessThan(0);
    expect(segmentFootprintClearance(
      { x: -8, z: 0 },
      { x: 8, z: 0 },
      bounds,
    )).toBe(0);
    expect(segmentFootprintClearance(
      { x: -8, z: 2 },
      { x: 8, z: 2 },
      bounds,
    )).toBe(0);
  });

  it('transforms segment clearance into rotated OBB coordinates', () => {
    const angle = Math.PI / 4;
    const axis = { x: Math.cos(angle), z: -Math.sin(angle) };
    const bounds = {
      file: 'rotated-synthetic',
      center: { x: 12, z: -7 },
      rotationY: angle,
      scale: 1,
      radius: Math.hypot(4, 2),
      halfX: 4,
      halfZ: 2,
      height: 10,
    };

    expect(segmentFootprintClearance(
      { x: 12 - axis.x, z: -7 - axis.z },
      { x: 12 + axis.x, z: -7 + axis.z },
      bounds,
    )).toBeLessThan(0);
  });

  it('returns exact positive distance for a separated segment and OBB', () => {
    const bounds = {
      file: 'synthetic',
      center: { x: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      radius: Math.hypot(4, 2),
      halfX: 4,
      halfZ: 2,
      height: 10,
    };

    expect(segmentFootprintClearance(
      { x: -3, z: 5 },
      { x: 3, z: 5 },
      bounds,
    )).toBeCloseTo(3, 10);
  });

  it('uses edge-to-OBB distance for diagonally offset building gaps', () => {
    const first = {
      file: 'first',
      center: { x: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      radius: Math.hypot(4, 1),
      halfX: 4,
      halfZ: 1,
      height: 10,
    };
    const second = {
      ...first,
      file: 'second',
      center: { x: 6, z: 4 },
    };

    expect(orientedFootprintGap(first, second)).toBeCloseTo(2, 10);
  });
});
