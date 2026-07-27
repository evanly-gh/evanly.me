import * as THREE from 'three';
import { BikePath } from '../choreography/bikePath';
import {
  RESEARCH_CAMERA_TIMES,
  activeResearchPanelIds,
  buildResearchCameraRig,
} from './researchCamera';
import { RESEARCH_PANELS } from './researchContent';

export interface ResearchSightCorridor {
  id: string;
  semanticT: number;
  subjectId: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  halfWidth: number;
}

export const RESEARCH_CAPTURE_TIMES = [
  RESEARCH_CAMERA_TIMES.gateway1,
  RESEARCH_CAMERA_TIMES.midpoint,
  RESEARCH_CAMERA_TIMES.gateway2,
  RESEARCH_CAMERA_TIMES.end,
] as const;

function createResearchSightCorridors(): ResearchSightCorridor[] {
  const rig = buildResearchCameraRig();
  const bikePath = new BikePath();
  return RESEARCH_CAPTURE_TIMES.flatMap((semanticT) => {
    const pose = rig.sample(semanticT);
    const activeIds = new Set(activeResearchPanelIds(semanticT));
    const subjects = [
      {
        id: 'projected-bike',
        point: bikePath.state(semanticT).pos,
        halfWidth: 1.25,
      },
      ...RESEARCH_PANELS
        .filter(({ id }) => activeIds.has(id))
        .map((panel) => ({
          id: panel.id,
          point: new THREE.Vector3(...panel.position),
          halfWidth: panel.width / 2 + 1,
        })),
      ...(semanticT === RESEARCH_CAMERA_TIMES.end
        ? [{
            id: 'handoff-view',
            point: pose.target,
            halfWidth: 2,
          }]
        : []),
    ];
    return subjects.map(({ id, point, halfWidth }) => ({
      id: `research-sight-${semanticT}-${id}`,
      semanticT,
      subjectId: id,
      start: pose.position.clone(),
      end: point.clone(),
      halfWidth,
    }));
  });
}

const RESEARCH_SIGHT_CORRIDORS = createResearchSightCorridors();

export function buildResearchSightCorridors(): ResearchSightCorridor[] {
  return RESEARCH_SIGHT_CORRIDORS.map((corridor) => ({
    ...corridor,
    start: corridor.start.clone(),
    end: corridor.end.clone(),
  }));
}

function pointSegmentDistanceXZ(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0
    ? 0
    : THREE.MathUtils.clamp(
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq,
      0,
      1,
    );
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

export function researchCorridorPointClearance(
  point: { x: number; z: number },
  radius = 0,
): number {
  return Math.min(...RESEARCH_SIGHT_CORRIDORS.map((corridor) =>
    pointSegmentDistanceXZ(point, corridor.start, corridor.end)
      - corridor.halfWidth
      - radius));
}

export function researchCorridorSegmentClearance(
  start: { x: number; z: number },
  end: { x: number; z: number },
  radius = 0,
): number {
  let minimum = Infinity;
  const samples = Math.max(8, Math.ceil(Math.hypot(
    end.x - start.x,
    end.z - start.z,
  )));
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    minimum = Math.min(minimum, researchCorridorPointClearance({
      x: THREE.MathUtils.lerp(start.x, end.x, t),
      z: THREE.MathUtils.lerp(start.z, end.z, t),
    }, radius));
  }
  return minimum;
}
