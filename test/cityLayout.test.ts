import { describe, expect, it } from 'vitest';
import {
  buildCityLayout,
  buildProps,
  buildStreetFurniture,
  clearsOpenWater,
  placementCenter,
  type Placement,
} from '../src/world/cityLayout';
import {
  groundRoadClearance,
  groundRoadMemberships,
  keepClear,
  keepClearFootprint,
  overheadClearance,
  protectedOrientedFootprintClearance,
  protectedFootprintClearance,
  ROADS,
} from '../src/world/roads';
import {
  buildShibuyaSightCorridors,
  shibuyaPlazaClearance,
} from '../src/world/intersections';
import { buildCrowdLayout } from '../src/world/crowdLayout';
import {
  buildingPlacementBounds,
  orientedFootprintGap,
  orientedFootprintPerimeterPoints,
  orientedFootprintsOverlap,
  projectedFootprintHalfExtent,
  renderedPlacementBounds,
  segmentFootprintClearance,
} from '../src/world/buildingCatalog';

type ShibuyaWallPlacement = Placement & {
  layoutRole: 'shibuya-front' | 'shibuya-back';
  shibuyaApproach: 'west' | 'north' | 'east' | 'south';
  shibuyaSide: -1 | 1;
  shibuyaAlleyApplicable: boolean;
  roadIndex: number;
};

const isShibuyaWall = (p: Placement): p is ShibuyaWallPlacement =>
  ['shibuya-front', 'shibuya-back'].includes(
    (p as Placement & { layoutRole?: string }).layoutRole ?? '',
  );

const isLowBase = (p: Placement): boolean =>
  p.file.endsWith('KB3D_NEC_BldgLG_C_Base.glb')
  || p.file.endsWith('KB3D_NEC_BldgMD_A_Base.glb');

describe('city layout', () => {
  it('is deterministic', () => {
    expect(buildCityLayout(20260720)).toEqual(buildCityLayout(20260720));
  });

  it('calculates rendered placement centres', () => {
    expect(placementCenter({
      file: 'test.glb',
      position: [10, 0, 20],
      rotationY: 0,
      foot: 5,
      outDir: [0.6, -0.8],
    })).toEqual({ x: 13, z: 16 });
    expect(placementCenter({
      file: 'test.glb',
      position: [10, 0, 20],
      rotationY: 0,
      foot: 5,
      outDir: [0.6, -0.8],
      centerOffset: [2, -3],
    })).toEqual({ x: 12, z: 17 });
  });

  it('keeps every building outside roads and sidewalks', () => {
    for (const p of buildCityLayout()) {
      const bounds = buildingPlacementBounds(p);
      if (isShibuyaWall(p)) {
        for (const point of orientedFootprintPerimeterPoints(bounds, 8)) {
          for (const membership of groundRoadMemberships(point.x, point.z)) {
            expect(
              membership.clearance,
              JSON.stringify({ p, bounds, point, membership }),
            ).toBeGreaterThanOrEqual(10 - 1e-6);
          }
        }
        continue;
      }
      const memberships = groundRoadMemberships(bounds.center.x, bounds.center.z);
      for (const membership of memberships) {
        expect(
          membership.clearance,
          JSON.stringify({ p, bounds, membership }),
        ).toBeGreaterThanOrEqual(bounds.radius + 10);
      }
      expect(
        keepClear(bounds.center.x, bounds.center.z),
        JSON.stringify({ p, bounds }),
      ).toBe(false);
    }
  });

  it('rejects complete building footprints from plaza and stunt keep-clear geometry', () => {
    expect(keepClear(283, -38)).toBe(false);
    expect(keepClearFootprint(283, -38, 16)).toBe(true);

    for (const placement of buildCityLayout()) {
      const bounds = buildingPlacementBounds(placement);
      expect(
        protectedFootprintClearance(
          bounds.center.x,
          bounds.center.z,
          bounds.radius,
        ),
        JSON.stringify({ placement, bounds }),
      ).toBeGreaterThan(0);
      expect(
        keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius),
        JSON.stringify({ placement, bounds }),
      ).toBe(false);
    }
  });

  it('keeps the shared Shibuya plaza clear of generated scene clutter', () => {
    expect(keepClear(240, 0)).toBe(true);

    for (const placement of buildCityLayout()) {
      const center = placementCenter(placement);
      expect(
        shibuyaPlazaClearance(center.x, center.z),
        JSON.stringify(placement),
      ).toBeGreaterThanOrEqual((placement.foot ?? 0) + 1);
    }
    for (const placement of buildProps()) {
      expect(
        shibuyaPlazaClearance(placement.position[0], placement.position[2]),
        JSON.stringify(placement),
      ).toBeGreaterThan(0);
    }
    for (const spot of [
      ...buildCrowdLayout().humans,
      ...buildCrowdLayout().robots,
    ]) {
      expect(shibuyaPlazaClearance(spot.x, spot.z), JSON.stringify(spot)).toBeGreaterThan(0);
    }

    const furniture = buildStreetFurniture();
    for (const item of [...furniture.lamps, ...furniture.poles]) {
      expect(
        shibuyaPlazaClearance(item.pos.x, item.pos.z),
        JSON.stringify(item),
      ).toBeGreaterThan(0);
    }
    for (const cable of furniture.cables) {
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const x = cable.a.x + (cable.b.x - cable.a.x) * t;
        const z = cable.a.z + (cable.b.z - cable.a.z) * t;
        expect(
          shibuyaPlazaClearance(x, z),
          JSON.stringify(cable),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('replaces miniature turn infill with regular-scale Shibuya wall roles', () => {
    const layout = buildCityLayout();
    const walls = layout.filter(isShibuyaWall);
    const front = walls.filter(({ layoutRole }) => layoutRole === 'shibuya-front');
    const back = walls.filter(({ layoutRole }) => layoutRole === 'shibuya-back');

    expect(layout.some((p) =>
      (p as { layoutRole?: string }).layoutRole === 'turn-infill',
    )).toBe(false);
    expect(front.length).toBeGreaterThanOrEqual(8);
    expect(back.length).toBeGreaterThanOrEqual(4);
    for (const p of front) {
      expect(p.foot, JSON.stringify(p)).toBeGreaterThanOrEqual(14);
      expect(p.foot, JSON.stringify(p)).toBeLessThanOrEqual(18);
    }
    for (const p of back) {
      expect(p.foot, JSON.stringify(p)).toBeGreaterThanOrEqual(22);
      expect(p.foot, JSON.stringify(p)).toBeLessThanOrEqual(28);
      expect(buildingPlacementBounds(p).height, JSON.stringify(p))
        .toBeGreaterThanOrEqual(50);
    }
  });

  it('uses only medium, tall, and hero assets on Shibuya walls', () => {
    const forbidden = [
      'BldgSM_',
      'BldgLG_C_Base',
      'BldgMD_A_Base',
      'BldgMD_A_Main',
      'BldgMD_C_BuildingA',
    ];
    const walls = buildCityLayout().filter(isShibuyaWall);

    expect(walls).not.toHaveLength(0);
    for (const p of walls) {
      expect(
        forbidden.some((name) => p.file.includes(name)),
        JSON.stringify(p),
      ).toBe(false);
    }
  });

  it('derives each Shibuya facade anchor from its production approach road', () => {
    const expectedRoad = { west: 0, north: 3, east: 4, south: 0 } as const;
    const expectedRoadId = {
      west: 'main-route',
      north: 'shibuya-north',
      east: 'shibuya-east',
      south: 'main-route',
    } as const;

    for (const p of buildCityLayout()
      .filter(isShibuyaWall)
      .filter(({ layoutRole }) => layoutRole === 'shibuya-front')) {
      expect(p.roadIndex).toBe(expectedRoad[p.shibuyaApproach]);
      expect(p.roadId).toBe(expectedRoadId[p.shibuyaApproach]);
      expect(p.centerOffset, JSON.stringify(p)).toBeDefined();
      const bounds = buildingPlacementBounds(p);
      const outward = { x: p.outDir![0], z: p.outDir![1] };
      const radialExtent = projectedFootprintHalfExtent(bounds, outward);
      const nearFacade = {
        x: bounds.center.x - outward.x * radialExtent,
        z: bounds.center.z - outward.z * radialExtent,
      };
      const source = groundRoadMemberships(nearFacade.x, nearFacade.z)
        .find(({ roadIndex }) => roadIndex === p.roadIndex);
      expect(source?.endpointCap, JSON.stringify({ p, source })).toBe(false);
      expect(source?.clearance, JSON.stringify({ p, source }))
        .toBeCloseTo(10, 1);
      expect(Math.hypot(...(p.outDir ?? [0, 0])), JSON.stringify(p)).toBeCloseTo(1, 6);
    }
  });

  it('keeps complete Shibuya OBBs road, plaza, highway, and keep-clear safe', () => {
    for (const p of buildCityLayout().filter(isShibuyaWall)) {
      const bounds = buildingPlacementBounds(p);
      const perimeter = orientedFootprintPerimeterPoints(bounds, 8);
      for (const point of perimeter) {
        for (const membership of groundRoadMemberships(point.x, point.z)) {
          expect(
            membership.clearance,
            JSON.stringify({ p, bounds, point, membership }),
          ).toBeGreaterThanOrEqual(10 - 1e-6);
        }
        expect(overheadClearance(point.x, point.z), JSON.stringify({ p, point }))
          .toBeGreaterThanOrEqual(32);
      }
      expect(protectedOrientedFootprintClearance(bounds), JSON.stringify({ p, bounds }))
        .toBeGreaterThan(0);
    }
  });

  it('keeps paired back facades two to four metres behind front facades', () => {
    const walls = buildCityLayout().filter(isShibuyaWall);
    const fronts = walls.filter(({ layoutRole }) => layoutRole === 'shibuya-front');
    const backs = walls.filter(({ layoutRole }) => layoutRole === 'shibuya-back');
    const pairedBacks = backs.filter(({ shibuyaAlleyApplicable }) =>
      shibuyaAlleyApplicable);

    expect(pairedBacks.length).toBeGreaterThanOrEqual(4);
    for (const back of pairedBacks) {
      expect(back.shibuyaAlleyApplicable, JSON.stringify(back)).toBe(true);
      const backBounds = buildingPlacementBounds(back);
      const backMembership = groundRoadMemberships(backBounds.center.x, backBounds.center.z)
        .find(({ roadIndex }) => roadIndex === back.roadIndex)!;
      const matching = fronts
        .filter((front) =>
          front.shibuyaApproach === back.shibuyaApproach
          && front.shibuyaSide === back.shibuyaSide)
        .map((front) => {
          const bounds = buildingPlacementBounds(front);
          const membership = groundRoadMemberships(bounds.center.x, bounds.center.z)
            .find(({ roadIndex }) => roadIndex === front.roadIndex)!;
          return { front, bounds, deltaU: Math.abs(membership.u - backMembership.u) };
        })
        .sort((a, b) => a.deltaU - b.deltaU)[0];

      expect(matching, JSON.stringify(back)).toBeDefined();
      expect(
        matching.deltaU * ROADS[back.roadIndex].curve.getLength(),
        JSON.stringify({ back, front: matching.front }),
      ).toBeLessThan(1);
      const outward = { x: back.outDir![0], z: back.outDir![1] };
      const frontBackFacade = matching.bounds.center.x * outward.x
        + matching.bounds.center.z * outward.z
        + projectedFootprintHalfExtent(matching.bounds, outward);
      const backNearFacade = backBounds.center.x * outward.x
        + backBounds.center.z * outward.z
        - projectedFootprintHalfExtent(backBounds, outward);
      const alley = backNearFacade - frontBackFacade;
      expect(alley, JSON.stringify({ back, front: matching.front })).toBeGreaterThanOrEqual(2);
      expect(alley, JSON.stringify({ back, front: matching.front })).toBeLessThanOrEqual(4);
    }
  });

  it('places a safe east back tower near approach distance eighty', () => {
    const eastBack = buildCityLayout().filter(isShibuyaWall)
      .filter(({ layoutRole, shibuyaApproach }) =>
        layoutRole === 'shibuya-back' && shibuyaApproach === 'east');
    expect(eastBack).not.toHaveLength(0);
    expect(eastBack.some((placement) => {
      const bounds = buildingPlacementBounds(placement);
      const source = groundRoadMemberships(bounds.center.x, bounds.center.z)
        .find(({ roadIndex }) => roadIndex === placement.roadIndex)!;
      const distance = source.u * ROADS[placement.roadIndex].curve.getLength();
      return distance >= 70 && distance <= 85;
    })).toBe(true);
  });

  it('reports all approach roles and preserves continuous side chains', () => {
    const walls = buildCityLayout().filter(isShibuyaWall);
    const front = walls.filter(({ layoutRole }) => layoutRole === 'shibuya-front');
    expect(new Set(walls.map(({ shibuyaApproach }) => shibuyaApproach))).toEqual(
      new Set(['west', 'north', 'east', 'south']),
    );
    expect(new Set(front.map(({ shibuyaApproach }) => shibuyaApproach))).toEqual(
      new Set(['west', 'north', 'east', 'south']),
    );
    const south = walls.filter(({ shibuyaApproach }) => shibuyaApproach === 'south');
    expect(south.length).toBeGreaterThan(1);
    expect(south.some(({ layoutRole }) => layoutRole === 'shibuya-front')).toBe(true);
    expect(south.some(({ layoutRole }) => layoutRole === 'shibuya-back')).toBe(true);
    expect(south.every(({ foot }) => (foot ?? 0) >= 14)).toBe(true);

    const chains = new Map<string, ShibuyaWallPlacement[]>();
    for (const p of walls) {
      if (p.layoutRole === 'shibuya-back' && !p.shibuyaAlleyApplicable) continue;
      const key = `${p.layoutRole}:${p.shibuyaApproach}:${p.shibuyaSide}`;
      const chain = chains.get(key) ?? [];
      chain.push(p);
      chains.set(key, chain);
    }
    const continuousKeys = new Set(
      [...chains].filter(([, chain]) => chain.length >= 2).map(([key]) => key),
    );
    const retainedContinuousKeys = [
      'shibuya-front:west:1',
      'shibuya-front:north:-1',
      'shibuya-front:north:1',
      'shibuya-front:east:-1',
      'shibuya-front:east:1',
      'shibuya-back:west:1',
      'shibuya-back:north:-1',
    ];
    expect(retainedContinuousKeys.every((key) => continuousKeys.has(key))).toBe(true);

    let measuredGapCount = 0;
    for (const chain of chains.values()) {
      chain.sort((a, b) => {
        const ac = placementCenter(a);
        const bc = placementCenter(b);
        const au = groundRoadMemberships(ac.x, ac.z)
          .find(({ roadIndex }) => roadIndex === a.roadIndex)?.u ?? 0;
        const bu = groundRoadMemberships(bc.x, bc.z)
          .find(({ roadIndex }) => roadIndex === b.roadIndex)?.u ?? 0;
        return au - bu;
      });
      for (let i = 1; i < chain.length; i++) {
        const previousBounds = buildingPlacementBounds(chain[i - 1]);
        const currentBounds = buildingPlacementBounds(chain[i]);
        const gap = orientedFootprintGap(previousBounds, currentBounds);
        expect(gap, JSON.stringify({ previous: chain[i - 1], current: chain[i] }))
          .toBeGreaterThanOrEqual(0);
        expect(gap, JSON.stringify({ previous: chain[i - 1], current: chain[i] }))
          .toBeLessThanOrEqual(6);
        measuredGapCount++;
      }
    }
    expect(measuredGapCount).toBeGreaterThanOrEqual(4);
  });

  it('leaves a broad central opening around the complete plaza', () => {
    const walls = buildCityLayout().filter(isShibuyaWall);
    const nearestFacadeRadius = Math.min(...walls.map((p) =>
      Math.hypot(p.position[0] - 240, p.position[2])));

    expect(nearestFacadeRadius).toBeGreaterThan(40);
    expect(Math.min(...walls.map((p) =>
      shibuyaPlazaClearance(p.position[0], p.position[2])))).toBeGreaterThan(6);
  });

  it('retains deterministic ordinary-building density floors by district zone', () => {
    const ordinary = buildCityLayout().filter(({ layoutRole }) =>
      !layoutRole?.startsWith('shibuya-'));
    const count = (predicate: (center: { x: number; z: number }) => boolean): number =>
      ordinary.filter((placement) =>
        predicate(buildingPlacementBounds(placement).center)).length;

    expect(ordinary.length).toBe(280);
    expect(count(({ x, z }) => z > -160 && x < 120)).toBeGreaterThanOrEqual(80);
    expect(count(({ x, z }) => z > -160 && x >= 120)).toBeGreaterThanOrEqual(6);
    expect(count(({ z }) => z <= -160)).toBeGreaterThanOrEqual(170);
  });

  it('keeps every city building footprint outside all crossing sight corridors', () => {
    const corridors = buildShibuyaSightCorridors();
    for (const placement of buildCityLayout()) {
      const bounds = buildingPlacementBounds(placement);
      for (const corridor of corridors) {
        expect(
          segmentFootprintClearance(corridor.start, corridor.end, bounds)
            - corridor.halfWidth,
          JSON.stringify({ placement, corridor, bounds }),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('uses the overlooked BuildingA tower section', () => {
    expect(buildCityLayout().some((p) =>
      p.file.endsWith('KB3D_NEC_BldgLG_A_BuildingA.glb'),
    )).toBe(true);
  });

  it('uses both overlooked low-rise base sections as safe podium backfill', () => {
    const bases = [
      'KB3D_NEC_BldgLG_C_Base.glb',
      'KB3D_NEC_BldgMD_A_Base.glb',
    ];
    const layout = buildCityLayout();

    for (const base of bases) {
      expect(layout.some((p) => p.file.endsWith(base))).toBe(true);
    }
  });

  it('keeps every low-base podium two metres clear of every other placement', () => {
    const layout = buildCityLayout();
    const lowBases = layout.filter(isLowBase);
    expect(lowBases.length).toBeGreaterThanOrEqual(2);

    for (const lowBase of lowBases) {
      for (const other of layout) {
        if (lowBase === other) continue;
        const a = buildingPlacementBounds(lowBase);
        const b = buildingPlacementBounds(other);
        expect(
          orientedFootprintsOverlap(a, b, 2),
          JSON.stringify({ lowBase, other }),
        ).toBe(false);
      }
    }
  });

  it('keeps service dressing sparse and behind every road sidewalk', () => {
    const serviceFiles = [
      'props/quat_ac.glb',
      'props/quat_ac_stacked.glb',
      'props/quat_antenna_1.glb',
      'props/quat_antenna_2.glb',
      'props/quat_sign_1.glb',
      'props/quat_sign_3.glb',
    ];
    const service = buildProps().filter((p) => serviceFiles.includes(p.file));

    expect(buildProps()).toEqual(buildProps());
    expect(service.length).toBeGreaterThanOrEqual(serviceFiles.length);
    expect(service.length).toBeLessThanOrEqual(16);
    expect(new Set(service.map((p) => p.file))).toEqual(new Set(serviceFiles));

    for (const p of service) {
      const [x, , z] = p.position;
      const memberships = groundRoadMemberships(x, z);
      const sourceMemberships = memberships.filter((membership) =>
        !membership.endpointCap
        && membership.clearance >= 11.5
        && membership.clearance <= 14,
      );
      expect(groundRoadClearance(x, z), JSON.stringify(p)).toBeGreaterThanOrEqual(10);
      expect(keepClear(x, z), JSON.stringify(p)).toBe(false);
      expect(sourceMemberships.length, JSON.stringify({ p, memberships })).toBe(1);
      expect(
        memberships.some((membership) => membership.withinRoadOrSidewalk),
        JSON.stringify(p),
      ).toBe(false);
    }
  });

  it('retains exact source-road safety for every generated prop', () => {
    for (const p of buildProps()) {
      const [x, , z] = p.position;
      const memberships = groundRoadMemberships(x, z);
      const source = memberships.find(({ roadIndex }) => roadIndex === p.roadIndex);
      expect(source, JSON.stringify(p)).toBeDefined();
      expect(source?.endpointCap, JSON.stringify({ p, source })).toBe(false);
      expect(source?.clearance, JSON.stringify({ p, source })).toBeGreaterThanOrEqual(3);
      expect(
        memberships.some(({ roadIndex, withinRoadOrSidewalk }) =>
          roadIndex !== p.roadIndex && withinRoadOrSidewalk),
        JSON.stringify({ p, memberships }),
      ).toBe(false);
      expect(keepClear(x, z), JSON.stringify(p)).toBe(false);
    }
  });

  it('keeps every complete rendered prop OBB outside unsafe geometry', () => {
    const props = buildProps();
    expect(props.some(({ file }) => file.endsWith('KB3D_NEC_BldgLG_A_Tree.glb')))
      .toBe(true);
    for (const placement of props) {
      const bounds = renderedPlacementBounds(placement);
      const memberships = groundRoadMemberships(bounds.center.x, bounds.center.z);
      expect(
        memberships.every(({ roadIndex, clearance, endpointCap }) =>
          clearance >= bounds.radius + 9
          && (roadIndex !== placement.roadIndex || !endpointCap)),
        JSON.stringify({ placement, bounds, memberships }),
      ).toBe(true);
      expect(
        shibuyaPlazaClearance(bounds.center.x, bounds.center.z),
        JSON.stringify({ placement, bounds }),
      ).toBeGreaterThan(bounds.radius);
      expect(
        protectedOrientedFootprintClearance(bounds),
        JSON.stringify({ placement, bounds }),
      ).toBeGreaterThan(0);
      expect(clearsOpenWater(bounds), JSON.stringify({ placement, bounds })).toBe(true);
      for (const corridor of buildShibuyaSightCorridors()) {
        expect(
          segmentFootprintClearance(corridor.start, corridor.end, bounds),
          JSON.stringify({ placement, bounds, corridor }),
        ).toBeGreaterThan(corridor.halfWidth);
      }
    }
  });

  it('retains exact source-road safety for every lamp, pole, and cable endpoint', () => {
    const furniture = buildStreetFurniture();
    const assertSafe = (pos: { x: number; z: number }, roadIndex: number): void => {
      const memberships = groundRoadMemberships(pos.x, pos.z);
      const source = memberships.find((membership) => membership.roadIndex === roadIndex);
      expect(source, JSON.stringify({ pos, roadIndex })).toBeDefined();
      expect(source?.endpointCap, JSON.stringify({ pos, source })).toBe(false);
      expect(source?.clearance, JSON.stringify({ pos, source })).toBeGreaterThanOrEqual(1);
      expect(
        memberships.some((membership) =>
          membership.roadIndex !== roadIndex && membership.withinRoadOrSidewalk),
        JSON.stringify({ pos, roadIndex, memberships }),
      ).toBe(false);
    };

    for (const lamp of furniture.lamps) assertSafe(lamp.pos, lamp.roadIndex);
    for (const rawPole of furniture.poles) {
      const pole = rawPole as unknown as { pos: { x: number; z: number }; roadIndex: number };
      assertSafe(pole.pos, pole.roadIndex);
    }
    for (const cable of furniture.cables) {
      const sourcedCable = cable as typeof cable & { aRoadIndex: number; bRoadIndex: number };
      assertSafe(cable.a, sourcedCable.aRoadIndex);
      assertSafe(cable.b, sourcedCable.bRoadIndex);
    }
  });
});
