// Adaptive quality tiers. There is no automated test suite; verify perf changes
// with the harness in tools/verification/perf (ride.mjs / ablate.mjs / shot.mjs).
//
// Everyone defaults to the high tier — an earlier GPU-benchmark auto-detection
// pass (see git history on perf/low-end-devices before this commit) showed
// little real-world difference between tiers, so guessing a visitor's device
// down to low isn't worth the risk of misclassifying a capable machine. The
// low tier still exists for anyone who wants it: `?quality=low` in the URL, or
// the visible Quality toggle, both stored in localStorage and read back on
// every load. High and mid are visually identical; mid is kept only as a
// harmless `?quality=mid` alias.

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

/** Detect once and memoize for the session. `?quality=high|mid|low` beats the
 *  stored preference, which beats the default (high — see file header). */
export function resolveQuality(search = typeof location !== 'undefined' ? location.search : ''): QualitySettings {
  if (cached) return cached;
  const forced = new URLSearchParams(search).get('quality');
  const preference = readQualityPreference();
  let tier: QualityTier;
  if (forced === 'high' || forced === 'mid' || forced === 'low') tier = forced;
  else if (preference !== 'auto') tier = preference;
  else tier = 'high';
  cached = qualityForTier(tier);
  if (typeof window !== 'undefined') {
    (window as Window & { __EVANLY_QUALITY__?: unknown }).__EVANLY_QUALITY__ = { tier, preference, forced };
  }
  return cached;
}
