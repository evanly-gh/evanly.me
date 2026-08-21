/**
 * Shared canvas-2D primitives for the in-world billboards (research canyon,
 * project flip wall, About poster). They give every board the same cyberpunk
 * "ad-plate" look from the reference art: a double neon frame, machined corner
 * brackets, a top-right index chip, a right-side hero halo, a bottom-left brand
 * lockup, and text blocks that shrink-to-fit uniformly (never squashed, never
 * throwing on overflow — the old renderers threw when copy grew).
 *
 * Pure 2D canvas — no three.js — so it can be imported from `content/`,
 * `world/`, and `components/three/` without creating a dependency cycle.
 */

export interface BillboardPalette {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
}

export const withAlpha = (hex: string, alpha: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * The plate IS the poster: the content surface fills the canvas edge-to-edge,
 * with only a single hairline glow rim hugging the very edge. No dark
 * background margin, no double neon frame, no glow panel behind the board.
 */
export function drawNeonPlate(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  palette: BillboardPalette,
): { inset: number } {
  const min = Math.min(W, H);
  // Fill the whole plate with the content surface — the poster, edge to edge.
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, W, H);

  // A single hairline rim right on the edge. NO shadow/glow — the scene's bloom
  // pass amplifies any bright edge into a thick halo ("glow panel"), which is
  // exactly what we're avoiding. This is a crisp, dim, 1px definition line only.
  ctx.save();
  ctx.strokeStyle = withAlpha(palette.primary, 0.35);
  ctx.lineWidth = Math.max(1, Math.round(min * 0.0016));
  const edge = 1;
  ctx.strokeRect(edge, edge, W - 2 * edge, H - 2 * edge);
  ctx.restore();

  // Content padding reference for the text column / lockup / brackets.
  const inset = Math.round(min * 0.02);
  return { inset };
}

/** Machined L-brackets at each corner of the inner frame. */
export function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  inset: number,
  color: string,
): void {
  const min = Math.min(W, H);
  const len = Math.round(min * 0.045);
  const off = inset + Math.round(min * 0.012);
  const lw = Math.max(2, Math.round(min * 0.004));
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.8);
  // No shadow blur — the scene bloom pass would smear these corner accents into
  // the thick frame glow we're removing. Keep them as crisp machined ticks.
  ctx.lineWidth = lw;
  const corner = (cx: number, cy: number, sx: number, sy: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.stroke();
  };
  corner(off, off, 1, 1);
  corner(W - off, off, -1, 1);
  corner(off, H - off, 1, -1);
  corner(W - off, H - off, -1, -1);
  ctx.restore();
}

/** Top-right index chip, e.g. "03 / 04" or "RESEARCH 01". */
export function drawCornerIndex(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  inset: number,
  text: string,
  color: string,
): void {
  const min = Math.min(W, H);
  const fs = Math.round(min * 0.05);
  ctx.save();
  ctx.font = `700 ${fs}px ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  const padX = Math.round(min * 0.03);
  const x = W - inset - padX;
  const y = inset + padX;
  // small tick block to the right of the frame edge
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.round(min * 0.008);
  ctx.fillText(text, x, y);
  ctx.restore();
  ctx.textAlign = 'start';
}

/** Right-side hero halo — a soft radial bloom behind imagery / to balance the
 *  left text column, as in the reference plate. */
export function drawHeroHalo(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  color: string,
): void {
  const cx = W * 0.82;
  const cy = H * 0.52;
  const r = Math.min(W, H) * 0.42;
  const gradient = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  gradient.addColorStop(0, withAlpha(color, 0.2));
  gradient.addColorStop(0.5, withAlpha(color, 0.08));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Bottom-left brand lockup: a small neon dot + monospace wordmark. */
export function drawBrandLockup(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  inset: number,
  text: string,
  color: string,
  textColor: string,
): void {
  const min = Math.min(W, H);
  const fs = Math.round(min * 0.042);
  const padX = inset + Math.round(min * 0.03);
  const y = H - inset - Math.round(min * 0.055);
  const dotR = Math.round(fs * 0.34);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.round(min * 0.008);
  ctx.beginPath();
  ctx.arc(padX + dotR, y + fs * 0.55, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 ${fs}px ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = textColor;
  ctx.shadowBlur = 0;
  ctx.fillText(text, padX + dotR * 2 + Math.round(min * 0.02), y + fs * 0.08);
  ctx.restore();
}

/** Word-wrap `text` to `maxWidth` at the current font, capped to `maxLines`.
 *  Uniform — no horizontal squash, and never throws on overflow. */
export function wrapToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Neon glow can be at most this fraction of the rendered font size. Tuned to
 *  the readable look of the TTT-E2E ribbon: legible letters, soft halo. */
const GLOW_TO_FONT_RATIO = 0.16;

export interface TextBlockOptions {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  maxLines: number;
  sizePx: number;
  color: string;
  weight: string;
  mono: boolean;
  glow: number;
  lineHeightScale?: number;
  /** If set, the font also shrinks so all wrapped lines fit within this pixel
   *  height (keeps long copy from spilling past the plate / into the lockup). */
  maxHeight?: number;
}

/**
 * Draw a shrink-to-fit text block: the font shrinks uniformly until every
 * wrapped line fits `maxWidth` (and, if `maxHeight` is set, until all lines fit
 * that height too), then draws with a coloured neon glow. Returns the y-cursor
 * below the block so callers can stack blocks.
 */
export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  options: TextBlockOptions,
): number {
  const {
    text, x, y, maxWidth, maxLines, color, weight, mono, glow,
  } = options;
  if (!text) return y;
  const family = mono
    ? 'ui-monospace, monospace'
    : 'Inter, system-ui, sans-serif';
  const fontFor = (px: number) => `${weight} ${Math.round(px)}px ${family}`;
  const lineHeightScale = options.lineHeightScale ?? 1.14;
  let fs = options.sizePx;
  let lines: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    ctx.font = fontFor(fs);
    lines = wrapToWidth(ctx, text, maxWidth, maxLines);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
    const totalHeight = lines.length * fs * lineHeightScale;
    const widthScale = widest > maxWidth ? maxWidth / widest : 1;
    const heightScale = options.maxHeight && totalHeight > options.maxHeight
      ? options.maxHeight / totalHeight
      : 1;
    const scale = Math.min(widthScale, heightScale);
    if (scale >= 0.999) break;
    fs *= scale;
  }
  ctx.font = fontFor(fs);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  // Glow is capped to a fraction of the *rendered* font size so shrunk copy
  // never blooms into an unreadable smear — this keeps every board at the
  // clean, readable glow level of the TTT-E2E ribbon.
  ctx.shadowBlur = Math.min(glow, fs * GLOW_TO_FONT_RATIO);
  ctx.textBaseline = 'top';
  const lh = fs * lineHeightScale;
  let cursor = y;
  for (const l of lines) {
    ctx.fillText(l, x, cursor);
    cursor += lh;
  }
  ctx.restore();
  return cursor + fs * 0.35;
}
