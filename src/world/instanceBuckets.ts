export const INSTANCE_CHUNK_SIZE = 180;

export interface SpatialChunk<T> {
  id: string;
  items: T[];
}

export function buildSpatialChunks<T extends {
  position: [number, number, number];
}>(
  items: T[],
  chunkSize = INSTANCE_CHUNK_SIZE,
): SpatialChunk<T>[] {
  const chunks = new Map<string, T[]>();
  for (const item of items) {
    const x = Math.floor(item.position[0] / chunkSize);
    const z = Math.floor(item.position[2] / chunkSize);
    const id = `${x}:${z}`;
    const chunk = chunks.get(id) ?? [];
    chunk.push(item);
    chunks.set(id, chunk);
  }
  return [...chunks]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([id, members]) => ({ id, items: members }));
}

export function buildModelSpatialBuckets<T extends {
  file: string;
  materialVariant?: string;
  position: [number, number, number];
}>(
  items: T[],
  chunkSize = INSTANCE_CHUNK_SIZE,
): Array<SpatialChunk<T> & { file: string }> {
  const files = new Map<string, T[]>();
  for (const item of items) {
    const group = files.get(item.file) ?? [];
    group.push(item);
    files.set(item.file, group);
  }
  return [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([file, members]) =>
      buildSpatialChunks(members, chunkSize).map((chunk) => ({
        ...chunk,
        id: `${file}@${chunk.id}`,
        file,
      })));
}
