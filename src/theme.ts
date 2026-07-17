/** Attempt-1 palette (verbatim). Cyan is reserved for the bike/rider. */
export const PALETTE = {
  void: '#0A0B1E',
  panel: '#141838',
  magenta: '#FF3DA6',
  cyan: '#2BFDF9',
  amber: '#FFC857',
  violet: '#8A6CFF',
  lime: '#9DFF57',
  red: '#FF4D5E',
  blue: '#4D8CFF',
  white: '#EEF2FF',
} as const;

const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/**
 * Compatibility shim for the ported bike (cybersite bike.ts imports
 * COLORS.{tronCyan,signalMagenta,moonlight} as numbers). Mapped onto the
 * attempt-1 palette; cyan stays bike-reserved.
 */
export const COLORS = {
  tronCyan: hexNum(PALETTE.cyan),
  signalMagenta: hexNum(PALETTE.magenta),
  moonlight: hexNum(PALETTE.white),
} as const;

/** Starting lighting/bloom values; tuned live in the viewer HUD. */
export const LIGHTING = {
  ambientIntensity: 0.35,
  keyIntensity: 2.2,
  fillIntensity: 0.8,
  rimIntensity: 1.4,
  bloomIntensity: 0.6,
  bloomThreshold: 0.75,
  bloomRadius: 0.6,
  exposure: 1.0,
} as const;
