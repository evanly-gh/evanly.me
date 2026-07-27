import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildProductionCameraRig,
  measureCameraRoll,
  productionCameraSectionAt,
} from '../../choreography/productionCameraRig';
import {
  ProgressDirector,
  type ProgressAdapter,
} from '../../choreography/progressDirector';
import type { ProgressStore } from '../../choreography/progressStore';
import type {
  BikeRiderHandle,
  MountedBikeSnapshot,
} from './BikeRider';
import {
  measureBikeFraming,
  type BikeFramingMeasurement,
} from './bikeFraming';
import { rawForSemantic } from '../../choreography/scrollRemap';
import { BikePath } from '../../choreography/bikePath';
import {
  measureMountedSceneSubjects,
  type MountedSceneSubjectMeasurement,
} from '../../choreography/productionSubjects';

const ADAPTER_ORDER = ['bike', 'camera', 'content', 'fx'] as const;
const FRAME_SAMPLE_LIMIT = 600;

export interface ScrollInspectionSnapshot {
  raw: number;
  semanticT: number;
  updateCount: number;
  adapterOrder: readonly string[];
  activeSection: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    roll: number;
    positionError: number;
    targetError: number;
    fovError: number;
  };
  bike?: MountedBikeSnapshot & {
    ndc: [number, number, number];
    inFrame: boolean;
    framing: BikeFramingMeasurement;
    positionError: number;
    quaternionError: number;
    poseError: number;
  };
  canvas: { width: number; height: number };
  scroll: {
    y: number;
    maximum: number;
    sentinelHeight: number;
    pinned: boolean;
    shot: boolean;
    reducedMotion: boolean;
  };
  performance: {
    samples: number;
    meanMs: number;
    p95Ms: number;
    minimumMs: number;
    maximumMs: number;
  };
  trails?: {
    ribbonVisible: boolean;
    ribbonTriangles: number;
    ribbonSampleCount: number;
    echoVisible: boolean;
    echoCount: number;
    positionBufferId: number;
    instanceMatrixId: number;
    instanceColorId: number;
    instanceAlphaId: number;
    minimumEchoAlpha: number;
    maximumEchoAlpha: number;
    finaleOpacity: number;
    echoColors: Array<[number, number, number]>;
    echoAlphas: number[];
  };
}

declare global {
  interface Window {
    __EVANLY_SCROLL__?: {
      version: 1;
      snapshot(): ScrollInspectionSnapshot;
      rawForSemantic(semanticT: number): number;
      measureSubjects(subjectIds: readonly string[]): MountedSceneSubjectMeasurement;
      setTrailsEnabledForMeasurement(enabled: boolean): void;
    };
  }
}

function frameMetrics(samples: readonly number[]) {
  if (samples.length === 0) {
    return {
      samples: 0,
      meanMs: 0,
      p95Ms: 0,
      minimumMs: 0,
      maximumMs: 0,
    };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: samples.length,
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
    minimumMs: sorted[0],
    maximumMs: sorted.at(-1) as number,
  };
}

export function ProductionDirector({
  store,
  bikeRef,
  inspect,
}: {
  store: ProgressStore;
  bikeRef: RefObject<BikeRiderHandle | null>;
  inspect: boolean;
}) {
  const { camera, scene, size } = useThree();
  const rig = useMemo(buildProductionCameraRig, []);
  const semanticRef = useRef(0);
  const updateCountRef = useRef(0);
  const cameraTargetRef = useRef(new THREE.Vector3());
  const lastVersionRef = useRef(-1);
  const frameSamplesRef = useRef<number[]>([]);
  const bikePath = useMemo(() => new BikePath(), []);

  const director = useMemo(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      throw new Error('Production camera must be perspective');
    }
    const bike: ProgressAdapter = {
      setProgress: (semanticT) => {
        bikeRef.current?.setProgress(semanticT);
      },
    };
    const cameraAdapter: ProgressAdapter = {
      setProgress: (semanticT) => {
        const pose = rig.apply(camera, semanticT);
        cameraTargetRef.current.copy(pose.target);
      },
    };
    const content: ProgressAdapter = {
      setProgress: (semanticT) => {
        scene.userData.activeSection = productionCameraSectionAt(semanticT);
        scene.userData.contentProgress = semanticT;
      },
    };
    const fx: ProgressAdapter = {
      setProgress: (semanticT) => {
        bikeRef.current?.setTrailFx(semanticT);
        scene.userData.fxProgress = semanticT;
      },
    };
    return new ProgressDirector({
      bike,
      camera: cameraAdapter,
      content,
      fx,
    });
  }, [bikeRef, camera, rig, scene]);

  useFrame((_state, delta) => {
    const samples = frameSamplesRef.current;
    samples.push(delta * 1000);
    if (samples.length > FRAME_SAMPLE_LIMIT) samples.shift();

    const snapshot = store.read();
    if (snapshot.version === lastVersionRef.current) return;
    semanticRef.current = director.setProgress(snapshot.raw);
    updateCountRef.current += 1;
    lastVersionRef.current = snapshot.version;
  }, -100);

  useEffect(() => {
    if (!inspect) return undefined;
    const api = {
      version: 1 as const,
      rawForSemantic,
      snapshot: (): ScrollInspectionSnapshot => {
        const progress = store.read();
        const bike = bikeRef.current?.snapshot();
        const bikeObject = bikeRef.current?.object();
        const bikeNdc = bike
          ? new THREE.Vector3(...bike.position).project(camera)
          : undefined;
        const bikeFraming = bikeObject
          ? measureBikeFraming(bikeObject, camera, size)
          : undefined;
        const ribbon = scene.getObjectByName('bike-tron-ribbon');
        const echoes = scene.getObjectByName('bike-sandevistan-echoes');
        const echoMesh = echoes instanceof THREE.InstancedMesh
          ? echoes
          : undefined;
        const echoAlpha = echoMesh?.geometry.getAttribute('instanceAlpha');
        let minimumEchoAlpha = Number.POSITIVE_INFINITY;
        let maximumEchoAlpha = 0;
        const echoColors: Array<[number, number, number]> = [];
        const echoAlphas: number[] = [];
        if (echoAlpha) {
          const echoCount = echoMesh?.count ?? 0;
          for (let index = 0; index < echoCount; index += 1) {
            const alpha = echoAlpha.getX(index);
            echoAlphas.push(alpha);
            minimumEchoAlpha = Math.min(
              minimumEchoAlpha,
              alpha,
            );
            maximumEchoAlpha = Math.max(
              maximumEchoAlpha,
              alpha,
            );
            if (echoMesh?.instanceColor) {
              echoColors.push([
                echoMesh.instanceColor.getX(index),
                echoMesh.instanceColor.getY(index),
                echoMesh.instanceColor.getZ(index),
              ]);
            }
          }
        }
        const expectedBike = bikePath.state(semanticRef.current);
        const expectedCamera = rig.sample(semanticRef.current);
        const sentinel = document.querySelector<HTMLElement>(
          '[data-scroll-sentinel]',
        );
        const pin = document.querySelector<HTMLElement>('[data-scroll-pin]');
        const maximum = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        return {
          raw: progress.raw,
          semanticT: semanticRef.current,
          updateCount: updateCountRef.current,
          adapterOrder: ADAPTER_ORDER,
          activeSection: String(scene.userData.activeSection ?? 'intro'),
          camera: {
            position: camera.position.toArray(),
            target: cameraTargetRef.current.toArray(),
            fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 0,
            roll: measureCameraRoll(camera),
            positionError: camera.position.distanceTo(expectedCamera.position),
            targetError: cameraTargetRef.current.distanceTo(expectedCamera.target),
            fovError: camera instanceof THREE.PerspectiveCamera
              ? Math.abs(camera.fov - expectedCamera.fov)
              : Number.POSITIVE_INFINITY,
          },
          bike: bike && bikeNdc && bikeFraming ? {
            ...bike,
            ndc: bikeNdc.toArray(),
            inFrame: !bikeFraming.clipped
              && bikeFraming.visibleFraction === 1,
            framing: bikeFraming,
            positionError: new THREE.Vector3(...bike.position)
              .distanceTo(expectedBike.pos),
            quaternionError: 1 - Math.abs(
              new THREE.Quaternion(...bike.quaternion).dot(expectedBike.quat),
            ),
            poseError: Math.max(
              Math.abs(bike.pose.lean - expectedBike.pose.lean),
              Math.abs(bike.pose.pitch - expectedBike.pose.pitch),
              Math.abs(bike.pose.crouch - expectedBike.pose.crouch),
              Math.abs(bike.pose.wheelSpin - expectedBike.pose.wheelSpin),
            ),
          } : undefined,
          canvas: { width: size.width, height: size.height },
          scroll: {
            y: window.scrollY,
            maximum,
            sentinelHeight: sentinel?.getBoundingClientRect().height ?? 0,
            pinned: pin?.dataset.scrollRuntime === 'active',
            shot: sentinel?.dataset.shot === 'true',
            reducedMotion: sentinel?.dataset.reducedMotion === 'true',
          },
          performance: frameMetrics(frameSamplesRef.current),
          trails: ribbon instanceof THREE.Mesh
            && ribbon.geometry instanceof THREE.BufferGeometry
            && echoMesh
            && echoMesh.instanceColor
            && echoAlpha
            ? {
                ribbonVisible: ribbon.visible,
                ribbonTriangles: ribbon.geometry.drawRange.count / 3,
                ribbonSampleCount:
                  ribbon.geometry.drawRange.count / 6 + 1,
                echoVisible: echoMesh.visible,
                echoCount: echoMesh.count,
                positionBufferId: (
                  ribbon.geometry.getAttribute('position') as THREE.BufferAttribute
                ).id,
                instanceMatrixId: echoMesh.instanceMatrix.id,
                instanceColorId: echoMesh.instanceColor.id,
                instanceAlphaId: (
                  echoAlpha as THREE.InstancedBufferAttribute
                ).id,
                minimumEchoAlpha: Number.isFinite(minimumEchoAlpha)
                  ? minimumEchoAlpha
                  : 0,
                maximumEchoAlpha,
                finaleOpacity: bike?.finaleOpacity ?? 1,
                echoColors,
                echoAlphas,
              }
            : undefined,
        };
      },
      measureSubjects: (subjectIds: readonly string[]) =>
        measureMountedSceneSubjects(scene, camera, size, subjectIds),
      setTrailsEnabledForMeasurement: (enabled: boolean) => {
        const ribbon = scene.getObjectByName('bike-tron-ribbon');
        const echoes = scene.getObjectByName('bike-sandevistan-echoes');
        if (ribbon) ribbon.visible = enabled;
        if (echoes) echoes.visible = enabled;
      },
    };
    window.__EVANLY_SCROLL__ = api;
    return () => {
      if (window.__EVANLY_SCROLL__ === api) delete window.__EVANLY_SCROLL__;
    };
  }, [bikePath, bikeRef, camera, inspect, rig, scene, size.height, size.width, store]);

  useEffect(() => () => {
    delete scene.userData.activeSection;
    delete scene.userData.contentProgress;
    delete scene.userData.fxProgress;
  }, [scene]);

  return null;
}
