import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Link } from 'react-router-dom';
import { locationApi, type PreferredArea, type Venue } from '../../api/client';
import { requestBrowserLocation, type LocationMessages } from './browserLocation';
import { resolveMapStyle } from './mapStyle';
import { searchPlaces, type PlaceSearchResult } from './placeSearch';

const defaultCenter = { latitude: -25.4284, longitude: -49.2733 };
const locationMessages: LocationMessages = {
  unavailable: 'Browser location is unavailable. Search or choose on the map.',
  insecure:
    'Location requires HTTPS on phone browsers. Use local HTTPS, then try again, or search/choose on the map.',
  denied: 'Location permission is blocked. Enable it in browser settings, then try again.',
  positionUnavailable: 'Could not find your device location. Search or choose on the map.',
  timeout: 'Finding your location timed out. Search or choose on the map.',
  unknown: 'Could not use your current location. Search or choose on the map.',
};
const radiusOptions = [
  { meters: 2000, label: '2 km', hint: 'Very close' },
  { meters: 4000, label: '4 km', hint: 'Nearby' },
  { meters: 7000, label: '7 km', hint: 'Nearby neighborhoods' },
  { meters: 10000, label: '10 km', hint: 'Reasonably close' },
];

function roundPoint(point: { latitude: number; longitude: number }) {
  return {
    latitude: Math.round(point.latitude * 1000) / 1000,
    longitude: Math.round(point.longitude * 1000) / 1000,
  };
}

function MapPanel({
  center,
  onSelect,
}: {
  center: { latitude: number; longitude: number };
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const initialCenter = useRef(center);
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
          center: [initialCenter.current.longitude, initialCenter.current.latitude],
          zoom: 12,
        });
        instance.addControl(new maplibregl.NavigationControl(), 'top-right');
        instance.on('moveend', () => {
          const next = instance.getCenter();
          onSelectRef.current(next.lat, next.lng);
        });
        instance.on('click', (event) => onSelectRef.current(event.lngLat.lat, event.lngLat.lng));
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
    map.current?.setCenter([center.longitude, center.latitude]);
  }, [center.latitude, center.longitude]);

  if (!style || mapFailed)
    return <p className="map-inline-hint">Map unavailable. Search or use current location.</p>;
  return (
    <div className="map-shell">
      <div ref={node} className="map-panel" aria-label="Area selection map" />
      <div className="map-pin" aria-hidden="true" />
    </div>
  );
}

function venueLabel(venue: Venue) {
  const access =
    venue.accessType === 'paid_entry'
      ? 'Paid entry'
      : venue.accessType === 'public'
        ? 'Public court'
        : venue.accessType === 'private'
          ? 'Private court'
          : 'Court';
  const lighting =
    venue.lightingStatus === 'has_lighting'
      ? 'Lighting available'
      : venue.lightingStatus === 'no_lighting'
        ? 'No lighting'
        : 'Lighting unknown';
  return `${access} - ${lighting}`;
}

export function LocationsPage() {
  return (
    <main className="shell locations">
      <Link className="text-link" to="/">
        &lt;- Home
      </Link>
      <LocationSetup />
    </main>
  );
}

export function LocationSetup({ compact = false }: { compact?: boolean }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [favorites, setFavorites] = useState<Venue[]>([]);
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [mode, setMode] = useState<'list' | 'court' | 'area'>('list');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [search, setSearch] = useState('');
  const [point, setPoint] = useState(defaultCenter);
  const [radius, setRadius] = useState(4000);
  const [label, setLabel] = useState('Near home');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [areaSearchOpen, setAreaSearchOpen] = useState(false);
  const [areaSearchTouched, setAreaSearchTouched] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<PlaceSearchResult[]>([]);
  const [areaSearching, setAreaSearching] = useState(false);
  const areaSearchInput = useRef<HTMLInputElement>(null);
  const areaSearchSequence = useRef(0);
  const areaSearchController = useRef<AbortController | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [loadedVenues, loadedFavorites, loadedAreas] = await Promise.all([
        locationApi.venues(),
        locationApi.favoriteVenues(),
        locationApi.preferredAreas(),
      ]);
      setVenues(loadedVenues);
      setFavorites(loadedFavorites);
      setAreas(loadedAreas);
    } catch {
      setMessage('Could not load locations. Check connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (areaSearchOpen) areaSearchInput.current?.focus();
  }, [areaSearchOpen]);

  useEffect(() => {
    areaSearchController.current?.abort();
    setAreaResults([]);
    if (!areaSearchOpen || !areaSearchTouched) return;
    if (areaQuery.trim().length < 3) {
      setAreaSearching(false);
      return;
    }

    const sequence = areaSearchSequence.current + 1;
    areaSearchSequence.current = sequence;
    const controller = new AbortController();
    areaSearchController.current = controller;
    const timeout = window.setTimeout(() => {
      setAreaSearching(true);
      searchPlaces(areaQuery, { signal: controller.signal })
        .then((matches) => {
          if (sequence !== areaSearchSequence.current) return;
          setAreaResults(matches);
          setMessage(
            matches.length > 0
              ? 'Choose an area from the list.'
              : 'Neighborhood or address not found.',
          );
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setMessage('Could not search area. Try again soon.');
        })
        .finally(() => {
          if (sequence === areaSearchSequence.current) setAreaSearching(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [areaQuery, areaSearchOpen, areaSearchTouched]);

  const favoriteIds = new Set(favorites.map((venue) => venue.id));
  const savedLocations = favorites.length + areas.length;
  const filteredVenues = venues.filter((venue) =>
    `${venue.name} ${venue.addressLabel ?? ''} ${venue.city}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const useCurrentLocation = async () => {
    const result = await requestBrowserLocation(locationMessages);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    const rounded = roundPoint({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setPoint(rounded);
    setLabel('Near my area');
    setMessage('Area set from your device location.');
  };

  const openAreaSearch = () => {
    setAreaSearchOpen(true);
    setMessage('');
  };

  const chooseMap = () => {
    setAreaSearchOpen(false);
    setAreaResults([]);
    setMessage('Move the map or click a point to choose an area.');
  };

  const selectAreaPlace = (place: PlaceSearchResult) => {
    const rounded = roundPoint({ latitude: place.latitude, longitude: place.longitude });
    setPoint(rounded);
    setLabel(`Near ${place.city}`);
    setAreaQuery(place.displayName);
    setAreaSearchTouched(false);
    setAreaResults([]);
    setMessage(`Area selected: ${place.city}.`);
  };

  const saveCourt = async (venue: Venue) => {
    try {
      await locationApi.favoriteVenue(venue.id);
      setFavorites((current) => (favoriteIds.has(venue.id) ? current : [...current, venue]));
      setSelectedVenue(null);
      setMode('list');
      setMessage('Court saved.');
    } catch {
      setMessage('Could not save court.');
    }
  };

  const removeCourt = async (venue: Venue) => {
    try {
      await locationApi.unfavoriteVenue(venue.id);
      setFavorites((current) => current.filter((item) => item.id !== venue.id));
    } catch {
      setMessage('Could not remove court.');
    }
  };

  const saveArea = async () => {
    if (!label.trim()) {
      setMessage('Enter a label for this area.');
      return;
    }
    try {
      const created = await locationApi.createPreferredArea({
        label: label.trim(),
        ...roundPoint(point),
        radiusMeters: radius,
        priority: areas.length,
      });
      setAreas((current) => [...current, created]);
      setMode('list');
      setMessage('Area saved.');
    } catch {
      setMessage('Could not save area. You may have reached the limit of five.');
    }
  };

  const removeArea = async (id: string) => {
    try {
      await locationApi.deletePreferredArea(id);
      setAreas((current) => current.filter((area) => area.id !== id));
    } catch {
      setMessage('Could not remove area.');
    }
  };

  return (
    <>
      <p className="eyebrow">Playing locations</p>
      {!compact && <h1>Where can you play?</h1>}
      <p className="lead">
        Choose courts you already use, or mark a general area. Your private areas are only used for
        matching.
      </p>
      <div className="actions compact-actions">
        <button className="button" type="button" onClick={() => setMode('court')}>
          Choose a court
        </button>
        <button className="text-button" type="button" onClick={() => setMode('area')}>
          Choose an area
        </button>
      </div>

      {mode === 'list' && (
        <section className="location-list">
          <h2>Your playing locations</h2>
          {loading && <p role="status">Loading locations...</p>}
          {!loading && savedLocations === 0 && (
            <div className="card">
              <h3>Choose where you could play</h3>
              <p>Add courts you know or mark an area such as near home or near work.</p>
              <p>Your saved areas remain private.</p>
              <button className="button" type="button" onClick={() => setMode('court')}>
                Add my first location
              </button>
            </div>
          )}
          {favorites.map((venue) => (
            <article className="card location-card" key={venue.id}>
              <div>
                <h3>{venue.name}</h3>
                <p>{venueLabel(venue)}</p>
                <p>{venue.addressLabel || venue.city}</p>
                <p>Preferred anytime</p>
              </div>
              <button className="text-button" type="button" onClick={() => removeCourt(venue)}>
                Remove
              </button>
            </article>
          ))}
          {areas.map((area) => (
            <article className="card location-card" key={area.id}>
              <div>
                <h3>{area.label}</h3>
                <p>Private area</p>
                <p>Within {Math.round(area.radiusMeters / 1000)} km</p>
                <p>Any availability</p>
              </div>
              <button className="text-button" type="button" onClick={() => removeArea(area.id)}>
                Remove
              </button>
            </article>
          ))}
        </section>
      )}

      {mode === 'court' && (
        <section className="card">
          <h2>Choose a court</h2>
          <label>
            Search courts or neighborhoods
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {selectedVenue ? (
            <div className="venue-preview">
              <h3>{selectedVenue.name}</h3>
              <p>{venueLabel(selectedVenue)}</p>
              <p>{selectedVenue.addressLabel || selectedVenue.city}</p>
              <div className="map-preview" aria-label={`${selectedVenue.name} map preview`} />
              <p>When would you play here?</p>
              <label className="checks">
                <span>
                  <input type="checkbox" defaultChecked /> Anytime I'm available
                </span>
              </label>
              <button className="button" type="button" onClick={() => saveCourt(selectedVenue)}>
                Save court
              </button>
            </div>
          ) : (
            <>
              <h3>Nearby and popular</h3>
              <div className="choice-list">
                {filteredVenues.map((venue) => (
                  <button
                    className="choice"
                    key={venue.id}
                    type="button"
                    onClick={() => setSelectedVenue(venue)}
                  >
                    <strong>{venue.name}</strong>
                    <span>{venueLabel(venue)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {mode === 'area' && (
        <section className="card">
          <h2>Choose an area where you would be willing to play</h2>
          <div className="actions compact-actions">
            <button className="text-button" type="button" onClick={useCurrentLocation}>
              Use my current location
            </button>
            <button className="text-button" type="button" onClick={openAreaSearch}>
              Search for a neighborhood or address
            </button>
            <button className="text-button" type="button" onClick={chooseMap}>
              Choose directly on the map
            </button>
          </div>
          {areaSearchOpen && (
            <>
              <label>
                Neighborhood or address search
                <input
                  ref={areaSearchInput}
                  type="search"
                  autoComplete="off"
                  value={areaQuery}
                  onChange={(event) => {
                    setAreaSearchTouched(true);
                    setAreaQuery(event.target.value);
                  }}
                  placeholder="Batel, Curitiba"
                />
              </label>
              {areaSearching && <p className="hint">Searching area...</p>}
              {areaResults.length > 0 && (
                <div className="place-results" role="listbox" aria-label="Area results">
                  {areaResults.map((result) => (
                    <button
                      className="place-result"
                      key={result.id}
                      type="button"
                      role="option"
                      onClick={() => selectAreaPlace(result)}
                    >
                      <strong>{result.displayName}</strong>
                      <span>
                        {result.latitude.toFixed(3)}, {result.longitude.toFixed(3)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <MapPanel
            center={point}
            onSelect={(latitude, longitude) => setPoint({ latitude, longitude })}
          />
          <p className="hint">Near {label || 'selected area'}</p>
          <fieldset>
            <legend>How far would you travel?</legend>
            <div className="segmented">
              {radiusOptions.map((option) => (
                <button
                  className={radius === option.meters ? 'view-button selected' : 'view-button'}
                  key={option.meters}
                  type="button"
                  onClick={() => setRadius(option.meters)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="hint">{radiusOptions.find((option) => option.meters === radius)?.hint}</p>
          </fieldset>
          <label>
            Label
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <p className="hint">
            Private area. Other players will only see the venue of a proposed game.
          </p>
          <button className="button" type="button" onClick={saveArea} disabled={areas.length >= 5}>
            Save area
          </button>
        </section>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
