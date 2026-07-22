import * as THREE from 'three';
import {
  BRIDGE_DECK_THICKNESS,
  buildBridgeLayout,
  type BridgeLayout,
} from './bridgeLayout';
import { sampleRoute } from './route';
import { buildCurveRibbon } from './roads';

export const BRIDGE_RENDER_CONFIG = {
  steps: 640,
  horizonSteps: 448,
  deckLift: 0,
  markingLift: 0.06,
  edgeLift: 0.08,
  railHalfWidth: 0.12,
  underSlabWidthPadding: 0.8,
  railPostSpacing: 28,
  railPostWidth: 0.22,
  pierCapHeight: 0.7,
  pierCapDepth: 4.2,
  pierCapOverhang: 5,
} as const;

export const WATER_RENDER_CONFIG = {
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  side: THREE.DoubleSide,
  widthSegments: 96,
  heightSegments: 64,
} as const;

export const MOON_RENDER_CONFIG = {
  textures: {
    albedo: {
      url: '/textures/moon/moon-albedo.webp',
      colorSpace: THREE.SRGBColorSpace,
    },
    bump: {
      url: '/textures/moon/moon-height.webp',
      colorSpace: THREE.NoColorSpace,
    },
  },
  surface: {
    widthSegments: 128,
    heightSegments: 128,
    bumpScale: 14,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    emissive: 0xb8d8ff,
    emissiveIntensity: 0.32,
    fog: false,
  },
  halo: {
    scale: 1.08,
    widthSegments: 64,
    heightSegments: 64,
    color: 0xb9dcff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    fog: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  },
} as const;

export const TASK4_SCENE_NAMES = {
  bridgeDeck: 'task4-bridge-deck-top',
  horizonDeck: 'task4-bridge-horizon-deck-top',
  water: 'task4-water-basin',
  moonSurface: 'task4-moon-surface',
  moonHalo: 'task4-moon-halo',
} as const;

export function createOwnedResourceDisposer({
  geometries,
  materials,
}: {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of new Set(geometries)) geometry.dispose();
    for (const material of new Set(materials)) material.dispose();
  };
}

export interface BridgeRailPostRender {
  position: THREE.Vector3;
  height: number;
}

export interface BridgePierCapRender {
  u: number;
  position: THREE.Vector3;
  size: THREE.Vector3;
}

export interface BridgeRenderGeometry {
  layout: BridgeLayout;
  deckTop: THREE.BufferGeometry;
  underSlab: THREE.BufferGeometry;
  centreLine: THREE.BufferGeometry;
  edges: Array<{
    definition: BridgeLayout['edges'][number];
    geometry: THREE.BufferGeometry;
  }>;
  rails: Array<{
    definition: BridgeLayout['rails'][number];
    geometry: THREE.BufferGeometry;
  }>;
  railPosts: BridgeRailPostRender[];
  pierCaps: BridgePierCapRender[];
  cableGeometries: THREE.TubeGeometry[];
  horizon: {
    deckTop: THREE.BufferGeometry;
    underSlab: THREE.BufferGeometry;
    centreLine: THREE.BufferGeometry;
    edges: BridgeRenderGeometry['edges'];
    rails: BridgeRenderGeometry['rails'];
    railPosts: BridgeRailPostRender[];
    pierCaps: BridgePierCapRender[];
  };
}

export function buildBridgeRenderGeometry(
  layout = buildBridgeLayout(),
): BridgeRenderGeometry {
  const deckTop = buildCurveRibbon(layout.curve, layout.deck.halfWidth, {
    lift: BRIDGE_RENDER_CONFIG.deckLift,
    steps: BRIDGE_RENDER_CONFIG.steps,
  });
  const underSlab = buildCurveRibbon(
    layout.curve,
    layout.deck.halfWidth + BRIDGE_RENDER_CONFIG.underSlabWidthPadding,
    {
      lift: -layout.deck.thickness,
      steps: BRIDGE_RENDER_CONFIG.steps,
    },
  );
  const centreLine = buildCurveRibbon(
    layout.curve,
    layout.centreLine.halfWidth,
    {
      lift: BRIDGE_RENDER_CONFIG.markingLift,
      steps: BRIDGE_RENDER_CONFIG.steps,
    },
  );
  const edges = layout.edges.map((definition) => ({
    definition,
    geometry: buildCurveRibbon(layout.curve, definition.halfWidth, {
      offset: definition.offset,
      lift: BRIDGE_RENDER_CONFIG.edgeLift,
      steps: BRIDGE_RENDER_CONFIG.steps,
    }),
  }));
  const rails = layout.rails.map((definition) => ({
    definition,
    geometry: buildCurveRibbon(layout.curve, BRIDGE_RENDER_CONFIG.railHalfWidth, {
      offset: definition.offset,
      lift: definition.height,
      steps: BRIDGE_RENDER_CONFIG.steps,
    }),
  }));

  const railPostCount = Math.ceil(
    layout.curve.getLength() / BRIDGE_RENDER_CONFIG.railPostSpacing,
  );
  const railPosts = Array.from({ length: railPostCount + 1 }, (_, index) => {
    const u = index / railPostCount;
    const point = layout.curve.getPointAt(u);
    const tangent = layout.curve.getTangentAt(u).setY(0).normalize();
    const binormal = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize();
    return layout.rails.map((rail): BridgeRailPostRender => ({
      position: point.clone()
        .addScaledVector(binormal, rail.offset)
        .add(new THREE.Vector3(0, rail.height / 2, 0)),
      height: rail.height,
    }));
  }).flat();

  const underPositions = underSlab.getAttribute('position');
  const pierCaps = layout.piers.map((pier): BridgePierCapRender => {
    const row = Math.round(pier.u * BRIDGE_RENDER_CONFIG.steps);
    const vertex = row * 2;
    const undersideCenter = new THREE.Vector3(
      (underPositions.getX(vertex) + underPositions.getX(vertex + 1)) / 2,
      (underPositions.getY(vertex) + underPositions.getY(vertex + 1)) / 2,
      (underPositions.getZ(vertex) + underPositions.getZ(vertex + 1)) / 2,
    );
    return {
      u: pier.u,
      position: undersideCenter.add(
        new THREE.Vector3(0, -BRIDGE_RENDER_CONFIG.pierCapHeight / 2, 0),
      ),
      size: new THREE.Vector3(
        layout.deck.halfWidth * 2 + BRIDGE_RENDER_CONFIG.pierCapOverhang,
        BRIDGE_RENDER_CONFIG.pierCapHeight,
        BRIDGE_RENDER_CONFIG.pierCapDepth,
      ),
    };
  });

  const cableGeometries = layout.cables.map((cable) => {
    const midpoint = cable.start.clone().lerp(cable.end, 0.5);
    midpoint.y -= 3;
    return new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(cable.start, midpoint, cable.end),
      20,
      0.12,
      5,
      false,
    );
  });
  const horizonDeckTop = buildCurveRibbon(
    layout.horizon.curve,
    layout.deck.halfWidth,
    {
      lift: BRIDGE_RENDER_CONFIG.deckLift,
      steps: BRIDGE_RENDER_CONFIG.horizonSteps,
    },
  );
  const horizonUnderSlab = buildCurveRibbon(
    layout.horizon.curve,
    layout.deck.halfWidth + BRIDGE_RENDER_CONFIG.underSlabWidthPadding,
    {
      lift: -layout.deck.thickness,
      steps: BRIDGE_RENDER_CONFIG.horizonSteps,
    },
  );
  const horizonCentreLine = buildCurveRibbon(
    layout.horizon.curve,
    layout.centreLine.halfWidth,
    {
      lift: BRIDGE_RENDER_CONFIG.markingLift,
      steps: BRIDGE_RENDER_CONFIG.horizonSteps,
    },
  );
  const horizonEdges = layout.edges.map((definition) => ({
    definition,
    geometry: buildCurveRibbon(layout.horizon.curve, definition.halfWidth, {
      offset: definition.offset,
      lift: BRIDGE_RENDER_CONFIG.edgeLift,
      steps: BRIDGE_RENDER_CONFIG.horizonSteps,
    }),
  }));
  const horizonRails = layout.rails.map((definition) => ({
    definition,
    geometry: buildCurveRibbon(layout.horizon.curve, BRIDGE_RENDER_CONFIG.railHalfWidth, {
      offset: definition.offset,
      lift: definition.height,
      steps: BRIDGE_RENDER_CONFIG.horizonSteps,
    }),
  }));
  const horizonPostCount = Math.ceil(
    layout.horizon.curve.getLength() / BRIDGE_RENDER_CONFIG.railPostSpacing,
  );
  const horizonRailPosts = Array.from({ length: horizonPostCount + 1 }, (_, index) => {
    const point = layout.horizon.curve.getPointAt(index / horizonPostCount);
    const tangent = layout.horizon.curve.getTangentAt(index / horizonPostCount)
      .setY(0)
      .normalize();
    const binormal = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize();
    return layout.rails.map((rail): BridgeRailPostRender => ({
      position: point.clone()
        .addScaledVector(binormal, rail.offset)
        .add(new THREE.Vector3(0, rail.height / 2, 0)),
      height: rail.height,
    }));
  }).flat();
  const horizonUnderPositions = horizonUnderSlab.getAttribute('position');
  const horizonPierCaps = layout.horizon.piers.map((pier): BridgePierCapRender => {
    const row = Math.round(pier.u * BRIDGE_RENDER_CONFIG.horizonSteps);
    const vertex = row * 2;
    const undersideCenter = new THREE.Vector3(
      (horizonUnderPositions.getX(vertex) + horizonUnderPositions.getX(vertex + 1)) / 2,
      (horizonUnderPositions.getY(vertex) + horizonUnderPositions.getY(vertex + 1)) / 2,
      (horizonUnderPositions.getZ(vertex) + horizonUnderPositions.getZ(vertex + 1)) / 2,
    );
    return {
      u: pier.u,
      position: undersideCenter.add(
        new THREE.Vector3(0, -BRIDGE_RENDER_CONFIG.pierCapHeight / 2, 0),
      ),
      size: new THREE.Vector3(
        layout.deck.halfWidth * 2 + BRIDGE_RENDER_CONFIG.pierCapOverhang,
        BRIDGE_RENDER_CONFIG.pierCapHeight,
        BRIDGE_RENDER_CONFIG.pierCapDepth,
      ),
    };
  });

  return {
    layout,
    deckTop,
    underSlab,
    centreLine,
    edges,
    rails,
    railPosts,
    pierCaps,
    cableGeometries,
    horizon: {
      deckTop: horizonDeckTop,
      underSlab: horizonUnderSlab,
      centreLine: horizonCentreLine,
      edges: horizonEdges,
      rails: horizonRails,
      railPosts: horizonRailPosts,
      pierCaps: horizonPierCaps,
    },
  };
}

function ribbonEndpointCenter(
  geometry: THREE.BufferGeometry,
  end: 'start' | 'end',
): THREE.Vector3 | undefined {
  const positions = geometry.getAttribute('position');
  if (!positions || positions.count < 2) return undefined;
  const first = end === 'start' ? 0 : positions.count - 2;
  return new THREE.Vector3(
    (positions.getX(first) + positions.getX(first + 1)) / 2,
    (positions.getY(first) + positions.getY(first + 1)) / 2,
    (positions.getZ(first) + positions.getZ(first + 1)) / 2,
  );
}

function asMesh(object: THREE.Object3D | undefined): THREE.Mesh | undefined {
  return object instanceof THREE.Mesh ? object : undefined;
}

function firstMaterial(mesh: THREE.Mesh | undefined): THREE.Material | undefined {
  if (!mesh) return undefined;
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

export interface Task4SceneSnapshot {
  version: 1;
  ready: boolean;
  bridge: {
    mounted: boolean;
    deckVertexCount: number;
    routeStartError: number | null;
    routeEndError: number | null;
    horizonMounted: boolean;
    horizonJoinError: number | null;
    horizonEndZ: number | null;
  };
  water: {
    mounted: boolean;
    transparent: boolean | null;
    depthWrite: boolean | null;
    blending: THREE.Blending | null;
  };
  moon: {
    surfaceMounted: boolean;
    haloMounted: boolean;
    widthSegments: number | null;
    heightSegments: number | null;
    albedoColorSpace: string | null;
    bumpColorSpace: string | null;
    haloBlending: THREE.Blending | null;
    haloDepthWrite: boolean | null;
    surfaceFog: boolean | null;
    surfaceEmissiveIntensity: number | null;
    haloFog: boolean | null;
    haloOpacity: number | null;
  };
}

export function inspectTask4Scene(scene: THREE.Object3D): Task4SceneSnapshot {
  const bridgeDeck = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.bridgeDeck));
  const deckStart = bridgeDeck
    ? ribbonEndpointCenter(bridgeDeck.geometry, 'start')
    : undefined;
  const deckEnd = bridgeDeck
    ? ribbonEndpointCenter(bridgeDeck.geometry, 'end')
    : undefined;
  const horizonDeck = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.horizonDeck));
  const horizonStart = horizonDeck
    ? ribbonEndpointCenter(horizonDeck.geometry, 'start')
    : undefined;
  const horizonEnd = horizonDeck
    ? ribbonEndpointCenter(horizonDeck.geometry, 'end')
    : undefined;
  const water = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.water));
  const waterMaterial = firstMaterial(water);
  const moonSurface = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.moonSurface));
  const moonMaterial = firstMaterial(moonSurface);
  const sphere = moonSurface?.geometry instanceof THREE.SphereGeometry
    ? moonSurface.geometry
    : undefined;
  const standard = moonMaterial instanceof THREE.MeshStandardMaterial
    ? moonMaterial
    : undefined;
  const halo = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.moonHalo));
  const haloMaterial = firstMaterial(halo);
  const haloBasic = haloMaterial instanceof THREE.MeshBasicMaterial
    ? haloMaterial
    : undefined;

  const snapshot: Task4SceneSnapshot = {
    version: 1,
    ready: Boolean(
      bridgeDeck
      && horizonDeck
      && water
      && moonSurface
      && halo
      && standard?.map
      && standard.bumpMap,
    ),
    bridge: {
      mounted: Boolean(bridgeDeck),
      deckVertexCount: bridgeDeck?.geometry.getAttribute('position')?.count ?? 0,
      routeStartError: deckStart
        ? deckStart.distanceTo(sampleRoute(0.84).pos)
        : null,
      routeEndError: deckEnd ? deckEnd.distanceTo(sampleRoute(1).pos) : null,
      horizonMounted: Boolean(horizonDeck),
      horizonJoinError: deckEnd && horizonStart
        ? deckEnd.distanceTo(horizonStart)
        : null,
      horizonEndZ: horizonEnd?.z ?? null,
    },
    water: {
      mounted: Boolean(water),
      transparent: waterMaterial?.transparent ?? null,
      depthWrite: waterMaterial?.depthWrite ?? null,
      blending: waterMaterial?.blending ?? null,
    },
    moon: {
      surfaceMounted: Boolean(moonSurface),
      haloMounted: Boolean(halo),
      widthSegments: sphere?.parameters.widthSegments ?? null,
      heightSegments: sphere?.parameters.heightSegments ?? null,
      albedoColorSpace: standard?.map?.colorSpace ?? null,
      bumpColorSpace: standard?.bumpMap?.colorSpace ?? null,
      haloBlending: haloMaterial?.blending ?? null,
      haloDepthWrite: haloMaterial?.depthWrite ?? null,
      surfaceFog: standard?.fog ?? null,
      surfaceEmissiveIntensity: standard?.emissiveIntensity ?? null,
      haloFog: haloBasic?.fog ?? null,
      haloOpacity: haloBasic?.opacity ?? null,
    },
  };
  return snapshot;
}

export function bridgeRenderedThicknessAt(
  render: BridgeRenderGeometry,
  row: number,
): number {
  const top = render.deckTop.getAttribute('position');
  const underside = render.underSlab.getAttribute('position');
  const vertex = row * 2;
  return top.getY(vertex) - underside.getY(vertex);
}

export const BRIDGE_EXPECTED_RENDERED_THICKNESS = BRIDGE_DECK_THICKNESS;
