import * as THREE from 'three';
import { PALETTE } from '../../theme';
import type {
  CommittedThreeAllocation,
  ThreeResourceScope,
} from './useCommittedThreeResources';

/**
 * Shared presentation kit for the suspended (hanging) monorail — a Japanese
 * straddle/suspended-beam train (Shonan / Chiba / Wuppertal references) rebuilt
 * in the city's cyberpunk-neon key. Pure resource builder (no rendering),
 * mirroring signKit.ts: `createMonorailResources({ own })` hands geometries +
 * materials to `useCommittedThreeResource`, so the `?gallery` showcase (and a
 * later city swap) build byte-identical resources from one source of truth.
 *
 * Palette note (theme.ts): cyan is reserved for the bike/rider and the guideway
 * already glows violet, so the train uses warm-white windows, a magenta accent
 * stripe, and violet hanger accents to tie into the existing guideway.
 */

// ── Car + assembly dimensions (metres) ──
// Sized so the car body ≈ the elevated guideway width (ROADS elevated-highway
// halfWidth 3.8 → 7.6m beam); the car sits just under the beam. Enlarged so the
// train reads at street scale rather than as a distant toy.
export const CAR_LENGTH = 16;
export const CAR_WIDTH = 6.6;
export const CAR_HEIGHT = 3.6;
export const CORNER_RADIUS = 0.72;
export const CAR_GAP = 1.6;
/** ExtrudeGeometry bevel — inflates the profile outward on every axis, so the
 *  base shape is shrunk by this on each side to keep finished outer dims exact. */
const BEVEL = 0.22;
/** The gallery train shows a full consist: 2 nose cabs + 3 mid cars. */
export const SHOWCASE_CAR_COUNT = 5;

// Vertical stack of the hung assembly, measured from the beam down.
export const BEAM_HEIGHT = 1.6;
export const BEAM_WIDTH = 1.4;
export const BOGIE_HOUSING_H = 0.8;
export const BOGIE_NECK_H = 1.4;

export type CarVariant = 'nose-front' | 'nose-rear' | 'mid';

/** End cars are cabs (front / rear); everything between is a plain mid car. */
export function carVariant(index: number, count: number): CarVariant {
  if (index === count - 1) return 'nose-front';
  if (index === 0) return 'nose-rear';
  return 'mid';
}

/** Total length of a `count`-car consist laid end-to-end (no leading gap). */
export function consistLength(count: number): number {
  return count * CAR_LENGTH + (count - 1) * CAR_GAP;
}

/** A rounded-rectangle cross-section (X = width, Y = height) for the car tube. */
function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Rounded car body extruded along its length, baked so length → X, width → Z,
 *  height → Y, centred at the origin, nose facing +X. Bevelled caps keep the
 *  ends soft rather than razor-sharp (the streamlined-tube read). */
function buildCarBody(): THREE.ExtrudeGeometry {
  // Base profile is inset by BEVEL on each side; the bevel then grows it back
  // out to the true CAR_WIDTH × CAR_HEIGHT × CAR_LENGTH outer envelope.
  const shape = roundedRectShape(
    CAR_WIDTH - 2 * BEVEL,
    CAR_HEIGHT - 2 * BEVEL,
    CORNER_RADIUS - BEVEL,
  );
  const depth = CAR_LENGTH - 2 * BEVEL;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2); // length: Z → X
  geo.computeVertexNormals();
  return geo;
}

export interface MonorailKitResources {
  // geometries
  carBody: THREE.ExtrudeGeometry;
  windowBand: THREE.BoxGeometry;
  mullion: THREE.BoxGeometry;
  stripe: THREE.BoxGeometry;
  door: THREE.BoxGeometry;
  windshield: THREE.BoxGeometry;
  lamp: THREE.CylinderGeometry;
  bogieNeck: THREE.BoxGeometry;
  bogieHousing: THREE.BoxGeometry;
  bogieWheel: THREE.CylinderGeometry;
  beam: THREE.BoxGeometry;
  beamGlow: THREE.BoxGeometry;
  // materials
  bodyMat: THREE.MeshStandardMaterial;
  windowMat: THREE.MeshStandardMaterial;
  stripeMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  hangerMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  taillightMat: THREE.MeshStandardMaterial;
  beamMat: THREE.MeshStandardMaterial;
  beamGlowMat: THREE.MeshStandardMaterial;
}

/** Build every geometry + material for the monorail, all registered via `own`
 *  so the committed-resource hook disposes them on unmount. */
export function createMonorailResources(
  { own }: ThreeResourceScope,
): CommittedThreeAllocation<MonorailKitResources> {
  // Window band spans most of the car length; a hair thinner than the body
  // half-width so it sits just proud of the side surface (z placed by caller).
  const windowSpan = CAR_LENGTH - 3.0;

  const value: MonorailKitResources = {
    carBody: own(buildCarBody()),
    windowBand: own(new THREE.BoxGeometry(windowSpan, 0.85, 0.08)),
    mullion: own(new THREE.BoxGeometry(0.12, 0.95, 0.12)),
    stripe: own(new THREE.BoxGeometry(CAR_LENGTH - 0.8, 0.28, 0.08)),
    door: own(new THREE.BoxGeometry(1.2, 2.0, 0.06)),
    windshield: own(new THREE.BoxGeometry(0.16, 1.55, CAR_WIDTH * 0.82)),
    // lamp axis baked along X so its face points forward/back.
    lamp: own(rotatedCyl(0.24, 0.24, 0.18, 16)),
    bogieNeck: own(new THREE.BoxGeometry(0.7, BOGIE_NECK_H, 1.0)),
    bogieHousing: own(new THREE.BoxGeometry(1.7, BOGIE_HOUSING_H, 1.35)),
    // running wheels: axis along Z (across the beam), placed by caller.
    bogieWheel: own(rotatedCyl(0.4, 0.4, 0.26, 14, 'z')),
    beam: own(new THREE.BoxGeometry(1, BEAM_HEIGHT, BEAM_WIDTH)), // X scaled by caller
    beamGlow: own(new THREE.BoxGeometry(1, 0.1, 0.08)),           // X scaled by caller

    bodyMat: own(new THREE.MeshStandardMaterial({
      color: 0x1a1c26,
      roughness: 0.38,
      metalness: 0.62,
      // faint violet self-glow so the dark body still reads as a solid volume
      // under the city's night lighting (matches the guideway accent).
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 0.14,
    })),
    windowMat: own(new THREE.MeshStandardMaterial({
      color: 0x20242e,
      emissive: new THREE.Color(PALETTE.white),
      emissiveIntensity: 1.7,
      roughness: 0.3,
      toneMapped: false,
    })),
    stripeMat: own(new THREE.MeshStandardMaterial({
      color: 0x1a0611,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 2.4,
      toneMapped: false,
    })),
    glassMat: own(new THREE.MeshStandardMaterial({
      color: 0x05070d,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.12,
      roughness: 0.15,
      metalness: 0.4,
      toneMapped: false,
    })),
    hangerMat: own(new THREE.MeshStandardMaterial({
      color: 0x0d0f18, roughness: 0.55, metalness: 0.7,
    })),
    accentMat: own(new THREE.MeshStandardMaterial({
      color: 0x0c0722,
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 2.0,
      toneMapped: false,
    })),
    headlightMat: own(new THREE.MeshStandardMaterial({
      color: 0x1c1c1c,
      emissive: new THREE.Color(PALETTE.white),
      emissiveIntensity: 3.0,
      toneMapped: false,
    })),
    taillightMat: own(new THREE.MeshStandardMaterial({
      color: 0x1c0608,
      emissive: new THREE.Color(PALETTE.red),
      emissiveIntensity: 2.6,
      toneMapped: false,
    })),
    beamMat: own(new THREE.MeshStandardMaterial({
      color: 0x12131c, roughness: 0.5, metalness: 0.6,
    })),
    beamGlowMat: own(new THREE.MeshStandardMaterial({
      color: 0x160c22,
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 2.0,
      toneMapped: false,
    })),
  };

  return {
    value,
    resources: [
      value.carBody, value.windowBand, value.mullion, value.stripe, value.door,
      value.windshield, value.lamp, value.bogieNeck, value.bogieHousing,
      value.bogieWheel, value.beam, value.beamGlow,
      value.bodyMat, value.windowMat, value.stripeMat, value.glassMat,
      value.hangerMat, value.accentMat, value.headlightMat, value.taillightMat,
      value.beamMat, value.beamGlowMat,
    ],
  };
}

/** A cylinder whose axis is baked to X (default) or Z instead of the native Y. */
function rotatedCyl(
  rt: number, rb: number, h: number, seg: number, axis: 'x' | 'z' = 'x',
): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return g;
}
