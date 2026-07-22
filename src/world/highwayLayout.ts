import {
  pointOrientedFootprintClearance,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import {
  DECK_UNDERSIDE_OFFSET,
  ELEVATED_HIGHWAY_ID,
  ROADS,
  groundRoadMemberships,
  protectedFootprintClearance,
} from './roads';

export interface HighwayPillarCandidate {
  roadId: string;
  u: number;
  x: number;
  z: number;
  deckY: number;
  radius: number;
}

export interface HighwayPillar extends HighwayPillarCandidate {
  height: number;
}

export type HighwayPillarDecisionReason =
  | 'accepted'
  | 'ground-road-or-sidewalk'
  | 'protected-region'
  | 'building-obb';

export interface HighwayPillarDecision {
  accepted: boolean;
  reason: HighwayPillarDecisionReason;
  roadSidewalkMargin: number;
  protectedMargin: number;
  buildingObbMargin: number;
}

export const HIGHWAY_PILLAR_RADIUS = 3;
export const HIGHWAY_PILLAR_SPACING = 55;
export const GROUND_SIDEWALK_OFFSET = 9;

/** Pure, independently testable safety decision for one support candidate. */
export function evaluateHighwayPillarCandidate(
  candidate: HighwayPillarCandidate,
  buildings: readonly OrientedBuildingBounds[],
): HighwayPillarDecision {
  const roadSidewalkMargin = Math.min(...groundRoadMemberships(
    candidate.x,
    candidate.z,
  ).map((membership) =>
    membership.clearance - GROUND_SIDEWALK_OFFSET - candidate.radius));
  const protectedMargin = protectedFootprintClearance(
    candidate.x,
    candidate.z,
    candidate.radius,
  );
  const buildingObbMargin = buildings.length === 0
    ? Infinity
    : Math.min(...buildings.map((bounds) =>
      pointOrientedFootprintClearance(candidate, bounds) - candidate.radius));
  const reason: HighwayPillarDecisionReason = roadSidewalkMargin < 0
    ? 'ground-road-or-sidewalk'
    : protectedMargin <= 0
      ? 'protected-region'
      : buildingObbMargin <= 0
        ? 'building-obb'
        : 'accepted';
  return {
    accepted: reason === 'accepted',
    reason,
    roadSidewalkMargin,
    protectedMargin,
    buildingObbMargin,
  };
}

/** Pure support layout shared by collision tests and City rendering. */
export function buildHighwayPillarLayout(
  buildings: readonly OrientedBuildingBounds[],
  spacing = HIGHWAY_PILLAR_SPACING,
): HighwayPillar[] {
  const highway = ROADS.find(({ id }) => id === ELEVATED_HIGHWAY_ID);
  if (!highway) throw new Error(`Missing ${ELEVATED_HIGHWAY_ID}`);
  const segmentCount = Math.max(6, Math.floor(highway.curve.getLength() / spacing));
  const pillars: HighwayPillar[] = [];

  for (let index = 1; index < segmentCount; index++) {
    const u = index / segmentCount;
    const point = highway.curve.getPointAt(u);
    const radius = HIGHWAY_PILLAR_RADIUS;
    const deckY = point.y + highway.level;
    const candidate: HighwayPillarCandidate = {
      roadId: highway.id,
      u,
      x: point.x,
      z: point.z,
      deckY,
      radius,
    };
    if (!evaluateHighwayPillarCandidate(candidate, buildings).accepted) continue;
    pillars.push({
      ...candidate,
      height: deckY - DECK_UNDERSIDE_OFFSET,
    });
  }
  return pillars;
}
