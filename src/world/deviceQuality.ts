// Adaptive quality tiers. There is no automated test suite; verify perf changes
// visually + via the ?shot measurement harness (see agent notes).
//
// This only carries INVISIBLE, draw-call-only knobs now: the resolution/bloom
// tiering was reverted because it visibly softened the image on integrated GPUs.
// The device is classified into a tier from cheap synchronous signals; the only
// thing derived from it is the instanced-building chunk size (see instanceChunkSize).
// `?quality=high|mid|low` overrides the detection.

export type QualityTier = 'high' | 'mid' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Spatial chunk size (world units) for instanced building batches. Larger =
   *  fewer InstancedMesh draw calls (less CPU submission) at the cost of coarser
   *  frustum culling — a good trade on CPU-bound weak devices whose GPU is idle.
   *  Visually identical (only affects when off-screen instances get culled). */
  instanceChunkSize: number;
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
      return { tier, instanceChunkSize: 180 };
    case 'mid':
      return { tier, instanceChunkSize: 360 };
    case 'low':
    default:
      return { tier, instanceChunkSize: 560 };
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
