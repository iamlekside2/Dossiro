import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 3015 is chosen to stay clear of the other local projects
// (3000-3002, 3005-3014, 4000 are already spoken for).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3015,
    strictPort: true,
    proxy: {
      // Keeps the browser on one origin in dev, so cookies and CORS stay simple.
      '/api': {
        target: 'http://localhost:4010',
        // Deliberately false. Rewriting Host to localhost:4010 hides which
        // hostname the browser actually asked for, and that hostname is how the
        // API knows which tenant is signing in. With it rewritten, every
        // development machine looked like a tenantless host and the whole
        // mechanism was untestable locally. Nothing here needs the rewrite:
        // the proxy talks to the API server-side, so no CORS is involved.
        changeOrigin: false,
      },
    },
  },
});
