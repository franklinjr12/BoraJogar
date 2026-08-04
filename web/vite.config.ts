import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const env = runtime.process?.env ?? {};
const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';
const devHttpsKey = env.DEV_HTTPS_KEY;
const devHttpsCert = env.DEV_HTTPS_CERT;
const https =
  devHttpsKey && devHttpsCert
    ? {
        key: readFileSync(devHttpsKey),
        cert: readFileSync(devHttpsCert),
      }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    ...(https ? { https } : {}),
    ...(apiProxyTarget
      ? {
          proxy: {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
});
