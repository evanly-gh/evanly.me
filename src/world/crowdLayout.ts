import { makeRng } from '../assets/rng';
import { groundRoadEdgePoints, groundRoadMemberships, keepClear } from './roads';

export interface CrowdSpot {
  x: number;
  z: number;
  r: number;
  roadIndex: number;
}

export interface RobotSpot extends CrowdSpot {
  file: string;
}

export interface CrowdLayout {
  humans: CrowdSpot[];
  robots: RobotSpot[];
}

export const ROBOT_FILES = [
  'props/robot_companion.glb',
  'props/robot_recon.glb',
  'props/robot_storage.glb',
] as const;

const isClearSidewalk = (x: number, z: number, sourceRoadIndex: number): boolean => {
  if (keepClear(x, z)) return false;
  const memberships = groundRoadMemberships(x, z);
  const source = memberships.find(({ roadIndex }) => roadIndex === sourceRoadIndex);
  return source?.withinSidewalkWidth === true
    && !source.endpointCap
    && memberships.every(({ roadIndex, withinRoadOrSidewalk }) =>
      roadIndex === sourceRoadIndex || !withinRoadOrSidewalk);
};

export function buildCrowdLayout(seed = 4242): CrowdLayout {
  const rng = makeRng(seed);
  const humans: CrowdSpot[] = [];
  const robots: RobotSpot[] = [];

  // Twelve-metre sampling keeps both sidewalks visibly occupied while bounding
  // the static human instance budget well below the former 409 placements.
  for (const edge of groundRoadEdgePoints(12)) {
    if (edge.pos.z < -560) continue;
    for (const side of [1, -1] as const) {
      if (rng.chance(0.28)) continue;
      const count = 1 + rng.int(0, 1);
      for (let i = 0; i < count; i++) {
        const offset = edge.hw + 1.5 + rng.range(0, 6.5);
        const along = rng.range(-2.5, 2.5);
        const x = edge.pos.x + edge.bin.x * side * offset + edge.tan.x * along;
        const z = edge.pos.z + edge.bin.z * side * offset + edge.tan.z * along;
        if (isClearSidewalk(x, z, edge.roadIndex)) {
          humans.push({ x, z, r: rng.range(0, Math.PI * 2), roadIndex: edge.roadIndex });
        }
      }
    }
  }

  for (const edge of groundRoadEdgePoints(42)) {
    if (robots.length === 9 || edge.pos.z < -560) continue;
    for (const side of [1, -1] as const) {
      if (robots.length === 9) break;
      const offset = edge.hw + 2.5 + rng.range(0, 4.5);
      const along = rng.range(-2, 2);
      const x = edge.pos.x + edge.bin.x * side * offset + edge.tan.x * along;
      const z = edge.pos.z + edge.bin.z * side * offset + edge.tan.z * along;
      if (!isClearSidewalk(x, z, edge.roadIndex)) continue;
      if ([...humans, ...robots].some((spot) => Math.hypot(spot.x - x, spot.z - z) < 2.5)) continue;
      robots.push({
        x,
        z,
        r: rng.range(0, Math.PI * 2),
        roadIndex: edge.roadIndex,
        file: ROBOT_FILES[robots.length % ROBOT_FILES.length],
      });
    }
  }

  return { humans, robots };
}
