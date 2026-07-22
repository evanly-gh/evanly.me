import { StrictMode, useEffect, type ComponentType } from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const useGLTFMock = vi.hoisted(() => Object.assign(vi.fn(), {
  preload: vi.fn(),
}));
const useTextureMock = vi.hoisted(() => vi.fn());

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    useGLTF: useGLTFMock,
    useTexture: useTextureMock,
  };
});

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;

function collectMeshResources(root: THREE.Object3D): {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
  });
  return { geometries, materials };
}

function trackDisposals(resources: Iterable<Disposable>): Map<Disposable, number> {
  const counts = new Map<Disposable, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => {
      counts.set(resource, (counts.get(resource) ?? 0) + 1);
    });
  }
  return counts;
}

function expectEveryCount(
  counts: Map<Disposable, number>,
  expected: number,
): void {
  for (const count of counts.values()) expect(count).toBe(expected);
}

describe('StrictMode R3F lifecycle ownership', () => {
  it('mounts, unmounts, and remounts without disposing cached GLTF or texture data', async () => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { search: '' },
    });
    const textureDocument = {
      createElement: () => {
          const context = {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            fillRect() {},
            strokeRect() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            createImageData: (width: number, height: number) => ({
              data: new Uint8ClampedArray(width * height * 4),
            }),
            putImageData() {},
          };
          return {
            width: 1,
            height: 1,
            getContext: () => context,
          };
      },
    };

    const cachedMap = new THREE.Texture();
    const cachedGeometry = new THREE.BoxGeometry(2, 3, 4);
    const cachedMaterial = new THREE.MeshStandardMaterial({ map: cachedMap });
    const instancedScene = new THREE.Group();
    instancedScene.add(new THREE.Mesh(cachedGeometry, cachedMaterial));

    const robotGeometry = new THREE.BoxGeometry(1, 2, 1);
    const robotMap = new THREE.Texture();
    const robotMaterial = new THREE.MeshStandardMaterial({ map: robotMap });
    const robotScene = new THREE.Group();
    robotScene.add(new THREE.Mesh(robotGeometry, robotMaterial));

    const moonAlbedo = new THREE.Texture();
    const moonHeight = new THREE.Texture();
    useGLTFMock.mockImplementation((url: string) => ({
      scene: url.includes('robot_recon') ? robotScene : instancedScene,
    }));
    useTextureMock.mockReturnValue([moonAlbedo, moonHeight]);

    const instancing = await import('../src/components/three/InstancedPieces');
    const cityModule = await import('../src/components/three/City');
    const lifecycle = await import(
      '../src/components/three/useCommittedThreeResources'
    );
    const lifecycleEvents: Array<{
      allocationId: number;
      label: string;
      phase: 'created' | 'disposed';
    }> = [];
    const allocationLedger = new Map<number, {
      label: string;
      disposeEvents: number;
      resourceDisposals: Map<Disposable, number>;
    }>();
    const unsubscribeLifecycle = lifecycle.subscribeThreeResourceLifecycle(
      ({ allocationId, label, phase, resources }) => {
        lifecycleEvents.push({ allocationId, label, phase });
        if (phase === 'created') {
          const resourceDisposals = new Map<Disposable, number>();
          for (const rawResource of resources) {
            const resource = rawResource as Disposable;
            resourceDisposals.set(resource, 0);
            resource.addEventListener('dispose', () => {
              resourceDisposals.set(
                resource,
                (resourceDisposals.get(resource) ?? 0) + 1,
              );
            });
          }
          allocationLedger.set(allocationId, {
            label,
            disposeEvents: 0,
            resourceDisposals,
          });
        } else {
          const entry = allocationLedger.get(allocationId);
          if (entry) entry.disposeEvents += 1;
        }
      },
    );
    const lifecycleComponents = cityModule as typeof cityModule & {
      FinaleBridge?: ComponentType;
      WaterBasin?: ComponentType;
      Moon?: ComponentType;
      Signs?: ComponentType;
      ShibuyaFacadePanels?: ComponentType;
      Pillars?: ComponentType;
      Roads?: ComponentType;
      Ground?: ComponentType;
      StreetFurniture?: ComponentType;
      Skyline?: ComponentType;
      JunkRamp?: ComponentType;
      Ramp2?: ComponentType;
      Scaffold?: ComponentType;
      StreetDressing?: ComponentType;
      RobotCharacter?: ComponentType<{
        spot: {
          file: string;
          x: number;
          z: number;
          r: number;
          roadIndex: number;
        };
      }>;
    };
    expect(lifecycleComponents.FinaleBridge).toBeTypeOf('function');
    expect(lifecycleComponents.WaterBasin).toBeTypeOf('function');
    expect(lifecycleComponents.Moon).toBeTypeOf('function');
    expect(lifecycleComponents.Signs).toBeTypeOf('function');
    expect(lifecycleComponents.ShibuyaFacadePanels).toBeTypeOf('function');
    for (const component of [
      lifecycleComponents.Pillars,
      lifecycleComponents.Roads,
      lifecycleComponents.Ground,
      lifecycleComponents.StreetFurniture,
      lifecycleComponents.Skyline,
      lifecycleComponents.JunkRamp,
      lifecycleComponents.Ramp2,
      lifecycleComponents.Scaffold,
      lifecycleComponents.StreetDressing,
    ]) {
      expect(component).toBeTypeOf('function');
    }
    expect(lifecycleComponents.RobotCharacter).toBeTypeOf('function');

    const cachedCounts = trackDisposals([
      cachedGeometry,
      cachedMaterial,
      cachedMap,
      robotGeometry,
      robotMaterial,
      robotMap,
      moonAlbedo,
      moonHeight,
    ]);
    const strictEffects = { renders: 0, setups: 0, cleanups: 0 };
    const StrictProbe = () => {
      strictEffects.renders += 1;
      useEffect(() => {
        strictEffects.setups += 1;
        return () => { strictEffects.cleanups += 1; };
      }, []);
      return null;
    };

    const Fixture = () => (
      <StrictMode>
        <group>
          <StrictProbe />
          <instancing.InstancedPieces
            placements={[{
              file: 'props/test.glb',
              position: [0, 0, 0],
              rotationY: 0,
            }]}
          />
          <lifecycleComponents.FinaleBridge />
          <lifecycleComponents.WaterBasin />
          <lifecycleComponents.Signs />
          <lifecycleComponents.ShibuyaFacadePanels />
          <lifecycleComponents.Pillars />
          <lifecycleComponents.Roads />
          <lifecycleComponents.Ground />
          <lifecycleComponents.StreetFurniture />
          <lifecycleComponents.Skyline />
          <lifecycleComponents.JunkRamp />
          <lifecycleComponents.Ramp2 />
          <lifecycleComponents.Scaffold />
          <lifecycleComponents.StreetDressing />
          <lifecycleComponents.RobotCharacter
            spot={{
              file: 'props/robot_recon.glb',
              x: 0,
              z: 0,
              r: 0,
              roadIndex: 0,
            }}
          />
          <lifecycleComponents.Moon />
        </group>
      </StrictMode>
    );

    const mount = async () => {
      Reflect.deleteProperty(globalThis, 'document');
      const renderer = await ReactThreeTestRenderer.create(<Fixture />, {
        beforeReturn: () => {
          Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: textureDocument,
          });
        },
      });
      const scene = renderer.scene.instance;
      const bridge = scene.getObjectByName('lifecycle-finale-bridge-owned');
      const water = scene.getObjectByName('task4-water-basin');
      const robot = scene.getObjectByName('lifecycle-robot-clone');
      const chunks = scene.getObjectsByProperty(
        'name',
        'lifecycle-spatial-chunk',
      );
      const moonSurface = scene.getObjectByName('task4-moon-surface');
      const moonHalo = scene.getObjectByName('task4-moon-halo');
      expect(bridge).toBeDefined();
      expect(water).toBeDefined();
      expect(robot).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
      expect(moonSurface).toBeDefined();
      expect(moonHalo).toBeDefined();

      const bridgeResources = collectMeshResources(bridge!);
      const waterResources = collectMeshResources(water!);
      const robotResources = collectMeshResources(robot!);
      const moonResources = [
        collectMeshResources(moonSurface!),
        collectMeshResources(moonHalo!),
      ];
      const chunkMaterials = new Set<THREE.Material>();
      for (const chunk of chunks) {
        const resources = collectMeshResources(chunk);
        for (const material of resources.materials) chunkMaterials.add(material);
      }
      const ownedResources = new Set<Disposable>([
        ...bridgeResources.geometries,
        ...bridgeResources.materials,
        ...waterResources.geometries,
        ...waterResources.materials,
        ...robotResources.materials,
        ...chunkMaterials,
        ...moonResources.flatMap(({ geometries }) => [...geometries]),
        ...moonResources.flatMap(({ materials }) => [...materials]),
      ]);
      const ownedCounts = trackDisposals(ownedResources);
      expectEveryCount(ownedCounts, 0);

      return {
        renderer,
        ownedResources,
        ownedCounts,
        moonSurface: moonSurface as THREE.Mesh,
      };
    };

    const first = await mount();
    expect(lifecycleEvents.some(({ label, phase }) =>
      label === 'instanced:props/test.glb' && phase === 'created')).toBe(true);
    for (const label of [
      'signs',
      'shibuya-panels',
      'finale-bridge',
      'water',
      'robot:props/robot_recon.glb',
      'pillars',
      'roads',
      'ground',
      'street-furniture',
      'skyline',
      'junk-ramp',
      'ramp-2',
      'scaffold',
      'street-dressing',
    ]) {
      expect(
        lifecycleEvents.some(event =>
          event.label === label && event.phase === 'created'),
        label,
      ).toBe(true);
    }
    expect(strictEffects.renders).toBeGreaterThanOrEqual(2);
    expect(strictEffects.setups).toBeGreaterThanOrEqual(1);
    expect(strictEffects.cleanups).toBe(strictEffects.setups - 1);
    expect(first.moonSurface.geometry.getAttribute('position').count)
      .toBeGreaterThan(0);
    await first.renderer.unmount();
    expect(strictEffects.cleanups).toBe(strictEffects.setups);
    expectEveryCount(first.ownedCounts, 1);
    expectEveryCount(cachedCounts, 0);
    const createdAfterFirst = lifecycleEvents.filter(({ phase }) =>
      phase === 'created');
    const disposedAfterFirst = lifecycleEvents.filter(({ phase }) =>
      phase === 'disposed');
    expect(disposedAfterFirst.map(({ allocationId }) => allocationId).sort())
      .toEqual(createdAfterFirst.map(({ allocationId }) => allocationId).sort());
    for (const entry of allocationLedger.values()) {
      expect(entry.disposeEvents, entry.label).toBe(1);
      expectEveryCount(entry.resourceDisposals, 1);
    }

    const second = await mount();
    expect(strictEffects.renders).toBeGreaterThanOrEqual(4);
    expect(strictEffects.cleanups).toBe(strictEffects.setups - 1);
    for (const resource of second.ownedResources) {
      expect(first.ownedResources.has(resource)).toBe(false);
    }
    expect(second.moonSurface.geometry.getAttribute('position').count)
      .toBeGreaterThan(0);
    await second.renderer.unmount();
    expect(strictEffects.cleanups).toBe(strictEffects.setups);
    expectEveryCount(second.ownedCounts, 1);
    expectEveryCount(cachedCounts, 0);
    const created = lifecycleEvents.filter(({ phase }) => phase === 'created');
    const disposed = lifecycleEvents.filter(({ phase }) => phase === 'disposed');
    expect(disposed.map(({ allocationId }) => allocationId).sort())
      .toEqual(created.map(({ allocationId }) => allocationId).sort());
    const expectedLabels = [
      'instanced:props/test.glb',
      'signs',
      'shibuya-panels',
      'finale-bridge',
      'water',
      'robot:props/robot_recon.glb',
      'pillars',
      'roads',
      'ground',
      'street-furniture',
      'skyline',
      'junk-ramp',
      'ramp-2',
      'scaffold',
      'street-dressing',
    ];
    for (const label of expectedLabels) {
      expect(
        [...allocationLedger.values()].filter(entry => entry.label === label),
        label,
      ).toHaveLength(2);
    }
    for (const entry of allocationLedger.values()) {
      expect(entry.disposeEvents, entry.label).toBe(1);
      expect(entry.resourceDisposals.size, entry.label).toBeGreaterThan(0);
      expectEveryCount(entry.resourceDisposals, 1);
    }
    expect(
      [...allocationLedger.values()].filter(entry => entry.disposeEvents === 0),
    ).toHaveLength(0);
    const ownedResourceDisposals = [...allocationLedger.values()]
      .reduce((sum, entry) => sum + entry.resourceDisposals.size, 0);
    expect(ownedResourceDisposals).toBeGreaterThan(0);
    console.log('[lifecycle-ledger]', JSON.stringify({
      factoryLabels: expectedLabels.length,
      allocationsCreated: allocationLedger.size,
      allocationsDisposed: disposed.length,
      ownedResourceDisposals,
      liveOwnedAllocations: 0,
      cachedDisposals: [...cachedCounts.values()]
        .reduce((sum, count) => sum + count, 0),
    }));
    unsubscribeLifecycle();
  }, 60_000);
});
