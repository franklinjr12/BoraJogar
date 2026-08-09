export interface MapDestination {
  latitude: number;
  longitude: number;
  label: string;
}

export interface MapLinks {
  googleMaps: string;
  appleMaps: string;
  waze: string;
}

export function buildMapLinks({ latitude, longitude, label }: MapDestination): MapLinks {
  const coordinates = `${latitude},${longitude}`;

  const googleMaps = new URL('https://www.google.com/maps/dir/');
  googleMaps.searchParams.set('api', '1');
  googleMaps.searchParams.set('destination', coordinates);

  const appleMaps = new URL('https://maps.apple.com/');
  appleMaps.searchParams.set('daddr', coordinates);
  appleMaps.searchParams.set('q', label);

  const waze = new URL('https://waze.com/ul');
  waze.searchParams.set('ll', coordinates);
  waze.searchParams.set('navigate', 'yes');

  return {
    googleMaps: googleMaps.toString(),
    appleMaps: appleMaps.toString(),
    waze: waze.toString(),
  };
}
