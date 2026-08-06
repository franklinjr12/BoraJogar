export interface PlaceSearchResult {
  id: string;
  displayName: string;
  addressLabel?: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

interface GeocodingApiResult {
  id?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country?: unknown;
  admin1?: unknown;
  timezone?: unknown;
}

interface GeocodingApiResponse {
  results?: unknown;
}

interface ReverseGeocodingApiResponse {
  display_name?: unknown;
  address?: unknown;
}

interface AddressSearchApiResult {
  place_id?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  address?: unknown;
}

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim() !== '');
}

function roundCoordinate(value: number) {
  return value.toFixed(3);
}

function normalizeResult(result: GeocodingApiResult): PlaceSearchResult | undefined {
  const name = firstString(result.name);
  const latitude = typeof result.latitude === 'number' ? result.latitude : NaN;
  const longitude = typeof result.longitude === 'number' ? result.longitude : NaN;
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;

  const id =
    typeof result.id === 'number'
      ? String(result.id)
      : `${roundCoordinate(latitude)}:${roundCoordinate(longitude)}`;
  const displayName = [name, firstString(result.admin1), firstString(result.country)]
    .filter(Boolean)
    .join(', ');
  const timezone = firstString(result.timezone);
  return {
    id,
    displayName,
    city: name,
    latitude,
    longitude,
    ...(timezone ? { timezone } : {}),
  };
}

export async function searchPlaces(
  city: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<PlaceSearchResult[]> {
  const query = city.trim();
  if (query.length < 3) return [];

  const fetcher = options.fetcher ?? fetch;
  const url = new URL(OPEN_METEO_GEOCODING_URL);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'pt');
  url.searchParams.set('format', 'json');

  const response = await fetcher(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Geocoding request failed with ${response.status}`);

  const body = (await response.json()) as GeocodingApiResponse;
  if (!Array.isArray(body.results)) return [];
  return body.results
    .map((item) =>
      typeof item === 'object' && item !== null
        ? normalizeResult(item as GeocodingApiResult)
        : undefined,
    )
    .filter((item): item is PlaceSearchResult => Boolean(item));
}

function reverseAddress(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function searchAddress(
  address: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<PlaceSearchResult[]> {
  const query = address.trim();
  if (query.length < 4) return [];

  const fetcher = options.fetcher ?? fetch;
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'pt-BR');
  const response = await fetcher(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Address geocoding request failed with ${response.status}`);

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) return [];
  return body
    .map((item): PlaceSearchResult | undefined => {
      if (typeof item !== 'object' || item === null) return undefined;
      const result = item as AddressSearchApiResult;
      const latitude = typeof result.lat === 'string' ? Number(result.lat) : NaN;
      const longitude = typeof result.lon === 'string' ? Number(result.lon) : NaN;
      const displayName = firstString(result.display_name);
      const city = firstString(
        reverseAddress(result.address).city,
        reverseAddress(result.address).town,
        reverseAddress(result.address).municipality,
        reverseAddress(result.address).village,
      );
      if (!displayName || !city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return undefined;
      }
      const address = reverseAddress(result.address);
      const addressLabel = [
        firstString(address.road, address.pedestrian, address.footway),
        firstString(address.house_number),
        firstString(address.suburb, address.neighbourhood, address.quarter),
      ]
        .filter(Boolean)
        .join(', ');
      return {
        id: typeof result.place_id === 'number' ? String(result.place_id) : displayName,
        displayName,
        ...(addressLabel ? { addressLabel } : {}),
        city,
        latitude,
        longitude,
      };
    })
    .filter((item): item is PlaceSearchResult => Boolean(item));
}

export async function reverseGeocode(
  point: { latitude: number; longitude: number },
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<(Pick<PlaceSearchResult, 'city'> & { addressLabel: string }) | undefined> {
  const fetcher = options.fetcher ?? fetch;
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(point.latitude));
  url.searchParams.set('lon', String(point.longitude));
  url.searchParams.set('accept-language', 'pt-BR');
  const response = await fetcher(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Reverse geocoding request failed with ${response.status}`);

  const body = (await response.json()) as ReverseGeocodingApiResponse;
  const address = reverseAddress(body.address);
  const city = firstString(
    address.city,
    address.town,
    address.municipality,
    address.village,
    address.city_district,
  );
  const addressLabel = [
    firstString(address.road, address.pedestrian, address.footway),
    firstString(address.house_number),
    firstString(address.suburb, address.neighbourhood, address.quarter),
  ]
    .filter(Boolean)
    .join(', ');
  if (!city || !addressLabel) return undefined;
  return { city, addressLabel };
}
