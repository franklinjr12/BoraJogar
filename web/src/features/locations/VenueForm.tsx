import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ApiError, type Venue } from '../../api/client';
import { requestBrowserLocation, type LocationMessages } from './browserLocation';
import { resolveMapStyle } from './mapStyle';
import {
  blankVenueDraft,
  createVenueFromDraft,
  venueDraftReady,
  type VenueDraft,
} from './venueDraft';
import { reverseGeocode, searchAddress, searchPlaces, type PlaceSearchResult } from './placeSearch';

const locationMessages: LocationMessages = {
  unavailable: 'A permissão de localização está indisponível. Pesquise por cidade.',
  insecure:
    'A localização exige HTTPS em navegadores de celular. Use HTTPS local e tente novamente.',
  denied:
    'A permissão de localização está bloqueada. Ative-a nas configurações do navegador e tente novamente.',
  positionUnavailable:
    'Não foi possível encontrar a localização do seu dispositivo. Pesquise por cidade.',
  timeout: 'A busca pela sua localização expirou. Pesquise por cidade.',
  unknown: 'Não foi possível usar sua localização atual. Pesquise por cidade.',
};
const addressMinimumCharacters = 4;
const addressSearchDelayMs = 500;

function MapPicker({
  point,
  onSelect,
}: {
  point: { latitude: number; longitude: number };
  onSelect: (point: { latitude: number; longitude: number }) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const marker = useRef<import('maplibre-gl').Marker | null>(null);
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
          attributionControl: {},
          center: [initialPoint.current.longitude, initialPoint.current.latitude],
          zoom: 11,
        });
        instance.addControl(new maplibregl.NavigationControl(), 'top-right');
        marker.current = new maplibregl.Marker()
          .setLngLat([initialPoint.current.longitude, initialPoint.current.latitude])
          .addTo(instance);
        instance.on('click', (event) =>
          onSelectRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }),
        );
        instance.on('error', () => {
          if (disposed) return;
          marker.current?.remove();
          marker.current = null;
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
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, [style]);

  useEffect(() => {
    map.current?.setCenter([point.longitude, point.latitude]);
    marker.current?.setLngLat([point.longitude, point.latitude]);
  }, [point.latitude, point.longitude]);

  if (!style || mapFailed)
    return <p className="map-inline-hint">Mapa indisponível. Pesquise por cidade.</p>;
  return <div ref={node} className="map-panel compact-map" aria-label="Escolher local no mapa" />;
}

export function VenueForm({
  draft,
  onChange,
  onCreated,
  buttonLabel = 'Criar local',
}: {
  draft: VenueDraft;
  onChange: (draft: VenueDraft) => void;
  onCreated?: (venue: Venue) => void;
  buttonLabel?: string;
}) {
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [addressResults, setAddressResults] = useState<PlaceSearchResult[]>([]);
  const [cityQuery, setCityQuery] = useState(draft.city);
  const [citySearchTouched, setCitySearchTouched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addressSearching, setAddressSearching] = useState(false);
  const searchSequence = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const addressController = useRef<AbortController | null>(null);
  const addressSearchSequence = useRef(0);
  const addressSearchTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const update = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const cancelAddressSearch = () => {
    addressController.current?.abort();
    addressController.current = null;
    if (addressSearchTimer.current !== null) {
      window.clearTimeout(addressSearchTimer.current);
      addressSearchTimer.current = null;
    }
    addressSearchSequence.current += 1;
    setAddressResults([]);
    setAddressSearching(false);
  };
  const selectAddress = (place: PlaceSearchResult) => {
    const addressLabel = place.addressLabel ?? place.displayName;
    onChange({
      ...draftRef.current,
      addressLabel,
      city: place.city,
      point: { latitude: place.latitude, longitude: place.longitude },
      addressConfirmed: true,
    });
    setAddressResults([]);
    setCityQuery(place.city);
    setCitySearchTouched(false);
    setMessage('Endereço marcado no mapa.');
  };
  const searchAddressForDraft = async (): Promise<PlaceSearchResult[]> => {
    const currentDraft = draftRef.current;
    if (currentDraft.addressLabel.trim().length < addressMinimumCharacters) return [];
    addressController.current?.abort();
    const sequence = addressSearchSequence.current + 1;
    addressSearchSequence.current = sequence;
    const controller = new AbortController();
    addressController.current = controller;
    setAddressSearching(true);
    try {
      const matches = await searchAddress(`${currentDraft.addressLabel}, ${currentDraft.city}`, {
        signal: controller.signal,
      });
      if (sequence !== addressSearchSequence.current) return [];
      setAddressResults(matches);
      setMessage(matches.length > 0 ? 'Escolha um endereço da lista.' : 'Endereço não encontrado.');
      return matches;
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return [];
      if (sequence === addressSearchSequence.current)
        setMessage('Não foi possível pesquisar o endereço. Tente novamente em instantes.');
      return [];
    } finally {
      if (sequence === addressSearchSequence.current) setAddressSearching(false);
    }
  };
  const updateAddress = (value: string) => {
    cancelAddressSearch();
    onChange({ ...draft, addressLabel: value, addressConfirmed: false });
    if (value.trim().length >= addressMinimumCharacters) {
      addressSearchTimer.current = window.setTimeout(() => {
        addressSearchTimer.current = null;
        void searchAddressForDraft();
      }, addressSearchDelayMs);
    }
  };
  const resolveAddress = async () => {
    const currentDraft = draftRef.current;
    if (currentDraft.addressLabel.trim().length < addressMinimumCharacters) return;
    if (addressSearchTimer.current !== null) {
      window.clearTimeout(addressSearchTimer.current);
      addressSearchTimer.current = null;
    }
    if (addressResults[0]) {
      selectAddress(addressResults[0]);
      return;
    }
    const matches = await searchAddressForDraft();
    if (matches[0]) selectAddress(matches[0]);
  };
  const selectMapPoint = async (point: { latitude: number; longitude: number }) => {
    onChange({ ...draftRef.current, point, addressConfirmed: false });
    try {
      const result = await reverseGeocode(point);
      if (!result) {
        setMessage('Ponto marcado no mapa. Informe o endereço da quadra.');
        return;
      }
      onChange({
        ...draftRef.current,
        point,
        city: result.city,
        addressLabel: result.addressLabel,
        addressConfirmed: true,
      });
      setCityQuery(result.city);
      setMessage('Endereço preenchido pelo mapa.');
    } catch {
      setMessage('Ponto marcado no mapa. Informe o endereço da quadra.');
    }
  };
  useEffect(
    () => () => {
      addressController.current?.abort();
      if (addressSearchTimer.current !== null) window.clearTimeout(addressSearchTimer.current);
    },
    [],
  );
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
    setMessage('Ponto definido pelo seu dispositivo. Selecione a cidade antes de salvar.');
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
          setMessage(
            matches.length > 0 ? 'Escolha uma cidade da lista.' : 'Cidade não encontrada.',
          );
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setMessage('Não foi possível pesquisar a cidade. Tente novamente em instantes.');
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
    setMessage(`Cidade selecionada: ${place.city}.`);
  };
  const save = async () => {
    setMessage('');
    if (!venueDraftReady(draft)) {
      setMessage('Informe um nome e o endereço da quadra, depois pesquise e selecione uma cidade.');
      return;
    }
    try {
      const created = await createVenueFromDraft(draft);
      onCreated?.(created);
      onChange(blankVenueDraft());
      setMessage('Local criado e pronto para partidas.');
    } catch (cause: unknown) {
      setMessage(
        cause instanceof ApiError
          ? `Não foi possível criar o local: ${cause.message}`
          : 'Não foi possível criar o local. Verifique nome, cidade e endereço.',
      );
    }
  };
  return (
    <div className="venue-form">
      <label>
        Nome personalizado
        <input
          value={draft.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Praia Central"
        />
      </label>
      <label>
        Endereço da quadra
        <input
          value={draft.addressLabel}
          onChange={(event) => updateAddress(event.target.value)}
          onBlur={() => void resolveAddress()}
          placeholder="Av. Atlantica, 100"
        />
      </label>
      {addressSearching && <p className="hint">Pesquisando endereço...</p>}
      {addressResults.length > 0 && (
        <div className="place-results" role="listbox" aria-label="Sugestões de endereços">
          {addressResults.map((result) => (
            <button
              className="place-result"
              key={result.id}
              type="button"
              role="option"
              onClick={() => selectAddress(result)}
            >
              <strong>{result.addressLabel ?? result.displayName}</strong>
              <span>{result.city}</span>
            </button>
          ))}
        </div>
      )}
      <label>
        Pesquisa de cidade
        <input
          type="search"
          autoComplete="off"
          value={cityQuery}
          onChange={(event) => {
            cancelAddressSearch();
            setCitySearchTouched(true);
            setCityQuery(event.target.value);
            onChange({ ...draft, city: event.target.value, addressConfirmed: false });
          }}
          placeholder="Curitiba"
        />
      </label>
      {searching && <p className="hint">Pesquisando cidade...</p>}
      {results.length > 0 && (
        <div className="place-results" role="listbox" aria-label="Resultados de cidades">
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
      {draft.addressConfirmed && <p className="hint">Cidade selecionada: {draft.city}</p>}
      <MapPicker point={draft.point} onSelect={(point) => void selectMapPoint(point)} />
      <button className="text-button" type="button" onClick={useCurrentLocation}>
        Usar minha localização atual
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
