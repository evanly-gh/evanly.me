import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import * as THREE from 'three';
import {
  buildBike,
  type BikeAsset,
  type BikePose,
} from '../../assets/bike';
import { makeRng } from '../../assets/rng';
import { BikePath, type BikeState } from '../../choreography/bikePath';
import { bikeTrailFinaleFadeAt } from '../../choreography/bikeTrail';
import {
  BikeTrails,
  type BikeTrailsHandle,
} from './BikeTrails';
import { useCommittedThreeResource } from './useCommittedThreeResources';
import { finaleSubjectOpacityAt } from '../../world/finaleRender';

const BIKE_PATH = new BikePath();

interface BikeFadeMaterialState {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

const BIKE_FADE_MATERIALS = new WeakMap<BikeAsset, BikeFadeMaterialState[]>();

export interface MountedBikeSnapshot {
  mounted: boolean;
  semanticT: number;
  finaleOpacity: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  pose: BikePose;
}

export interface BikeRiderHandle {
  setProgress(semanticT: number): BikeState | undefined;
  setTrailFx(semanticT: number): void;
  snapshot(): MountedBikeSnapshot | undefined;
  object(): THREE.Group | null;
}

export function applyBikeProgress(
  asset: BikeAsset,
  semanticT: number,
): BikeState {
  const state = BIKE_PATH.state(semanticT);
  asset.group.position.copy(state.pos);
  asset.group.quaternion.copy(state.quat);
  asset.pose(state.pose);
  applyBikeFinaleOpacity(asset, finaleSubjectOpacityAt(semanticT));
  asset.group.updateMatrixWorld(true);
  return state;
}

export function collectBikeOwnedResources(
  asset: BikeAsset,
): Array<THREE.BufferGeometry | THREE.Material | THREE.Skeleton> {
  const resources = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Skeleton
  >([
    asset.ghostGeometry,
  ]);
  asset.group.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      resources.add(object.skeleton);
    }
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      resources.add(material);
    }
  });
  return [...resources];
}

function captureBikeFadeMaterials(asset: BikeAsset): BikeFadeMaterialState[] {
  const states: BikeFadeMaterialState[] = [];
  const seen = new Set<THREE.Material>();
  asset.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      states.push({
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      });
    }
  });
  return states;
}

export function applyBikeFinaleOpacity(
  asset: BikeAsset,
  finaleOpacity: number,
): void {
  const fade = THREE.MathUtils.clamp(finaleOpacity, 0, 1);
  for (const state of BIKE_FADE_MATERIALS.get(asset) ?? []) {
    const fading = fade < 1;
    const transparent = fading ? true : state.transparent;
    const depthWrite = fading ? false : state.depthWrite;
    if (
      state.material.transparent !== transparent
      || state.material.depthWrite !== depthWrite
    ) {
      state.material.transparent = transparent;
      state.material.depthWrite = depthWrite;
      state.material.needsUpdate = true;
    }
    state.material.opacity = state.opacity * fade;
  }
}

export function snapshotBikeAsset(
  asset: BikeAsset,
  semanticT: number,
): MountedBikeSnapshot {
  const chassisTilt = asset.group.getObjectByName('chassisTilt');
  const pitchPivot = asset.group.getObjectByName('pitchPivot');
  const frontHub = asset.group.getObjectByName('hubFront');
  const rider = asset.group.getObjectByName('riderMesh');
  if (
    !chassisTilt
    || !pitchPivot
    || !frontHub
    || !(rider instanceof THREE.SkinnedMesh)
  ) {
    throw new Error('Mounted bike hierarchy is incomplete');
  }
  const hipsY = rider.skeleton.bones[0]?.position.y;
  if (!Number.isFinite(hipsY)) {
    throw new Error('Mounted rider hips pose is unavailable');
  }
  return {
    mounted: asset.group.parent !== null,
    semanticT: Math.max(0, Math.min(1, semanticT)),
    finaleOpacity: finaleSubjectOpacityAt(semanticT),
    position: asset.group.position.toArray(),
    quaternion: asset.group.quaternion.toArray(),
    pose: {
      lean: chassisTilt.rotation.x,
      pitch: pitchPivot.rotation.z,
      crouch: THREE.MathUtils.clamp((hipsY - 1) / 0.12, 0, 1),
      wheelSpin: -frontHub.rotation.z,
    },
  };
}

export const BikeRider = forwardRef<BikeRiderHandle>(function BikeRider(
  _props,
  forwardedRef,
) {
  const desiredProgress = useRef(0);
  const assetRef = useRef<BikeAsset | null>(null);
  const trailsRef = useRef<BikeTrailsHandle>(null);
  const stateRef = useRef<BikeState | undefined>(undefined);
  const asset = useCommittedThreeResource('bike-rider', ({ own }) => {
    const created = buildBike(makeRng(0x4556414e));
    BIKE_FADE_MATERIALS.set(created, captureBikeFadeMaterials(created));
    const resources = collectBikeOwnedResources(created);
    resources.forEach(own);
    return { value: created, resources };
  }, []);

  const apply = (semanticT: number): BikeState | undefined => {
    desiredProgress.current = semanticT;
    const current = assetRef.current;
    if (!current) return undefined;
    const state = applyBikeProgress(current, semanticT);
    stateRef.current = state;
    return state;
  };

  useImperativeHandle(forwardedRef, () => ({
    setProgress: apply,
    setTrailFx: (semanticT) => {
      trailsRef.current?.setProgress(
        semanticT,
        bikeTrailFinaleFadeAt(semanticT),
        stateRef.current,
      );
    },
    // Computed on demand: only the inspect API reads this, so building a fresh
    // snapshot (with its toArray() allocations) every frame was pure waste in
    // production.
    snapshot: () => {
      const current = assetRef.current;
      return current
        ? snapshotBikeAsset(current, desiredProgress.current)
        : undefined;
    },
    object: () => assetRef.current?.group ?? null,
  }), []);

  useLayoutEffect(() => {
    assetRef.current = asset;
    if (asset) apply(desiredProgress.current);
    return () => {
      if (assetRef.current === asset) assetRef.current = null;
    };
  }, [asset]);

  if (!asset) return null;
  return (
    <>
      <primitive
        object={asset.group}
        name="production-bike-rider"
        dispose={null}
      />
      <BikeTrails ref={trailsRef} ghostGeometry={asset.ghostGeometry} />
    </>
  );
});
