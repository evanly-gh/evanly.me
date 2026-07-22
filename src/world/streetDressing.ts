import { makeRng } from '../assets/rng';
import { shibuyaPlazaClearance } from './intersections';
import { groundRoadEdgePoints, groundRoadMemberships } from './roads';

export type StreetDressingKind = 'manhole' | 'can' | 'cone';
export type StreetDressingSurface = 'road' | 'sidewalk';

export interface StreetDressingSpot {
  kind: StreetDressingKind;
  surface: StreetDressingSurface;
  x: number;
  z: number;
  radius: number;
  roadIndex: number;
  rotationY: number;
}

export interface StreetDressingLayout {
  manholes: StreetDressingSpot[];
  cans: StreetDressingSpot[];
  cones: StreetDressingSpot[];
}

function footprintIsSafe(spot: StreetDressingSpot): boolean {
  if (shibuyaPlazaClearance(spot.x, spot.z) <= spot.radius) return false;
  const centerMemberships = groundRoadMemberships(spot.x, spot.z);
  const centerSource = centerMemberships.find(({ roadIndex }) =>
    roadIndex === spot.roadIndex);
  if (!centerSource || centerSource.endpointCap) return false;
  if (spot.surface === 'road') {
    if (centerSource.clearance > -spot.radius) return false;
  } else if (
    centerSource.clearance < 1 + spot.radius
    || centerSource.clearance > 9 - spot.radius
  ) {
    return false;
  }
  if (centerMemberships.some(({ roadIndex, clearance }) =>
    roadIndex !== spot.roadIndex && clearance <= 9 + spot.radius)) return false;

  const samples = [
    { x: spot.x, z: spot.z },
    ...Array.from({ length: 16 }, (_, sample) => {
      const angle = sample * Math.PI * 2 / 16;
      return {
        x: spot.x + Math.cos(angle) * spot.radius,
        z: spot.z + Math.sin(angle) * spot.radius,
      };
    }),
  ];
  for (const { x, z } of samples) {
    if (shibuyaPlazaClearance(x, z) <= 0) return false;

    const memberships = groundRoadMemberships(x, z);
    const source = memberships.find(({ roadIndex }) => roadIndex === spot.roadIndex);
    if (!source || source.endpointCap) return false;
    if (spot.surface === 'road') {
      if (source.clearance > 0) return false;
    } else if (!source.withinSidewalkWidth) {
      return false;
    }
    if (memberships.some(({ roadIndex, withinRoadOrSidewalk }) =>
      roadIndex !== spot.roadIndex && withinRoadOrSidewalk)) return false;
  }
  return true;
}

export function buildStreetDressingLayout(seed = 70): StreetDressingLayout {
  const rng = makeRng(seed);
  const manholes: StreetDressingSpot[] = [];
  const cans: StreetDressingSpot[] = [];
  const cones: StreetDressingSpot[] = [];

  for (const edge of groundRoadEdgePoints(26)) {
    if (rng.chance(0.6)) {
      const spot: StreetDressingSpot = {
        kind: 'manhole',
        surface: 'road',
        x: edge.pos.x + edge.bin.x * rng.range(-4, 4),
        z: edge.pos.z + edge.bin.z * rng.range(-4, 4),
        radius: 1.1,
        roadIndex: edge.roadIndex,
        rotationY: 0,
      };
      if (footprintIsSafe(spot)) manholes.push(spot);
    }

    for (const side of [1, -1] as const) {
      if (!rng.chance(0.8)) continue;
      const offset = edge.hw + 6;
      const spot: StreetDressingSpot = {
        kind: 'can',
        surface: 'sidewalk',
        x: edge.pos.x + edge.bin.x * side * offset,
        z: edge.pos.z + edge.bin.z * side * offset,
        radius: 0.55,
        roadIndex: edge.roadIndex,
        rotationY: rng.range(0, Math.PI * 2),
      };
      if (footprintIsSafe(spot)) cans.push(spot);
    }
  }

  for (let z = -40; z >= -110; z -= 6) {
    const spot: StreetDressingSpot = {
      kind: 'cone',
      surface: 'road',
      x: 244,
      z,
      radius: 0.4,
      roadIndex: 0,
      rotationY: 0,
    };
    if (footprintIsSafe(spot)) cones.push(spot);
  }

  return { manholes, cans, cones };
}
