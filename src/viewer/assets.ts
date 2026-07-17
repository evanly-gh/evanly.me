import type { KitPiece } from './manifest';

export type AssetKind = 'kitbash' | 'bike' | 'character';

export interface AssetEntry {
  id: string;
  label: string;
  kind: AssetKind;
  /** public URL for gltf-loaded assets (kitbash, character) */
  src?: string;
  piece?: KitPiece;
}

export const CHARACTER_SRCS: string[] = [
  '/models/characters/Character.gltf',
];

export function buildRegistry(pieces: KitPiece[]): AssetEntry[] {
  const kit: AssetEntry[] = pieces.map(p => ({
    id: p.name, label: p.name, kind: 'kitbash', src: `/models/${p.file}`, piece: p,
  }));
  const bike: AssetEntry = { id: 'bike', label: 'Tron Bike (hero)', kind: 'bike' };
  const chars: AssetEntry[] = CHARACTER_SRCS.map((src, i) => ({
    id: `char-${i}`, label: `Character ${i + 1}`, kind: 'character', src,
  }));
  return [bike, ...kit, ...chars];
}
