export interface StuntFlipTiming {
  id: 'flip-1' | 'flip-2';
  lip: number;
  apex: number;
  landing: number;
}

const timing = (
  id: StuntFlipTiming['id'],
  lip: number,
  apex: number,
  landing: number,
): Readonly<StuntFlipTiming> => Object.freeze({ id, lip, apex, landing });

export const STUNT_FLIP_TIMINGS = Object.freeze([
  timing('flip-1', 0.395, 0.41, 0.46),
  timing('flip-2', 0.575, 0.59, 0.64),
] as const);

export const FIRST_STUNT_FLIP = STUNT_FLIP_TIMINGS[0];
export const SECOND_STUNT_FLIP = STUNT_FLIP_TIMINGS[1];
