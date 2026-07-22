import { describe, expect, it } from 'vitest';
import { buildCrowdLayout, ROBOT_FILES } from '../src/world/crowdLayout';
import {
  groundRoadEdgePoints,
  groundRoadMemberships,
  keepClear,
} from '../src/world/roads';

describe('crowd layout', () => {
  it('is deterministic for a given seed', () => {
    expect(buildCrowdLayout(4242)).toEqual(buildCrowdLayout(4242));
    expect(buildCrowdLayout(4243)).toEqual(buildCrowdLayout(4243));
    expect(buildCrowdLayout(4243)).not.toEqual(buildCrowdLayout(4242));
  });

  it('keeps every crowd member on its originating sidewalk away from endpoint caps', () => {
    const layout = buildCrowdLayout();
    for (const spot of [...layout.humans, ...layout.robots]) {
      const source = groundRoadMemberships(spot.x, spot.z)
        .find((membership) => membership.roadIndex === spot.roadIndex);
      expect(source?.withinSidewalkWidth, JSON.stringify({ spot, source })).toBe(true);
      expect(source?.endpointCap, JSON.stringify({ spot, source })).toBe(false);
      expect(keepClear(spot.x, spot.z), JSON.stringify(spot)).toBe(false);
    }
  });

  it('keeps every crowd member outside every other road and sidewalk', () => {
    const layout = buildCrowdLayout();
    for (const spot of [...layout.humans, ...layout.robots]) {
      const others = groundRoadMemberships(spot.x, spot.z)
        .filter((membership) => membership.roadIndex !== spot.roadIndex);
      for (const other of others) {
        expect(
          other.withinRoadOrSidewalk,
          JSON.stringify({ spot, other }),
        ).toBe(false);
      }
    }
  });

  it('identifies endpoint caps independently from sidewalk width', () => {
    const endpoint = groundRoadEdgePoints(6).find((edge) => edge.u === 0);
    expect(endpoint).toBeDefined();
    const x = endpoint!.pos.x + endpoint!.bin.x * (endpoint!.hw + 5);
    const z = endpoint!.pos.z + endpoint!.bin.z * (endpoint!.hw + 5);
    const membership = groundRoadMemberships(x, z)
      .find((candidate) => candidate.roadIndex === endpoint!.roadIndex);

    expect(membership?.withinSidewalkWidth).toBe(true);
    expect(membership?.endpointCap).toBe(true);
  });

  it('identifies another road at a geometric sidewalk intersection', () => {
    const mainRoadNearCrossing = groundRoadEdgePoints(1)
      .filter((edge) => edge.roadIndex === 0)
      .reduce((nearest, edge) =>
        Math.hypot(edge.pos.x + 60, edge.pos.z)
          < Math.hypot(nearest.pos.x + 60, nearest.pos.z)
          ? edge
          : nearest);
    const overlap = ([1, -1] as const)
      .map((side) => {
        const x = mainRoadNearCrossing.pos.x
          + mainRoadNearCrossing.bin.x * side * (mainRoadNearCrossing.hw + 5);
        const z = mainRoadNearCrossing.pos.z
          + mainRoadNearCrossing.bin.z * side * (mainRoadNearCrossing.hw + 5);
        return groundRoadMemberships(x, z);
      })
      .find((memberships) =>
        memberships.some((membership) =>
          membership.roadIndex === mainRoadNearCrossing.roadIndex
          && membership.withinSidewalkWidth)
        && memberships.some((membership) =>
          membership.roadIndex !== mainRoadNearCrossing.roadIndex
          && membership.withinRoadOrSidewalk));

    expect(overlap).toBeDefined();
  });

  it('keeps robots sparse while representing every robot model', () => {
    const layout = buildCrowdLayout();
    expect(layout.humans.length).toBeGreaterThanOrEqual(140);
    expect(layout.humans.length).toBeLessThanOrEqual(240);
    expect(layout.robots).toHaveLength(9);
    expect(layout.robots.length).toBeLessThan(layout.humans.length / 4);
    expect(new Set(layout.robots.map((robot) => robot.file))).toEqual(new Set(ROBOT_FILES));
  });
});
