import * as THREE from 'three';

export const INSPECTION_PRESET_IDS = [
  'straight-crosswalk-close',
  'shibuya-overhead',
  'shibuya-street-level',
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

export function shouldEnableInspection(isDevelopment: boolean, search: string): boolean {
  return isDevelopment && new URLSearchParams(search).has('inspect');
}

const preset = (
  id: InspectionPresetId,
  label: string,
  position: InspectionVector,
  target: InspectionVector,
  fov: number,
): InspectionPreset => ({ id, label, position, target, fov });

export const INSPECTION_PRESETS: Record<InspectionPresetId, InspectionPreset> = {
  'straight-crosswalk-close': preset(
    'straight-crosswalk-close',
    'Straight crosswalk close view',
    [-58, 9, 22],
    [-60, 0.2, 0],
    48,
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
