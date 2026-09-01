import type { Project } from '../content/resume';
import { RESUME } from '../content/resume';
import {
  BILLBOARD_TITLE_FILL as TITLE_FILL,
  drawBrandLockup,
  drawCornerBrackets,
  drawCornerIndex,
  drawHeroHalo,
  drawNeonPlate,
  drawTextBlock,
  withAlpha,
} from '../content/billboardFrame';
import {
  RESEARCH_WALLS,
  type ResearchVector,
} from './researchLayout';
import {
  buildingPlacementBounds,
  projectedFootprintHalfExtent,
} from './buildingCatalog';

export interface ResearchContentRecord {
  title: string;
  stack: string;
  blurb: string;
}

const contentRecord = (project: Project): ResearchContentRecord =>
  Object.freeze({
    title: project.title,
    stack: project.stack,
    blurb: project.blurb,
  });

export const RESEARCH_CONTENT_RECORDS: readonly ResearchContentRecord[] =
  Object.freeze(RESUME.research.map(contentRecord));

export type ResearchPanelMount = 'gateway-face' | 'tower-facade';
// A board is either a compact text CONTENT card (bottom row) or a big IMAGE hero
// board (second row of tall towers). Image boards currently draw a placeholder.
export type ResearchPanelKind = 'content' | 'image';

export interface ResearchPanel {
  id: string;
  gatewayId: string;
  parentId: string;
  contentIndex: 0 | 1 | 2;
  kind: ResearchPanelKind;
  mount: ResearchPanelMount;
  parentPosition: ResearchVector;
  parentRotationY: number;
  localPosition: ResearchVector;
  localRotationY: number;
  position: ResearchVector;
  rotationY: number;
  width: number;
  height: number;
  solidBacking: true;
}

function worldFromParent(
  parentPosition: ResearchVector,
  parentRotationY: number,
  localPosition: ResearchVector,
): ResearchVector {
  const cos = Math.cos(parentRotationY);
  const sin = Math.sin(parentRotationY);
  return [
    parentPosition[0] + cos * localPosition[0] + sin * localPosition[2],
    parentPosition[1] + localPosition[1],
    parentPosition[2] - sin * localPosition[0] + cos * localPosition[2],
  ];
}

function localFromParent(
  parentPosition: ResearchVector,
  parentRotationY: number,
  worldPosition: ResearchVector,
): ResearchVector {
  const dx = worldPosition[0] - parentPosition[0];
  const dz = worldPosition[2] - parentPosition[2];
  const cos = Math.cos(parentRotationY);
  const sin = Math.sin(parentRotationY);
  return [
    cos * dx - sin * dz,
    worldPosition[1] - parentPosition[1],
    sin * dx + cos * dz,
  ];
}

function panelFromParent(
  specification: Omit<
    ResearchPanel,
    'position' | 'rotationY' | 'solidBacking'
  >,
): ResearchPanel {
  return Object.freeze({
    ...specification,
    position: worldFromParent(
      specification.parentPosition,
      specification.parentRotationY,
      specification.localPosition,
    ),
    rotationY: specification.parentRotationY + specification.localRotationY,
    solidBacking: true,
  });
}

function facadePanel(
  id: string,
  gatewayId: string,
  wall: typeof RESEARCH_WALLS[number],
  contentIndex: 0 | 1 | 2,
  kind: ResearchPanelKind,
  y: number,
  width: number,
  height: number,
): ResearchPanel {
  const bounds = buildingPlacementBounds(wall);
  const roadFacingX = bounds.center.x - wall.side * projectedFootprintHalfExtent(
    bounds,
    { x: 1, z: 0 },
  );
  const worldPosition: ResearchVector = [
    roadFacingX - wall.side * 0.08,
    y,
    bounds.center.z,
  ];
  const worldRotationY = wall.side === 1 ? -Math.PI / 2 : Math.PI / 2;
  return panelFromParent({
    id,
    gatewayId,
    parentId: wall.id,
    contentIndex,
    kind,
    mount: 'tower-facade',
    parentPosition: wall.position,
    parentRotationY: wall.rotationY,
    localPosition: localFromParent(
      wall.position,
      wall.rotationY,
      worldPosition,
    ),
    localRotationY: worldRotationY - wall.rotationY,
    width,
    height,
  });
}

// The research canyon reads as a signage district. All three real projects live
// on the EAST wall (screen-right), which the camera aims across the street at.
// The WEST wall (screen-left) is dressed with ORDINARY city ad billboards (see
// adBillboardPlacement's research-canyon west pass) so the left of frame isn't
// bare — it is deliberately NOT a copy of the real research boards.
//
// The east arrangement is two rows:
//   • BOTTOM ROW — three large, readable CONTENT cards spread across the whole
//     length of the canyon (mouth → deep end) so a fresh card faces the rider at
//     each stage of the ride. One per project, in project order (SLM, RL, SD).
//   • SECOND ROW — three smaller IMAGE hero boards mounted mid-high on the
//     tallest back-row towers, one per project, each roughly BEHIND its content
//     card. Kept modest (and lower) so the first one isn't cropped off the top of
//     the frame as the rider scrolls into the canyon. Image art is a placeholder.
// Content card N and image board N share a contentIndex (and therefore a glow
// colour) and sit at nearly the same z, so each project's card + hero read as a
// stacked pair. Walls are untouched.
type ResearchBoardRow = 'front' | 'back';

interface ResearchBoardSpec {
  id: string;
  contentIndex: 0 | 1 | 2;
  kind: ResearchPanelKind;
  side: -1 | 1;
  row: ResearchBoardRow;
  targetZ: number;
  y: number;
  width: number;
  height: number;
}

const RESEARCH_BOARD_SPECS: readonly ResearchBoardSpec[] = [
  // ── Bottom row: three large CONTENT cards spread the full length of the
  //    canyon (front towers near the mouth, middle, and deep end). ──
  // SLM (project 0) is pushed a couple of towers DEEPER (−442 → −474) so the
  // first card doesn't greet the rider right at the canyon mouth.
  { id: 'research-content-0', contentIndex: 0, kind: 'content', side: 1, row: 'front', targetZ: -474, y: 24, width: 60, height: 38 },
  { id: 'research-content-1', contentIndex: 1, kind: 'content', side: 1, row: 'front', targetZ: -558, y: 24, width: 60, height: 38 },
  { id: 'research-content-2', contentIndex: 2, kind: 'content', side: 1, row: 'front', targetZ: -666, y: 24, width: 60, height: 38 },
  // ── Second row: three IMAGE (placeholder) boards mounted HIGH on the tallest
  //    back-row towers, one per project, each just behind its content card.
  //    Raised + enlarged (they were hard to read from across the canyon); the
  //    SLM board also rides deeper (−458 → −490) to stay paired with its card. ──
  { id: 'research-image-0', contentIndex: 0, kind: 'image', side: 1, row: 'back', targetZ: -490, y: 112, width: 80, height: 42 },
  { id: 'research-image-1', contentIndex: 1, kind: 'image', side: 1, row: 'back', targetZ: -571, y: 112, width: 80, height: 42 },
  { id: 'research-image-2', contentIndex: 2, kind: 'image', side: 1, row: 'back', targetZ: -665, y: 112, width: 80, height: 42 },
];

function boardPanels(): ResearchPanel[] {
  return RESEARCH_BOARD_SPECS.map((spec) => {
    const candidates = RESEARCH_WALLS.filter(
      (wall) => wall.row === spec.row && wall.side === spec.side,
    );
    if (candidates.length === 0) {
      throw new Error(
        `Missing Research ${spec.row}/${spec.side} walls for ${spec.id}`,
      );
    }
    const wall = candidates.reduce((best, candidate) =>
      Math.abs(candidate.position[2] - spec.targetZ)
      < Math.abs(best.position[2] - spec.targetZ)
        ? candidate
        : best);
    return facadePanel(
      spec.id,
      spec.id,
      wall,
      spec.contentIndex,
      spec.kind,
      spec.y,
      spec.width,
      spec.height,
    );
  });
}

export const RESEARCH_PANELS: readonly ResearchPanel[] = Object.freeze(
  boardPanels(),
);

export const RESEARCH_ART_MIN_WIDTH = 2048;
export const RESEARCH_ART_MIN_HEIGHT = 1024;

export interface ResearchArtTypography {
  fontSize: number;
  lineHeight: number;
  maximumLines: number;
  font: string;
}

export const RESEARCH_ART_TYPOGRAPHY = Object.freeze({
  eyebrow: Object.freeze({
    fontSize: 44,
    lineHeight: 52,
    maximumLines: 1,
    font: '700 44px ui-monospace, monospace',
  }),
  title: Object.freeze({
    fontSize: 112,
    lineHeight: 118,
    maximumLines: 2,
    font: '800 112px Inter, system-ui, sans-serif',
  }),
  stack: Object.freeze({
    fontSize: 70,
    lineHeight: 78,
    maximumLines: 2,
    font: '700 70px ui-monospace, monospace',
  }),
  blurb: Object.freeze({
    fontSize: 116,
    lineHeight: 112,
    maximumLines: 5,
    font: '600 116px Inter, system-ui, sans-serif',
  }),
} satisfies Record<string, ResearchArtTypography>);

export interface ResearchArtLayout {
  panelId: string;
  size: { width: number; height: number };
  copy: {
    eyebrow: string;
    title: string;
    stack: string;
    blurb: string;
  };
  typography: typeof RESEARCH_ART_TYPOGRAPHY;
  minimumContrast: number;
  palette: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    text: string;
    muted: string;
  };
}

export type ResearchArtLineRegion = 'eyebrow' | 'title' | 'stack' | 'blurb';

export interface ResearchArtLineBox {
  region: ResearchArtLineRegion;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  fontSize: number;
  font: string;
  color: string;
}

const LINE_REGIONS = [
  {
    region: 'eyebrow',
    x: 104,
    y: 70,
    maximumWidth: 900,
    color: 'primary',
  },
  {
    region: 'title',
    x: 104,
    y: 142,
    maximumWidth: 1840,
    color: 'text',
  },
  {
    region: 'stack',
    x: 104,
    y: 304,
    maximumWidth: 1840,
    color: 'secondary',
  },
  {
    region: 'blurb',
    x: 104,
    y: 390,
    maximumWidth: 1840,
    color: 'muted',
  },
] as const;

export function buildResearchArtLayout(
  panel: ResearchPanel,
): ResearchArtLayout {
  const record = RESEARCH_CONTENT_RECORDS[panel.contentIndex];
  // Per-panel canvas sized to the panel's real aspect so the texture is never
  // stretched on the plane (the old fixed 2048x1024 was warped onto portrait
  // facade panels). Height fixed; width follows width/height.
  const H = RESEARCH_ART_MIN_HEIGHT;
  const W = Math.max(640, Math.min(2048, Math.round(H * (panel.width / panel.height))));
  return {
    panelId: panel.id,
    size: {
      width: W,
      height: H,
    },
    copy: {
      eyebrow: `RESEARCH 0${panel.contentIndex + 1}`,
      title: record.title,
      stack: record.stack,
      blurb: record.blurb,
    },
    typography: RESEARCH_ART_TYPOGRAPHY,
    minimumContrast: 7.2,
    palette: {
      background: '#030811',
      surface: '#0a1623',
      primary:
        panel.contentIndex === 0
          ? '#2bfdf9'
          : panel.contentIndex === 1
            ? '#ff3da6'
            : '#5cff9e',
      secondary: '#ffc857',
      text: '#f7fbff',
      muted: '#b8c7d8',
    },
  };
}

export interface ResearchArtReadability {
  titleCssPx: number;
  stackCssPx: number;
  bodyCssPx: number;
}

export function measureResearchArtReadability(
  projectedPixelHeight: number,
): ResearchArtReadability {
  const scale = projectedPixelHeight / RESEARCH_ART_MIN_HEIGHT;
  return {
    titleCssPx: RESEARCH_ART_TYPOGRAPHY.title.fontSize * scale,
    stackCssPx: RESEARCH_ART_TYPOGRAPHY.stack.fontSize * scale,
    bodyCssPx: RESEARCH_ART_TYPOGRAPHY.blurb.fontSize * scale,
  };
}

export function measureResearchArtLineBoxes(
  context: CanvasRenderingContext2D,
  art: ResearchArtLayout,
): ResearchArtLineBox[] {
  return LINE_REGIONS.flatMap((specification) => {
    const typography = art.typography[specification.region];
    const text = art.copy[specification.region];
    context.font = typography.font;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    for (const word of words) {
      const lineIndex = Math.max(0, lines.length - 1);
      const candidate = lines.length === 0
        ? word
        : `${lines[lineIndex]} ${word}`;
      if (
        lines.length > 0
        && context.measureText(candidate).width > specification.maximumWidth
        && lines.length < typography.maximumLines
      ) {
        lines.push(word);
      } else if (lines.length === 0) {
        lines.push(word);
      } else {
        lines[lineIndex] = candidate;
      }
    }
    return lines.map((line, lineIndex) => {
      const measuredWidth = Math.max(context.measureText(line).width, 1);
      const scaleX = Math.min(1, specification.maximumWidth / measuredWidth);
      return {
        region: specification.region,
        text: line,
        x: specification.x,
        y: specification.y + lineIndex * typography.lineHeight,
        width: measuredWidth * scaleX,
        height: typography.fontSize,
        scaleX,
        fontSize: typography.fontSize,
        font: typography.font,
        color: art.palette[specification.color],
      };
    });
  });
}

/**
 * Neon research billboard. Aspect-correct (canvas matches the panel plane),
 * using the shared cyberpunk ad-plate template: double neon frame, corner
 * brackets, a right-side hero halo, a top-right index chip (the eyebrow), a
 * left-hand text column (title / stack / blurb, all shrink-to-fit), and a
 * bottom-left brand lockup.
 */
export function renderResearchArt(
  context: CanvasRenderingContext2D,
  art: ResearchArtLayout,
): void {
  const { width: W, height: H } = art.size;
  const P = art.palette;

  const { inset } = drawNeonPlate(context, W, H, P);
  drawHeroHalo(context, W, H, P.primary);
  drawCornerBrackets(context, W, H, inset, P.primary);
  drawCornerIndex(context, W, H, inset, art.copy.eyebrow, P.primary);

  const padX = inset + Math.round(W * 0.035);
  const maxW = W - 2 * padX;
  let y = inset + Math.round(H * 0.13);

  y = drawTextBlock(context, {
    text: art.copy.title,
    x: padX,
    y,
    maxWidth: maxW,
    maxLines: 3,
    sizePx: H * 0.11,
    // Slightly off pure-white so the 1.45x screen boost doesn't drive the large
    // title far past the bloom threshold and blow out into a harsh halo.
    color: TITLE_FILL,
    weight: '800',
    mono: false,
    glow: H * 0.03,
  });
  y += H * 0.01;
  y = drawTextBlock(context, {
    text: art.copy.stack,
    x: padX,
    y,
    maxWidth: maxW,
    maxLines: 2,
    sizePx: H * 0.055,
    color: P.secondary,
    weight: '700',
    mono: true,
    glow: H * 0.018,
  });
  drawTextBlock(context, {
    text: art.copy.blurb,
    x: padX,
    y,
    maxWidth: maxW,
    maxLines: 8,
    sizePx: H * 0.05,
    color: P.muted,
    weight: '600',
    mono: false,
    glow: H * 0.012,
    maxHeight: (H - inset - Math.round(H * 0.11)) - y,
  });

  drawBrandLockup(context, W, H, inset, 'EVAN LI // RESEARCH', P.primary, P.text);
}

/**
 * Placeholder hero-image board for the second-row (tall tower) research boards.
 * Uses the same neon plate / halo / brackets / brand lockup as the content
 * cards so the two rows read as one system, but the centre is a labelled image
 * placeholder (diagonal hatch + framed drop zone + project title) instead of the
 * text column. Swap this for a real CanvasTexture/loaded image later — keep the
 * signature so researchKit's synchronous canvas pipeline is unchanged.
 */
export function renderResearchPlaceholderImage(
  context: CanvasRenderingContext2D,
  art: ResearchArtLayout,
): void {
  const { width: W, height: H } = art.size;
  const P = art.palette;

  const { inset } = drawNeonPlate(context, W, H, P);
  drawHeroHalo(context, W, H, P.primary);
  drawCornerBrackets(context, W, H, inset, P.primary);
  drawCornerIndex(context, W, H, inset, art.copy.eyebrow, P.primary);

  // Framed image drop-zone in the centre.
  const pad = inset + Math.round(Math.min(W, H) * 0.05);
  const zoneX = pad;
  const zoneY = pad;
  const zoneW = W - 2 * pad;
  const zoneH = H - 2 * pad - Math.round(H * 0.12); // leave room for the lockup
  context.save();
  context.strokeStyle = withAlpha(P.primary, 0.55);
  context.lineWidth = Math.max(2, Math.round(Math.min(W, H) * 0.004));
  context.setLineDash([Math.round(W * 0.02), Math.round(W * 0.012)]);
  context.strokeRect(zoneX, zoneY, zoneW, zoneH);
  context.setLineDash([]);

  // Diagonal hatch fill so it clearly reads as an empty image slot.
  context.beginPath();
  context.rect(zoneX, zoneY, zoneW, zoneH);
  context.clip();
  context.strokeStyle = withAlpha(P.primary, 0.14);
  context.lineWidth = Math.max(1, Math.round(Math.min(W, H) * 0.003));
  const step = Math.round(Math.min(W, H) * 0.06);
  for (let x = zoneX - zoneH; x < zoneX + zoneW; x += step) {
    context.beginPath();
    context.moveTo(x, zoneY + zoneH);
    context.lineTo(x + zoneH, zoneY);
    context.stroke();
  }
  context.restore();

  // Centre label: project title + "IMAGE PLACEHOLDER".
  drawTextBlock(context, {
    text: art.copy.title,
    x: zoneX + Math.round(zoneW * 0.06),
    y: zoneY + Math.round(zoneH * 0.34),
    maxWidth: zoneW * 0.88,
    maxLines: 2,
    sizePx: H * 0.14,
    color: TITLE_FILL,
    weight: '800',
    mono: false,
    glow: H * 0.03,
  });
  drawTextBlock(context, {
    text: 'IMAGE PLACEHOLDER',
    x: zoneX + Math.round(zoneW * 0.06),
    y: zoneY + Math.round(zoneH * 0.62),
    maxWidth: zoneW * 0.88,
    maxLines: 1,
    sizePx: H * 0.06,
    color: P.primary,
    weight: '700',
    mono: true,
    glow: H * 0.018,
  });

  drawBrandLockup(context, W, H, inset, 'EVAN LI // RESEARCH', P.primary, P.text);
}
