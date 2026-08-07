import type { StyleSpecification } from 'maplibre-gl';

export type MapStyle = string | StyleSpecification;

const defaultMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    openstreetmap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openstreetmap',
      type: 'raster',
      source: 'openstreetmap',
    },
  ],
};

export function resolveMapStyle(env: ImportMetaEnv): MapStyle {
  const configured = env.VITE_MAP_STYLE_URL?.trim();
  if (configured) return configured;
  return defaultMapStyle;
}
