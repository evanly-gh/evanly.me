import * as THREE from 'three';
import {
  buildingPlacementBounds,
  orientedFootprintGap,
  projectedFootprintHalfExtent,
} from './buildingCatalog';
import { roadFrame } from './route';

export type ResearchVector = [number, number, number];
export type ResearchSide = -1 | 1;
export type ResearchWallRow = 'front' | 'back';

export const RESEARCH_ROUTE = Object.freeze({
  startT: 0.69,
  straightStartT: 0.7,
  endT: 0.84,
  centerX: 240,
  startZ: -360,
  straightStartZ: -375,
  endZ: -600,
  deckHalfWidth: 11,
  sidewalkOuterOffset: 20,
});

export interface ResearchWallPlacement {
  id: string;
  file: string;
  position: ResearchVector;
  rotationY: number;
  scale: 1;
  centerOffset: [number, number];
  outDir: [number, number];
  layoutRole: 'research-front' | 'research-back';
  row: ResearchWallRow;
  side: ResearchSide;
  sourceT: number;
  roadId: 'main-route';
  roadIndex: 0;
}

const FRONT_FILE = 'neocity/KB3D_NEC_BldgLG_A_BuildingA.glb';
const BACK_HERO_B = 'neocity/KB3D_NEC_BldgLG_B_Main.glb';
const BACK_HERO_C = 'neocity/KB3D_NEC_BldgLG_C_Main.glb';
const FRONT_Z = Array.from({ length: 14 }, (_, index) => -378 - index * 16);
const FRONT_ALLEY = 1;
const BACK_ALLEY = 2;
const BACK_GAP = 7.5;

interface BackWallSpec {
  file: string;
  z: number;
}

function buildBackWallSpecs(side: ResearchSide): BackWallSpec[] {
  const files = side === -1
    ? [BACK_HERO_C, BACK_HERO_B, BACK_HERO_C, BACK_HERO_B, BACK_HERO_C]
    : [BACK_HERO_B, BACK_HERO_C, BACK_HERO_B, BACK_HERO_C, BACK_HERO_B];
  let northEdge = side === -1 ? -364 : -360;
  return files.map((file) => {
    const bounds = buildingPlacementBounds({
      file,
      position: [0, 0, 0],
      rotationY: 0,
      scale: 1,
      centerOffset: [0, 0],
    });
    const z = northEdge - bounds.halfZ;
    northEdge = z - bounds.halfZ - BACK_GAP;
    return { file, z };
  });
}

function semanticTAtZ(z: number): number {
  if (z > RESEARCH_ROUTE.straightStartZ) {
    const targetFraction = THREE.MathUtils.clamp(
      (RESEARCH_ROUTE.startZ - z)
        / (RESEARCH_ROUTE.startZ - RESEARCH_ROUTE.straightStartZ),
      0,
      1,
    );
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (lower + upper) / 2;
      const smoothed = middle * middle * (3 - 2 * middle);
      if (smoothed < targetFraction) lower = middle;
      else upper = middle;
    }
    return THREE.MathUtils.lerp(
      RESEARCH_ROUTE.startT,
      RESEARCH_ROUTE.straightStartT,
      (lower + upper) / 2,
    );
  }
  return THREE.MathUtils.clamp(THREE.MathUtils.lerp(
    RESEARCH_ROUTE.straightStartT,
    RESEARCH_ROUTE.endT,
    (RESEARCH_ROUTE.straightStartZ - z)
      / (RESEARCH_ROUTE.straightStartZ - RESEARCH_ROUTE.endZ),
  ), RESEARCH_ROUTE.straightStartT, RESEARCH_ROUTE.endT);
}

function wallAt(
  row: ResearchWallRow,
  side: ResearchSide,
  z: number,
  index: number,
  fileOverride?: string,
): ResearchWallPlacement {
  const sourceT = semanticTAtZ(z);
  const frame = roadFrame(sourceT);
  const file = fileOverride ?? FRONT_FILE;
  const roadAlignedRotation = Math.atan2(-frame.tangent.z, frame.tangent.x);
  const rotationY = row === 'front' ? roadAlignedRotation : 0;
  const probe = {
    file,
    position: [0, 0, 0] as ResearchVector,
    rotationY,
    centerOffset: [0, 0] as [number, number],
  };
  const bounds = buildingPlacementBounds(probe);
  const lateralExtent = projectedFootprintHalfExtent(bounds, frame.binormal);
  const frontProbe = buildingPlacementBounds({
    file: FRONT_FILE,
    position: [0, 0, 0],
    rotationY: roadAlignedRotation,
    scale: 1,
    centerOffset: [0, 0],
  });
  const frontExtent = projectedFootprintHalfExtent(
    frontProbe,
    frame.binormal,
  );
  const lateral = row === 'front'
    ? RESEARCH_ROUTE.sidewalkOuterOffset + FRONT_ALLEY + lateralExtent
    : RESEARCH_ROUTE.sidewalkOuterOffset
      + FRONT_ALLEY
      + frontExtent * 2
      + BACK_ALLEY
      + lateralExtent;
  const landingTransitionClearance = index === 0
    ? side > 0
      ? row === 'front' ? 22 : 6
      : row === 'front' ? 5 : 0
    : 0;
  const center = frame.pos.clone().addScaledVector(
    frame.binormal,
    side * (lateral + landingTransitionClearance),
  );
  return Object.freeze({
    id: `research-${row}-${side < 0 ? 'west' : 'east'}-${index + 1}`,
    file,
    position: [center.x, 0, center.z] as ResearchVector,
    rotationY,
    scale: 1,
    centerOffset: [0, 0] as [number, number],
    outDir: [side, 0] as [number, number],
    layoutRole: `research-${row}`,
    row,
    side,
    sourceT,
    roadId: 'main-route',
    roadIndex: 0,
  });
}

export const RESEARCH_WALLS: readonly ResearchWallPlacement[] = Object.freeze(
  ([-1, 1] as const).flatMap((side) => [
    ...FRONT_Z.map((z, index) => wallAt('front', side, z, index)),
    ...buildBackWallSpecs(side).map(({ file, z }, index) =>
      wallAt('back', side, z, index, file)),
  ]),
);

export interface ResearchWallGap {
  id: string;
  row: ResearchWallRow;
  side: ResearchSide;
  gap: number;
}

export function measureResearchWallGaps(): ResearchWallGap[] {
  return (['front', 'back'] as const).flatMap((row) =>
    ([-1, 1] as const).flatMap((side) => {
      const walls = RESEARCH_WALLS
        .filter((wall) => wall.row === row && wall.side === side)
        .sort((first, second) => second.position[2] - first.position[2]);
      return walls.slice(1).map((wall, index) => ({
        id: `${walls[index].id}/${wall.id}`,
        row,
        side,
        gap: orientedFootprintGap(
          buildingPlacementBounds(walls[index]),
          buildingPlacementBounds(wall),
        ),
      }));
    }));
}

export interface ResearchGatewayMember {
  id: string;
  buildingId: string;
  center: ResearchVector;
  scale: ResearchVector;
}

export interface ResearchGateway {
  id: string;
  center: ResearchVector;
  undersideY: number;
  clearWidth: number;
  beam: {
    center: ResearchVector;
    scale: ResearchVector;
  };
  supports: ResearchGatewayMember[];
  ties: ResearchGatewayMember[];
}

function gatewayAt(index: number, z: number): ResearchGateway {
  const west = RESEARCH_WALLS.find((wall) =>
    wall.row === 'front'
    && wall.side === -1
    && Math.abs(wall.position[2] - z) < 1e-6);
  const east = RESEARCH_WALLS.find((wall) =>
    wall.row === 'front'
    && wall.side === 1
    && Math.abs(wall.position[2] - z) < 1e-6);
  if (!west || !east) throw new Error(`Missing Research gateway walls at z=${z}`);
  const undersideY = 27;
  const beamHeight = 3;
  const westFacade = buildingPlacementBounds(west).center.x
    + projectedFootprintHalfExtent(
      buildingPlacementBounds(west),
      { x: 1, z: 0 },
    );
  const eastFacade = buildingPlacementBounds(east).center.x
    - projectedFootprintHalfExtent(
      buildingPlacementBounds(east),
      { x: 1, z: 0 },
    );
  const clearWidth = eastFacade - westFacade;
  const supports = [
    { wall: west, x: westFacade - 0.5 },
    { wall: east, x: eastFacade + 0.5 },
  ].map(({ wall, x }, supportIndex): ResearchGatewayMember => ({
    id: `research-gateway-${index}:support-${supportIndex + 1}`,
    buildingId: wall.id,
    center: [x, undersideY / 2, z],
    scale: [1, undersideY, 1.4],
  }));
  const ties = supports.flatMap((support, supportIndex) => {
    const wall = supportIndex === 0 ? west : east;
    return [12, 22].map((y, tieIndex): ResearchGatewayMember => {
      const length = Math.abs(support.center[0] - wall.position[0]);
      return {
        id: `research-gateway-${index}:tie-${supportIndex + 1}-${tieIndex + 1}`,
        buildingId: wall.id,
        center: [
          (support.center[0] + wall.position[0]) / 2,
          y,
          z,
        ],
        scale: [length, 0.55, 0.65],
      };
    });
  });
  return Object.freeze({
    id: `research-gateway-${index}`,
    center: [
      RESEARCH_ROUTE.centerX,
      undersideY + beamHeight / 2,
      z,
    ] as ResearchVector,
    undersideY,
    clearWidth,
    beam: {
      center: [
        RESEARCH_ROUTE.centerX,
        undersideY + beamHeight / 2,
        z,
      ] as ResearchVector,
      scale: [clearWidth, beamHeight, 3] as ResearchVector,
    },
    supports,
    ties,
  });
}

export const RESEARCH_GATEWAYS: readonly ResearchGateway[] = Object.freeze([
  gatewayAt(1, -410),
  gatewayAt(2, -522),
]);
