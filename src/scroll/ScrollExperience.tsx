import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createProgressStore, type ProgressStore } from '../choreography/progressStore';
import { rawForSemantic, remapScroll } from '../choreography/scrollRemap';
import {
  CITY_ZONE_IDS,
  cityLoadingProgress,
  type CityZoneId,
} from './cityLoading';
import {
  createPinnedScrollRuntime,
  outroOverlayOpacityAt,
  resolvePresentationMode,
  resolveScrollExperienceMode,
  sectionTitleOpacityAt,
  type SectionTitleWindow,
} from './scrollRuntime';
import {
  NativePortfolio,
  PortfolioHero,
  SkipToContent,
} from './NativePortfolio';
import { CursorFx } from './CursorFx';
import type { IntroPhase } from '../choreography/introSequence';
import { detectWebGL2Support } from './webglSupport';
import './ScrollExperience.css';

gsap.registerPlugin(ScrollTrigger);
const City = lazy(() => import('../components/three/City'));

const SECTION_MARKERS = [
  { id: 'intro', title: 'Intro', semanticT: 0 },
  { id: 'about', title: 'About', semanticT: 0.12 },
  { id: 'projects', title: 'Projects', semanticT: 0.36 },
  { id: 'research', title: 'Research', semanticT: 0.69 },
  { id: 'finale', title: 'Finale', semanticT: 0.89 },
] as const;

function browserSupportsWebGL(): boolean {
  return detectWebGL2Support(document);
}

class ScrollCanvasBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

// On-screen section titles that fade in/out as the camera reaches each dedicated
// beat. Windows are tuned to each section's held camera range in
// productionCameraRig (about ~0.16-0.22, projects ~0.40-0.60, research
// ~0.72-0.82). Same leaf-subscription trick as IntroTitle — opacity is driven
// imperatively so scrolling costs zero React renders.
const SECTION_TITLES: ReadonlyArray<{
  id: string;
  index: string;
  title: string;
  window: SectionTitleWindow;
}> = [
  {
    id: 'about',
    index: 'SCENE_01 / WHO',
    title: 'About Me',
    window: { fadeInStart: 0.15, fadeInEnd: 0.175, fadeOutStart: 0.215, fadeOutEnd: 0.245 },
  },
  {
    id: 'projects',
    index: 'SCENE_02 / WORK',
    title: 'Projects',
    window: { fadeInStart: 0.4, fadeInEnd: 0.43, fadeOutStart: 0.56, fadeOutEnd: 0.61 },
  },
  {
    id: 'research',
    index: 'SCENE_03 / LAB',
    title: 'Research',
    window: { fadeInStart: 0.72, fadeInEnd: 0.745, fadeOutStart: 0.81, fadeOutEnd: 0.84 },
  },
];

function SectionTitles({
  store,
  shotT,
}: {
  store: ProgressStore;
  shotT: number | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const apply = (semanticT: number) => {
      const container = containerRef.current;
      if (!container) return;
      const cards = container.children;
      for (let i = 0; i < cards.length; i += 1) {
        const el = cards[i] as HTMLElement;
        const opacity = sectionTitleOpacityAt(semanticT, SECTION_TITLES[i].window);
        el.style.opacity = String(opacity);
        el.setAttribute('aria-hidden', opacity <= 0.01 ? 'true' : 'false');
      }
    };
    if (shotT !== undefined) {
      apply(shotT);
      return undefined;
    }
    apply(remapScroll(store.read().raw));
    return store.subscribe((snapshot) => apply(remapScroll(snapshot.raw)));
  }, [store, shotT]);
  return (
    <div ref={containerRef} aria-live="off">
      {SECTION_TITLES.map(({ id, index, title }) => (
        <header key={id} className="city-section-title" style={{ opacity: 0 }}>
          <span className="city-section-title__index">{index}</span>
          <h2>{title}</h2>
        </header>
      ))}
    </div>
  );
}

// Post-moon outro banner: a full-screen dark layer carrying the portfolio hero,
// its opacity driven imperatively from the store (same leaf-subscription trick as
// IntroTitle) so it fades in over the tilt-up without costing React renders. The
// dark background doubles as the canvas dim.
function OutroBanner({
  store,
  shotT,
}: {
  store: ProgressStore;
  shotT: number | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const apply = (semanticT: number) => {
      const el = ref.current;
      if (!el) return;
      const opacity = outroOverlayOpacityAt(semanticT);
      el.style.opacity = String(opacity);
      el.setAttribute('aria-hidden', opacity <= 0.01 ? 'true' : 'false');
    };
    if (shotT !== undefined) {
      apply(shotT);
      return undefined;
    }
    apply(remapScroll(store.read().raw));
    return store.subscribe((snapshot) => apply(remapScroll(snapshot.raw)));
  }, [store, shotT]);
  return (
    <div ref={ref} className="city-outro-banner" style={{ opacity: 0 }}>
      <PortfolioHero variant="banner" />
      <span className="city-outro-banner__hint">Scroll to read on ↓</span>
    </div>
  );
}

export default function ScrollExperience() {
  const sentinelRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => createProgressStore());
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [webglFailed, setWebglFailed] = useState(
    () => !browserSupportsWebGL(),
  );
  const [activeCityZones, setActiveCityZones] =
    useState<CityZoneId[]>(['route']);
  const [readyCityZones, setReadyCityZones] = useState<CityZoneId[]>([]);
  const reducedMotion = useReducedMotion();
  const mode = resolveScrollExperienceMode(location.search, reducedMotion);
  const environment = (
    import.meta as ImportMeta & {
      env: { DEV: boolean; VITE_ENABLE_INSPECTION?: string };
    }
  ).env;
  const inspect = (
    environment.DEV || environment.VITE_ENABLE_INSPECTION === '1'
  ) && new URLSearchParams(location.search).has('inspect');
  const isShot = mode.kind === 'shot';
  const shotT = isShot ? mode.semanticT : undefined;
  const reducedScroll = mode.kind === 'scroll' && mode.reducedMotion;
  const presentation = isShot
    ? 'immersive'
    : resolvePresentationMode(
        location.search,
        reducedMotion,
        viewport.width,
        viewport.height,
        webglFailed,
      );
  const immersive = presentation === 'immersive';
  const reportWebglFailure = useCallback(() => setWebglFailed(true), []);
  const loading = cityLoadingProgress(readyCityZones);
  // The cinematic intro (loading bar → title → START → drive-in) only runs for
  // the full immersive ride; fallback/shot/reduced-motion presentations go
  // straight to the live scroll.
  const introApplies = immersive && !isShot && !reducedScroll;
  const [introPhase, setIntroPhase] = useState<IntroPhase>('loading');
  const startRide = useCallback(() => setIntroPhase('driving'), []);
  const finishIntro = useCallback(() => setIntroPhase('live'), []);
  const reportCityZoneActive = useCallback((zone: CityZoneId) => {
    setActiveCityZones((current) =>
      current.includes(zone) ? current : [...current, zone]);
  }, []);
  const reportCityZoneReady = useCallback((zone: CityZoneId) => {
    setReadyCityZones((current) => {
      if (current.includes(zone)) return current;
      const next = [...current, zone];
      performance.mark(`evanly-city-zone-${zone}-ready`);
      if (next.length === CITY_ZONE_IDS.length) {
        performance.mark('evanly-full-city-ready');
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const update = () => setViewport({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Safety net for the rare case where WebGL 2 passes the pre-flight probe but
  // renderer creation still fails asynchronously (e.g. the browser's live
  // context budget is exhausted). That error dodges the render-phase error
  // boundary, so listen for it explicitly and switch to the portfolio content
  // instead of leaving a blank canvas. This matches only genuinely thrown
  // WebGL errors, never three.js's normal teardown.
  useLayoutEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.message ?? '';
      if (/Error creating WebGL context|WebGLRenderer: .*WebGL/i.test(message)) {
        reportWebglFailure();
      }
    };
    window.addEventListener('error', onWindowError);
    return () => window.removeEventListener('error', onWindowError);
  }, [reportWebglFailure]);

  useLayoutEffect(() => {
    if (!immersive && !isShot) return;
    if (!performance.getEntriesByName('evanly-first-fallback').length) {
      performance.mark('evanly-first-fallback');
    }
  }, [immersive, isShot]);

  // Intro only applies to the immersive ride; anything else starts live.
  useLayoutEffect(() => {
    if (!introApplies) setIntroPhase('live');
  }, [introApplies]);

  // loading → title only once the WHOLE city is built (all zones ready), so the
  // loading bar runs to 100% and the viewer never sees buildings popping in on
  // the START/ride screen. A generous safety timeout un-strands the loader if a
  // single zone genuinely stalls, without cutting off a normal (slower) build.
  useEffect(() => {
    if (!introApplies || introPhase !== 'loading') return undefined;
    if (loading.complete) {
      setIntroPhase('title');
      return undefined;
    }
    const timeout = window.setTimeout(() => setIntroPhase('title'), 30000);
    return () => window.clearTimeout(timeout);
  }, [introApplies, introPhase, loading.complete]);

  // Lock page scroll until the ride goes live, so the tall sentinel can't be
  // scrolled during loading / title / drive-in.
  useLayoutEffect(() => {
    if (introPhase === 'live') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = previous;
    };
  }, [introPhase]);

  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    const pin = pinRef.current;
    if (!sentinel || !pin) return undefined;
    if (shotT !== undefined) {
      store.write(rawForSemantic(shotT));
      return undefined;
    }
    // Don't build the pinned scroll runtime until the intro hands off — the ride
    // starts exactly when the drive-in finishes at t=0.
    if (introPhase !== 'live') return undefined;
    const runtime = createPinnedScrollRuntime({
      gsap,
      ScrollTrigger,
      sentinel,
      pin,
      reducedMotion: reducedScroll,
      writeRaw: (raw) => store.write(raw),
    });
    runtime.refresh();
    return runtime.cleanup;
  }, [reducedScroll, shotT, store, introPhase]);

  return (
    <main
      className={`scroll-experience${isShot ? ' scroll-experience--shot' : ''}`}
      aria-label="Evan Li interactive portfolio"
      data-presentation={presentation}
    >
      <SkipToContent />
      {presentation === 'webgl-fallback' && (
        <div className="native-fallback-notice" role="status">
          <p>
            Your browser isn&rsquo;t running the interactive 3D version, so
            here&rsquo;s the full portfolio. To view the 3D experience, turn on
            hardware acceleration in your browser settings, then retry.
          </p>
          <button
            type="button"
            className="native-fallback-notice__retry"
            onClick={() => window.location.reload()}
          >
            Try the 3D version
          </button>
        </div>
      )}
      {immersive || isShot ? (
        <>
          <section
            ref={sentinelRef}
            className="scroll-sentinel"
            data-scroll-sentinel
            data-shot={isShot}
            data-reduced-motion={reducedScroll}
            aria-label="Portfolio journey"
          >
            <div ref={pinRef} className="scroll-pin" data-scroll-pin>
              <ScrollCanvasBoundary onError={reportWebglFailure}>
                <Suspense fallback={null}>
                  <City
                    production
                    progressStore={store}
                    inspect={inspect}
                    onZoneActive={reportCityZoneActive}
                    onZoneReady={reportCityZoneReady}
                    introPhase={introApplies ? introPhase : 'live'}
                    onIntroComplete={finishIntro}
                  />
                </Suspense>
              </ScrollCanvasBoundary>
              <SectionTitles store={store} shotT={shotT} />
              {!isShot && <OutroBanner store={store} shotT={shotT} />}
              {introApplies && introPhase !== 'live' && (
                <div className="city-intro-gate" data-phase={introPhase}>
                  {/* Title now lives on the 3D billboard behind the bike; the DOM
                      gate only carries the loading bar / START control, anchored
                      low so it never blocks the hero shot. */}
                  <div className="city-intro-gate__inner">
                    {introPhase === 'loading' ? (
                      <div className="city-intro-gate__loading">
                        <div
                          className="city-intro-gate__bar"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={loading.percent}
                          aria-label="Loading city"
                        >
                          <span
                            className="city-intro-gate__bar-fill"
                            style={{ width: `${loading.percent}%` }}
                          />
                        </div>
                        <span className="city-intro-gate__status">
                          LOADING CITY … {loading.percent}%
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="city-intro-gate__start"
                        onClick={startRide}
                      >
                        ▶&nbsp;START
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!isShot && !introApplies && !loading.complete && (
                <div
                  className="city-loading-status"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    Loading {activeCityZones.at(-1)} city zone ·{' '}
                    {loading.loaded} of {loading.total} ready
                  </span>
                  <progress
                    aria-label="City loading progress"
                    max={loading.total}
                    value={loading.loaded}
                  />
                </div>
              )}
            </div>
            <div className="scroll-markers">
              {SECTION_MARKERS.map(({ id, title, semanticT }) => (
                <section
                  key={id}
                  className="scroll-marker"
                  style={{ top: `${rawForSemantic(semanticT) * 100}%` }}
                  aria-labelledby={`scroll-marker-${id}`}
                >
                  <h2 id={`scroll-marker-${id}`}>{title}</h2>
                </section>
              ))}
            </div>
          </section>
          <NativePortfolio mode="outro" />
          {!isShot && <CursorFx />}
        </>
      ) : (
        <NativePortfolio mode={presentation} />
      )}
    </main>
  );
}
