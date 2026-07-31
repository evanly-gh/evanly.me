import {
  Component,
  Suspense,
  lazy,
  useCallback,
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
  introOverlayOpacityAt,
  resolvePresentationMode,
  resolveScrollExperienceMode,
} from './scrollRuntime';
import {
  NativePortfolio,
  SkipToContent,
} from './NativePortfolio';
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

// The intro title is the only DOM whose opacity tracks live scroll. Rather than
// subscribe the whole ScrollExperience (and the heavy <City> child) to the
// progress store — which forced a React commit on every scrub frame — this leaf
// subscribes on its own and drives style.opacity imperatively, so scrolling
// costs zero React renders.
function IntroTitle({
  store,
  shotT,
}: {
  store: ProgressStore;
  shotT: number | undefined;
}) {
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const apply = (semanticT: number) => {
      const el = headerRef.current;
      if (!el) return;
      const opacity = introOverlayOpacityAt(semanticT);
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
    <header ref={headerRef} className="city-intro-title" style={{ opacity: 1 }}>
      <span className="city-intro-title__index">SCENE_00 / ENTER</span>
      <h1>EVAN LI // PORTFOLIO CITY</h1>
      <p>A THREE.JS RIDE</p>
    </header>
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

  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    const pin = pinRef.current;
    if (!sentinel || !pin) return undefined;
    if (shotT !== undefined) {
      store.write(rawForSemantic(shotT));
      return undefined;
    }
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
  }, [reducedScroll, shotT, store]);

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
                  />
                </Suspense>
              </ScrollCanvasBoundary>
              <IntroTitle store={store} shotT={shotT} />
              {!isShot && !loading.complete && (
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
          <NativePortfolio mode="immersive" />
        </>
      ) : (
        <NativePortfolio mode={presentation} />
      )}
    </main>
  );
}
