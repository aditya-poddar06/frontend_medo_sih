import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { fileURLToPath, URL } from 'node:url';

// Fix: `__dirname` is not available in ESM; use `import.meta.url` instead
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      '@udaan': `${__dirname}src/udaan`,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate Cesium into its own chunk (it's very large and self-contained)
          if (id.includes('/node_modules/cesium/')) return 'cesium-vendor';
          // All other node_modules go into a single vendors chunk to avoid circular refs
          if (id.includes('node_modules')) return 'vendors';
        },
      },
    },
  },
});
