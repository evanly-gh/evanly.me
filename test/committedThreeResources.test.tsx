import { StrictMode, type ComponentType } from 'react';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as committedResources from '../src/components/three/useCommittedThreeResources';

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

describe('commit-phase Three resource ownership', () => {
  it('disposes resources registered before a factory throws', () => {
    const runCommittedThreeFactory = (
      committedResources as typeof committedResources & {
        runCommittedThreeFactory?: <T>(
          label: string,
          create: (scope: {
            own: <R extends THREE.Material>(resource: R) => R;
          }) => T,
        ) => unknown;
      }
    ).runCommittedThreeFactory;
    expect(runCommittedThreeFactory).toBeTypeOf('function');
    const material = new THREE.MeshBasicMaterial();
    let disposals = 0;
    material.addEventListener('dispose', () => { disposals += 1; });
    expect(() => runCommittedThreeFactory!('failing-factory', ({ own }) => {
      own(material);
      throw new Error('factory failed');
    })).toThrow(/factory failed/);
    expect(disposals).toBe(1);
  });

  it('allocates after StrictMode render and disposes every allocation once', async () => {
    const module = committedResources as typeof committedResources & {
      useCommittedThreeResource?: <T>(
        label: string,
        create: () => { value: T; resources: THREE.Material[] },
        dependencies: readonly unknown[],
      ) => T | null;
      subscribeThreeResourceLifecycle?: (
        listener: (event: {
          allocationId: number;
          label: string;
          phase: 'created' | 'disposed';
          resources: committedResources.ThreeDisposable[];
        }) => void,
      ) => () => void;
    };
    expect(module.useCommittedThreeResource).toBeTypeOf('function');
    expect(module.subscribeThreeResourceLifecycle).toBeTypeOf('function');

    const events: Array<{
      allocationId: number;
      label: string;
      phase: 'created' | 'disposed';
      resources: committedResources.ThreeDisposable[];
    }> = [];
    const unsubscribe = module.subscribeThreeResourceLifecycle!(event => {
      events.push(event);
    });
    let renderCount = 0;
    let factoryCount = 0;
    const materials: THREE.Material[] = [];
    const disposalCounts = new Map<THREE.Material, number>();

    const Probe: ComponentType = () => {
      renderCount += 1;
      const material = module.useCommittedThreeResource!(
        'strict-probe',
        () => {
          factoryCount += 1;
          const owned = new THREE.MeshBasicMaterial();
          materials.push(owned);
          disposalCounts.set(owned, 0);
          owned.addEventListener('dispose', () => {
            disposalCounts.set(owned, (disposalCounts.get(owned) ?? 0) + 1);
          });
          return { value: owned, resources: [owned] };
        },
        [],
      );
      return material
        ? (
            <mesh material={material} dispose={null}>
              <boxGeometry />
            </mesh>
          )
        : null;
    };

    const mount = () => ReactThreeTestRenderer.create(
      <StrictMode><group><Probe /></group></StrictMode>,
    );
    const first = await mount();
    expect(renderCount).toBeGreaterThan(factoryCount);
    expect(factoryCount).toBe(1);
    expect(events.map(({ phase }) => phase)).toEqual(['created']);
    await first.unmount();
    expect(disposalCounts.get(materials[0])).toBe(1);
    expect(events.map(({ phase }) => phase)).toEqual(['created', 'disposed']);

    const second = await mount();
    expect(factoryCount).toBe(2);
    expect(materials[1]).not.toBe(materials[0]);
    await second.unmount();
    expect(disposalCounts.get(materials[1])).toBe(1);
    expect(events.map(({ phase }) => phase)).toEqual([
      'created',
      'disposed',
      'created',
      'disposed',
    ]);
    expect(new Set(events.map(({ allocationId }) => allocationId)).size).toBe(2);
    unsubscribe();
  }, 20_000);
});
