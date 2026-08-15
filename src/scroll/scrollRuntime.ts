import { snapReducedMotion } from '../choreography/reducedMotion';
import { rawForSemantic, remapScroll } from '../choreography/scrollRemap';

// Whole-ride scroll length. Bumped ~2.5× again (3625 → 9063 vh) so every section
// dwells much longer under the finger instead of blowing past in a few notches;
// per-section weighting (see scrollRemap.ts) still rides on top of this.
export const SCROLL_SENTINEL_VH = 9063;
export const SCROLL_TOTAL_LENGTH_RATIO = SCROLL_SENTINEL_VH / 800;
export const SCROLL_PINNED_TRAVEL_VH = SCROLL_SENTINEL_VH - 100;
export const SCROLL_PINNED_TRAVEL_RATIO = SCROLL_PINNED_TRAVEL_VH / 700;
export const SCROLL_SCRUB_SECONDS = 0.35;

export function introOverlayOpacityAt(semanticT: number): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Intro overlay progress must be finite');
  }
  const progress = Math.max(0, Math.min(1, semanticT / 0.1));
  const eased = progress * progress * (3 - 2 * progress);
  return 1 - eased;
}

// Post-moon outro: as the finale camera tilts up off the moon (t≈0.94→1.0), a
// full-screen banner — identical to the top of the static portfolio page — fades
// in over the dimming canvas, so when the pinned ride releases at t=1 the viewer
// is already at the head of the traditional page. Eased ramp, same system as the
// intro/section overlays.
export function outroOverlayOpacityAt(semanticT: number): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Outro overlay progress must be finite');
  }
  const progress = Math.max(0, Math.min(1, (semanticT - 0.94) / (0.995 - 0.94)));
  return progress * progress * (3 - 2 * progress);
}

export interface SectionTitleWindow {
  fadeInStart: number;
  fadeInEnd: number;
  fadeOutStart: number;
  fadeOutEnd: number;
}

// Per-section on-screen title (About / Projects / Research): fades up as the
// camera enters the section, holds, then fades out before the next beat — the
// same eased ramp as the intro overlay so all the overlays read as one system.
export function sectionTitleOpacityAt(
  semanticT: number,
  window: SectionTitleWindow,
): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Section title progress must be finite');
  }
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const { fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd } = window;
  if (semanticT <= fadeInStart || semanticT >= fadeOutEnd) return 0;
  if (semanticT < fadeInEnd) {
    return smooth((semanticT - fadeInStart) / (fadeInEnd - fadeInStart));
  }
  if (semanticT <= fadeOutStart) return 1;
  return 1 - smooth((semanticT - fadeOutStart) / (fadeOutEnd - fadeOutStart));
}

export type ScrollExperienceMode =
  | { kind: 'scroll'; reducedMotion: boolean }
  | { kind: 'shot'; semanticT: number };

export function sceneAnimationTime(
  search: string,
  semanticT: number,
  elapsedSeconds: number,
): number {
  if (
    !Number.isFinite(semanticT)
    || !Number.isFinite(elapsedSeconds)
  ) {
    throw new Error('Scene animation time inputs must be finite');
  }
  const params = new URLSearchParams(search);
  return (params.has('shot') || params.has('scrollTask6'))
    ? Math.max(0, Math.min(1, semanticT)) * 120
    : elapsedSeconds;
}

export type PresentationMode =
  | 'immersive'
  | 'text'
  | 'reduced'
  | 'compact'
  | 'webgl-fallback';

export function resolvePresentationMode(
  search: string,
  prefersReducedMotion: boolean,
  width: number,
  height: number,
  webglFailed: boolean,
): PresentationMode {
  if (new URLSearchParams(search).has('text')) return 'text';
  if (webglFailed) return 'webgl-fallback';
  if (prefersReducedMotion) return 'reduced';
  if (width <= 700 || height > width) return 'compact';
  return 'immersive';
}

export function resolveScrollExperienceMode(
  search: string,
  prefersReducedMotion: boolean,
): ScrollExperienceMode {
  const params = new URLSearchParams(search);
  if (params.has('shot')) {
    const requested = Number(params.get('shot'));
    return {
      kind: 'shot',
      semanticT: Number.isFinite(requested)
        ? Math.max(0, Math.min(1, requested))
        : 0,
    };
  }
  return { kind: 'scroll', reducedMotion: prefersReducedMotion };
}

interface ScrollTriggerUpdate {
  progress: number;
}

interface ScrollTriggerConfiguration {
  trigger: HTMLElement;
  start: string;
  end: string;
  pin: HTMLElement;
  pinSpacing: boolean;
  scrub: number | boolean;
  invalidateOnRefresh: boolean;
  anticipatePin: number;
  onUpdate: (self: ScrollTriggerUpdate) => void;
}

interface TweenLike {
  kill(): void;
  scrollTrigger?: { kill(): void };
}

export interface GsapLike {
  to(
    target: object,
    configuration: {
      value: number;
      ease: string;
      onUpdate?: () => void;
      scrollTrigger: ScrollTriggerConfiguration;
    },
  ): TweenLike;
}

export interface ScrollTriggerLike {
  refresh(): void;
}

export interface PinnedScrollRuntimeOptions {
  gsap: GsapLike;
  ScrollTrigger: ScrollTriggerLike;
  sentinel: HTMLElement;
  pin: HTMLElement;
  reducedMotion: boolean;
  writeRaw: (raw: number) => void;
  addResizeListener?: (listener: () => void) => void;
  removeResizeListener?: (listener: () => void) => void;
}

export interface PinnedScrollRuntime {
  refresh(): void;
  cleanup(): void;
}

interface ActivePinnedRuntime {
  cleanup(): void;
}

const activeRuntimes = new WeakMap<HTMLElement, ActivePinnedRuntime>();

export function createPinnedScrollRuntime({
  gsap,
  ScrollTrigger,
  sentinel,
  pin,
  reducedMotion,
  writeRaw,
  addResizeListener = (listener) =>
    window.addEventListener('resize', listener),
  removeResizeListener = (listener) =>
    window.removeEventListener('resize', listener),
}: PinnedScrollRuntimeOptions): PinnedScrollRuntime {
  activeRuntimes.get(sentinel)?.cleanup();

  let refreshCount = 0;
  const refresh = () => {
    refreshCount += 1;
    sentinel.dataset.refreshCount = String(refreshCount);
    ScrollTrigger.refresh();
  };
  const tweenProgress = { value: 0 };
  const tween = gsap.to(tweenProgress, {
    value: 1,
    ease: 'none',
    onUpdate: reducedMotion
      ? undefined
      : () => writeRaw(tweenProgress.value),
    scrollTrigger: {
      trigger: sentinel,
      start: 'top top',
      end: 'bottom bottom',
      pin,
      pinSpacing: false,
      scrub: reducedMotion ? false : SCROLL_SCRUB_SECONDS,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onUpdate: ({ progress }) => {
        if (!reducedMotion) return;
        const raw = Math.max(0, Math.min(1, progress));
        writeRaw(rawForSemantic(snapReducedMotion(remapScroll(raw))));
      },
    },
  });
  addResizeListener(refresh);
  pin.dataset.scrollRuntime = 'active';
  sentinel.dataset.gsapInstances = '1';
  sentinel.dataset.scrub = reducedMotion ? 'false' : String(SCROLL_SCRUB_SECONDS);

  let cleaned = false;
  const active: ActivePinnedRuntime = {
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      removeResizeListener(refresh);
      tween.scrollTrigger?.kill();
      tween.kill();
      delete pin.dataset.scrollRuntime;
      delete sentinel.dataset.gsapInstances;
      delete sentinel.dataset.scrub;
      if (activeRuntimes.get(sentinel) === active) {
        activeRuntimes.delete(sentinel);
      }
    },
  };
  activeRuntimes.set(sentinel, active);
  return {
    refresh,
    cleanup: active.cleanup,
  };
}
