import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const Viewer = React.lazy(() => import('./viewer/Viewer'));

const isViewer = new URLSearchParams(location.search).has('viewer');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isViewer ? (
      <React.Suspense fallback={null}>
        <Viewer />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
