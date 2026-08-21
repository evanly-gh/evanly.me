import type { ImageSlot, Project } from '../content/resume';
import { RESUME } from '../content/resume';
import {
  drawBrandLockup,
  drawCornerBrackets,
  drawCornerIndex,
  drawHeroHalo,
  drawNeonPlate,
  drawTextBlock,
} from '../content/billboardFrame';
import { buildingPlacementBounds } from './buildingCatalog';
import {
  STUNT_BACKDROP,
  type StuntBackdropPlacement,
  type StuntVector,
} from './stuntLayout';

export type StuntProjectGroup = 'flip-1' | 'flip-2';
export type StuntProjectFormat =
  | 'facade-hero'
  | 'facade-portrait'
  | 'floating-hologram'
  | 'scaffold-hung'
  | 'facade-ribbon';
export type StuntProjectMount = 'facade' | 'hologram' | 'hanging';

export interface StuntProjectPanel {
  id: string;
  group: StuntProjectGroup;
  parentId: string;
  position: StuntVector;
  rotationY: number;
  width: number;
  height: number;
  title: string;
  stack: string;
  blurb: string;
  image: ImageSlot;
  format: StuntProjectFormat;
  mount: StuntProjectMount;
  paletteId: string;
  edgeTreatment: string;
  protectedRadius: number;
}

interface StuntProjectPanelDefinition {
  id: string;
  group: StuntProjectGroup;
  parentId: string;
  facadeOffset: number;
  localY: number;
  localZ: number;
  width: number;
  height: number;
  project: Project;
  format: StuntProjectFormat;
  mount: StuntProjectMount;
  paletteId: string;
  edgeTreatment: string;
  protectedRadius: number;
}

const panelDefinition = (
  id: string,
  group: StuntProjectGroup,
  parentId: string,
  facadeOffset: number,
  localY: number,
  localZ: number,
  width: number,
  height: number,
  project: Project,
  format: StuntProjectFormat,
  mount: StuntProjectMount,
  paletteId: string,
  edgeTreatment: string,
  protectedRadius: number,
): StuntProjectPanelDefinition => Object.freeze({
  id,
  group,
  parentId,
  facadeOffset,
  localY,
  localZ,
  width,
  height,
  project,
  format,
  mount,
  paletteId,
  edgeTreatment,
  protectedRadius,
});

// Exactly four project billboards, one per RESUME.projects entry, mounted flat on
// the west facades of the backdrop wall the hero camera flies past. Each is ~equal
// area (~1,500) but a distinct aspect so the four read as a unique set. flip-1 =
// RememberMe + OpenChinese (first flight), flip-2 = RhetBench + TTT-E2E (second).
const STUNT_PROJECT_PANEL_DEFINITIONS = Object.freeze([
  panelDefinition(
    'project-rememberme',
    'flip-1',
    'stunt-backdrop-2',
    5,
    26,
    16,
    40,
    37,
    RESUME.projects[0],
    'facade-portrait',
    'facade',
    'cyan-noir',
    'clean-cyan-frame',
    1,
  ),
  panelDefinition(
    'project-openchinese',
    'flip-1',
    'stunt-backdrop-3',
    5,
    24,
    -2,
    52,
    29,
    RESUME.projects[1],
    'facade-hero',
    'facade',
    'amber-editorial',
    'clean-amber-frame',
    1,
  ),
  panelDefinition(
    'project-rhetbench',
    'flip-2',
    'stunt-backdrop-6',
    5,
    28,
    15,
    38,
    39,
    RESUME.projects[2],
    'floating-hologram',
    'facade',
    'violet-holo',
    'clean-violet-frame',
    1,
  ),
  panelDefinition(
    'project-ttt-e2e',
    'flip-2',
    'stunt-backdrop-7',
    5,
    25,
    6,
    58,
    26,
    RESUME.projects[3],
    'facade-ribbon',
    'facade',
    'magenta-ribbon',
    'clean-magenta-frame',
    1,
  ),
]);

export function buildStuntProjectPanels(
  placements: readonly StuntBackdropPlacement[] = STUNT_BACKDROP,
): readonly StuntProjectPanel[] {
  const parents = new Map(placements.map((placement) => [
    placement.id,
    placement,
  ]));
  return Object.freeze(STUNT_PROJECT_PANEL_DEFINITIONS.map((definition) => {
    const parent = parents.get(definition.parentId);
    if (!parent) {
      throw new Error(`Missing stunt panel parent ${definition.parentId}`);
    }
    const bounds = buildingPlacementBounds(parent);
    const cos = Math.cos(bounds.rotationY);
    const sin = Math.sin(bounds.rotationY);
    const xAxis = { x: cos, z: -sin };
    const zAxis = { x: sin, z: cos };
    const localX = -bounds.halfX - definition.facadeOffset;
    const position: StuntVector = [
      bounds.center.x
        + xAxis.x * localX
        + zAxis.x * definition.localZ,
      parent.position[1] + definition.localY,
      bounds.center.z
        + xAxis.z * localX
        + zAxis.z * definition.localZ,
    ];
    return Object.freeze({
      id: definition.id,
      group: definition.group,
      parentId: definition.parentId,
      position,
      rotationY: bounds.rotationY - Math.PI / 2,
      width: definition.width,
      height: definition.height,
      title: definition.project.title,
      stack: definition.project.stack,
      blurb: definition.project.blurb,
      image: definition.project.image,
      format: definition.format,
      mount: definition.mount,
      paletteId: definition.paletteId,
      edgeTreatment: definition.edgeTreatment,
      protectedRadius: definition.protectedRadius,
    });
  }));
}

export const STUNT_PROJECT_PANELS = buildStuntProjectPanels();

export const PROJECT_ART_MIN_WIDTH = 640;
export const PROJECT_ART_MIN_HEIGHT = 408;
export const PROJECT_GALLERY_TEXTURE_BUDGET_BYTES = 24 * 1024 * 1024;

export interface ProjectArtRegion {
  id: 'background' | 'eyebrow' | 'title' | 'stack' | 'blurb';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectArtLayout {
  panelId: string;
  format: StuntProjectFormat;
  edgeTreatment: string;
  size: { width: number; height: number };
  copy: {
    eyebrow: string;
    title: string;
    stack: string;
    blurb: string;
  };
  regions: ProjectArtRegion[];
  typography: Record<
    'eyebrow' | 'title' | 'stack' | 'blurb',
    ProjectArtTypography
  >;
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

export interface ProjectArtTypography {
  fontSize: number;
  lineHeight: number;
  maximumLines: number;
  font: string;
}

const artTypography = (
  height: number,
  titleScale: number,
  stackScale = 0.085,
  blurbScale = 0.055,
): Record<'eyebrow' | 'title' | 'stack' | 'blurb', ProjectArtTypography> => {
  const entry = (
    fontSize: number,
    maximumLines: number,
    weight: number,
    family: string,
  ): ProjectArtTypography => Object.freeze({
    fontSize,
    lineHeight: fontSize * 0.94,
    maximumLines,
    font: `${weight} ${fontSize}px ${family}`,
  });
  return Object.freeze({
    eyebrow: entry(height * 0.055, 1, 700, 'ui-monospace, monospace'),
    title: entry(height * titleScale, 3, 800, 'Inter, system-ui, sans-serif'),
    stack: entry(height * stackScale, 3, 650, 'ui-monospace, monospace'),
    blurb: entry(height * blurbScale, 6, 600, 'Inter, system-ui, sans-serif'),
  });
};

const ART_PROFILES = Object.freeze({
  // OpenChinese — 52x29 panel (aspect 1.793); amber editorial.
  'facade-hero': Object.freeze({
    size: Object.freeze({ width: 1280, height: 714 }),
    typography: artTypography(714, 0.145, 0.085, 0.075),
    palette: Object.freeze({
      background: '#02070d',
      surface: '#071827',
      primary: '#39f6ff',
      secondary: '#a8ffdf',
      text: '#f4fcff',
      muted: '#b8d7df',
    }),
  }),
  // RememberMe — 40x37 panel (aspect 1.081); near-square amber/cyan.
  'facade-portrait': Object.freeze({
    size: Object.freeze({ width: 984, height: 912 }),
    typography: artTypography(912, 0.14),
    palette: Object.freeze({
      background: '#120b04',
      surface: '#271709',
      primary: '#ffbd42',
      secondary: '#ff7a3d',
      text: '#fff7e8',
      muted: '#e3c99c',
    }),
  }),
  // RhetBench — 38x39 panel (aspect 0.974); portrait violet holo.
  'floating-hologram': Object.freeze({
    size: Object.freeze({ width: 940, height: 964 }),
    typography: artTypography(964, 0.142, 0.085, 0.09),
    palette: Object.freeze({
      background: '#09051a',
      surface: '#15113d',
      primary: '#bca2ff',
      secondary: '#4df4ff',
      text: '#fbf8ff',
      muted: '#c9c0ef',
    }),
  }),
  // Unused spare profile (kept for the format union); lime scaffold look.
  'scaffold-hung': Object.freeze({
    size: Object.freeze({ width: 1197, height: 704 }),
    typography: artTypography(704, 0.145, 0.085, 0.08),
    palette: Object.freeze({
      background: '#11130d',
      surface: '#242719',
      primary: '#d8ff45',
      secondary: '#f5d45b',
      text: '#fbffe9',
      muted: '#d6dab9',
    }),
  }),
  // TTT-E2E — 58x26 panel (aspect 2.231); wide magenta ribbon.
  'facade-ribbon': Object.freeze({
    size: Object.freeze({ width: 1280, height: 574 }),
    typography: artTypography(574, 0.15, 0.09, 0.075),
    palette: Object.freeze({
      background: '#13030e',
      surface: '#28081f',
      primary: '#ff4db8',
      secondary: '#7df9ff',
      text: '#fff5fc',
      muted: '#e7bdd7',
    }),
  }),
});

export const PROJECT_ART_TYPOGRAPHY =
  ART_PROFILES['facade-hero'].typography;

export function estimateProjectGalleryTextureBytes() {
  const textures = STUNT_PROJECT_PANELS.map((panel) => {
    const { width, height } = ART_PROFILES[panel.format].size;
    return {
      panelId: panel.id,
      width,
      height,
      estimatedGpuBytes: Math.ceil(width * height * 4 * 4 / 3),
      typography: {
        title: ART_PROFILES[panel.format].typography.title.fontSize,
        stack: ART_PROFILES[panel.format].typography.stack.fontSize,
        body: ART_PROFILES[panel.format].typography.blurb.fontSize,
      },
    };
  });
  return {
    textureCount: textures.length,
    includesMipmaps: true as const,
    totalBytes: textures.reduce(
      (total, texture) => total + texture.estimatedGpuBytes,
      0,
    ),
    textures,
  };
}

export interface ProjectArtReadability {
  titleCssPx: number;
  stackCssPx: number;
  bodyCssPx: number;
}

export function measureProjectArtReadability(
  projectedPixelHeight: number,
  panel: StuntProjectPanel = STUNT_PROJECT_PANELS[0],
): ProjectArtReadability {
  const profile = ART_PROFILES[panel.format];
  const scale = projectedPixelHeight / profile.size.height;
  return {
    titleCssPx: profile.typography.title.fontSize * scale,
    stackCssPx: profile.typography.stack.fontSize * scale,
    bodyCssPx: profile.typography.blurb.fontSize * scale,
  };
}

export function buildProjectArtLayout(
  projectPanel: StuntProjectPanel,
): ProjectArtLayout {
  const projectNumber = STUNT_PROJECT_PANELS.findIndex(
    ({ id }) => id === projectPanel.id,
  ) + 1;
  const profile = ART_PROFILES[projectPanel.format];
  const { width, height } = profile.size;
  const marginX = Math.round(width * 0.055);
  const contentWidth = width - marginX * 2;
  return {
    panelId: projectPanel.id,
    format: projectPanel.format,
    edgeTreatment: projectPanel.edgeTreatment,
    size: { width, height },
    copy: {
      eyebrow: `PROJECT ${String(projectNumber).padStart(2, '0')}`,
      title: projectPanel.title,
      stack: projectPanel.stack,
      blurb: projectPanel.blurb,
    },
    regions: [
      { id: 'background', x: 0, y: 0, width, height },
      {
        id: 'eyebrow',
        x: marginX,
        y: Math.round(height * 0.055),
        width: contentWidth,
        height: Math.round(height * 0.06),
      },
      {
        id: 'title',
        x: marginX,
        y: Math.round(height * 0.14),
        width: contentWidth,
        height: Math.round(height * 0.28),
      },
      {
        id: 'stack',
        x: marginX,
        y: Math.round(height * 0.46),
        width: contentWidth,
        height: Math.round(height * 0.2),
      },
      {
        id: 'blurb',
        x: marginX,
        y: Math.round(height * 0.68),
        width: contentWidth,
        height: Math.round(height * 0.28),
      },
    ],
    typography: profile.typography,
    minimumContrast: 7.1,
    palette: profile.palette,
  };
}

/**
 * Neon project billboard, drawn with the shared cyberpunk ad-plate template so
 * it matches the research canyon and About poster: double neon frame, corner
 * brackets, right-side hero halo, a top-right index chip (the eyebrow), a
 * left-hand text column (title / stack / blurb, all shrink-to-fit — never
 * throwing on long copy), and a bottom-left brand lockup.
 */
export function renderProjectArt(
  context: CanvasRenderingContext2D,
  art: ProjectArtLayout,
): void {
  const { width: W, height: H } = art.size;
  const P = art.palette;

  const { inset } = drawNeonPlate(context, W, H, P);
  drawHeroHalo(context, W, H, P.primary);
  drawCornerBrackets(context, W, H, inset, P.primary);
  drawCornerIndex(context, W, H, inset, art.copy.eyebrow, P.primary);

  const padX = inset + Math.round(W * 0.04);
  const maxW = W - 2 * padX;
  let y = inset + Math.round(H * 0.13);

  y = drawTextBlock(context, {
    text: art.copy.title,
    x: padX,
    y,
    maxWidth: maxW,
    maxLines: 2,
    sizePx: H * 0.13,
    color: P.text,
    weight: '800',
    mono: false,
    glow: H * 0.03,
  });
  y += H * 0.015;
  y = drawTextBlock(context, {
    text: art.copy.stack,
    x: padX,
    y,
    maxWidth: maxW,
    maxLines: 2,
    sizePx: H * 0.06,
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
    maxLines: 9,
    sizePx: H * 0.055,
    color: P.muted,
    weight: '600',
    mono: false,
    glow: H * 0.012,
    maxHeight: (H - inset - Math.round(H * 0.12)) - y,
  });

  drawBrandLockup(context, W, H, inset, 'EVAN LI // PROJECT', P.primary, P.text);
}
