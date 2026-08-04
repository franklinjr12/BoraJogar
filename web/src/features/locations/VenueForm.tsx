import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Venue } from '../../api/client';
import { requestBrowserLocation, type LocationMessages } from './browserLocation';
import { resolveMapStyle } from './mapStyle';
import {
  blankVenueDraft,
  createVenueFromDraft,
  venueDraftReady,
  type VenueDraft,
} from './venueDraft';
import { searchPlaces, type PlaceSearchResult } from './placeSearch';

const locationMessages: LocationMessages = {
  unavailable: 'Location permission is unavailable. Search by city.',
  insecure: 'Location requires HTTPS on phone browsers. Use local HTTPS, then try again.',
  denied: 'Location permission is blocked. Enable it in browser settings, then try again.',
  positionUnavailable: 'Could not find your device location. Search by city.',
  timeout: 'Finding your location timed out. Search by city.',
  unknown: 'Could not use your current location. Search by city.',
};

function MapPicker({
  point,
  onSelect,
}: {
  point: { latitude: number; longitude: number };
  onSelect: (point: { latitude: number; longitude: number }) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const initialPoint = useRef(point);
  const onSelectRef = useRef(onSelect);
  const style = resolveMapStyle(import.meta.env);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!node.current || !style) return;
    let disposed = false;
    void import('maplibre-gl')
      .then(({ default: maplibregl }) => {
        if (disposed || !node.current) return;
        const instance = new maplibregl.Map({
          container: node.current,
          style,
          center: [initialPoint.current.longitude, initialPoint.current.latitude],
          zoom: 11,
        });
        instance.addControl(new maplibregl.NavigationControl(), 'top-right');
        instance.on('click', (event) =>
          onSelectRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
        );
        instance.on('error', () => {
          if (disposed) return;
          instance.remove();
          map.current = null;
          setMapFailed(true);
        });
        map.current = instance;
      })
      .catch(() => {
        if (!disposed) setMapFailed(true);
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [style]);

  useEffect(() => {
    map.current?.setCenter([point.longitude, point.latitude]);
  }, [point.latitude, point.longitude]);

  if (!style || mapFailed)
    return <p className="map-inline-hint">Map unavailable. Search by city.</p>;
  return <div ref={node} className="map-panel compact-map" aria-label="Pick location on map" />;
}

export function VenueForm({
  draft,
  onChange,
  onCreated,
  buttonLabel = 'Create location',
}: {
  draft: VenueDraft;
  onChange: (draft: VenueDraft) => void;
  onCreated?: (venue: Venue) => void;
  buttonLabel?: string;
}) {
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [cityQuery, setCityQuery] = useState(draft.city);
  const [citySearchTouched, setCitySearchTouched] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchSequence = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const update = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const updateAddress = (value: string) => {
    onChange({ ...draft, addressLabel: value });
  };
  const useCurrentLocation = async () => {
    const result = await requestBrowserLocation(locationMessages);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    onChange({
      ...draft,
      point: {
        latitude: result.latitude,
        longitude: result.longitude,
      },
    });
    setMessage('Map pin set from your device. Select city before saving.');
  };
  useEffect(() => {
    searchController.current?.abort();
    setResults([]);
    if (!citySearchTouched) return;
    if (cityQuery.trim().length < 3) {
      setSearching(false);
      return;
    }
    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      searchPlaces(cityQuery, { signal: controller.signal })
        .then((matches) => {
          if (sequence !== searchSequence.current) return;
          setResults(matches);
          setMessage(matches.length > 0 ? 'Choose a city from the list.' : 'City not found.');
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setMessage('Could not search city. Try again soon.');
        })
        .finally(() => {
          if (sequence === searchSequence.current) setSearching(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cityQuery, citySearchTouched]);
  const selectPlace = (place: PlaceSearchResult) => {
    onChange({
      ...draft,
      city: place.city,
      point: { latitude: place.latitude, longitude: place.longitude },
      addressConfirmed: true,
    });
    setCityQuery(place.displayName);
    setCitySearchTouched(false);
    setResults([]);
    setMessage(`City selected: ${place.city}.`);
  };
  const save = async () => {
    setMessage('');
    if (!venueDraftReady(draft)) {
      setMessage('Enter a name, court address, then search and select a city.');
      return;
    }
    try {
      const created = await createVenueFromDraft(draft);
      onCreated?.(created);
      onChange(blankVenueDraft());
      setMessage('Location created and ready for games.');
    } catch (cause: unknown) {
      setMessage(
        cause instanceof Error
          ? `Could not create location: ${cause.message}`
          : 'Could not create location. Check name, city, and address.',
      );
    }
  };
  return (
    <div className="venue-form">
      <label>
        Personalized name
        <input
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Praia Central"
        />
      </label>
      <label>
        Court address
        <input
          value={draft.addressLabel}
          onChange={(event) => updateAddress(event.target.value)}
          placeholder="Av. Atlantica, 100"
        />
      </label>
      <label>
        City search
        <input
          type="search"
          autoComplete="off"
          value={cityQuery}
          onChange={(event) => {
            setCitySearchTouched(true);
            setCityQuery(event.target.value);
            onChange({ ...draft, city: event.target.value, addressConfirmed: false });
          }}
          placeholder="Curitiba"
        />
      </label>
      {searching && <p className="hint">Searching city...</p>}
      {results.length > 0 && (
        <div className="place-results" role="listbox" aria-label="City results">
          {results.map((result) => (
            <button
              className="place-result"
              key={result.id}
              type="button"
              role="option"
              onClick={() => selectPlace(result)}
            >
              <strong>{result.displayName}</strong>
              <span>
                {result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}
              </span>
            </button>
          ))}
        </div>
      )}
      {draft.addressConfirmed && <p className="hint">Selected city: {draft.city}</p>}
      <MapPicker
        point={draft.point}
        onSelect={(point) => onChange({ ...draft, point, addressConfirmed: false })}
      />
      <button className="text-button" type="button" onClick={useCurrentLocation}>
        Use my current location
      </button>
      {onCreated && (
        <button className="button" type="button" onClick={save}>
          {buttonLabel}
        </button>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
