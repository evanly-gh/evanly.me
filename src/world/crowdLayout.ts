import { makeRng } from '../assets/rng';
import { groundRoadEdgePoints, groundRoadMemberships, keepClear } from './roads';
import { researchCorridorPointClearance } from './researchSightlines';

export interface CrowdSpot {
  x: number;
  z: number;
  r: number;
  roadIndex: number;
}

export const HUMAN_FILE = 'props/ped_char.glb' as const;

export const HUMAN_VARIANTS = [
  {
    id: 'courier',
    file: HUMAN_FILE,
    height: 1.72,
    buildScale: 0.94,
    skin: '#8f5f45',
    hair: '#1b1210',
    jacket: '#4d5c62',
    shirt: '#c2b08c',
    pants: '#252b30',
    accent: '#9a6a39',
  },
  {
    id: 'commuter',
    file: HUMAN_FILE,
    height: 1.68,
    buildScale: 0.92,
    skin: '#d9a177',
    hair: '#291c18',
    jacket: '#675b62',
    shirt: '#b8b2a7',
    pants: '#31333a',
    accent: '#7c6558',
  },
  {
    id: 'technician',
    file: HUMAN_FILE,
    height: 1.78,
    buildScale: 0.96,
    skin: '#6f452f',
    hair: '#120f12',
    jacket: '#42524f',
    shirt: '#8e9b91',
    pants: '#292f2d',
    accent: '#7a6642',
  },
  {
    id: 'nightlife',
    file: HUMAN_FILE,
    height: 1.7,
    buildScale: 0.95,
    skin: '#b87552',
    hair: '#30172d',
    jacket: '#594d61',
    shirt: '#a98791',
    pants: '#2d2931',
    accent: '#8e635f',
  },
  {
    id: 'worker',
    file: HUMAN_FILE,
    height: 1.82,
    buildScale: 1.06,
    skin: '#c98b61',
    hair: '#36241d',
    jacket: '#665d48',
    shirt: '#b3a57e',
    pants: '#34322b',
    accent: '#9a743f',
  },
  {
    id: 'security',
    file: HUMAN_FILE,
    height: 1.85,
    buildScale: 1.08,
    skin: '#7f5037',
    hair: '#15171d',
    jacket: '#343941',
    shirt: '#7d858b',
    pants: '#20242a',
    accent: '#6b6252',
  },
] as const;

export type HumanVariant = (typeof HUMAN_VARIANTS)[number];
export type HumanVariantId = HumanVariant['id'];

export interface HumanSpot extends CrowdSpot {
  variant: HumanVariantId;
  materialVariant: HumanVariantId;
  file: HumanVariant['file'];
  height: number;
  buildScale: number;
  skin: string;
  hair: string;
  jacket: string;
  shirt: string;
  pants: string;
  accent: string;
}

export interface RobotSpot extends CrowdSpot {
  file: string;
}

export interface CrowdLayout {
  humans: HumanSpot[];
  robots: RobotSpot[];
}

export const ROBOT_FILES = [
  'props/robot_companion.glb',
  'props/robot_recon.glb',
  'props/robot_storage.glb',
] as const;

const isClearSidewalk = (x: number, z: number, sourceRoadIndex: number): boolean => {
  if (keepClear(x, z)) return false;
  if (researchCorridorPointClearance({ x, z }, 0.65) <= 0) return false;
  const memberships = groundRoadMemberships(x, z);
  const source = memberships.find(({ roadIndex }) => roadIndex === sourceRoadIndex);
  return source?.withinSidewalkWidth === true
    && !source.endpointCap
    && memberships.every(({ roadIndex, withinRoadOrSidewalk }) =>
      roadIndex === sourceRoadIndex || !withinRoadOrSidewalk);
};

export function buildCrowdLayout(seed = 4242): CrowdLayout {
  const rng = makeRng(seed);
  const styleRng = makeRng(seed ^ 0x5f3759df);
  const humans: HumanSpot[] = [];
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
          const variant = HUMAN_VARIANTS[
            styleRng.int(0, HUMAN_VARIANTS.length - 1)
          ];
          const { id: variantId, ...style } = variant;
          humans.push({
            x,
            z,
            r: rng.range(0, Math.PI * 2),
            roadIndex: edge.roadIndex,
            ...style,
            variant: variantId,
            materialVariant: variantId,
          });
        }
      }
    }
  }

  for (const edge of groundRoadEdgePoints(28)) {
    if (robots.length === 18 || edge.pos.z < -560) continue;
    for (const side of [1, -1] as const) {
      if (robots.length === 18) break;
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
