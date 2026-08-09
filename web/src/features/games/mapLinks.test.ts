import { describe, expect, it } from 'vitest';
import { buildMapLinks } from './mapLinks';

describe('buildMapLinks', () => {
  it('builds provider links from coordinates and an encoded venue label', () => {
    const links = buildMapLinks({
      latitude: -23.5,
      longitude: -46.6,
      label: 'Quadra Central, Rua A & 10',
    });
    const googleMaps = new URL(links.googleMaps);
    const appleMaps = new URL(links.appleMaps);
    const waze = new URL(links.waze);

    expect(googleMaps.origin + googleMaps.pathname).toBe('https://www.google.com/maps/dir/');
    expect(googleMaps.searchParams.get('api')).toBe('1');
    expect(googleMaps.searchParams.get('destination')).toBe('-23.5,-46.6');

    expect(appleMaps.origin + appleMaps.pathname).toBe('https://maps.apple.com/');
    expect(appleMaps.searchParams.get('daddr')).toBe('-23.5,-46.6');
    expect(appleMaps.searchParams.get('q')).toBe('Quadra Central, Rua A & 10');

    expect(waze.origin + waze.pathname).toBe('https://waze.com/ul');
    expect(waze.searchParams.get('ll')).toBe('-23.5,-46.6');
    expect(waze.searchParams.get('navigate')).toBe('yes');
  });
});
