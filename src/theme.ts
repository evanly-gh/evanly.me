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

/** Cyberpunk night lighting: dark base so neon/billboards dominate, moonlit
 *  key + colored neon fills for the ambiance. Tuned live in the viewer HUD. */
export const LIGHTING = {
  ambientIntensity: 0.05,  // deep base darkness so neon dominates
  keyIntensity: 0.55,
  fillIntensity: 0.5,
  rimIntensity: 1.4,
  envIntensity: 0.14,   // scene.environment contribution (lower = moodier)
  bloomIntensity: 1.4,  // vibrant neon bloom
  bloomThreshold: 0.5,
  bloomRadius: 0.85,
  exposure: 1.0,
} as const;
