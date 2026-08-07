import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { locationApi } from '../../api/client';

export interface GoogleMapsLibraries {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
  places: google.maps.PlacesLibrary;
}

let librariesPromise: Promise<GoogleMapsLibraries> | undefined;

export function loadGoogleMaps(): Promise<GoogleMapsLibraries> {
  if (librariesPromise) return librariesPromise;

  librariesPromise = locationApi
    .mapsConfig()
    .then((config) => {
      const apiKey = config.googleMapsApiKey.trim();
      if (!apiKey) throw new Error('Google Maps API key is missing.');
      setOptions({ key: apiKey, v: 'weekly', language: 'pt-BR', region: 'BR' });
      return Promise.all([importLibrary('maps'), importLibrary('marker'), importLibrary('places')]);
    })
    .then(([maps, marker, places]) => ({ maps, marker, places }))
    .catch((error: unknown) => {
      librariesPromise = undefined;
      throw error;
    });

  return librariesPromise;
}
