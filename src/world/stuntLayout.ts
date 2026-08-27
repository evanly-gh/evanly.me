import {
  buildingPlacementBounds,
  orientedFootprintGap,
} from './buildingCatalog';
import {
  FIRST_STUNT_FLIP,
  SECOND_STUNT_FLIP,
} from '../choreography/stuntTiming';
import {
  STUNT_CENTER_X,
  STUNT_RAMP1,
  STUNT_RAMP2,
  STUNT_SCAFFOLD,
} from './stuntGeometry';

export {
  PROJECTS_MAIN_ROAD_KEEP_CLEAR,
  STUNT_CAMERA_KEEP_CLEAR,
  STUNT_CENTER_X,
  STUNT_KEEP_CLEAR,
} from './stuntGeometry';
export type { StuntProtectedRect } from './stuntGeometry';

export type StuntVector = [number, number, number];

export interface StuntRouteLandmark {
  t: number;
  position: StuntVector;
}

export const STUNT_ROUTE = {
  ramp1Base: { t: 0.36, position: [STUNT_CENTER_X, STUNT_RAMP1.baseY, STUNT_RAMP1.baseZ] },
  ramp1Lip: { t: FIRST_STUNT_FLIP.lip, position: [STUNT_CENTER_X, STUNT_RAMP1.baseY + STUNT_RAMP1.rise, STUNT_RAMP1.lipZ] },
  flip1Apex: { t: FIRST_STUNT_FLIP.apex, position: [STUNT_CENTER_X, 23, -128] },
  scaffoldLanding: { t: FIRST_STUNT_FLIP.landing, position: [STUNT_CENTER_X, STUNT_SCAFFOLD.deckY, -172] },
  ramp2Base: { t: 0.54, position: [STUNT_CENTER_X, STUNT_RAMP2.baseY, STUNT_RAMP2.baseZ] },
  ramp2Lip: { t: SECOND_STUNT_FLIP.lip, position: [STUNT_CENTER_X, STUNT_RAMP2.baseY + STUNT_RAMP2.rise, STUNT_RAMP2.lipZ] },
  flip2Apex: { t: SECOND_STUNT_FLIP.apex, position: [STUNT_CENTER_X, 33, -288] },
  descentTop: { t: SECOND_STUNT_FLIP.landing, position: [STUNT_CENTER_X, 17, -326] },
  groundResume: { t: 0.69, position: [STUNT_CENTER_X, 0, -348] },
} as const satisfies Record<string, StuntRouteLandmark>;

export interface StuntBackdropPlacement {
  id: string;
  file: string;
  position: StuntVector;
  rotationY: number;
  scale: number;
  layoutRole: 'stunt-backdrop';
}

const backdrop = (
  id: string,
  file: string,
  halfX: number,
  z: number,
): StuntBackdropPlacement => Object.freeze({
  id,
  file: `neocity/${file}.glb`,
  position: [STUNT_SCAFFOLD.backdropFacadeX + halfX, 0, z] as StuntVector,
  rotationY: 0,
  scale: 1,
  layoutRole: 'stunt-backdrop',
});

/**
 * Exact regular-scale wall. Every western facade is x=300 and adjacent OBBs
 * have a four metre visible alley.
 */
export const STUNT_BACKDROP: readonly StuntBackdropPlacement[] = Object.freeze([
  backdrop('stunt-backdrop-1', 'KB3D_NEC_BldgLG_B_Main', 27.2865, -80.689),
  backdrop('stunt-backdrop-2', 'KB3D_NEC_BldgLG_C_Main', 17.6135, -124.3065),
  backdrop('stunt-backdrop-3', 'KB3D_NEC_BldgLG_A_Main', 14.932, -159.732),
  backdrop('stunt-backdrop-4', 'KB3D_NEC_BldgMD_C_Main', 24.5545, -189.8285),
  backdrop('stunt-backdrop-5', 'KB3D_NEC_BldgMD_B_Main', 13.3905, -216.834),
  backdrop('stunt-backdrop-6', 'KB3D_NEC_BldgLG_B_Main', 27.2865, -254.929),
  backdrop('stunt-backdrop-7', 'KB3D_NEC_BldgLG_C_Main', 17.6135, -298.5465),
  backdrop('stunt-backdrop-8', 'KB3D_NEC_BldgLG_A_Main', 14.932, -333.972),
  // Continue the east wall south past the landing so the pocket between the
  // backdrop (ends z-334) and the research canyon front row (begins z-378) isn't
  // a bare void on the rider's right after the second flip. Same facade x=300.
  backdrop('stunt-backdrop-9', 'KB3D_NEC_BldgLG_C_Main', 17.6135, -363),
]);

// Second, deeper row of tall/varied towers behind the backdrop wall. Purely for
// depth from the hero camera (which looks east past the scaffold): they peek
// through the gaps in the front wall. Placed well behind it (facade x=360) and
// staggered against the front-row seams. Injected like STUNT_BACKDROP (bypass the
// packer), and clear of the railway (which is far north at z>150 here).
const BACKDROP_ROW2_FACADE_X = 360;
const backdrop2 = (
  id: string,
  file: string,
  halfX: number,
  z: number,
): StuntBackdropPlacement => Object.freeze({
  id,
  file,
  position: [BACKDROP_ROW2_FACADE_X + halfX, 0, z] as StuntVector,
  rotationY: 0,
  scale: 1,
  layoutRole: 'stunt-backdrop',
});

export const STUNT_BACKDROP_ROW2: readonly StuntBackdropPlacement[] = Object.freeze([
  backdrop2('stunt-backdrop2-1', 'neocity/KB3D_NEC_BldgLG_B_Main.glb', 27.2865, -102),
  backdrop2('stunt-backdrop2-2', 'neocity-variants/KB3D_NEC_BldgLG_C_Main_H100.glb', 17.6, -144),
  backdrop2('stunt-backdrop2-3', 'neocity/KB3D_NEC_BldgLG_C_Main.glb', 17.6135, -188),
  backdrop2('stunt-backdrop2-4', 'neocity-variants/KB3D_NEC_BldgLG_B_Main_H124.glb', 27.3, -236),
  backdrop2('stunt-backdrop2-5', 'neocity/KB3D_NEC_BldgLG_A_Main.glb', 14.932, -300),
]);

export function measureBackdropGaps(): number[] {
  return STUNT_BACKDROP.slice(1).map((placement, index) =>
    orientedFootprintGap(
      buildingPlacementBounds(STUNT_BACKDROP[index]),
      buildingPlacementBounds(placement),
    ));
}

export interface ScaffoldMember {
  id: string;
  center: StuntVector;
  scale: StuntVector;
  rotationX?: number;
}

export interface ScaffoldTieBeam {
  id: string;
  buildingId: string;
  start: StuntVector;
  end: StuntVector;
  center: StuntVector;
  scale: StuntVector;
}

export interface ScaffoldStructure {
  poles: ScaffoldMember[];
  ledgers: ScaffoldMember[];
  braces: ScaffoldMember[];
  transverseTies: ScaffoldMember[];
  tieBeams: ScaffoldTieBeam[];
}

function scaffoldTieFacadePoint(
  placement: StuntBackdropPlacement,
  desiredZ: number,
): { x: number; z: number } {
  const bounds = buildingPlacementBounds(placement);
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  const xAxis = { x: cos, z: -sin };
  const zAxis = { x: sin, z: cos };
  const halfZ = Math.max(0, bounds.halfZ - 0.25);
  const edgeCenter = {
    x: bounds.center.x - xAxis.x * bounds.halfX,
    z: bounds.center.z - xAxis.z * bounds.halfX,
  };
  const first = {
    x: edgeCenter.x - zAxis.x * halfZ,
    z: edgeCenter.z - zAxis.z * halfZ,
  };
  const second = {
    x: edgeCenter.x + zAxis.x * halfZ,
    z: edgeCenter.z + zAxis.z * halfZ,
  };
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const lengthSq = dx * dx + dz * dz;
  const fraction = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1, (
        (STUNT_SCAFFOLD.backdropFacadeX - first.x) * dx
        + (desiredZ - first.z) * dz
      ) / lengthSq));
  return {
    x: first.x + dx * fraction,
    z: first.z + dz * fraction,
  };
}

export function buildScaffoldStructure(): ScaffoldStructure {
  const deckX = STUNT_CENTER_X;
  const deckY = STUNT_SCAFFOLD.deckY;
  const deckWidth = STUNT_SCAFFOLD.width;
  const z0 = STUNT_SCAFFOLD.southZ;
  const z1 = STUNT_SCAFFOLD.northZ;
  const poleZs = Array.from({ length: 9 }, (_, index) =>
    z0 + (z1 - z0) * index / 8);
  const edges = [deckX - deckWidth / 2, deckX + deckWidth / 2];
  const poles = poleZs.flatMap((z, zIndex) =>
    edges.map((x, edgeIndex) => ({
      id: `pole-${zIndex}-${edgeIndex}`,
      center: [x, deckY / 2, z] as StuntVector,
      scale: [0.5, deckY, 0.5] as StuntVector,
    })));
  const ledgers = edges.flatMap((x, edgeIndex) =>
    [deckY * 0.45, deckY * 0.8].map((y, levelIndex) => ({
      id: `ledger-${edgeIndex}-${levelIndex}`,
      center: [x, y, STUNT_SCAFFOLD.centerZ] as StuntVector,
      scale: [0.3, 0.3, STUNT_SCAFFOLD.length] as StuntVector,
    })));
  const bay = (z1 - z0) / 8;
  const braceLength = Math.hypot(deckY, bay);
  const braces = edges.flatMap((x, edgeIndex) =>
    poleZs.slice(0, -1).map((z, index) => ({
      id: `brace-${edgeIndex}-${index}`,
      center: [x, deckY / 2, z + bay / 2] as StuntVector,
      scale: [0.22, braceLength, 0.22] as StuntVector,
      rotationX: Math.atan2(bay, deckY) * (index % 2 === 0 ? 1 : -1),
    })));
  const transverseTies = poleZs.map((z, index) => ({
    id: `transverse-${index}`,
    center: [deckX, deckY - 0.6, z] as StuntVector,
    scale: [deckWidth, 0.3, 0.3] as StuntVector,
  }));
  const tieBeams = STUNT_SCAFFOLD.tieZs.map((desiredZ, index) => {
    const candidates = STUNT_BACKDROP.map((placement) => ({
      placement,
      point: scaffoldTieFacadePoint(placement, desiredZ),
    })).filter(({ point }) => point.x > STUNT_SCAFFOLD.outerEdgeX);
    const { placement: parent, point } = candidates.reduce(
      (nearest, candidate) =>
        Math.abs(candidate.point.z - desiredZ)
          < Math.abs(nearest.point.z - desiredZ)
          ? candidate
          : nearest,
    );
    const start: StuntVector = [
      deckX + deckWidth / 2,
      deckY - 0.5,
      point.z,
    ];
    const end: StuntVector = [
      point.x,
      deckY - 0.5,
      point.z,
    ];
    return {
      id: `building-tie-${index}`,
      buildingId: parent.id,
      start,
      end,
      center: [(start[0] + end[0]) / 2, start[1], point.z] as StuntVector,
      scale: [end[0] - start[0], 0.35, 0.35] as StuntVector,
    };
  });
  return { poles, ledgers, braces, transverseTies, tieBeams };
}

export function setpieceFootprintCorners(): Array<{ x: number; z: number }> {
  return [
    { x: STUNT_CENTER_X - STUNT_RAMP1.width / 2, z: STUNT_RAMP1.baseZ },
    { x: STUNT_CENTER_X + STUNT_RAMP1.width / 2, z: STUNT_RAMP1.baseZ },
    { x: STUNT_CENTER_X - STUNT_RAMP1.width / 2, z: STUNT_RAMP1.lipZ },
    { x: STUNT_CENTER_X + STUNT_RAMP1.width / 2, z: STUNT_RAMP1.lipZ },
    { x: STUNT_SCAFFOLD.innerEdgeX, z: STUNT_SCAFFOLD.northZ },
    { x: STUNT_SCAFFOLD.outerEdgeX, z: STUNT_SCAFFOLD.northZ },
    { x: STUNT_SCAFFOLD.innerEdgeX, z: STUNT_SCAFFOLD.southZ },
    { x: STUNT_SCAFFOLD.outerEdgeX, z: STUNT_SCAFFOLD.southZ },
    { x: STUNT_CENTER_X - STUNT_RAMP2.width / 2, z: STUNT_RAMP2.baseZ },
    { x: STUNT_CENTER_X + STUNT_RAMP2.width / 2, z: STUNT_RAMP2.baseZ },
    { x: STUNT_CENTER_X - STUNT_RAMP2.width / 2, z: STUNT_RAMP2.lipZ },
    { x: STUNT_CENTER_X + STUNT_RAMP2.width / 2, z: STUNT_RAMP2.lipZ },
  ];
}
