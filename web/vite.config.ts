import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const apiProxyTarget = runtime.process?.env?.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: apiProxyTarget
    ? {
        proxy: {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
          },
        },
      }
    : undefined,
});
