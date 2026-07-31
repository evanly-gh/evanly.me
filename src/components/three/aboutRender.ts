import * as THREE from 'three';
import { BikePath } from '../../choreography/bikePath';
import {
  ABOUT_REVEAL_SCREENSHOT,
  measureAboutBikeCrossing,
  measureAboutRevealFraming,
  type AboutHeroScreen,
} from '../../world/aboutReveal';

export const ABOUT_HERO_RENDER_CONFIG = {
  texture: {
    width: 3072,
    height: 2048,
    colorSpace: THREE.SRGBColorSpace,
    anisotropy: 8,
  },
  screen: {
    side: THREE.FrontSide,
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    renderOrder: 42,
  },
  backing: {
    color: 0x040711,
    roughness: 0.76,
    metalness: 0.72,
    renderOrder: 40,
  },
  attachment: {
    color: 0x202c42,
    roughness: 0.42,
    metalness: 0.88,
    railHeight: 0.16,
    railDepth: 0.12,
    bracketWidth: 0.16,
    braceWidth: 0.18,
    braceDrop: 6,
  },
} as const;

export const TASK2_SCENE_NAMES = {
  screen: 'task2-about-hero-screen',
  backing: 'task2-about-hero-backing',
  attachment: 'task2-about-hero-attachment',
} as const;

export interface AboutRenderPart {
  id: string;
  matrix: THREE.Matrix4;
}

export interface AboutAttachmentRenderPart extends AboutRenderPart {
  kind: AboutHeroScreen['attachments'][number]['kind'];
  outsideTextSafeRegion: boolean;
}

export type AboutScreenRenderPart = AboutHeroScreen & {
  matrix: THREE.Matrix4;
};

export interface AboutBackingRenderPart extends AboutRenderPart {
  parentId: string;
  screenToBackingFront: number;
}

export interface AboutHeroRenderAssembly {
  screen: AboutScreenRenderPart;
  backing: AboutBackingRenderPart;
  attachments: AboutAttachmentRenderPart[];
}

export function buildAboutSecondaryPanelMatrices(
  screen: AboutHeroScreen,
): AboutRenderPart[] {
  return ([
    ['about-secondary-left', -1],
    ['about-secondary-right', 1],
  ] as const).map(([id, side]) => ({
    id,
    matrix: matrix(
      [
        screen.position[0]
          + screen.tangent[0] * side * (screen.width / 2 + 7),
        screen.position[1] - 2,
        screen.position[2]
          + screen.tangent[2] * side * (screen.width / 2 + 7),
      ],
      screen.rotationY,
      [10, 6.67, 1],
    ),
  }));
}

function matrix(
  position: readonly [number, number, number],
  rotationY: number,
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    new THREE.Vector3(...scale),
  );
}

function localMatrix(
  screen: AboutHeroScreen,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Matrix4 {
  return matrix(screen.position, screen.rotationY, [1, 1, 1])
    .multiply(new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    ));
}

export function buildAboutHeroRenderAssembly(
  screen: AboutHeroScreen,
): AboutHeroRenderAssembly {
  const backingCenterZ = -(
    screen.depth.screenToBackingFront + screen.depth.backingDepth / 2
  );
  return {
    screen: {
      ...screen,
      matrix: matrix(
        screen.position,
        screen.rotationY,
        [screen.width, screen.height, 1],
      ),
    },
    backing: {
      id: `${screen.id}:backing`,
      parentId: screen.parentId,
      screenToBackingFront: screen.depth.screenToBackingFront,
      matrix: localMatrix(
        screen,
        [0, 0, backingCenterZ],
        [screen.width + 1, screen.height + 1, screen.depth.backingDepth],
      ),
    },
    attachments: screen.attachments.map((attachment) => {
      const common = {
        id: attachment.id,
        kind: attachment.kind,
        outsideTextSafeRegion: attachment.kind === 'brace',
      };
      if (attachment.kind === 'rail') {
        return {
          ...common,
          matrix: localMatrix(
          screen,
          [
            0,
            attachment.side * (screen.height / 2 + 0.3),
            -ABOUT_HERO_RENDER_CONFIG.attachment.railDepth / 2,
          ],
          [
            screen.width + 1,
            ABOUT_HERO_RENDER_CONFIG.attachment.railHeight,
            ABOUT_HERO_RENDER_CONFIG.attachment.railDepth,
          ],
          ),
        };
      }
      if (attachment.kind === 'bracket') {
        return {
          ...common,
          matrix: localMatrix(
          screen,
          [
            attachment.side * (screen.width / 2 + 0.4),
            0,
            -screen.facade.screenOffset / 2,
          ],
          [
            ABOUT_HERO_RENDER_CONFIG.attachment.bracketWidth,
            screen.height + 0.8,
            screen.facade.screenOffset,
          ],
          ),
        };
      }
      const braceDrop = ABOUT_HERO_RENDER_CONFIG.attachment.braceDrop;
      const braceLength = Math.hypot(braceDrop, screen.facade.screenOffset);
      return {
        ...common,
        matrix: localMatrix(
          screen,
          [
            attachment.side * (screen.width / 2 + 0.42),
            -screen.height / 2 + 1,
            -screen.facade.screenOffset / 2,
          ],
          [
            ABOUT_HERO_RENDER_CONFIG.attachment.braceWidth,
            braceLength,
            ABOUT_HERO_RENDER_CONFIG.attachment.braceWidth,
          ],
          [Math.atan2(screen.facade.screenOffset, braceDrop), 0, 0],
        ),
      };
    }),
  };
}

// ── Plaza dressing: a low mounting plinth at the sign's base plus a run of
//    approach light poles down the street. Kept minimal and out of the poster
//    face — real surrounding buildings/trees/signs (added in the city layout)
//    do the heavy lifting of integrating the billboard into the district. ──
export interface AboutPlazaDressing {
  structure: THREE.Matrix4[];   // low mounting plinth at the sign base
  poles: THREE.Matrix4[];       // approach light poles down the street
  lamps: THREE.Matrix4[];       // emissive lamp heads on the poles
}

export function buildAboutPlazaDressing(
  screen: AboutHeroScreen,
): AboutPlazaDressing {
  const [px, , pz] = screen.position;
  const rot = screen.rotationY;
  const structZ = pz - 2.5;      // plinth just behind the screen plane
  const box = (
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
  ): THREE.Matrix4 => matrix([x, y, z], rot, [sx, sy, sz]);
  const cyl = (
    x: number, y: number, z: number, radius: number, height: number,
  ): THREE.Matrix4 => matrix([x, y, z], rot, [radius, height, radius]);

  const structure = [
    box(px, 2.5, structZ, screen.width + 16, 5, 12), // ground mounting plinth
  ];

  // Light poles down the approach (at the cross-street curb lines), lamp head
  // cantilevered toward the roadway centre.
  const poles: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
  for (const x of [-71, -49]) {
    const inward = x < -60 ? 2.4 : -2.4;
    for (const z of [20, -6, -32, -56]) {
      poles.push(cyl(x, 6.5, z, 0.4, 13));
      lamps.push(box(x + inward, 12.4, z, 3.2, 0.6, 1.1));
    }
  }
  // Streetlights along the boulevard sidewalks flanking the intersection, lamp
  // heads cantilevered toward the roadway centre (z = 0).
  for (const z of [-16, 16]) {
    const inward = z < 0 ? 2.4 : -2.4;
    for (const x of [-104, -30, 44, 104]) {
      poles.push(cyl(x, 6.5, z, 0.4, 13));
      lamps.push(box(x, 12.4, z + inward, 1.1, 0.6, 3.2));
    }
  }

  return { structure, poles, lamps };
}

export interface Task2SceneSnapshot {
  ready: boolean;
  mountedScreens: number;
  mountedBackings: number;
  mountedAttachments: number;
  screenId: string;
  parentId: string;
  screenshot: typeof ABOUT_REVEAL_SCREENSHOT;
  screenToBackingFront: number;
  framing: ReturnType<typeof measureAboutRevealFraming>;
  bikeCrossing: ReturnType<typeof measureAboutBikeCrossing>;
}

export function inspectTask2Scene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
): Task2SceneSnapshot {
  const screens = scene.getObjectsByProperty('name', TASK2_SCENE_NAMES.screen);
  const backings = scene.getObjectsByProperty('name', TASK2_SCENE_NAMES.backing);
  const attachments = scene.getObjectsByProperty(
    'name',
    TASK2_SCENE_NAMES.attachment,
  );
  const screen = screens[0]?.userData.contract as
    | AboutScreenRenderPart
    | undefined;
  const backing = backings[0]?.userData.contract as
    | AboutBackingRenderPart
    | undefined;
  if (!screen || !backing) throw new Error('About hero render is not mounted');
  const bike = new BikePath().state(0.192).pos;
  return {
    ready: screens.length === 1
      && backings.length === 1
      && attachments.length === screen.attachments.length,
    mountedScreens: screens.length,
    mountedBackings: backings.length,
    mountedAttachments: attachments.length,
    screenId: screen.id,
    parentId: screen.parentId,
    screenshot: ABOUT_REVEAL_SCREENSHOT,
    screenToBackingFront: backing.screenToBackingFront,
    framing: measureAboutRevealFraming(screen, viewport, camera),
    bikeCrossing: measureAboutBikeCrossing(bike, screen, viewport, camera),
  };
}
