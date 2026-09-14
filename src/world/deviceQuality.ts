// Adaptive quality tiers. There is no automated test suite; verify perf changes
// visually + via the ?shot measurement harness (see agent notes).
//
// The device is classified into a tier from cheap synchronous signals. Resolution
// and bloom are NOT scaled (that visibly softened the image and was reverted).
// `?quality=high|mid|low` overrides the detection.

export type QualityTier = 'high' | 'mid' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Spatial chunk size (world units) for instanced building batches. Larger =
   *  fewer InstancedMesh draw calls (less CPU submission) at the cost of coarser
   *  frustum culling — a good trade on CPU-bound weak devices whose GPU is idle.
   *  Visually identical (only affects when off-screen instances get culled). */
  instanceChunkSize: number;
  /** Camera far-clip (render distance) during the CITY ride, in world units.
   *  Buildings beyond this are frustum-culled by three.js — the render-distance
   *  lever. High tier sits past the fog so it's lossless (only culls fully-fogged
   *  geometry the camera used to waste-draw out to far=8000); weak tiers pull it
   *  in for far fewer objects. Ramps back up to reach the moon/bridge at the finale. */
  cityFar: number;
  /** Fog far, pulled in to match cityFar so buildings fade out instead of popping
   *  at the clip plane. */
  fogFar: number;
  /** Max device-pixel-ratio. NEVER below 1.0 (that blurs — the reverted mistake);
   *  weak tiers cap at native 1.0 to drop the supersampling a HiDPI laptop would
   *  otherwise do at 1.25×, which is a big GPU-fill saving with no softening. */
  dprMax: number;
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
  if (weakGpu || cores <= 4 || mem <= 4) return 'low';
  if (discrete && cores >= 8 && mem >= 8) return 'high';
  return 'mid';
}

export function qualityForTier(tier: QualityTier): QualitySettings {
  switch (tier) {
    case 'high':
      // cityFar past the fog (2100) → only culls fully-fogged geometry: lossless.
      return { tier, instanceChunkSize: 180, cityFar: 2600, fogFar: 2100, dprMax: 1.25 };
    case 'mid':
      return { tier, instanceChunkSize: 360, cityFar: 1700, fogFar: 1550, dprMax: 1.0 };
    case 'low':
    default:
      return { tier, instanceChunkSize: 560, cityFar: 1200, fogFar: 1080, dprMax: 1.0 };
  }
}

let cached: QualitySettings | null = null;

/** Detect once and memoize for the session. Allows ?quality=high|mid|low override. */
export function resolveQuality(search = typeof location !== 'undefined' ? location.search : ''): QualitySettings {
  if (cached) return cached;
  const forced = new URLSearchParams(search).get('quality');
  const tier: QualityTier = forced === 'high' || forced === 'mid' || forced === 'low'
    ? forced
    : detectQualityTier();
  cached = qualityForTier(tier);
  return cached;
}
