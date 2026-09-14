import * as THREE from 'three';

/**
 * One material for every KitBash building.
 *
 * The KitBash NeoCity pieces are 8-16 primitives each, one per PBR material,
 * and those materials differ only by their (tiling, 256x256) base-colour
 * texture, a solid colour, or an emissive factor. Rendering them as separate
 * material parts cost 11-14 draw calls per building per zone — ~670 instanced
 * draws at the opening shot, the single largest CPU cost in the frame.
 *
 * Because the textures tile across world space (UVs run to 60+), a UV atlas is
 * impossible. A 2D texture ARRAY is not: every part keeps its own UVs and REPEAT
 * wrapping, and picks its texture by a per-vertex layer index. All parts of a
 * file then merge into ONE geometry drawn with ONE material (plus a per-vertex
 * emissive radiance so neon parts still glow), i.e. one draw per file per zone.
 *
 * The shader is the stock MeshStandardMaterial with two chunks swapped via
 * onBeforeCompile, so lighting, fog, env-map and tone mapping are untouched.
 */

/** One packed Uint8x4 attribute per vertex: [layer, emissiveR, emissiveG,
 *  emissiveB] with emissive radiance stored ×127.5 (range 0-2). Kept to 4
 *  bytes on purpose: separate float attributes added 16 B/vertex and measured
 *  +3 ms GPU per frame from vertex-fetch bandwidth alone. */
export const KITBASH_PACKED_ATTRIBUTE = 'aKb';
export const KITBASH_EMISSIVE_SCALE = 127.5;

const LAYER_SIZE = 256;
const MAX_LAYERS = 96;

export class KitbashTextureArray {
  readonly texture: THREE.DataArrayTexture;
  private readonly data: Uint8Array;
  private readonly layers = new Map<string, number>();
  private next = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor() {
    this.data = new Uint8Array(LAYER_SIZE * LAYER_SIZE * 4 * MAX_LAYERS);
    const texture = new THREE.DataArrayTexture(this.data, LAYER_SIZE, LAYER_SIZE, MAX_LAYERS);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    // Match the source glTF textures (three's default, no anisotropic taps):
    // anisotropy 4 here measured +3 ms GPU per frame on an integrated Radeon.
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    this.texture = texture;
    this.canvas = document.createElement('canvas');
    this.canvas.width = LAYER_SIZE;
    this.canvas.height = LAYER_SIZE;
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas unavailable for texture array packing');
    this.context = context;
  }

  get capacityLeft(): number {
    return MAX_LAYERS - this.next;
  }

  /** Layer holding this glTF texture's pixels (resampled to 256²), packing it on
   *  first use. Returns -1 when the array is full. */
  layerForTexture(texture: THREE.Texture): number {
    const key = `t:${texture.uuid}`;
    const existing = this.layers.get(key);
    if (existing !== undefined) return existing;
    const image = texture.image as CanvasImageSource & { width?: number; height?: number };
    if (!image || !image.width || !image.height) return -1;
    if (this.next >= MAX_LAYERS) return -1;
    const index = this.next++;
    this.layers.set(key, index);
    this.context.clearRect(0, 0, LAYER_SIZE, LAYER_SIZE);
    // glTF textures are uploaded unflipped (flipY=false, v=0 at the top row);
    // canvas rows also run top-down, so the layer needs no flip either.
    this.context.drawImage(image, 0, 0, LAYER_SIZE, LAYER_SIZE);
    const pixels = this.context.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data;
    this.data.set(pixels, index * LAYER_SIZE * LAYER_SIZE * 4);
    this.texture.addLayerUpdate(index);
    this.texture.needsUpdate = true;
    return index;
  }

  /** Layer filled with a solid (linear) colour, for untextured parts. */
  layerForColor(color: THREE.Color): number {
    const srgb = color.clone().convertLinearToSRGB();
    const r = Math.round(THREE.MathUtils.clamp(srgb.r, 0, 1) * 255);
    const g = Math.round(THREE.MathUtils.clamp(srgb.g, 0, 1) * 255);
    const b = Math.round(THREE.MathUtils.clamp(srgb.b, 0, 1) * 255);
    const key = `c:${r},${g},${b}`;
    const existing = this.layers.get(key);
    if (existing !== undefined) return existing;
    if (this.next >= MAX_LAYERS) return -1;
    const index = this.next++;
    this.layers.set(key, index);
    const base = index * LAYER_SIZE * LAYER_SIZE * 4;
    for (let i = 0; i < LAYER_SIZE * LAYER_SIZE; i += 1) {
      const o = base + i * 4;
      this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
    }
    this.texture.addLayerUpdate(index);
    this.texture.needsUpdate = true;
    return index;
  }
}

let sharedArray: KitbashTextureArray | null = null;
export function kitbashTextureArray(): KitbashTextureArray {
  if (!sharedArray) sharedArray = new KitbashTextureArray();
  return sharedArray;
}

const materials = new Map<THREE.Side, THREE.MeshStandardMaterial>();
let placeholderMap: THREE.DataTexture | null = null;

/** The shared array-sampling MeshStandardMaterial (one program for all
 *  buildings). `emissive` is white so per-vertex radiance passes straight
 *  through; roughness/metalness use the kit's uniform 0.85 / 0 values. */
export function kitbashArrayMaterial(side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const existing = materials.get(side);
  if (existing) return existing;
  const array = kitbashTextureArray();
  if (!placeholderMap) {
    // A 1x1 map only exists to switch on USE_MAP (and its vMapUv varying); the
    // fragment chunk below samples the array instead.
    placeholderMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    placeholderMap.needsUpdate = true;
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: placeholderMap,
    roughness: 0.85,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    side,
  });
  material.name = 'KitbashArray';
  material.customProgramCacheKey = () => 'kitbash-array-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMapArray = { value: array.texture };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          `attribute vec4 ${KITBASH_PACKED_ATTRIBUTE};`,
          'varying float vKbLayer;',
          'varying vec3 vKbEmissive;',
        ].join('\n'),
      )
      .replace(
        '#include <uv_vertex>',
        [
          '#include <uv_vertex>',
          `vKbLayer = ${KITBASH_PACKED_ATTRIBUTE}.x;`,
          `vKbEmissive = ${KITBASH_PACKED_ATTRIBUTE}.yzw * ${(1 / KITBASH_EMISSIVE_SCALE).toFixed(8)};`,
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2DArray uMapArray;',
          'varying float vKbLayer;',
          'varying vec3 vKbEmissive;',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          'vec4 kbSampled = texture( uMapArray, vec3( vMapUv, vKbLayer ) );',
          'diffuseColor *= kbSampled;',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        'totalEmissiveRadiance = vKbEmissive;',
      );
  };
  materials.set(side, material);
  return material;
}

/** Emissive radiance a KitBash part contributes, matching tuneClonedMaterial:
 *  parts with light/neon/glass-style names glow 1.6x brighter. */
export const KITBASH_EMISSIVE_HINT = /light|neon|glass|screen|banner|letter|sign|decal/i;
export function kitbashPartEmissive(material: THREE.MeshStandardMaterial): THREE.Color {
  const intensity = KITBASH_EMISSIVE_HINT.test(material.name || '') ? 1.6 : material.emissiveIntensity;
  return material.emissive.clone().multiplyScalar(intensity);
}
