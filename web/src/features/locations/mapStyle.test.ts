import { describe, expect, it } from 'vitest';
import { resolveMapStyle } from './mapStyle';

const productionEnv: ImportMetaEnv = {
  BASE_URL: '/',
  DEV: false,
  MODE: 'production',
  PROD: true,
  SSR: false,
  VITE_MAP_STYLE_URL: '',
};

describe('resolveMapStyle', () => {
  it('uses configured production style URL when available', () => {
    expect(
      resolveMapStyle({
        ...productionEnv,
        VITE_MAP_STYLE_URL: '  https://maps.example/style.json  ',
      }),
    ).toBe('https://maps.example/style.json');
  });

  it('uses OpenStreetMap fallback in production', () => {
    const style = resolveMapStyle(productionEnv);

    expect(style).toMatchObject({
      sources: {
        openstreetmap: {
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          attribution: '© OpenStreetMap contributors',
        },
      },
    });
  });
});
