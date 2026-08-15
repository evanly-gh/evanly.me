import type { ImageSlot, Project } from '../content/resume';
import { RESUME } from '../content/resume';
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

const STUNT_PROJECT_PANEL_DEFINITIONS = Object.freeze([
  panelDefinition(
    'project-ttt-e2e',
    'flip-1',
    'stunt-backdrop-2',
    5,
    30,
    12,
    50,
    30,
    RESUME.projectsMain[0],
    'facade-hero',
    'facade',
    'cyan-noir',
    'clean-cyan-frame',
    1,
  ),
  panelDefinition(
    'project-rememberme',
    'flip-1',
    'stunt-backdrop-3',
    5,
    22,
    3,
    32,
    34,
    RESUME.projectsMain[1],
    'facade-portrait',
    'facade',
    'amber-editorial',
    'clean-amber-frame',
    1,
  ),
  panelDefinition(
    'project-mandarin',
    'flip-2',
    'stunt-backdrop-6',
    5,
    44,
    3,
    28,
    26,
    RESUME.projectsSmall[0],
    'floating-hologram',
    'facade',
    'violet-holo',
    'clean-violet-frame',
    7.8,
  ),
  panelDefinition(
    'project-bellevue',
    'flip-2',
    'stunt-backdrop-7',
    5,
    31,
    10.5,
    34,
    20,
    RESUME.projectsSmall[1],
    'scaffold-hung',
    'facade',
    'hazard-paper',
    'clean-lime-frame',
    1.2,
  ),
  panelDefinition(
    'project-dubhacks',
    'flip-2',
    'stunt-backdrop-8',
    5,
    18,
    10,
    40,
    16,
    RESUME.projectsSmall[2],
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
      blurb: definition.project.displayBlurb,
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
  'facade-hero': Object.freeze({
    // width matched to the 50x30 panel aspect (1.667) so text isn't stretched
    size: Object.freeze({ width: 1280, height: 768 }),
    typography: artTypography(768, 0.145, 0.085, 0.075),
    palette: Object.freeze({
      background: '#02070d',
      surface: '#071827',
      primary: '#39f6ff',
      secondary: '#a8ffdf',
      text: '#f4fcff',
      muted: '#b8d7df',
    }),
  }),
  'facade-portrait': Object.freeze({
    // width matched to the 32x34 panel aspect (0.94) so text isn't stretched
    size: Object.freeze({ width: 964, height: 1024 }),
    typography: artTypography(1024, 0.14),
    palette: Object.freeze({
      background: '#120b04',
      surface: '#271709',
      primary: '#ffbd42',
      secondary: '#ff7a3d',
      text: '#fff7e8',
      muted: '#e3c99c',
    }),
  }),
  'floating-hologram': Object.freeze({
    // width matched to the 28x26 panel aspect (1.08) so text isn't stretched
    size: Object.freeze({ width: 965, height: 896 }),
    typography: artTypography(896, 0.142, 0.085, 0.09),
    palette: Object.freeze({
      background: '#09051a',
      surface: '#15113d',
      primary: '#bca2ff',
      secondary: '#4df4ff',
      text: '#fbf8ff',
      muted: '#c9c0ef',
    }),
  }),
  'scaffold-hung': Object.freeze({
    // width matched to the 34x20 panel aspect (1.7) so text isn't stretched
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
  'facade-ribbon': Object.freeze({
    // width matched to the 40x16 panel aspect (2.5) so text isn't stretched
    size: Object.freeze({ width: 1020, height: 408 }),
    typography: artTypography(408, 0.18, 0.155, 0.16),
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

function wrapLines(
  context: CanvasRenderingContext2D,
  copy: string,
  maximumWidth: number,
  maximumLines: number,
): string[] {
  const words = copy.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maximumWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maximumLines) {
    throw new Error(
      `Project copy requires ${lines.length} lines; maximum is ${maximumLines}`,
    );
  }
  return lines;
}

export function renderProjectArt(
  context: CanvasRenderingContext2D,
  art: ProjectArtLayout,
): void {
  const { width, height } = art.size;
  const region = (id: ProjectArtRegion['id']) =>
    art.regions.find((candidate) => candidate.id === id)!;
  const inset = Math.max(24, Math.round(Math.min(width, height) * 0.035));
  context.fillStyle = art.palette.background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = art.palette.surface;
  context.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  context.textBaseline = 'top';

  const eyebrow = region('eyebrow');
  context.fillStyle = art.palette.primary;
  context.font = art.typography.eyebrow.font;
  context.fillText(art.copy.eyebrow, eyebrow.x, eyebrow.y);

  const title = region('title');
  context.fillStyle = art.palette.text;
  context.font = art.typography.title.font;
  for (const [index, line] of wrapLines(
    context,
    art.copy.title,
    title.width,
    art.typography.title.maximumLines,
  ).entries()) {
    context.fillText(
      line,
      title.x,
      title.y + index * art.typography.title.lineHeight,
    );
  }

  const stack = region('stack');
  context.fillStyle = art.palette.secondary;
  context.font = art.typography.stack.font;
  for (const [index, line] of wrapLines(
    context,
    art.copy.stack,
    stack.width,
    art.typography.stack.maximumLines,
  ).entries()) {
    context.fillText(
      line,
      stack.x,
      stack.y + index * art.typography.stack.lineHeight,
    );
  }

  const blurb = region('blurb');
  context.fillStyle = art.palette.muted;
  context.font = art.typography.blurb.font;
  for (const [index, line] of wrapLines(
    context,
    art.copy.blurb,
    blurb.width,
    art.typography.blurb.maximumLines,
  ).entries()) {
    context.fillText(
      line,
      blurb.x,
      blurb.y + index * art.typography.blurb.lineHeight,
    );
  }
}
