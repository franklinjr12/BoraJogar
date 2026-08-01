export interface PlaceSearchResult {
  id: string;
  displayName: string;
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

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

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
