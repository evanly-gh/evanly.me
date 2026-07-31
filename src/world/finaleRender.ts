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
  deckMaterial: {
    roughness: 0.86,
    metalness: 0.14,
  },
} as const;

export const WATER_RENDER_CONFIG = {
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  side: THREE.DoubleSide,
  widthSegments: 96,
  heightSegments: 64,
  reflection: {
    centerX: 240,
    halfWidth: 150,
    intensity: 1.7,
  },
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
    bumpScale: 26,
    color: 0xf2f6ff,
    roughness: 0.92,
    metalness: 0,
    // Emissive carries the albedo texture (emissiveMap) at reduced intensity so
    // the maria/crater detail reads instead of a flat blue self-glow, while a
    // dedicated raking light (rakeLight) adds crater relief via the bump map.
    emissive: 0xdfeaff,
    emissiveIntensity: 0.16,
    fog: false,
  },
  // Scene-wide moonlight. This is a directionalLight (no falloff), so its
  // intensity is exactly "how much the moon spills over everything else" —
  // kept low so the asset stays bright without washing the whole city.
  keyLight: {
    color: 0xcfe4ff,
    intensity: 0.85,
  },
  // Grazing light on the moon's camera-facing hemisphere. Distance-limited so it
  // sculpts crater shadows on the moon without washing the distant city.
  rakeLight: {
    color: 0xf0f4ff,
    intensity: 2.1,
    distance: 2600,
    decay: 0,
    offset: [-360, 220, 780] as [number, number, number],
  },
  halo: {
    radiusScale: 1.1,
    opacity: 0.16,
    color: 0x9fd0ff,
  },
  // Large soft atmospheric glow behind the moon (a camera-facing additive
  // billboard with a radial falloff). Separate from the tight rim halo.
  glow: {
    scale: 2.3,
    color: 0xa8d2ff,
    opacity: 0.46,
  },
} as const;

export const FINALE_FADE_CONFIG = Object.freeze({
  start: 0.965,
  end: 1,
});

// The moon should not be a character until the exit. Its visible elements (disc
// self-light, halo, atmospheric glow, crater rake light) and its scene-wide key
// light are held down through the city and ramped up only as the ride lifts onto
// the bridge toward the finale — so nothing bleeds through the skyline earlier.
export const MOON_PRESENCE_RAMP = Object.freeze({ start: 0.8, end: 0.92 });
// Scene key-light floor kept before the ramp so the night city stays readable
// without the moon "spilling over everything"; it rises to the full config
// intensity by the finale.
export const MOON_KEYLIGHT_FLOOR_FRACTION = 0.4;

export function moonPresenceAt(semanticT: number): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Moon presence progress must be finite');
  }
  const fraction = clamp01(
    (semanticT - MOON_PRESENCE_RAMP.start)
      / (MOON_PRESENCE_RAMP.end - MOON_PRESENCE_RAMP.start),
  );
  return fraction * fraction * (3 - 2 * fraction);
}

export const FINALE_ATMOSPHERE_CONFIG = Object.freeze({
  seed: 0x46494e41,
  particleCount: 96,
  drawCalls: 1,
  size: 3.1,
  opacity: 0.34,
  bounds: Object.freeze({
    x0: 90,
    x1: 390,
    y0: -2,
    y1: 58,
    z0: -2240,
    z1: -640,
  }),
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function finaleSubjectOpacityAt(semanticT: number): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Finale subject progress must be finite');
  }
  if (semanticT >= FINALE_FADE_CONFIG.end - 1e-5) return 0;
  const fraction = clamp01(
    (semanticT - FINALE_FADE_CONFIG.start)
      / (FINALE_FADE_CONFIG.end - FINALE_FADE_CONFIG.start),
  );
  const eased = fraction * fraction * (3 - 2 * fraction);
  return 1 - eased;
}

export function buildFinaleAtmospherePositions(): Float32Array {
  const positions = new Float32Array(
    FINALE_ATMOSPHERE_CONFIG.particleCount * 3,
  );
  let state = FINALE_ATMOSPHERE_CONFIG.seed >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const { bounds } = FINALE_ATMOSPHERE_CONFIG;
  for (let index = 0; index < FINALE_ATMOSPHERE_CONFIG.particleCount; index += 1) {
    const offset = index * 3;
    positions[offset] = THREE.MathUtils.lerp(bounds.x0, bounds.x1, random());
    positions[offset + 1] = THREE.MathUtils.lerp(bounds.y0, bounds.y1, random());
    positions[offset + 2] = THREE.MathUtils.lerp(bounds.z0, bounds.z1, random());
  }
  return positions;
}

export function estimateMoonRenderMetrics(): {
  luminanceProxy: number;
  detailProxy: number;
} {
  const luminance = (color: THREE.Color): number =>
    color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const emissive = new THREE.Color(MOON_RENDER_CONFIG.surface.emissive);
  const rake = new THREE.Color(MOON_RENDER_CONFIG.rakeLight.color);
  // Visible brightness now comes mostly from the dedicated raking light that
  // sculpts crater relief; the restrained emissive only tints the shadow side.
  // The 0.5 factor is a nominal lunar-albedo reflectance proxy for the lit face.
  return {
    luminanceProxy:
      luminance(emissive) * MOON_RENDER_CONFIG.surface.emissiveIntensity
      + luminance(rake) * MOON_RENDER_CONFIG.rakeLight.intensity * 0.5,
    detailProxy:
      MOON_RENDER_CONFIG.surface.bumpScale
      * MOON_RENDER_CONFIG.surface.roughness,
  };
}

export const TASK4_SCENE_NAMES = {
  bridgeDeck: 'task4-bridge-deck-top',
  horizonDeck: 'task4-bridge-horizon-deck-top',
  shorelineGround: 'scroll-task-5-shoreline-ground',
  shorelineRetaining: 'scroll-task-5-shoreline-retaining',
  water: 'task4-water-basin',
  atmosphere: 'finale-atmosphere',
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
    animationTime: number | null;
    reflectionCenterX: number | null;
    reflectionIntensity: number | null;
  };
  atmosphere: {
    mounted: boolean;
    pointCount: number;
    rotationY: number | null;
    opacity: number | null;
  };
  shoreline: {
    groundMounted: boolean;
    retainingMounted: boolean;
    boundaryVertexCount: number;
    groundTriangles: number;
    waterTriangles: number;
    retainingTriangles: number;
    maximumSeamError: number | null;
    minimumTriangleArea: number | null;
    invertedTriangles: number;
  };
  moon: {
    surfaceMounted: boolean;
    haloMounted: boolean;
    widthSegments: number | null;
    heightSegments: number | null;
    albedoColorSpace: string | null;
    bumpColorSpace: string | null;
    surfaceFog: boolean | null;
    surfaceEmissiveIntensity: number | null;
  };
}

function triangleCount(geometry: THREE.BufferGeometry | undefined): number {
  if (!geometry) return 0;
  return (geometry.getIndex()?.count ?? 0) / 3;
}

function shorelineMeshMetrics(
  ground: THREE.Mesh | undefined,
  water: THREE.Mesh | undefined,
  retaining: THREE.Mesh | undefined,
): Task4SceneSnapshot['shoreline'] {
  const geometries = [ground?.geometry, water?.geometry, retaining?.geometry];
  const groundPosition = ground?.geometry.getAttribute('position');
  const waterPosition = water?.geometry.getAttribute('position');
  const retainingPosition = retaining?.geometry.getAttribute('position');
  const boundaryVertexCount = Number(
    ground?.geometry.userData.boundaryVertexCount ?? 0,
  );
  let maximumSeamError = 0;
  if (!groundPosition || !waterPosition || !retainingPosition) {
    maximumSeamError = NaN;
  } else {
    const groundPoint = new THREE.Vector3();
    const comparison = new THREE.Vector3();
    for (let index = 0; index < boundaryVertexCount; index += 1) {
      const vertex = index * 2;
      groundPoint.fromBufferAttribute(groundPosition, vertex);
      comparison.fromBufferAttribute(waterPosition, vertex);
      maximumSeamError = Math.max(
        maximumSeamError,
        groundPoint.distanceTo(comparison),
      );
      comparison.fromBufferAttribute(retainingPosition, vertex);
      maximumSeamError = Math.max(
        maximumSeamError,
        groundPoint.distanceTo(comparison),
      );
    }
  }
  let minimumTriangleArea = Infinity;
  let invertedTriangles = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  geometries.forEach((geometry, geometryIndex) => {
    const position = geometry?.getAttribute('position');
    const index = geometry?.getIndex();
    if (!position || !index) return;
    for (let offset = 0; offset < index.count; offset += 3) {
      a.fromBufferAttribute(position, index.getX(offset));
      b.fromBufferAttribute(position, index.getX(offset + 1));
      c.fromBufferAttribute(position, index.getX(offset + 2));
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
      minimumTriangleArea = Math.min(minimumTriangleArea, normal.length() / 2);
      if (geometryIndex < 2 && normal.y <= 0) invertedTriangles += 1;
    }
  });
  return {
    groundMounted: Boolean(ground),
    retainingMounted: Boolean(retaining),
    boundaryVertexCount,
    groundTriangles: triangleCount(ground?.geometry),
    waterTriangles: triangleCount(water?.geometry),
    retainingTriangles: triangleCount(retaining?.geometry),
    maximumSeamError: Number.isFinite(maximumSeamError)
      ? maximumSeamError
      : null,
    minimumTriangleArea: Number.isFinite(minimumTriangleArea)
      ? minimumTriangleArea
      : null,
    invertedTriangles,
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
  const ground = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.shorelineGround));
  const retaining = asMesh(
    scene.getObjectByName(TASK4_SCENE_NAMES.shorelineRetaining),
  );
  const waterMaterial = firstMaterial(water);
  const waterShader = waterMaterial instanceof THREE.ShaderMaterial
    ? waterMaterial
    : undefined;
  const atmosphereObject = scene.getObjectByName(TASK4_SCENE_NAMES.atmosphere);
  const atmosphere = atmosphereObject instanceof THREE.Points
    ? atmosphereObject
    : undefined;
  const atmosphereMaterial = atmosphere && !Array.isArray(atmosphere.material)
    && atmosphere.material instanceof THREE.PointsMaterial
    ? atmosphere.material
    : undefined;
  const moonSurface = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.moonSurface));
  const moonMaterial = firstMaterial(moonSurface);
  const sphere = moonSurface?.geometry instanceof THREE.SphereGeometry
    ? moonSurface.geometry
    : undefined;
  const standard = moonMaterial instanceof THREE.MeshStandardMaterial
    ? moonMaterial
    : undefined;
  const halo = asMesh(scene.getObjectByName(TASK4_SCENE_NAMES.moonHalo));

  const snapshot: Task4SceneSnapshot = {
    version: 1,
    ready: Boolean(
      bridgeDeck
      && horizonDeck
      && water
      && ground
      && retaining
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
      animationTime: Number.isFinite(waterShader?.uniforms.uTime?.value)
        ? Number(waterShader?.uniforms.uTime.value)
        : null,
      reflectionCenterX:
        Number.isFinite(waterShader?.uniforms.uReflectionX?.value)
          ? Number(waterShader?.uniforms.uReflectionX.value)
          : null,
      reflectionIntensity:
        Number.isFinite(waterShader?.uniforms.uReflectionIntensity?.value)
          ? Number(waterShader?.uniforms.uReflectionIntensity.value)
          : null,
    },
    atmosphere: {
      mounted: Boolean(atmosphere),
      pointCount: atmosphere?.geometry.getAttribute('position')?.count ?? 0,
      rotationY: atmosphere?.rotation.y ?? null,
      opacity: atmosphereMaterial?.opacity ?? null,
    },
    shoreline: shorelineMeshMetrics(ground, water, retaining),
    moon: {
      surfaceMounted: Boolean(moonSurface),
      haloMounted: Boolean(halo),
      widthSegments: sphere?.parameters.widthSegments ?? null,
      heightSegments: sphere?.parameters.heightSegments ?? null,
      albedoColorSpace: standard?.map?.colorSpace ?? null,
      bumpColorSpace: standard?.bumpMap?.colorSpace ?? null,
      surfaceFog: standard?.fog ?? null,
      surfaceEmissiveIntensity: standard?.emissiveIntensity ?? null,
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
