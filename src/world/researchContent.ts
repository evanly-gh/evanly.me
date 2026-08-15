import type { Project } from '../content/resume';
import { RESUME } from '../content/resume';
import {
  RESEARCH_GATEWAYS,
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

export interface ResearchPanel {
  id: string;
  gatewayId: string;
  parentId: string;
  contentIndex: 0 | 1;
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
  contentIndex: 0 | 1,
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

function gatewayPanels(contentIndex: 0 | 1): ResearchPanel[] {
  const gateway = RESEARCH_GATEWAYS[contentIndex];
  const frontWalls = RESEARCH_WALLS.filter((wall) =>
    wall.row === 'front'
    && Math.abs(wall.position[2] - gateway.center[2]) < 1e-6);
  if (frontWalls.length !== 2) {
    throw new Error(`Missing Research facade parents for ${gateway.id}`);
  }
  const parentPosition = gateway.center;
  const parentRotationY = 0;
  return [
    panelFromParent({
      id: `${gateway.id}:face-panel`,
      gatewayId: gateway.id,
      parentId: gateway.id,
      contentIndex,
      mount: 'gateway-face',
      parentPosition,
      parentRotationY,
      localPosition: [
        0,
        gateway.undersideY + 5 - gateway.center[1],
        gateway.beam.scale[2] / 2 + 0.2,
      ],
      localRotationY: 0,
      width: Math.min(36, gateway.clearWidth - 4),
      height: 9.5,
    }),
    ...frontWalls
      .sort((left, right) => left.side - right.side)
      .map((wall) => facadePanel(
        wall.side === 1
          ? `${gateway.id}:facade-panel`
          : `${gateway.id}:west-facade-panel`,
        gateway.id,
        wall,
        contentIndex,
        18,
        13,
        22,
      )),
  ];
}

function endPanels(): ResearchPanel[] {
  return ([-1, 1] as const).map((side) => {
    const parent = RESEARCH_WALLS
      .filter((wall) => wall.row === 'back' && wall.side === side)
      .sort((left, right) =>
        Math.abs(left.position[2] - RESEARCH_ROUTE_END_Z)
          - Math.abs(right.position[2] - RESEARCH_ROUTE_END_Z))[0];
    if (!parent) throw new Error(`Missing Research end facade parent on ${side}`);
    return facadePanel(
      side === 1
        ? 'research-end:facade-panel'
        : 'research-end:west-facade-panel',
      'research-end',
      parent,
      side === 1 ? 1 : 0,
      76,
      28,
      20,
    );
  });
}

const RESEARCH_ROUTE_END_Z = -740;

export const RESEARCH_PANELS: readonly ResearchPanel[] = Object.freeze([
  ...gatewayPanels(0),
  ...gatewayPanels(1),
  ...endPanels(),
]);

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
      primary: panel.contentIndex === 0 ? '#2bfdf9' : '#ff3da6',
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

/** Word-wrap `text` to fit `maxWidth` at the current context font, capped to
 *  `maxLines` (last line ellipsised if it overflows). Uniform — never squashed. */
function wrapToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
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

/**
 * Neon research panel. Aspect-correct (canvas matches the panel plane), text is
 * wrapped uniformly (no horizontal squash) and shrunk to fit, with a neon glow
 * on the frame + text to match the ad-billboard look.
 */
export function renderResearchArt(
  context: CanvasRenderingContext2D,
  art: ResearchArtLayout,
): void {
  const { width: W, height: H } = art.size;
  const P = art.palette;

  context.fillStyle = P.background;
  context.fillRect(0, 0, W, H);
  const m = Math.round(Math.min(W, H) * 0.05);
  context.fillStyle = P.surface;
  context.fillRect(m, m, W - 2 * m, H - 2 * m);
  // Glowing neon frame.
  context.save();
  context.strokeStyle = P.primary;
  context.shadowColor = P.primary;
  context.shadowBlur = Math.round(H * 0.02);
  context.lineWidth = Math.max(4, Math.round(H * 0.009));
  context.strokeRect(m, m, W - 2 * m, H - 2 * m);
  context.restore();

  const padX = m + Math.round(W * 0.035);
  const maxW = W - 2 * padX;
  const fontFor = (px: number, weight: string, mono: boolean) =>
    `${weight} ${Math.round(px)}px ${mono ? 'ui-monospace, monospace' : 'Inter, system-ui, sans-serif'}`;
  context.textBaseline = 'top';
  let y = m + Math.round(H * 0.06);

  // A text block: shrinks its font until every wrapped line fits maxW, then
  // draws with a coloured glow. Advances the vertical cursor.
  const block = (
    text: string,
    sizePx: number,
    color: string,
    weight: string,
    mono: boolean,
    maxLines: number,
    glow: number,
  ): void => {
    if (!text) return;
    let fs = sizePx;
    let lines: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      context.font = fontFor(fs, weight, mono);
      lines = wrapToWidth(context, text, maxW, maxLines);
      const widest = Math.max(...lines.map((l) => context.measureText(l).width), 1);
      if (widest <= maxW) break;
      fs *= maxW / widest; // shrink uniformly to fit
    }
    context.font = fontFor(fs, weight, mono);
    context.save();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = glow;
    const lh = fs * 1.14;
    for (const l of lines) {
      context.fillText(l, padX, y);
      y += lh;
    }
    context.restore();
    y += fs * 0.35; // gap after block
  };

  block(art.copy.eyebrow, H * 0.045, P.primary, '700', true, 1, H * 0.02);
  block(art.copy.title, H * 0.11, P.text, '800', false, 3, H * 0.03);
  y += H * 0.01;
  block(art.copy.stack, H * 0.055, P.secondary, '700', true, 2, H * 0.018);
  block(art.copy.blurb, H * 0.052, P.muted, '600', false, 6, H * 0.012);
}
