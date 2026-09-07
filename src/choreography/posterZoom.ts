import { useSyncExternalStore } from 'react';
import * as THREE from 'three';

/**
 * Click-to-zoom state for the section poster billboards. A poster click opens a
 * face-on, screen-filling view of that board; an X (or Esc) closes it and hands
 * control back to the scroll ride at the exact pose it was opened from.
 *
 * The camera animation itself lives in ProductionDirector (it owns the camera in
 * useFrame); this module is just the shared status + target and a pure helper to
 * compute the face-on pose. Page scroll is locked while a zoom is active (see the
 * PosterZoomOverlay).
 */

export interface PosterZoomTarget {
  id: string;
  /** World-space centre of the poster plane. */
  center: [number, number, number];
  /** Plane rotation about Y (its normal is (sin,0,cos)). */
  rotationY: number;
  width: number;
  height: number;
}

export type PosterZoomStatus = 'idle' | 'in' | 'held' | 'out';

export interface PosterZoomState {
  status: PosterZoomStatus;
  target: PosterZoomTarget | null;
}

let state: PosterZoomState = { status: 'idle', target: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getPosterZoomState(): PosterZoomState {
  return state;
}

export function subscribePosterZoom(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Open (or re-open) a face-on zoom of the given poster. Ignored mid-animation. */
export function openPosterZoom(target: PosterZoomTarget): void {
  if (state.status !== 'idle') return;
  state = { status: 'in', target };
  emit();
}

/** Begin closing the current zoom, flying the camera back to the ride. */
export function closePosterZoom(): void {
  if (state.status === 'idle' || state.status === 'out') return;
  state = { status: 'out', target: state.target };
  emit();
}

/** Director-only: advance the lifecycle when an in/out tween finishes. */
export function setPosterZoomStatus(status: PosterZoomStatus): void {
  if (state.status === status) return;
  state = {
    status,
    target: status === 'idle' ? null : state.target,
  };
  emit();
}

export function isPosterZoomActive(): boolean {
  return state.status !== 'idle';
}

export interface FaceOnPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/**
 * Straight-on camera pose that frames the whole poster with a little margin.
 * Distance is the max of the height- and width-limited distances so neither axis
 * is cropped at the given viewport aspect.
 */
export function faceOnPose(
  poster: PosterZoomTarget,
  aspect: number,
  fovDeg = 38,
): FaceOnPose {
  const normal = new THREE.Vector3(
    Math.sin(poster.rotationY),
    0,
    Math.cos(poster.rotationY),
  ).normalize();
  const center = new THREE.Vector3(...poster.center);
  const vfov = THREE.MathUtils.degToRad(fovDeg);
  const distForHeight = poster.height / 2 / Math.tan(vfov / 2);
  const halfHfov = Math.atan(Math.tan(vfov / 2) * aspect);
  const distForWidth = poster.width / 2 / Math.tan(halfHfov);
  const dist = Math.max(distForHeight, distForWidth) * 1.06;
  return {
    position: center.clone().addScaledVector(normal, dist),
    target: center,
    fov: fovDeg,
  };
}

export function usePosterZoom(): PosterZoomState {
  return useSyncExternalStore(
    subscribePosterZoom,
    getPosterZoomState,
    getPosterZoomState,
  );
}

// Dev/test handle so the zoom can be driven without pixel-precise 3D clicks.
if (typeof window !== 'undefined') {
  (window as unknown as {
    __EVANLY_POSTER_ZOOM__?: unknown;
  }).__EVANLY_POSTER_ZOOM__ = {
    version: 1,
    open: openPosterZoom,
    close: closePosterZoom,
    get: getPosterZoomState,
  };
}
