import * as THREE from 'three';
import { ABOUT_REVEAL_CAMERA } from './aboutReveal';
import {
  STUNT_CAMERA_TIMES,
  buildStuntCameraRig,
} from './stuntCamera';
import {
  RESEARCH_CAMERA_TIMES,
  buildResearchCameraRig,
} from './researchCamera';

export const INSPECTION_PRESET_IDS = [
  'straight-crosswalk-close',
  'about-reveal-sightline',
  'shibuya-overhead',
  'shibuya-street-level',
  'projects-flip-1',
  'projects-scaffold-midpoint',
  'projects-flip-2',
  'research-canyon-low',
  'research-canyon-end',
  'research-gateway-1',
  'research-gateway-2',
  'highway-collision-corridor',
  'bridge-approach',
  'bridge-end',
  'water-pier-side',
  'moon-sightline',
  'facade-sign-close',
  'hologram-close',
] as const;

export type InspectionPresetId = typeof INSPECTION_PRESET_IDS[number];
export type InspectionVector = [number, number, number];

export interface InspectionPreset {
  id: InspectionPresetId;
  label: string;
  position: InspectionVector;
  target: InspectionVector;
  fov: number;
}

export function shouldEnableInspection(
  isDevelopment: boolean,
  search: string,
  verificationBuild = false,
): boolean {
  return (isDevelopment || verificationBuild)
    && new URLSearchParams(search).has('inspect');
}

const preset = (
  id: InspectionPresetId,
  label: string,
  position: InspectionVector,
  target: InspectionVector,
  fov: number,
): InspectionPreset => ({ id, label, position, target, fov });

const stuntPreset = (
  id: InspectionPresetId,
  label: string,
  t: number,
): InspectionPreset => {
  const pose = buildStuntCameraRig().sample(t);
  return preset(
    id,
    label,
    pose.position.toArray(),
    pose.target.toArray(),
    pose.fov,
  );
};

const researchPreset = (
  id: InspectionPresetId,
  label: string,
  t: number,
): InspectionPreset => {
  const pose = buildResearchCameraRig().sample(t);
  return preset(
    id,
    label,
    pose.position.toArray(),
    pose.target.toArray(),
    pose.fov,
  );
};

export const INSPECTION_PRESETS: Record<InspectionPresetId, InspectionPreset> = {
  'straight-crosswalk-close': preset(
    'straight-crosswalk-close',
    'Straight crosswalk close view',
    [-58, 9, 22],
    [-60, 0.2, 0],
    48,
  ),
  'about-reveal-sightline': preset(
    'about-reveal-sightline',
    'About reveal sightline',
    [...ABOUT_REVEAL_CAMERA.position],
    [...ABOUT_REVEAL_CAMERA.target],
    ABOUT_REVEAL_CAMERA.fov,
  ),
  'shibuya-overhead': preset(
    'shibuya-overhead',
    'Shibuya overhead',
    [240, 90, 190],
    [240, 15, 0],
    65,
  ),
  'shibuya-street-level': preset(
    'shibuya-street-level',
    'Shibuya street level',
    [240, 14, -95],
    [240, 18, 20],
    72,
  ),
  'projects-flip-1': stuntPreset(
    'projects-flip-1',
    'Projects first flip',
    STUNT_CAMERA_TIMES.flip1,
  ),
  'projects-scaffold-midpoint': stuntPreset(
    'projects-scaffold-midpoint',
    'Projects scaffold midpoint',
    STUNT_CAMERA_TIMES.scaffoldMidpoint,
  ),
  'projects-flip-2': stuntPreset(
    'projects-flip-2',
    'Projects second flip',
    STUNT_CAMERA_TIMES.flip2,
  ),
  'research-canyon-low': researchPreset(
    'research-canyon-low',
    'Research canyon semantic midpoint',
    RESEARCH_CAMERA_TIMES.midpoint,
  ),
  'research-canyon-end': researchPreset(
    'research-canyon-end',
    'Research canyon bridge handoff',
    RESEARCH_CAMERA_TIMES.end,
  ),
  'research-gateway-1': researchPreset(
    'research-gateway-1',
    'Research first gateway readability',
    RESEARCH_CAMERA_TIMES.gateway1,
  ),
  'research-gateway-2': researchPreset(
    'research-gateway-2',
    'Research second gateway readability',
    RESEARCH_CAMERA_TIMES.gateway2,
  ),
  'highway-collision-corridor': preset(
    'highway-collision-corridor',
    'Elevated highway collision corridor',
    [-90, 104, 290],
    [-80, 55, 190],
    52,
  ),
  'bridge-approach': preset(
    'bridge-approach',
    'Bridge approach',
    [240, 18, -540],
    [240, 4, -720],
    50,
  ),
  'bridge-end': preset(
    'bridge-end',
    'Bridge end',
    [240, 50, -1480],
    [240, 16, -2250],
    48,
  ),
  'water-pier-side': preset(
    'water-pier-side',
    'Water and pier side view',
    [410, 28, -1040],
    [240, 2, -1040],
    52,
  ),
  'moon-sightline': preset(
    'moon-sightline',
    'Moon sightline',
    [240, 30, -1510],
    [240, 330, -3300],
    42,
  ),
  'facade-sign-close': preset(
    'facade-sign-close',
    'Close facade sign',
    [226.58, 23.5, -400.74],
    [208.57921093413654, 21.49027072840709, -400.8492331094949],
    38,
  ),
  'hologram-close': preset(
    'hologram-close',
    'Close hologram',
    [174.25, 49, 23.34],
    [159.1791752733725, 44, 28.688454428564107],
    38,
  ),
};

export function getInspectionPreset(id: InspectionPresetId): InspectionPreset {
  const source = INSPECTION_PRESETS[id];
  if (!source) throw new Error(`Unknown inspection preset: ${String(id)}`);
  return {
    ...source,
    position: [...source.position],
    target: [...source.target],
  };
}

export function applyInspectionPreset(
  camera: THREE.Camera,
  id: InspectionPresetId,
): InspectionPreset {
  const selected = getInspectionPreset(id);
  camera.position.set(...selected.position);
  camera.lookAt(...selected.target);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = selected.fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
  return selected;
}
