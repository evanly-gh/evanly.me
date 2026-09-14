// Adaptive quality tiers. There is no automated test suite; verify perf changes
// with the harness in tools/verification/perf (ride.mjs / ablate.mjs / shot.mjs).
//
// A device lands in a tier from three signals, in priority order:
//   1. `?quality=high|mid|low` (URL) or the visible quality toggle (localStorage)
//   2. a ~100 ms fill-rate benchmark run once on a throwaway WebGL2 context
//   3. cheap heuristics (renderer string, cores, memory, mobile UA)
// Low-end desktop/laptop GPUs therefore get the same reductions as mobile
// regardless of screen size. The tier only reduces what a weak device can't
// afford; high/mid keep today's look (dpr cap, bloom, lights) unchanged.

export type QualityTier = 'high' | 'mid' | 'low';
export type QualityPreference = 'auto' | QualityTier;

export const QUALITY_STORAGE_KEY = 'evanly-quality';

export interface QualitySettings {
  tier: QualityTier;
  /** Spatial chunk size (world units) for instanced building batches. One
   *  chunk per file per BuildingZone on every tier (see instanceBuckets). */
  instanceChunkSize: number;
  /** Upper bound for the canvas device-pixel ratio. */
  maxDpr: number;
  /** Bloom mip levels; each level is a pair of half-res passes. */
  bloomLevels: number;
  /** HalfFloat (HDR) composer buffers; 8-bit halves the bandwidth on weak GPUs. */
  halfFloatComposer: boolean;
  /** The two faint magenta/cyan directional fills. */
  fillLights: boolean;
  /** The three Shibuya wall point lights (each is shaded on every PBR fragment
   *  city-wide, so dropping them is a shader-wide saving). */
  shibuyaPointLights: boolean;
  /** Per-frame bob on the floating hologram billboards (static when false, so
   *  they bake into the merged billboard draws). */
  animatedHolograms: boolean;
  /** Render only when something changed, paced to `maxFps`. */
  pacedFrameloop: boolean;
  /** Frame cap while paced (0 = display rate). */
  maxFps: number;
  /** Largest billboard screen atlas dimension. */
  atlasSize: number;
}

function readRendererString(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2')
      || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      : String(gl.getParameter(gl.RENDERER) ?? '');
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return raw.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Fill-rate benchmark: draws a fragment-heavy full-screen quad (a 48-tap
 * loop of texture reads + transcendental math, roughly the cost of the city's
 * PBR + bloom per pixel) onto a 512² offscreen canvas, blocks on gl.finish()
 * and returns megapixels of that shading per millisecond. Returns null when the
 * measurement can't be trusted (no WebGL2, software renderer, tiny sample).
 *
 * Reference point (this shader): AMD Radeon Vega 8 iGPU (Ryzen 7 5700U)
 * ≈ 0.24 Mpx/ms. See LOW_/HIGH_FILL_RATE_MPX_PER_MS for the tier cut-offs.
 */
export function benchmarkFillRate(): number | null {
  try {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
      in vec2 p; out vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; in vec2 v; uniform sampler2D t; uniform float k; out vec4 o;
      void main(){
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 48; i++) {
          float f = float(i) * 0.137 + k;
          vec2 uv = v * (1.0 + 0.02 * float(i)) + vec2(sin(f), cos(f)) * 0.05;
          vec3 s = texture(t, uv).rgb;
          acc += s * (0.5 + 0.5 * sin(s.r * 6.2831 + f)) * pow(max(s.g, 0.001), 1.5);
        }
        o = vec4(acc / 48.0, 1.0);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const noise = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) >>> 24;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const kLoc = gl.getUniformLocation(program, 'k');
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST);
    // A 1x1 readback is the only reliable way to wait for the GPU: gl.finish()
    // returned in 0.2 ms on ANGLE/D3D11 without the work having executed.
    const pixel = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    // Warm up (shader compile / first-draw costs must not be measured).
    for (let i = 0; i < 4; i += 1) { gl.uniform1f(kLoc, i); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    sync();
    const passes = 24;
    const start = performance.now();
    for (let i = 0; i < passes; i += 1) { gl.uniform1f(kLoc, i * 0.31); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    sync();
    const ms = performance.now() - start;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (!(ms > 0.5)) { lastBenchmarkError = `too fast: ${ms.toFixed(3)} ms`; return null; }
    return (size * size * passes) / 1e6 / ms;
  } catch (error) {
    lastBenchmarkError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

let lastBenchmarkError: string | null = null;

// Calibration (this shader, readPixels-synchronised): the reference low-end
// laptop — Ryzen 7 5700U with Radeon Vega 8 — scores ≈0.24 Mpx/ms and needs
// every low-tier reduction to hold 30 fps at the opening shot. Iris Xe / Apple
// M-series integrated GPUs land around 3-5x that; mid-range discrete GPUs 10x+.
const LOW_FILL_RATE_MPX_PER_MS = 0.6;
const HIGH_FILL_RATE_MPX_PER_MS = 2.5;

export function detectQualityTier(win: Window = window): QualityTier {
  const nav = win.navigator;
  const ua = (nav.userAgent || '').toLowerCase();
  const renderer = readRendererString();
  const cores = nav.hardwareConcurrency || 4;
  // deviceMemory is Chromium-only; treat missing as unknown (don't penalize).
  const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const mobile = /android|iphone|ipad|ipod|mobile|windows phone/.test(ua)
    // iPadOS 13+ reports as desktop Safari; catch it via touch + Mac.
    || (/macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);

  // Software / clearly-weak GPUs (integrated / mobile / software rasterizers).
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/.test(renderer);
  const weakGpu = software
    || /\bmali\b|adreno|powervr|videocore|apple a\d/.test(renderer)
    || /intel.*\b(hd|uhd|iris)\b.*graphics/.test(renderer)
    // AMD integrated APUs report "Radeon(TM) Graphics" or "Radeon Vega" (no RX/Pro).
    || /radeon(\(tm\))?\s+(graphics|vega)/.test(renderer)
    || /amd radeon\(tm\) graphics/.test(renderer);

  // Strong discrete GPUs.
  const discrete = /\brtx\b|geforce (gtx|rtx)|radeon rx|radeon pro|arc a\d|quadro/
    .test(renderer);

  if (mobile) return 'low';
  if (software) return 'low';

  // Measure rather than guess where we can: a benchmark catches weak desktop
  // GPUs the renderer regexes miss, and clears strong ones they misclassify.
  const fill = benchmarkFillRate();
  lastBenchmark = fill;
  if (fill !== null) {
    if (fill < LOW_FILL_RATE_MPX_PER_MS) return 'low';
    if (fill >= HIGH_FILL_RATE_MPX_PER_MS && cores >= 6) return 'high';
    if (weakGpu) return 'low';
    return 'mid';
  }

  if (weakGpu || cores <= 4 || mem <= 4) return 'low';
  if (discrete && cores >= 8 && mem >= 8) return 'high';
  return 'mid';
}

let lastBenchmark: number | null = null;
/** Fill-rate score from the most recent detection (null if not measured). */
export function lastFillRateBenchmark(): number | null {
  return lastBenchmark;
}

// One chunk per file per BuildingZone on every tier. Spatial sub-chunking
// produced ~700 InstancedMeshes averaging 3 instances each (349 of them held a
// single instance), and draw submission — not vertex work — was the measured
// per-frame cost. The zone partition already gives corridor-scale culling.
const SINGLE_CHUNK = 1_000_000;

export function qualityForTier(tier: QualityTier): QualitySettings {
  switch (tier) {
    case 'high':
      return {
        tier,
        instanceChunkSize: SINGLE_CHUNK,
        maxDpr: 1.25,
        bloomLevels: 8,
        halfFloatComposer: true,
        fillLights: true,
        shibuyaPointLights: true,
        animatedHolograms: true,
        pacedFrameloop: false,
        maxFps: 0,
        atlasSize: 4096,
      };
    case 'mid':
      return {
        tier,
        instanceChunkSize: SINGLE_CHUNK,
        maxDpr: 1.25,
        bloomLevels: 8,
        halfFloatComposer: true,
        fillLights: true,
        shibuyaPointLights: true,
        animatedHolograms: true,
        pacedFrameloop: false,
        maxFps: 0,
        atlasSize: 4096,
      };
    case 'low':
    default:
      return {
        tier,
        instanceChunkSize: SINGLE_CHUNK,
        maxDpr: 1,
        bloomLevels: 4,
        halfFloatComposer: false,
        fillLights: false,
        shibuyaPointLights: false,
        animatedHolograms: false,
        pacedFrameloop: true,
        maxFps: 30,
        atlasSize: 2048,
      };
  }
}

export function readQualityPreference(): QualityPreference {
  try {
    const stored = window.localStorage.getItem(QUALITY_STORAGE_KEY);
    if (stored === 'high' || stored === 'mid' || stored === 'low' || stored === 'auto') return stored;
  } catch {
    // storage unavailable (private mode / blocked) — fall through to auto
  }
  return 'auto';
}

export function writeQualityPreference(preference: QualityPreference): void {
  try {
    if (preference === 'auto') window.localStorage.removeItem(QUALITY_STORAGE_KEY);
    else window.localStorage.setItem(QUALITY_STORAGE_KEY, preference);
  } catch {
    // ignore: the toggle still works for this page load via reload
  }
}

let cached: QualitySettings | null = null;
let detectedTier: QualityTier | null = null;

/** Detect once and memoize for the session. `?quality=high|mid|low` beats the
 *  stored preference, which beats auto detection. */
export function resolveQuality(search = typeof location !== 'undefined' ? location.search : ''): QualitySettings {
  if (cached) return cached;
  const forced = new URLSearchParams(search).get('quality');
  const preference = readQualityPreference();
  let tier: QualityTier;
  if (forced === 'high' || forced === 'mid' || forced === 'low') tier = forced;
  else if (preference !== 'auto') tier = preference;
  else tier = detectQualityTier();
  if (forced === null && preference === 'auto') detectedTier = tier;
  cached = qualityForTier(tier);
  if (typeof window !== 'undefined') {
    (window as Window & { __EVANLY_QUALITY__?: unknown }).__EVANLY_QUALITY__ = {
      tier, preference, forced, fillRate: lastBenchmark, benchmarkError: lastBenchmarkError,
    };
  }
  return cached;
}

/** The tier auto-detection would pick (null when a preference/URL overrode it). */
export function autoDetectedTier(): QualityTier | null {
  return detectedTier;
}
