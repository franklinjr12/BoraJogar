import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Venue } from '../../api/client';
import { blankVenueDraft, createVenueFromDraft, venueDraftReady, type VenueDraft } from './venueDraft';

function MapPicker({
  point,
  onSelect,
}: {
  point: { latitude: number; longitude: number };
  onSelect: (point: { latitude: number; longitude: number }) => void;
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
        center: [point.longitude, point.latitude],
        zoom: 11,
      });
      instance.addControl(new maplibregl.NavigationControl(), 'top-right');
      instance.on('click', (event) =>
        onSelect({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
      );
      map.current = instance;
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [onSelect, point.latitude, point.longitude, styleUrl]);
  if (!styleUrl) return null;
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
  const update = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location permission is unavailable. City fallback will be used.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update('point', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setMessage('Map pin set from your device.');
      },
      () => setMessage('Location permission denied. City fallback will be used.'),
    );
  };
  const save = async () => {
    setMessage('');
    if (!venueDraftReady(draft)) {
      setMessage('Enter location name and city.');
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
        Name
        <input
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Praia Central"
        />
      </label>
      <label>
        City
        <input value={draft.city} onChange={(event) => update('city', event.target.value)} />
      </label>
      <label>
        Address
        <input
          value={draft.addressLabel}
          onChange={(event) => update('addressLabel', event.target.value)}
          placeholder="Av. Atlantica, 100"
        />
      </label>
      <MapPicker point={draft.point} onSelect={(point) => update('point', point)} />
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
