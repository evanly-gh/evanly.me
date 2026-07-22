import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CORRIDOR,
  BRIDGE_DECK_THICKNESS,
  BRIDGE_END_T,
  BRIDGE_START_T,
  CITY_GROUND_BOUNDS,
  HORIZON_END_Z,
  WATER_BASIN,
  WATER_LEVEL,
  bridgeCorridorFootprintClearance,
  buildBridgeLayout,
  measureMoonView,
  rectangleClearance,
} from '../src/world/bridgeLayout';
import {
  MOON_POS,
  MOON_RADIUS,
  buildRouteSegmentCurve,
  sampleRoute,
} from '../src/world/route';
import {
  ROADS,
  groundRoadClearance,
  keepClear,
  protectedOrientedFootprintClearance,
} from '../src/world/roads';
import {
  buildCityLayout,
  buildProps,
  buildSkyline,
  buildStreetFurniture,
} from '../src/world/cityLayout';
import { buildSignLayout } from '../src/world/signLayout';
import { buildCrowdLayout } from '../src/world/crowdLayout';
import { buildStreetDressingLayout } from '../src/world/streetDressing';
import {
  buildingPlacementBounds,
  orientedFootprintsOverlap,
  type OrientedBuildingBounds,
} from '../src/world/buildingCatalog';

const waterBounds: OrientedBuildingBounds = {
  file: 'water-basin',
  center: {
    x: (WATER_BASIN.x0 + WATER_BASIN.x1) / 2,
    z: (WATER_BASIN.z0 + WATER_BASIN.z1) / 2,
  },
  rotationY: 0,
  scale: 1,
  radius: Math.hypot(
    WATER_BASIN.x1 - WATER_BASIN.x0,
    WATER_BASIN.z1 - WATER_BASIN.z0,
  ) / 2,
  halfX: (WATER_BASIN.x1 - WATER_BASIN.x0) / 2,
  halfZ: (WATER_BASIN.z1 - WATER_BASIN.z0) / 2,
  height: 0,
};

const intersectsWater = (bounds: OrientedBuildingBounds): boolean =>
  orientedFootprintsOverlap(bounds, waterBounds, 1e-6);

describe('finale route and bridge layout', () => {
  it('extends the semantic bridge endpoint without flattening it', () => {
    const endpoint = sampleRoute(BRIDGE_END_T);
    expect(endpoint.pos.x).toBeCloseTo(240, 6);
    expect(endpoint.pos.y).toBeCloseTo(16, 6);
    expect(endpoint.pos.z).toBeCloseTo(-1600, 6);

    const curve = buildRouteSegmentCurve(BRIDGE_START_T, BRIDGE_END_T);
    for (let i = 0; i <= 64; i++) {
      const u = i / 64;
      const route = sampleRoute(THREE.MathUtils.lerp(BRIDGE_START_T, BRIDGE_END_T, u));
      expect(curve.getPoint(u).distanceTo(route.pos)).toBeLessThan(1e-8);
      expect(curve.getTangent(u).angleTo(route.tangent)).toBeLessThan(1e-8);
      if (u > 0) expect(curve.getPoint(u).y).toBeGreaterThanOrEqual(-1e-8);
    }
  });

  it('ends ground asphalt at the shoreline and joins the bridge with no gap', () => {
    const ground = ROADS.find(({ id }) => id === 'main-route')!;
    const bridge = buildBridgeLayout();
    const routeSplit = sampleRoute(BRIDGE_START_T).pos;

    expect(ground.curve.getPoint(1).distanceTo(routeSplit.clone().setY(0))).toBeLessThan(1e-8);
    expect(bridge.curve.getPoint(0).distanceTo(routeSplit)).toBeLessThan(1e-8);
    expect(bridge.curve.getPoint(1).distanceTo(sampleRoute(1).pos)).toBeLessThan(1e-8);
    expect(groundRoadClearance(240, -800)).toBeGreaterThan(100);

    let previous = bridge.curve.getPoint(0);
    let largestStep = 0;
    for (let i = 1; i <= 512; i++) {
      const point = bridge.curve.getPoint(i / 512);
      largestStep = Math.max(largestStep, point.distanceTo(previous));
      previous = point;
    }
    expect(largestStep).toBeLessThan(4);
  });

  it('provides a finished, supported deck above a complete water basin', () => {
    const bridge = buildBridgeLayout();
    expect(bridge.edges).toHaveLength(2);
    expect(new Set(bridge.edges.map(({ accent }) => accent)))
      .toEqual(new Set(['cyan', 'magenta']));
    expect(bridge.rails).toHaveLength(2);
    expect(bridge.centreLine.accent).toBe('amber');
    expect(bridge.piers.length).toBeGreaterThanOrEqual(8);
    expect(bridge.pylons.length).toBeGreaterThanOrEqual(4);
    expect(bridge.cables.length).toBeGreaterThanOrEqual(12);

    for (const pier of bridge.piers) {
      const deckPoint = bridge.curve.getPointAt(pier.u);
      expect(pier.bottomY).toBeLessThan(WATER_LEVEL);
      expect(pier.topY).toBeGreaterThan(WATER_LEVEL);
      expect(pier.topY).toBeLessThanOrEqual(deckPoint.y - BRIDGE_DECK_THICKNESS + 1e-8);
      expect(Math.hypot(pier.position.x - deckPoint.x, pier.position.z - deckPoint.z))
        .toBeLessThan(1e-8);
    }

    for (let i = 0; i <= 256; i++) {
      const point = bridge.curve.getPoint(i / 256);
      expect(point.x).toBeGreaterThanOrEqual(WATER_BASIN.x0);
      expect(point.x).toBeLessThanOrEqual(WATER_BASIN.x1);
      expect(point.z).toBeGreaterThanOrEqual(WATER_BASIN.z0);
      expect(point.z).toBeLessThanOrEqual(WATER_BASIN.z1);
    }
    expect(CITY_GROUND_BOUNDS.z0).toBeGreaterThanOrEqual(WATER_BASIN.z1);
    expect(CITY_GROUND_BOUNDS.z0).toBeCloseTo(BRIDGE_CORRIDOR.z1, 6);
  });

  it('continues the visual deck beyond the semantic endpoint without extending the route', () => {
    const bridge = buildBridgeLayout();
    const routeEnd = sampleRoute(1).pos;
    const horizonStart = bridge.horizon.curve.getPoint(0);
    const horizonEnd = bridge.horizon.curve.getPoint(1);

    expect(routeEnd.toArray()).toEqual([240, 16, -1600]);
    expect(horizonStart.distanceTo(routeEnd)).toBeLessThan(1e-8);
    expect(horizonEnd.x).toBeCloseTo(routeEnd.x, 8);
    expect(horizonEnd.y).toBeCloseTo(routeEnd.y, 8);
    expect(horizonEnd.z).toBe(HORIZON_END_Z);
    expect(HORIZON_END_Z).toBeLessThanOrEqual(-2200);
    expect(bridge.horizon.rideable).toBe(false);
    expect(bridge.horizon.piers.length).toBeGreaterThanOrEqual(5);
    expect(BRIDGE_CORRIDOR.z0).toBeLessThan(HORIZON_END_Z);
    expect(WATER_BASIN.z0).toBeLessThan(HORIZON_END_Z);
  });
});

describe('finale keep-clear and moon composition', () => {
  it('protects the complete shoreline-to-horizon corridor from generated clutter', () => {
    expect(keepClear(240, -620)).toBe(true);
    expect(keepClear(240, -1600)).toBe(true);
    expect(keepClear(100, -620)).toBe(false);

    for (const placement of [...buildCityLayout(), ...buildSkyline()]) {
      const bounds = 'file' in placement
        ? buildingPlacementBounds(placement)
        : {
            file: 'procedural-skyline-box',
            center: placement.center,
            rotationY: placement.rotationY,
            scale: 1,
            radius: Math.hypot(placement.width, placement.depth) / 2,
            halfX: placement.width / 2,
            halfZ: placement.depth / 2,
            height: placement.height,
          };
      expect(
        protectedOrientedFootprintClearance(bounds),
        JSON.stringify(placement),
      ).toBeGreaterThan(0);
    }

    const points = [
      ...buildProps().map(({ position }) => ({ x: position[0], z: position[2], radius: 0 })),
      ...buildSignLayout().map(({ position, width }) => ({
        x: position[0],
        z: position[2],
        radius: width / 2,
      })),
      ...buildCrowdLayout().humans.map(({ x, z }) => ({ x, z, radius: 0.5 })),
      ...buildCrowdLayout().robots.map(({ x, z }) => ({ x, z, radius: 0.8 })),
      ...Object.values(buildStreetDressingLayout()).flat(),
    ];
    for (const point of points) {
      expect(
        bridgeCorridorFootprintClearance(point.x, point.z, point.radius),
        JSON.stringify(point),
      ).toBeGreaterThan(0);
    }

    const furniture = buildStreetFurniture();
    for (const item of [...furniture.lamps, ...furniture.poles]) {
      expect(bridgeCorridorFootprintClearance(item.pos.x, item.pos.z, 0.5))
        .toBeGreaterThan(0);
    }
    for (const cable of furniture.cables) {
      for (let i = 0; i <= 100; i++) {
        const point = cable.a.clone().lerp(cable.b, i / 100);
        expect(bridgeCorridorFootprintClearance(point.x, point.z, 0.1))
          .toBeGreaterThan(0);
      }
    }
  });

  it('keeps complete city massing and hologram parents out of open water', () => {
    const layout = buildCityLayout();
    const skyline = buildSkyline().map((box): OrientedBuildingBounds => ({
      file: 'procedural-skyline-box',
      center: box.center,
      rotationY: box.rotationY,
      scale: 1,
      radius: Math.hypot(box.width, box.depth) / 2,
      halfX: box.width / 2,
      halfZ: box.depth / 2,
      height: box.height,
    }));
    for (const bounds of [
      ...layout.map(buildingPlacementBounds),
      ...skyline,
    ]) {
      expect(intersectsWater(bounds), JSON.stringify(bounds)).toBe(false);
    }

    const holograms = buildSignLayout(layout)
      .filter((sign) => sign.mode === 'hologram');
    for (const sign of holograms) {
      const parentIndex = Number(sign.emitter.parentId.replace('building-', ''));
      const parentBounds = buildingPlacementBounds(layout[parentIndex]);
      expect(intersectsWater(parentBounds), JSON.stringify(sign)).toBe(false);
      for (const component of [sign.emitter, sign.beam, sign]) {
        expect(
          rectangleClearance(component.position[0], component.position[2], WATER_BASIN),
          JSON.stringify({ sign: sign.id, component }),
        ).toBeGreaterThan('radius' in component ? component.radius : sign.width / 2);
      }
    }
  });

  it('uses a cinematic NASA moon aligned with the final route', () => {
    expect(MOON_POS.toArray()).toEqual([240, 330, -3300]);
    expect(MOON_RADIUS).toBe(400);
    const endpoint = sampleRoute(1);
    const view = measureMoonView(endpoint.pos, endpoint.tangent, MOON_POS, MOON_RADIUS);

    expect(view.distance).toBeGreaterThan(1600);
    expect(view.distance).toBeLessThan(1800);
    expect(view.angularDiameterDeg).toBeGreaterThan(20);
    expect(view.angularDiameterDeg).toBeLessThan(30);
    expect(view.alignmentDeg).toBeLessThan(12);
    expect(Math.abs(MOON_POS.x - endpoint.pos.x)).toBeLessThan(1e-8);
  });
});
