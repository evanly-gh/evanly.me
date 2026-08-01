import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Split the heavy 3D/animation dependencies into their own long-lived vendor
// chunks. They change far less often than app code, so isolating them keeps the
// initial `index` chunk lean and lets the browser cache them across deploys.
// three is by far the largest, so it gets its own chunk; the R3F ecosystem
// (fiber/drei/postprocessing) and gsap follow.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  // react/react-dom must be their own chunk. Otherwise rollup folds react-dom
  // into `r3f` (fiber imports it), forcing the initial page — including the
  // non-3D DOM fallback — to download all of R3F before it can render anything.
  if (
    id.includes('/react/')
    || id.includes('/react-dom/')
    || id.includes('/scheduler/')
  ) {
    return 'react';
  }
  if (id.includes('/three/') || id.includes('/three-stdlib/')) return 'three';
  if (
    id.includes('/@react-three/')
    || id.includes('/postprocessing/')
  ) {
    return 'r3f';
  }
  if (id.includes('/gsap/')) return 'gsap';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
