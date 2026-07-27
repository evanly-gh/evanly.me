import React from 'react';
import { createRoot } from 'react-dom/client';

const Viewer = React.lazy(() => import('./viewer/Viewer'));
const City = React.lazy(() => import('./components/three/City'));
const ScrollExperience = React.lazy(() => import('./scroll/ScrollExperience'));

const params = new URLSearchParams(location.search);
const isViewer = params.has('viewer');
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
        color: '#eff7ff',
        background: '#05060f',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ width: 'min(28rem, 100%)' }}>
        <p style={{ color: '#9ce8ff', letterSpacing: '0.12em' }}>
          EVAN LI · PORTFOLIO
        </p>
        <h1 style={{ marginBlock: '0.5rem 1rem', fontSize: 'clamp(2rem, 8vw, 4rem)' }}>
          Entering the city
        </h1>
        <progress aria-label="Loading portfolio" style={{ width: '100%' }} />
      </div>
    </main>
  );
}

function Root() {
  if (isViewer) return <React.Suspense fallback={null}><Viewer /></React.Suspense>;
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
