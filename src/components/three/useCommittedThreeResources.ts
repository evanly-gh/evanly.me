import {
  useLayoutEffect,
  useState,
  type DependencyList,
} from 'react';

export interface ThreeDisposable {
  dispose: () => void;
}

export interface CommittedThreeAllocation<T> {
  value: T;
  resources: Iterable<ThreeDisposable>;
}

export interface ThreeResourceScope {
  own: <T extends ThreeDisposable>(resource: T) => T;
}

export interface ThreeResourceLifecycleEvent {
  allocationId: number;
  label: string;
  phase: 'created' | 'disposed';
  resources: ThreeDisposable[];
}

type LifecycleListener = (event: ThreeResourceLifecycleEvent) => void;

const lifecycleListeners = new Set<LifecycleListener>();
let nextAllocationId = 1;

export function subscribeThreeResourceLifecycle(
  listener: LifecycleListener,
): () => void {
  lifecycleListeners.add(listener);
  return () => lifecycleListeners.delete(listener);
}

function publish(event: ThreeResourceLifecycleEvent): void {
  for (const listener of lifecycleListeners) listener(event);
}

export function runCommittedThreeFactory<T>(
  label: string,
  create: (scope: ThreeResourceScope) => T,
): {
  value: T;
  resources: ThreeDisposable[];
  dispose: () => void;
} {
  const allocationId = nextAllocationId++;
  const registered: ThreeDisposable[] = [];
  const scope: ThreeResourceScope = {
    own: (resource) => {
      registered.push(resource);
      return resource;
    },
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const resources = [...new Set(registered)];
    for (const resource of resources) resource.dispose();
    publish({
      allocationId,
      label,
      phase: 'disposed',
      resources,
    });
  };
  try {
    const value = create(scope);
    const resources = [...new Set(registered)];
    publish({
      allocationId,
      label,
      phase: 'created',
      resources,
    });
    return { value, resources, dispose };
  } catch (error) {
    publish({
      allocationId,
      label,
      phase: 'created',
      resources: [...new Set(registered)],
    });
    dispose();
    throw error;
  }
}

export function useCommittedThreeResource<T>(
  label: string,
  create: (scope: ThreeResourceScope) => CommittedThreeAllocation<T>,
  dependencies: DependencyList,
): T | null {
  const [allocation, setAllocation] =
    useState<CommittedThreeAllocation<T> | null>(null);

  useLayoutEffect(() => {
    const committed = runCommittedThreeFactory(label, (scope) => {
      const created = create(scope);
      for (const resource of created.resources) scope.own(resource);
      return created;
    });
    setAllocation(committed.value);
    return committed.dispose;
  }, dependencies);

  return allocation?.value ?? null;
}
