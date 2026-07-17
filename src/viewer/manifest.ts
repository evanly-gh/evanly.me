export interface KitPiece {
  name: string;
  file: string;
  bbox: [number, number, number];
  hasEmissive: boolean;
  tris: number;
  category: 'LG' | 'MD' | 'SM' | 'prop';
}

const CATEGORIES = ['LG', 'MD', 'SM', 'prop'] as const;

export function validateManifest(data: unknown): KitPiece[] {
  if (!Array.isArray(data)) throw new Error('manifest: expected an array');
  const out = data.map((e, i) => {
    if (typeof e !== 'object' || e === null) throw new Error(`manifest[${i}]: not an object`);
    const o = e as Record<string, unknown>;
    if (typeof o.name !== 'string') throw new Error(`manifest[${i}]: name`);
    if (typeof o.file !== 'string') throw new Error(`manifest[${i}]: file`);
    if (!Array.isArray(o.bbox) || o.bbox.length !== 3 || !o.bbox.every(n => typeof n === 'number'))
      throw new Error(`manifest[${i}]: bbox`);
    if (typeof o.hasEmissive !== 'boolean') throw new Error(`manifest[${i}]: hasEmissive`);
    if (typeof o.tris !== 'number') throw new Error(`manifest[${i}]: tris`);
    if (!CATEGORIES.includes(o.category as typeof CATEGORIES[number])) throw new Error(`manifest[${i}]: category`);
    return {
      name: o.name, file: o.file, bbox: o.bbox as [number, number, number],
      hasEmissive: o.hasEmissive, tris: o.tris, category: o.category as KitPiece['category'],
    };
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
