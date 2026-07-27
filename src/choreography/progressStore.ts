export interface ProgressSnapshot {
  raw: number;
  version: number;
}

export interface ProgressStore {
  read(): ProgressSnapshot;
  write(raw: number): ProgressSnapshot;
  subscribe(listener: (snapshot: ProgressSnapshot) => void): () => void;
}

export function createProgressStore(initialRaw = 0): ProgressStore {
  if (!Number.isFinite(initialRaw)) {
    throw new Error('Initial progress must be finite');
  }
  let snapshot: ProgressSnapshot = Object.freeze({
    raw: Math.max(0, Math.min(1, initialRaw)),
    version: 0,
  });
  const listeners = new Set<(snapshot: ProgressSnapshot) => void>();
  return Object.freeze({
    read: () => snapshot,
    subscribe(listener: (snapshot: ProgressSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    write(raw: number) {
      if (!Number.isFinite(raw)) {
        throw new Error('Progress store writes must be finite');
      }
      const clamped = Math.max(0, Math.min(1, raw));
      if (Object.is(clamped, snapshot.raw)) return snapshot;
      snapshot = Object.freeze({
        raw: clamped,
        version: snapshot.version + 1,
      });
      listeners.forEach((listener) => listener(snapshot));
      return snapshot;
    },
  });
}
