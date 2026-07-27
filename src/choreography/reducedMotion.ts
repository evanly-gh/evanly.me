import { STUNT_FLIP_TIMINGS } from './stuntTiming';

export interface ReducedMotionSnapPoint {
  id: 'intro' | 'about' | 'flip-1' | 'flip-2' | 'research' | 'finale';
  t: number;
}

export const REDUCED_MOTION_SNAP_POINTS: readonly ReducedMotionSnapPoint[] =
  Object.freeze([
    Object.freeze({ id: 'intro', t: 0 }),
    Object.freeze({ id: 'about', t: 0.192 }),
    Object.freeze({ id: 'flip-1', t: STUNT_FLIP_TIMINGS[0].apex }),
    Object.freeze({ id: 'flip-2', t: STUNT_FLIP_TIMINGS[1].apex }),
    Object.freeze({ id: 'research', t: 0.76 }),
    Object.freeze({ id: 'finale', t: 1 }),
  ]);

export function nearestReducedMotionSnap(
  semanticT: number,
): ReducedMotionSnapPoint {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Reduced-motion progress must be finite');
  }

  let nearest = REDUCED_MOTION_SNAP_POINTS[0];
  let nearestDistance = Math.abs(semanticT - nearest.t);
  for (let index = 1; index < REDUCED_MOTION_SNAP_POINTS.length; index += 1) {
    const candidate = REDUCED_MOTION_SNAP_POINTS[index];
    const distance = Math.abs(semanticT - candidate.t);
    if (distance < nearestDistance - 1e-12) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function snapReducedMotion(semanticT: number): number {
  return nearestReducedMotionSnap(semanticT).t;
}
