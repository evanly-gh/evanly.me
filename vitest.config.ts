import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'three', '@react-three/fiber'],
    mainFields: ['module', 'browser', 'main'],
    conditions: ['import', 'module', 'browser', 'default'],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
