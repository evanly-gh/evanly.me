import { RESUME, type ImageSlot } from './resume';

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
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > maximumLines) {
    throw new Error(
      `About copy needs ${lines.length} lines; maximum is ${maximumLines}`,
    );
  }
  return lines;
}

export function buildAboutArtLayout(
  portraitSrc = resolveAboutPortraitSrc(),
): AboutArtLayout {
  const isPlaceholder = portraitSrc === ABOUT_PORTRAIT_FALLBACK_SRC;
  return {
    size: ABOUT_ART_SIZE,
    pixelsPerMetre: ABOUT_ART_SIZE.width / ABOUT_SCREEN_WIDTH_METRES,
    regions: [
      { id: 'background', x: 0, y: 0, width: 3072, height: 2048 },
      { id: 'portrait', x: 80, y: 80, width: 1000, height: 1580 },
      ...(isPlaceholder
        ? [{ id: 'portrait-badge' as const, x: 120, y: 1280, width: 920, height: 340 }]
        : []),
      { id: 'name', x: 1160, y: 90, width: 1832, height: 360 },
      { id: 'tagline', x: 1160, y: 500, width: 1832, height: 430 },
      { id: 'bio', x: 1160, y: 980, width: 1832, height: 520 },
      { id: 'contact', x: 80, y: 1740, width: 2912, height: 228 },
    ],
    typography: {
      name: 320,
      tagline: 190,
      bio: 190,
      contact: 185,
      badge: 155,
    },
    portrait: {
      src: portraitSrc,
      isPlaceholder,
      badgeLines: isPlaceholder ? ['PORTRAIT', 'PLACEHOLDER'] : [],
    },
    copy: {
      name: RESUME.name,
      taglineLines: [...RESUME.about.heroTagline],
      bioLines: wrapWordsByCharacters(RESUME.about.heroBlurb, 22, 3),
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
  const contact = region('contact');

  const gradient = context.createLinearGradient(0, 0, layout.size.width, layout.size.height);
  gradient.addColorStop(0, '#05091a');
  gradient.addColorStop(0.58, '#071326');
  gradient.addColorStop(1, '#17051c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, layout.size.width, layout.size.height);

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

  context.strokeStyle = '#2bfdf9';
  context.lineWidth = 12;
  context.strokeRect(
    portraitRegion.x,
    portraitRegion.y,
    portraitRegion.width,
    portraitRegion.height,
  );
  if (badge && layout.portrait.isPlaceholder) {
    context.fillStyle = 'rgba(4, 7, 17, 0.88)';
    context.fillRect(badge.x, badge.y, badge.width, badge.height);
    context.strokeStyle = '#ff3da6';
    context.lineWidth = 14;
    context.strokeRect(badge.x, badge.y, badge.width, badge.height);
    context.fillStyle = '#f4f8ff';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.font = `800 ${layout.typography.badge}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    layout.portrait.badgeLines.forEach((line, index) => {
      context.fillText(
        line,
        badge.x + badge.width / 2,
        badge.y + 24 + index * 154,
        badge.width - 48,
      );
    });
    context.textAlign = 'start';
  }
  context.fillStyle = '#ff3da6';
  context.fillRect(name.x, name.y - 20, 220, 12);

  context.textBaseline = 'top';
  context.fillStyle = '#f4f8ff';
  context.font = `800 ${layout.typography.name}px Inter, Arial, sans-serif`;
  context.fillText(layout.copy.name, name.x, name.y, name.width);

  context.fillStyle = '#2bfdf9';
  context.font = `700 ${layout.typography.tagline}px Inter, Arial, sans-serif`;
  layout.copy.taglineLines.forEach((line, index) => {
    context.fillText(line, tagline.x, tagline.y + index * 220, tagline.width);
  });

  context.fillStyle = '#cad6e8';
  context.font = `600 ${layout.typography.bio}px Inter, Arial, sans-serif`;
  layout.copy.bioLines.forEach((line, index) => {
    context.fillText(line, bio.x, bio.y + index * 220, bio.width);
  });

  context.fillStyle = '#f4f8ff';
  context.font = `600 ${layout.typography.contact}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  layout.copy.footerLines.forEach((line, index) => {
    context.fillText(line, contact.x, contact.y + index * 190, contact.width);
  });

  context.strokeStyle = '#ff3da6';
  context.lineWidth = 8;
  context.strokeRect(34, 34, layout.size.width - 68, layout.size.height - 68);
}
