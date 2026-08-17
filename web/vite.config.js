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
        changeOrigin: true,
      },
    },
  },
});
