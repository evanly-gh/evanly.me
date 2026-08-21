import { RESUME, type ImageSlot } from './resume';
import {
  type BillboardPalette,
  drawBrandLockup,
  drawCornerBrackets,
  drawCornerIndex,
  drawHeroHalo,
  drawTextBlock,
  withAlpha,
} from './billboardFrame';

export const ABOUT_PORTRAIT_FALLBACK_SRC =
  '/images/about/about-portrait-placeholder.webp';

// Aspect matched to the hero screen plane (110x70 = 1.571) so the poster art is
// not horizontally stretched on the billboard.
export const ABOUT_ART_SIZE = Object.freeze({
  width: 3072,
  height: 1954,
});

export type AboutArtRegionId =
  | 'background'
  | 'portrait'
  | 'portrait-badge'
  | 'name'
  | 'tagline'
  | 'bio'
  | 'contact';

export interface AboutArtRegion {
  id: AboutArtRegionId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AboutArtLayout {
  size: typeof ABOUT_ART_SIZE;
  pixelsPerMetre: number;
  regions: AboutArtRegion[];
  typography: {
    name: number;
    tagline: number;
    bio: number;
    contact: number;
    badge: number;
  };
  portrait: {
    src: string;
    isPlaceholder: boolean;
    badgeLines: string[];
  };
  copy: {
    name: string;
    taglineLines: string[];
    bioLines: string[];
    footerLines: string[];
    email: string;
  };
}

const ABOUT_SCREEN_WIDTH_METRES = 48;

export function resolveAboutPortraitSrc(
  slot: Pick<ImageSlot, 'src'> = RESUME.about.faceImage,
): string {
  return slot.src?.trim() || ABOUT_PORTRAIT_FALLBACK_SRC;
}

// Approximate char-based wrap used only for readability metrics (line counts).
// The actual on-canvas text is measured + shrink-to-fit at render time via the
// shared billboardFrame helpers, so this never needs to throw on long copy.
function wrapWordsByCharacters(
  text: string,
  maximumCharacters: number,
  maximumLines: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maximumCharacters) {
      lines.push(line);
      line = word;
      if (lines.length === maximumLines) break;
    } else line = candidate;
  }
  if (line && lines.length < maximumLines) lines.push(line);
  return lines;
}

export function buildAboutArtLayout(
  portraitSrc = resolveAboutPortraitSrc(),
): AboutArtLayout {
  const isPlaceholder = portraitSrc === ABOUT_PORTRAIT_FALLBACK_SRC;
  const { width: W, height: H } = ABOUT_ART_SIZE;
  // Reference layout: a left-hand text column and the portrait as a right-side
  // hero. Portrait region matches the placeholder aspect (1024x1536 ≈ 0.667).
  const portraitW = 880;
  const portraitH = 1410;
  const portraitX = W - portraitW - 110;
  const portraitY = Math.round((H - portraitH) / 2);
  const colX = 150;
  const colW = portraitX - colX - 110;
  return {
    size: ABOUT_ART_SIZE,
    pixelsPerMetre: ABOUT_ART_SIZE.width / ABOUT_SCREEN_WIDTH_METRES,
    regions: [
      { id: 'background', x: 0, y: 0, width: W, height: H },
      { id: 'portrait', x: portraitX, y: portraitY, width: portraitW, height: portraitH },
      ...(isPlaceholder
        ? [{
          id: 'portrait-badge' as const,
          x: portraitX + Math.round((portraitW - 620) / 2),
          y: portraitY + Math.round(portraitH / 2) - 170,
          width: 620,
          height: 340,
        }]
        : []),
      { id: 'name', x: colX, y: 200, width: colW, height: 280 },
      { id: 'tagline', x: colX, y: 480, width: colW, height: 260 },
      { id: 'bio', x: colX, y: 660, width: colW, height: 1120 },
      { id: 'contact', x: colX, y: 1790, width: colW, height: 150 },
    ],
    typography: {
      name: 300,
      tagline: 150,
      bio: 150,
      contact: 120,
      badge: 130,
    },
    portrait: {
      src: portraitSrc,
      isPlaceholder,
      badgeLines: isPlaceholder ? ['PORTRAIT', 'PLACEHOLDER'] : [],
    },
    copy: {
      name: RESUME.name,
      taglineLines: [...RESUME.about.heroTagline],
      bioLines: wrapWordsByCharacters(RESUME.about.paragraph, 46, 10),
      footerLines: [RESUME.contact.email],
      email: RESUME.contact.email,
    },
  };
}

function channelToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return channelToLinear((value >> 16) & 0xff) * 0.2126
    + channelToLinear((value >> 8) & 0xff) * 0.7152
    + channelToLinear(value & 0xff) * 0.0722;
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function measureAboutArtReadability(
  layout: AboutArtLayout,
  display: { width: number; height: number },
): {
  display: { width: number; height: number };
  fontCssPixels: {
    name: number;
    tagline: number;
    bio: number;
    contact: number;
  };
  minimumTextContrast: number;
  portraitCssPixels: { width: number; height: number };
  lineCounts: { tagline: number; bio: number; footer: number };
} {
  const scale = Math.min(
    display.width / layout.size.width,
    display.height / layout.size.height,
  );
  const portrait = layout.regions.find(({ id }) => id === 'portrait')!;
  const backgrounds = ['#05091a', '#071326', '#17051c'];
  const foregrounds = ['#f4f8ff', '#2bfdf9', '#cad6e8', '#ff3da6'];
  return {
    display: { ...display },
    fontCssPixels: {
      name: layout.typography.name * scale,
      tagline: layout.typography.tagline * scale,
      bio: layout.typography.bio * scale,
      contact: layout.typography.contact * scale,
    },
    minimumTextContrast: Math.min(...foregrounds.flatMap((foreground) =>
      backgrounds.map((background) => contrast(foreground, background)))),
    portraitCssPixels: {
      width: portrait.width * scale,
      height: portrait.height * scale,
    },
    lineCounts: {
      tagline: layout.copy.taglineLines.length,
      bio: layout.copy.bioLines.length,
      footer: layout.copy.footerLines.length,
    },
  };
}

const ABOUT_PALETTE: BillboardPalette = {
  background: '#05091a',
  surface: '#071326',
  primary: '#2bfdf9',
  secondary: '#ff3da6',
  text: '#f4f8ff',
  muted: '#cad6e8',
};

export function renderAboutArt(
  context: CanvasRenderingContext2D,
  portrait: CanvasImageSource,
  layout = buildAboutArtLayout(),
): void {
  const region = (id: AboutArtRegionId): AboutArtRegion =>
    layout.regions.find((candidate) => candidate.id === id)!;
  const portraitRegion = region('portrait');
  const badge = layout.regions.find(({ id }) => id === 'portrait-badge');
  const name = region('name');
  const tagline = region('tagline');
  const bio = region('bio');
  const { width: W, height: H } = layout.size;
  const P = ABOUT_PALETTE;

  // Base plate: diagonal gradient background + double neon frame / brackets.
  const gradient = context.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#05091a');
  gradient.addColorStop(0.58, '#071326');
  gradient.addColorStop(1, '#17051c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, W, H);
  const inset = Math.round(Math.min(W, H) * 0.026);
  context.save();
  context.strokeStyle = withAlpha(P.primary, 0.5);
  context.lineWidth = Math.max(2, Math.round(H * 0.003));
  context.strokeRect(inset * 0.55, inset * 0.55, W - inset * 1.1, H - inset * 1.1);
  context.strokeStyle = P.primary;
  context.shadowColor = P.primary;
  context.shadowBlur = Math.round(H * 0.01);
  context.lineWidth = Math.max(3, Math.round(H * 0.006));
  context.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  context.restore();
  drawCornerBrackets(context, W, H, inset, P.primary);
  drawCornerIndex(context, W, H, inset, 'ABOUT', P.primary);

  // Right-side hero: portrait with a neon halo + frame.
  drawHeroHalo(context, W, H, P.primary);
  context.save();
  context.beginPath();
  context.rect(
    portraitRegion.x,
    portraitRegion.y,
    portraitRegion.width,
    portraitRegion.height,
  );
  context.clip();
  context.drawImage(
    portrait,
    portraitRegion.x,
    portraitRegion.y,
    portraitRegion.width,
    portraitRegion.height,
  );
  context.restore();
  context.save();
  context.strokeStyle = P.primary;
  context.shadowColor = P.primary;
  context.shadowBlur = Math.round(H * 0.008);
  context.lineWidth = 10;
  context.strokeRect(
    portraitRegion.x,
    portraitRegion.y,
    portraitRegion.width,
    portraitRegion.height,
  );
  context.restore();
  if (badge && layout.portrait.isPlaceholder) {
    context.fillStyle = 'rgba(4, 7, 17, 0.88)';
    context.fillRect(badge.x, badge.y, badge.width, badge.height);
    context.strokeStyle = P.secondary;
    context.lineWidth = 14;
    context.strokeRect(badge.x, badge.y, badge.width, badge.height);
    context.fillStyle = P.text;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.font = `800 ${layout.typography.badge}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    layout.portrait.badgeLines.forEach((line, index) => {
      context.fillText(
        line,
        badge.x + badge.width / 2,
        badge.y + 40 + index * (layout.typography.badge + 24),
        badge.width - 48,
      );
    });
    context.textAlign = 'start';
  }

  // Left text column — accent tick, name, tagline, bio paragraph (shrink-to-fit).
  context.save();
  context.fillStyle = P.secondary;
  context.shadowColor = P.secondary;
  context.shadowBlur = Math.round(H * 0.015);
  context.fillRect(name.x, name.y - 34, 240, 14);
  context.restore();

  let y = name.y;
  y = drawTextBlock(context, {
    text: layout.copy.name,
    x: name.x,
    y,
    maxWidth: name.width,
    maxLines: 1,
    sizePx: layout.typography.name,
    color: P.text,
    weight: '800',
    mono: false,
    glow: H * 0.02,
  });
  y = Math.max(y, tagline.y);
  y = drawTextBlock(context, {
    text: layout.copy.taglineLines.join('  ·  '),
    x: tagline.x,
    y,
    maxWidth: tagline.width,
    maxLines: 2,
    sizePx: layout.typography.tagline,
    color: P.primary,
    weight: '700',
    mono: false,
    glow: H * 0.015,
  });
  y = Math.max(y, bio.y);
  drawTextBlock(context, {
    text: RESUME.about.paragraph,
    x: bio.x,
    y,
    maxWidth: bio.width,
    maxLines: 15,
    sizePx: layout.typography.bio,
    color: P.muted,
    weight: '600',
    mono: false,
    glow: H * 0.008,
    lineHeightScale: 1.18,
    maxHeight: (H - inset - Math.round(H * 0.055)) - y,
  });

  drawBrandLockup(context, W, H, inset, layout.copy.email, P.primary, P.text);
}
