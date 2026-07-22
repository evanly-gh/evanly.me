import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const citySource = readFileSync(
  new URL('../src/components/three/City.tsx', import.meta.url),
  'utf8',
);
const cityLayoutSource = readFileSync(
  new URL('../src/world/cityLayout.ts', import.meta.url),
  'utf8',
);

describe('City scene', () => {
  it('does not mount malformed flying traffic', () => {
    expect(citySource).not.toContain('function FlyingTraffic');
    expect(citySource).not.toContain('<FlyingTraffic');
    expect(citySource).not.toContain('veh_coupe.glb');
  });

  it('renders the deterministic mixed crowd layout', () => {
    expect(citySource).toContain("import { buildCrowdLayout, ROBOT_FILES");
    expect(citySource).toContain('function RobotCharacter');
    expect(citySource).toContain('layout.humans');
    expect(citySource).toContain('layout.robots');
    expect(citySource).toContain('ROBOT_FILES.forEach((file) => useGLTF.preload');
  });

  it('renders static humans through the existing GLB instancing path', () => {
    expect(citySource).toContain('materialTransform={pedestrianMaterialTransform}');
    expect(citySource).not.toContain('proto.clone(true)');
  });

  it('wires the previous pedestrian material treatment into instancing', () => {
    expect(citySource).toContain('const pedestrianMaterialTransform: InstancedMaterialTransform');
    expect(citySource).toContain('pedestrian.color.set(0x14161e)');
    expect(citySource).toContain('pedestrian.roughness = 0.7');
    expect(citySource).toContain('pedestrian.metalness = 0.2');
    expect(citySource).toContain('pedestrian.emissive.set(PALETTE.cyan)');
    expect(citySource).toContain('pedestrian.emissiveIntensity = 0.12');
  });

  it('renders generated Shibuya surfaces and removes world-axis crossbars', () => {
    expect(citySource).toContain('buildShibuyaIntersection,');
    expect(citySource).toContain('buildShibuyaIntersection()');
    expect(citySource).toContain('buildStraightRoadCrossings()');
    expect(citySource).toContain('intersection.crossings');
    expect(citySource).toContain('straightRoadCrossings.crossings');
    expect(citySource).toContain('intersection.indicators');
    expect(citySource).toContain(
      'const infrastructureClip = r.ground ? shibuyaPlazaContains : undefined',
    );
    expect(citySource).not.toContain('const crossbars');
  });

  it('renders pure street-dressing layout data instead of generating placements inline', () => {
    expect(citySource).toContain('buildStreetDressingLayout');
    expect(citySource).not.toContain('const manholes:');
    expect(citySource).not.toContain('for (let z = -40; z >= -110; z -= 6)');
  });

  it('renders the pure bridge layout and animated water finale', () => {
    expect(citySource).toContain('buildBridgeRenderGeometry');
    expect(citySource).toContain('BRIDGE_RENDER_CONFIG');
    expect(citySource).toContain('WATER_RENDER_CONFIG');
    expect(citySource).toContain('function FinaleBridge');
    expect(citySource).toContain("useCommittedThreeResource('finale-bridge'");
    expect(citySource).toContain('geometry={render.deckTop}');
    expect(citySource).not.toContain('lift: 0.08');
    expect(citySource).toContain('function WaterBasin');
    expect(citySource).toContain('waterResources.material.uniforms.uTime.value');
    expect(citySource).toContain('depthWrite: WATER_RENDER_CONFIG.depthWrite');
    expect(citySource).toContain('blending: WATER_RENDER_CONFIG.blending');
    expect(citySource).toContain('<FinaleBridge />');
    expect(citySource).toContain('<WaterBasin />');
  });

  it('cleans up owned bridge, water, and robot GPU resources', () => {
    expect(citySource).toContain("useCommittedThreeResource('finale-bridge'");
    expect(citySource).toContain("useCommittedThreeResource('water'");
    expect(citySource).toContain('useCommittedThreeResource(`robot:${spot.file}`');
    expect(citySource).toContain('dispose={null}');
  });

  it('wires the pure moon render and mounted inspection contracts', () => {
    expect(citySource).toContain('MOON_RENDER_CONFIG');
    expect(citySource).toContain('MOON_RENDER_CONFIG.textures.albedo.url');
    expect(citySource).toContain('MOON_RENDER_CONFIG.textures.bump.url');
    expect(citySource).toContain('albedo.colorSpace = MOON_RENDER_CONFIG.textures.albedo.colorSpace');
    expect(citySource).toContain('height.colorSpace = MOON_RENDER_CONFIG.textures.bump.colorSpace');
    expect(citySource).toContain('MOON_RENDER_CONFIG.surface.widthSegments');
    expect(citySource).toContain('MOON_RENDER_CONFIG.halo.blending');
    expect(citySource).toContain('bumpMap={height}');
    expect(citySource).toContain('fog={MOON_RENDER_CONFIG.surface.fog}');
    expect(citySource).toContain('fog={MOON_RENDER_CONFIG.halo.fog}');
    expect(citySource).toContain('function Task4SceneInspection');
    expect(citySource).toContain('<Task4SceneInspection />');
  });

  it('renders parent-linked facade signs and emitter-backed holograms', () => {
    expect(citySource).toContain("import { buildSignLayout");
    expect(citySource).toContain('FACADE_SIGN_RENDER_CONFIG');
    expect(citySource).toContain('HOLOGRAM_SIGN_RENDER_CONFIG');
    expect(citySource).toContain('buildSignPixelArt');
    expect(citySource).toContain('buildSignRenderBatches');
    expect(citySource).toContain("useCommittedThreeResource('signs'");
    expect(citySource).toContain('<group dispose={null}>');
    expect(citySource).toContain('function Signs()');
    expect(citySource).toContain('<instancedMesh');
    expect(citySource).toContain('batches.facadeScreens.map');
    expect(citySource).toContain('batches.hologramScreens.map');
    expect(citySource).not.toContain('signs.map((sign)');
    expect(citySource).toContain('enabled={!INSPECT_ENABLED}');
    expect(citySource).toContain('<Signs />');
    expect(citySource).not.toContain('buildBillboards');
    expect(citySource).not.toContain('function Billboards()');
    expect(citySource).not.toContain('<Billboards />');
    expect(cityLayoutSource).not.toContain('buildBillboards');
  });

  it('mounts dev/query-gated deterministic Task 6 camera presets', () => {
    expect(citySource).toContain('shouldEnableInspection(IS_DEVELOPMENT, location.search)');
    expect(citySource).toContain('function SceneInspectionPresets');
    expect(citySource).toContain('INSPECTION_PRESET_IDS.map(getInspectionPreset)');
    expect(citySource).toContain('applyInspectionPreset(camera, id)');
    expect(citySource).toContain('<SceneInspectionPresets />');
  });

  it('adds localized Shibuya wall lighting without lifting the whole skyline', () => {
    expect(citySource).toContain('function ShibuyaWallLighting');
    expect(citySource).toContain('distance={220}');
    expect(citySource).toContain('<ShibuyaWallLighting />');
  });

  it('renders attached textured panels on production Shibuya walls', () => {
    expect(citySource).toContain('buildShibuyaFacadePanels');
    expect(citySource).toContain('function ShibuyaFacadePanels');
    expect(citySource).toContain('<ShibuyaFacadePanels />');
  });
});
