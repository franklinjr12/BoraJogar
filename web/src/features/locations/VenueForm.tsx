import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type Venue } from '../../api/client';
import { requestBrowserLocation, type LocationMessages } from './browserLocation';
import { GooglePlaceSearch } from './GooglePlaceSearch';
import { loadGoogleMaps } from './googleMaps';
import {
  blankVenueDraft,
  createVenueFromDraft,
  venueDraftReady,
  type VenueDraft,
} from './venueDraft';
import type { PlaceSearchResult } from './googlePlace';

const locationMessages: LocationMessages = {
  unavailable: 'A permissão de localização está indisponível. Pesquise o local no Google Maps.',
  insecure:
    'A localização exige HTTPS em navegadores de celular. Use HTTPS local e tente novamente.',
  denied:
    'A permissão de localização está bloqueada. Ative-a nas configurações do navegador e tente novamente.',
  positionUnavailable:
    'Não foi possível encontrar a localização do seu dispositivo. Pesquise o local no Google Maps.',
  timeout: 'A busca pela sua localização expirou. Pesquise o local no Google Maps.',
  unknown: 'Não foi possível usar sua localização atual. Pesquise o local no Google Maps.',
};

type Point = { latitude: number; longitude: number };

function GoogleMapPicker({
  point,
  onSelect,
  onFailure,
}: {
  point: Point;
  onSelect: (point: Point) => void;
  onFailure: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const clickListener = useRef<google.maps.MapsEventListener | null>(null);
  const initialPoint = useRef(point);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!node.current) return;
    let disposed = false;
    void loadGoogleMaps()
      .then(({ maps, marker: markerLibrary }) => {
        if (disposed || !node.current) return;
        const instance = new maps.Map(node.current, {
          center: { lat: initialPoint.current.latitude, lng: initialPoint.current.longitude },
          zoom: 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          mapTypeId: 'roadmap',
        });
        const pin = new markerLibrary.Marker({
          map: instance,
          position: { lat: initialPoint.current.latitude, lng: initialPoint.current.longitude },
        });
        clickListener.current = instance.addListener(
          'click',
          (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            onSelectRef.current({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
          },
        );
        map.current = instance;
        marker.current = pin;
      })
      .catch(() => {
        if (!disposed) onFailure();
      });

    return () => {
      disposed = true;
      clickListener.current?.remove();
      clickListener.current = null;
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
    };
  }, [onFailure]);

  useEffect(() => {
    map.current?.setCenter({ lat: point.latitude, lng: point.longitude });
    marker.current?.setPosition({ lat: point.latitude, lng: point.longitude });
  }, [point.latitude, point.longitude]);

  return (
    <div ref={node} className="map-panel compact-map" aria-label="Escolher local no Google Maps" />
  );
}

function MapPicker({ point, onSelect }: { point: Point; onSelect: (point: Point) => void }) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const onGoogleFailure = useCallback(() => setGoogleFailed(true), []);
  if (googleFailed)
    return <p className="map-inline-hint">Mapa indisponível. Pesquise o local no Google Maps.</p>;
  return <GoogleMapPicker point={point} onSelect={onSelect} onFailure={onGoogleFailure} />;
}

export function VenueForm({
  draft,
  onChange,
  onCreated,
  buttonLabel = 'Criar local',
}: {
  draft: VenueDraft;
  onChange: (draft: VenueDraft) => void;
  onCreated?: (venue: Venue) => void | Promise<void>;
  buttonLabel?: string;
}) {
  const [message, setMessage] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const update = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const selectGooglePlace = (place: PlaceSearchResult) => {
    const currentDraft = draftRef.current;
    onChange({
      ...currentDraft,
      name: currentDraft.name.trim() || place.displayName,
      addressLabel: place.addressLabel ?? place.displayName,
      city: place.city,
      point: { latitude: place.latitude, longitude: place.longitude },
      addressConfirmed: true,
    });
    setMessage('Local encontrado no Google Maps. Confira os dados antes de salvar.');
  };
  const selectMapPoint = (point: Point) => {
    onChange({ ...draftRef.current, point, addressConfirmed: false });
    setMessage('Ponto marcado no mapa. Pesquise o local no Google Maps.');
  };
  const useCurrentLocation = async () => {
    const result = await requestBrowserLocation(locationMessages);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    onChange({
      ...draft,
      point: { latitude: result.latitude, longitude: result.longitude },
      addressConfirmed: false,
    });
    setMessage('Ponto definido pelo seu dispositivo. Pesquise o local no Google Maps.');
  };
  const save = async () => {
    setMessage('');
    if (!venueDraftReady(draft)) {
      setMessage('Informe um nome e selecione um local no Google Maps.');
      return;
    }
    try {
      const created = await createVenueFromDraft(draft);
      await onCreated?.(created);
      onChange(blankVenueDraft());
      setMessage('Local criado e pronto para partidas.');
    } catch (cause: unknown) {
      setMessage(
        cause instanceof ApiError
          ? `Não foi possível criar o local: ${cause.message}`
          : 'Não foi possível criar o local. Verifique o nome e selecione um local no Google Maps.',
      );
    }
  };
  return (
    <div className="venue-form">
      <label>
        Pesquisar local no Google Maps
        <GooglePlaceSearch
          point={draft.point}
          onSelected={selectGooglePlace}
          onUnavailable={() =>
            setMessage(
              (current) =>
                current || 'Pesquisa Google indisponível. Tente novamente ou escolha no mapa.',
            )
          }
        />
      </label>
      <label>
        <span>
          Nome personalizado <span className="optional-label">(opcional)</span>
        </span>
        <input
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Preenchido ao escolher um local"
        />
      </label>
      {draft.addressConfirmed && <p className="hint">Cidade selecionada: {draft.city}</p>}
      <MapPicker point={draft.point} onSelect={(point) => void selectMapPoint(point)} />
      <div className="venue-form-actions">
        <button
          className="text-button venue-location-button"
          type="button"
          onClick={useCurrentLocation}
        >
          Usar minha localização atual
        </button>
        {onCreated && (
          <button className="button" type="button" onClick={save}>
            {buttonLabel}
          </button>
        )}
      </div>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
