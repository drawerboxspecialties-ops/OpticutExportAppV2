import { defineConfig } from 'vite';

export default defineConfig({
  base: '/OpticutExportAppV2/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
