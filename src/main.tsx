import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const Viewer = React.lazy(() => import('./viewer/Viewer'));
const City = React.lazy(() => import('./components/three/City'));

const params = new URLSearchParams(location.search);
const isViewer = params.has('viewer');
// ?city (optionally with &freecam) renders the Phase 2 world for inspection.
const isCity = params.has('city') || params.has('freecam');

function Root() {
  if (isViewer) return <React.Suspense fallback={null}><Viewer /></React.Suspense>;
  if (isCity) return <React.Suspense fallback={null}><City /></React.Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
