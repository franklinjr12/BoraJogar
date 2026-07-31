import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Link } from 'react-router-dom';
import { locationApi, type PreferredArea, type Venue } from '../../api/client';
import { VenueForm } from './VenueForm';
import { blankVenueDraft, type VenueDraft } from './venueDraft';

const defaultCenter = { latitude: -23.5505, longitude: -46.6333 };

function MapPanel({
  center,
  onSelect,
}: {
  center: { latitude: number; longitude: number };
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<{ remove: () => void } | null>(null);
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;
  useEffect(() => {
    if (!node.current || !styleUrl) return;
    let disposed = false;
    void import('maplibre-gl').then(({ default: maplibregl }) => {
      if (disposed || !node.current) return;
      const instance = new maplibregl.Map({
        container: node.current,
        style: styleUrl,
        center: [center.longitude, center.latitude],
        zoom: 11,
      });
      instance.addControl(new maplibregl.NavigationControl(), 'top-right');
      instance.on('click', (event) => onSelect(event.lngLat.lat, event.lngLat.lng));
      map.current = instance;
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [center.latitude, center.longitude, onSelect, styleUrl]);
  if (!styleUrl)
    return (
      <div className="map-fallback" role="img" aria-label="Map unavailable">
        <strong>Map style not configured</strong>
        <span>Use venue list or enter an area manually.</span>
      </div>
    );
  return <div ref={node} className="map-panel" aria-label="Location map" />;
}

function venueLabel(venue: Venue) {
  const lighting =
    venue.lightingStatus === 'has_lighting'
      ? 'Lit'
      : venue.lightingStatus === 'no_lighting'
        ? 'No lighting'
        : 'Lighting unknown';
  const access = venue.accessType === 'paid_entry' ? 'Paid entry' : venue.accessType;
  return `${lighting} - ${access}`;
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [point, setPoint] = useState(defaultCenter);
  const [radius, setRadius] = useState(2500);
  const [label, setLabel] = useState('');
  const [venueDraft, setVenueDraft] = useState<VenueDraft>(blankVenueDraft());
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([locationApi.venues(), locationApi.favoriteVenues(), locationApi.preferredAreas()])
      .then(([loadedVenues, loadedFavorites, loadedAreas]) => {
        setVenues(loadedVenues);
        setFavorites(new Set(loadedFavorites.map((item) => item.id)));
        setAreas(loadedAreas);
      })
      .catch(() => setMessage('Could not load locations. Check connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  const selectPoint = (latitude: number, longitude: number) => setPoint({ latitude, longitude });
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Browser location is unavailable. Choose a point on the map.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setMessage('Location permission denied. You can configure an area manually.'),
    );
  };
  const saveArea = async () => {
    if (!label.trim()) {
      setMessage('Enter an area name.');
      return;
    }
    try {
      const created = await locationApi.createPreferredArea({
        label: label.trim(),
        latitude: point.latitude,
        longitude: point.longitude,
        radiusMeters: radius,
        priority: areas.length,
      });
      setAreas((current) => [...current, created]);
      setLabel('');
      setMessage('Preferred area saved.');
    } catch {
      setMessage('Could not save preferred area. You may have reached the limit of five.');
    }
  };
  const toggleFavorite = async (venue: Venue) => {
    try {
      if (favorites.has(venue.id)) {
        await locationApi.unfavoriteVenue(venue.id);
        setFavorites((current) => {
          const next = new Set(current);
          next.delete(venue.id);
          return next;
        });
      } else {
        await locationApi.favoriteVenue(venue.id);
        setFavorites((current) => new Set(current).add(venue.id));
      }
    } catch {
      setMessage('Could not update favorite venue.');
    }
  };
  const removeArea = async (id: string) => {
    try {
      await locationApi.deletePreferredArea(id);
      setAreas((current) => current.filter((area) => area.id !== id));
    } catch {
      setMessage('Could not remove preferred area.');
    }
  };

  return (
    <>
      <p className="eyebrow">Where you play</p>
      {!compact && <h1>Venues and preferred areas</h1>}
      <p className="lead">Choose courts or broad areas. Current location is optional.</p>
      <section className="location-grid">
        <div>
          <MapPanel center={point} onSelect={selectPoint} />
          <button className="text-button" type="button" onClick={useCurrentLocation}>
            Use my current location
          </button>
          <div className="card area-form">
            <h2>Preferred area</h2>
            <label>
              Area name
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Pinheiros"
              />
            </label>
            <label>
              Radius: {(radius / 1000).toFixed(1)} km
              <input
                type="range"
                min="500"
                max="25000"
                step="500"
                value={radius}
                onChange={(event) => setRadius(Number(event.target.value))}
              />
            </label>
            <button
              className="button"
              type="button"
              onClick={saveArea}
              disabled={areas.length >= 5}
            >
              Save preferred area
            </button>
          </div>
          <div className="card area-form">
            <h2>Create court/location</h2>
            <VenueForm
              draft={venueDraft}
              onChange={setVenueDraft}
              onCreated={(created) => {
                setVenues((current) => [...current, created]);
                setFavorites((current) => new Set(current).add(created.id));
                void locationApi.favoriteVenue(created.id).catch(() => undefined);
              }}
            />
          </div>
        </div>
        <div className="card">
          <h2>Available venues</h2>
          {loading && <p role="status">Loading venues...</p>}
          {!loading && venues.length === 0 && <p>No venues found. Create one to host a game.</p>}
          <div className="venue-list">
            {venues.map((venue) => (
              <article className="venue" key={venue.id}>
                <div>
                  <h3>{venue.name}</h3>
                  <p>{venue.addressLabel || venue.city}</p>
                  <span>
                    {venueLabel(venue)}
                    {venue.distanceMeters !== undefined &&
                      ` - ${Math.round(venue.distanceMeters)} m`}
                  </span>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => toggleFavorite(venue)}
                  aria-label={`${favorites.has(venue.id) ? 'Remove' : 'Add'} ${venue.name} favorite`}
                >
                  {favorites.has(venue.id) ? 'Favorited' : 'Favorite'}
                </button>
              </article>
            ))}
          </div>
          <h2>Your preferred areas</h2>
          {areas.length === 0 && <p>No areas saved yet.</p>}
          {areas.map((area) => (
            <div className="area-row" key={area.id}>
              <span>
                {area.label} - {(area.radiusMeters / 1000).toFixed(1)} km
              </span>
              <button className="text-button" type="button" onClick={() => removeArea(area.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
