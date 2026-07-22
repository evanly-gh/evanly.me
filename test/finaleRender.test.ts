import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_RENDER_CONFIG,
  MOON_RENDER_CONFIG,
  TASK4_SCENE_NAMES,
  WATER_RENDER_CONFIG,
  buildBridgeRenderGeometry,
  inspectTask4Scene,
} from '../src/world/finaleRender';
import { BRIDGE_DECK_THICKNESS, BRIDGE_START_T } from '../src/world/bridgeLayout';
import { sampleRoute } from '../src/world/route';
import { ROADS } from '../src/world/roads';
import * as finaleResources from '../src/world/finaleRender';

function ribbonCenter(
  geometry: THREE.BufferGeometry,
  row: number,
): THREE.Vector3 {
  const positions = geometry.getAttribute('position');
  const first = row * 2;
  return new THREE.Vector3(
    (positions.getX(first) + positions.getX(first + 1)) / 2,
    (positions.getY(first) + positions.getY(first + 1)) / 2,
    (positions.getZ(first) + positions.getZ(first + 1)) / 2,
  );
}

describe('finale render contracts', () => {
  it('keeps transparent water from writing depth with normal alpha blending', () => {
    expect(WATER_RENDER_CONFIG).toMatchObject({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      widthSegments: 96,
      heightSegments: 64,
    });
  });

  it('disposes owned bridge and water GPU resources once', () => {
    const createOwnedResourceDisposer = (
      finaleResources as typeof finaleResources & {
        createOwnedResourceDisposer: (resources: {
          geometries: THREE.BufferGeometry[];
          materials: THREE.Material[];
        }) => () => void;
      }
    ).createOwnedResourceDisposer;
    expect(createOwnedResourceDisposer).toBeTypeOf('function');
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();
    material.map = texture;
    let geometryDisposals = 0;
    let materialDisposals = 0;
    let textureDisposals = 0;
    geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
    material.addEventListener('dispose', () => { materialDisposals += 1; });
    texture.addEventListener('dispose', () => { textureDisposals += 1; });
    const dispose = createOwnedResourceDisposer({
      geometries: [geometry, geometry],
      materials: [material, material],
    });
    dispose();
    dispose();
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
    expect(textureDisposals).toBe(0);
  });

  it('defines the complete moon texture, surface, and halo contract', () => {
    expect(MOON_RENDER_CONFIG).toEqual({
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
    });
  });
});

describe('bridge render geometry', () => {
  it('renders the drive surface exactly on the shared route at both ends', () => {
    const render = buildBridgeRenderGeometry();
    const start = ribbonCenter(render.deckTop, 0);
    const end = ribbonCenter(render.deckTop, BRIDGE_RENDER_CONFIG.steps);
    const routeStart = sampleRoute(BRIDGE_START_T).pos;
    const routeEnd = sampleRoute(1).pos;
    const groundEnd = ROADS.find(({ id }) => id === 'main-route')!.curve.getPointAt(1);

    expect(routeStart.toArray()).toEqual([240, 0, -600]);
    expect(start.distanceTo(routeStart)).toBeLessThan(1e-8);
    expect(start.distanceTo(groundEnd)).toBeLessThan(1e-8);
    expect(end.distanceTo(routeEnd)).toBeLessThan(1e-8);
  });

  it('retains exact rendered slab thickness at representative rows', () => {
    const render = buildBridgeRenderGeometry();
    for (const row of [0, 1, 160, 320, 480, BRIDGE_RENDER_CONFIG.steps]) {
      const top = ribbonCenter(render.deckTop, row);
      const underside = ribbonCenter(render.underSlab, row);
      expect(top.x).toBeCloseTo(underside.x, 6);
      expect(top.z).toBeCloseTo(underside.z, 6);
      expect(top.y - underside.y).toBeCloseTo(BRIDGE_DECK_THICKNESS, 6);
    }
  });

  it('renders markings, edges, and rails at their declared offsets', () => {
    const render = buildBridgeRenderGeometry();
    const rows = [0, BRIDGE_RENDER_CONFIG.steps];

    for (const row of rows) {
      const u = row / BRIDGE_RENDER_CONFIG.steps;
      const route = render.layout.curve.getPointAt(u);
      const tangent = render.layout.curve.getTangentAt(u).setY(0).normalize();
      const binormal = new THREE.Vector3().crossVectors(
        tangent,
        new THREE.Vector3(0, 1, 0),
      ).normalize();
      const centre = ribbonCenter(render.centreLine, row).sub(route);
      expect(Math.abs(centre.y - BRIDGE_RENDER_CONFIG.markingLift)).toBeLessThan(1e-5);

      render.edges.forEach(({ geometry, definition }) => {
        const delta = ribbonCenter(geometry, row).sub(route);
        expect(delta.dot(binormal)).toBeCloseTo(definition.offset, 5);
        expect(delta.y).toBeCloseTo(BRIDGE_RENDER_CONFIG.edgeLift, 6);
      });
      render.rails.forEach(({ geometry, definition }) => {
        const delta = ribbonCenter(geometry, row).sub(route);
        expect(delta.dot(binormal)).toBeCloseTo(definition.offset, 5);
        expect(delta.y).toBeCloseTo(definition.height, 6);
      });
    }
  });

  it('places every rendered pier cap in contact with the under-slab', () => {
    const render = buildBridgeRenderGeometry();
    expect(render.pierCaps).toHaveLength(render.layout.piers.length);
    for (const cap of render.pierCaps) {
      const row = Math.round(cap.u * BRIDGE_RENDER_CONFIG.steps);
      const underside = ribbonCenter(render.underSlab, row);
      const capTopY = cap.position.y + cap.size.y / 2;
      expect(Math.abs(cap.position.x - underside.x)).toBeLessThan(2e-5);
      expect(Math.abs(cap.position.z - underside.z)).toBeLessThan(2e-5);
      expect(Math.abs(capTopY - underside.y)).toBeLessThan(2e-5);
    }
  });

  it('renders a gapless non-rideable horizon slab, markings, edges, and rails', () => {
    const render = buildBridgeRenderGeometry();
    const routeEnd = ribbonCenter(render.deckTop, BRIDGE_RENDER_CONFIG.steps);
    const horizonStart = ribbonCenter(render.horizon.deckTop, 0);
    const horizonEnd = ribbonCenter(
      render.horizon.deckTop,
      BRIDGE_RENDER_CONFIG.horizonSteps,
    );

    expect(horizonStart.distanceTo(routeEnd)).toBeLessThan(2e-5);
    expect(horizonEnd.z).toBeLessThanOrEqual(-2200);
    expect(render.horizon.edges).toHaveLength(2);
    expect(render.horizon.rails).toHaveLength(2);
    expect(
      ribbonCenter(render.horizon.centreLine, 0).distanceTo(
        ribbonCenter(render.centreLine, BRIDGE_RENDER_CONFIG.steps),
      ),
    ).toBeLessThan(2e-5);
  });
});

describe('mounted Task 4 scene inspection', () => {
  it('reports actual bridge, water, moon surface, and halo properties', () => {
    const render = buildBridgeRenderGeometry();
    const scene = new THREE.Scene();
    const deck = new THREE.Mesh(render.deckTop);
    deck.name = TASK4_SCENE_NAMES.bridgeDeck;
    scene.add(deck);
    const horizonDeck = new THREE.Mesh(render.horizon.deckTop);
    horizonDeck.name = TASK4_SCENE_NAMES.horizonDeck;
    scene.add(horizonDeck);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        transparent: WATER_RENDER_CONFIG.transparent,
        depthWrite: WATER_RENDER_CONFIG.depthWrite,
        blending: WATER_RENDER_CONFIG.blending,
      }),
    );
    water.name = TASK4_SCENE_NAMES.water;
    scene.add(water);

    const albedo = new THREE.Texture();
    albedo.colorSpace = MOON_RENDER_CONFIG.textures.albedo.colorSpace;
    const bump = new THREE.Texture();
    bump.colorSpace = MOON_RENDER_CONFIG.textures.bump.colorSpace;
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        MOON_RENDER_CONFIG.surface.widthSegments,
        MOON_RENDER_CONFIG.surface.heightSegments,
      ),
      new THREE.MeshStandardMaterial({
        map: albedo,
        bumpMap: bump,
        bumpScale: MOON_RENDER_CONFIG.surface.bumpScale,
        emissive: MOON_RENDER_CONFIG.surface.emissive,
        emissiveIntensity: MOON_RENDER_CONFIG.surface.emissiveIntensity,
        fog: MOON_RENDER_CONFIG.surface.fog,
      }),
    );
    moon.name = TASK4_SCENE_NAMES.moonSurface;
    scene.add(moon);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        MOON_RENDER_CONFIG.halo.widthSegments,
        MOON_RENDER_CONFIG.halo.heightSegments,
      ),
      new THREE.MeshBasicMaterial({
        transparent: MOON_RENDER_CONFIG.halo.transparent,
        depthWrite: MOON_RENDER_CONFIG.halo.depthWrite,
        blending: MOON_RENDER_CONFIG.halo.blending,
        opacity: MOON_RENDER_CONFIG.halo.opacity,
        fog: MOON_RENDER_CONFIG.halo.fog,
      }),
    );
    halo.name = TASK4_SCENE_NAMES.moonHalo;
    scene.add(halo);

    expect(inspectTask4Scene(scene)).toMatchObject({
      version: 1,
      ready: true,
      bridge: {
        mounted: true,
        horizonMounted: true,
        horizonJoinError: 0,
      },
      water: {
        mounted: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      },
      moon: {
        surfaceMounted: true,
        haloMounted: true,
        widthSegments: 128,
        albedoColorSpace: THREE.SRGBColorSpace,
        bumpColorSpace: THREE.NoColorSpace,
        haloBlending: THREE.AdditiveBlending,
        haloDepthWrite: false,
        surfaceFog: false,
        surfaceEmissiveIntensity: 0.32,
        haloFog: false,
        haloOpacity: 0.18,
      },
    });
  });
});
