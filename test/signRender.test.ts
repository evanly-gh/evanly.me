import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FACADE_SIGN_RENDER_CONFIG,
  HOLOGRAM_SIGN_RENDER_CONFIG,
  TASK5_SCENE_NAMES,
  buildSignRenderBatches,
  facadeDepthMetrics,
  frameTask5FacadeInspectionSubject,
  inspectTask5Scene,
  setTask5CameraView,
  type SignRenderBatch,
} from '../src/components/three/signRender';
import { buildSignLayout } from '../src/world/signLayout';

describe('sign render contracts', () => {
  it('renders facade screens front-sided, un-tone-mapped, and depth-biased', () => {
    expect(FACADE_SIGN_RENDER_CONFIG.screen).toMatchObject({
      side: THREE.FrontSide,
      toneMapped: false,
      polygonOffset: true,
      depthTest: true,
      depthWrite: true,
    });
    expect(FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetFactor).toBeLessThan(0);
    expect(FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetUnits).toBeLessThan(0);
    expect(FACADE_SIGN_RENDER_CONFIG.screen.renderOrder)
      .toBeGreaterThan(FACADE_SIGN_RENDER_CONFIG.backing.renderOrder);
    expect(FACADE_SIGN_RENDER_CONFIG.texture.background).toBe('opaque');
  });

  it('separates the screen and backing front by at least 0.06 metres', () => {
    const metrics = facadeDepthMetrics();

    expect(metrics.screenZ).toBe(0);
    expect(metrics.screenToBackingFront).toBeGreaterThanOrEqual(0.06);
    expect(metrics.backingRearZ).toBeGreaterThanOrEqual(
      -FACADE_SIGN_RENDER_CONFIG.screen.facadeOffset,
    );
    expect(metrics.screenZ).not.toBe(metrics.backingFrontZ);
    expect(FACADE_SIGN_RENDER_CONFIG.attachment.bracketDepth).toBe(
      FACADE_SIGN_RENDER_CONFIG.screen.facadeOffset,
    );
  });

  it('uses transparent additive holograms without a backing box', () => {
    expect(HOLOGRAM_SIGN_RENDER_CONFIG).toMatchObject({
      hasBacking: false,
      texture: {
        background: 'transparent',
        alpha: true,
      },
      screen: {
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      },
      beam: {
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      },
    });
    expect(HOLOGRAM_SIGN_RENDER_CONFIG.emitter.visible).toBe(true);
    expect(HOLOGRAM_SIGN_RENDER_CONFIG.beam.visible).toBe(true);
  });

  it('inspects instanced batch counts, depth, visibility, and draw objects', () => {
    const scene = new THREE.Scene();
    const batches = buildSignRenderBatches(buildSignLayout());
    const mount = (
      batch: SignRenderBatch,
      name: string,
      geometry: THREE.BufferGeometry,
    ): void => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({ visible: true }),
        batch.instances.length,
      );
      batch.instances.forEach(({ matrix }, index) => mesh.setMatrixAt(index, matrix));
      mesh.name = name;
      mesh.userData.instances = batch.instances;
      scene.add(mesh);
    };
    batches.facadeScreens.forEach((batch) =>
      mount(batch, TASK5_SCENE_NAMES.facadeScreen, new THREE.PlaneGeometry(1, 1)));
    mount(
      batches.backings,
      TASK5_SCENE_NAMES.facadeBacking,
      new THREE.BoxGeometry(1, 1, 1),
    );
    mount(
      batches.attachments,
      TASK5_SCENE_NAMES.facadeAttachment,
      new THREE.BoxGeometry(1, 1, 1),
    );
    batches.hologramScreens.forEach((batch) =>
      mount(batch, TASK5_SCENE_NAMES.hologramScreen, new THREE.PlaneGeometry(1, 1)));
    mount(
      batches.emitters,
      TASK5_SCENE_NAMES.hologramEmitter,
      new THREE.CylinderGeometry(1, 1.14, 1),
    );
    mount(
      batches.beams,
      TASK5_SCENE_NAMES.hologramBeam,
      new THREE.CylinderGeometry(0.16, 1, 1),
    );

    expect(inspectTask5Scene(scene, 120, 16)).toMatchObject({
      facadeCount: 120,
      hologramCount: 16,
      mountedFacadeScreens: 120,
      mountedFacadeBackings: 120,
      mountedHologramScreens: 16,
      mountedHologramBackings: 0,
      minimumScreenBackingSeparation: 0.06,
      drawObjectCount: 16,
      projectedTargets: [],
    });
    expect(inspectTask5Scene(scene, 120, 16).visibleScreenIds).toHaveLength(136);

    const camera = new THREE.PerspectiveCamera(58, 16 / 9, 1, 8000);
    const targetId = batches.facadeScreens[0].instances[0].id;
    expect(setTask5CameraView(scene, camera, targetId, 'direct')).toBe(true);
    const direct = inspectTask5Scene(
      scene,
      120,
      16,
      camera,
      { width: 1280, height: 720 },
    ).projectedTargets.find(({ id }) => id === targetId)!;
    expect(direct.inViewport).toBe(true);
    expect(direct.viewAngleCosine).toBeGreaterThan(0.9);

    expect(setTask5CameraView(scene, camera, targetId, 'grazing')).toBe(true);
    const grazing = inspectTask5Scene(
      scene,
      120,
      16,
      camera,
      { width: 1280, height: 720 },
    ).projectedTargets.find(({ id }) => id === targetId)!;
    expect(grazing.inViewport).toBe(true);
    expect(grazing.viewAngleCosine).toBeGreaterThan(0.12);
    expect(grazing.viewAngleCosine).toBeLessThan(0.4);

    const subject = frameTask5FacadeInspectionSubject(
      scene,
      camera,
      { width: 1280, height: 720 },
    );
    expect(subject.id).toMatch(/^facade-/);
    expect(subject.inViewport).toBe(true);
    expect(subject.occupancy.width).toBeGreaterThanOrEqual(0.3);
    expect(subject.occupancy.width).toBeLessThanOrEqual(0.8);
    expect(subject.occupancy.height).toBeGreaterThanOrEqual(0.12);
    expect(subject.occupancy.height).toBeLessThanOrEqual(0.8);
  });
});
