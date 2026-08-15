import React from 'react';
import { createRoot } from 'react-dom/client';

const Viewer = React.lazy(() => import('./viewer/Viewer'));
const City = React.lazy(() => import('./components/three/City'));
const BuildingGallery = React.lazy(() => import('./components/three/BuildingGallery'));
const ScrollExperience = React.lazy(() => import('./scroll/ScrollExperience'));

const params = new URLSearchParams(location.search);
const isViewer = params.has('viewer');
// ?gallery lines up every neocity kit piece with labels for pruning.
const isGallery = params.has('gallery');
// ?city (optionally with &freecam) renders the Phase 2 world for inspection.
const isCity = params.has('city') || params.has('freecam');

function PortfolioBootShell() {
  React.useLayoutEffect(() => {
    if (!performance.getEntriesByName('evanly-first-fallback').length) {
      performance.mark('evanly-first-fallback');
    }
    const frame = requestAnimationFrame(() => {
      if (!performance.getEntriesByName('evanly-first-meaningful-frame').length) {
        performance.mark('evanly-first-meaningful-frame');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  // Minimal dark boot screen shown only while the app chunk loads — deliberately
  // near-empty (no big heading) so it doesn't clash with the cinematic intro gate
  // that takes over the moment <ScrollExperience> mounts.
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Loading Evan Li interactive portfolio"
      style={{
        boxSizing: 'border-box',
        display: 'grid',
        minHeight: '100vh',
        placeItems: 'center',
        padding: '2rem',
        color: '#cdeffd',
        background: '#05060f',
        fontFamily:
          '"Bahnschrift Condensed", "DIN Condensed", "Oswald", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: '0.9rem',
          width: 'min(24rem, 82vw)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#ffbf45',
            letterSpacing: '0.32em',
            fontSize: '0.8rem',
            textTransform: 'uppercase',
          }}
        >
          EVAN LI · PORTFOLIO CITY
        </p>
        <div
          style={{
            width: '100%',
            height: '0.5rem',
            border: '1px solid #2bfdf9',
            background: 'rgba(4,10,18,0.82)',
            overflow: 'hidden',
            boxShadow: '0 0 12px rgba(43,253,249,0.35)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: '38%',
              background: '#2bfdf9',
              boxShadow: '0 0 10px rgba(43,253,249,0.8)',
              animation: 'evanly-boot-slide 1.1s ease-in-out infinite',
            }}
          />
        </div>
        <style>{
          '@keyframes evanly-boot-slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}'
        }</style>
      </div>
    </main>
  );
}

function Root() {
  if (isViewer) return <React.Suspense fallback={null}><Viewer /></React.Suspense>;
  if (isGallery) return <React.Suspense fallback={null}><BuildingGallery /></React.Suspense>;
  if (isCity) return <React.Suspense fallback={null}><City /></React.Suspense>;
  return (
    <React.Suspense fallback={<PortfolioBootShell />}>
      <ScrollExperience />
    </React.Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
