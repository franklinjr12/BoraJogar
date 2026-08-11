import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { locationApi, type PreferredArea, type Venue } from '../../api/client';
import { requestBrowserLocation, type LocationMessages } from './browserLocation';
import { GooglePlaceSearch } from './GooglePlaceSearch';
import { loadGoogleMaps } from './googleMaps';
import { blankVenueDraft, type VenueDraft } from './venueDraft';
import { VenueForm } from './VenueForm';
import type { PlaceSearchResult } from './googlePlace';

const defaultCenter = { latitude: -25.4284, longitude: -49.2733 };
const locationMessages: LocationMessages = {
  unavailable: 'A localização do navegador está indisponível. Pesquise ou escolha no mapa.',
  insecure:
    'A localização exige HTTPS em navegadores de celular. Use HTTPS local, tente novamente ou pesquise/escolha no mapa.',
  denied:
    'A permissão de localização está bloqueada. Ative-a nas configurações do navegador e tente novamente.',
  positionUnavailable:
    'Não foi possível encontrar a localização do seu dispositivo. Pesquise ou escolha no mapa.',
  timeout: 'A busca pela sua localização expirou. Pesquise ou escolha no mapa.',
  unknown: 'Não foi possível usar sua localização atual. Pesquise ou escolha no mapa.',
};
const radiusOptions = [
  { meters: 2000, label: '2 km', hint: 'Bem perto' },
  { meters: 4000, label: '4 km', hint: 'Perto' },
  { meters: 7000, label: '7 km', hint: 'Bairros próximos' },
  { meters: 10000, label: '10 km', hint: 'Relativamente perto' },
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
  onPointSelected,
}: {
  center: { latitude: number; longitude: number };
  onSelect: (latitude: number, longitude: number) => void;
  onPointSelected?: (latitude: number, longitude: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const initialCenter = useRef(center);
  const onSelectRef = useRef(onSelect);
  const onPointSelectedRef = useRef(onPointSelected);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onPointSelectedRef.current = onPointSelected;
  }, [onPointSelected]);

  useEffect(() => {
    if (!node.current) return;
    let disposed = false;
    const listeners: google.maps.MapsEventListener[] = [];
    void loadGoogleMaps()
      .then(({ maps }) => {
        if (disposed || !node.current) return;
        const instance = new maps.Map(node.current, {
          center: {
            lat: initialCenter.current.latitude,
            lng: initialCenter.current.longitude,
          },
          zoom: 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          mapTypeId: 'roadmap',
        });
        listeners.push(
          instance.addListener('idle', () => {
            const next = instance.getCenter();
            if (!next) return;
            onSelectRef.current(next.lat(), next.lng());
          }),
        );
        listeners.push(
          instance.addListener('click', (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            (onPointSelectedRef.current ?? onSelectRef.current)(
              event.latLng.lat(),
              event.latLng.lng(),
            );
          }),
        );
        map.current = instance;
      })
      .catch(() => {
        if (!disposed) setMapFailed(true);
      });
    return () => {
      disposed = true;
      listeners.forEach((listener) => listener.remove());
      map.current = null;
    };
  }, []);

  useEffect(() => {
    map.current?.setCenter({ lat: center.latitude, lng: center.longitude });
  }, [center.latitude, center.longitude]);

  if (mapFailed)
    return (
      <p className="map-inline-hint">Mapa indisponível. Pesquise ou use sua localização atual.</p>
    );
  return (
    <div className="map-shell">
      <div ref={node} className="map-panel" aria-label="Mapa para selecionar área" />
      <div className="map-pin" aria-hidden="true" />
    </div>
  );
}

function venueLabel(venue: Venue) {
  const access =
    venue.accessType === 'paid_entry'
      ? 'Entrada paga'
      : venue.accessType === 'public'
        ? 'Quadra pública'
        : venue.accessType === 'private'
          ? 'Quadra privada'
          : 'Quadra';
  const lighting =
    venue.lightingStatus === 'has_lighting'
      ? 'Com iluminação'
      : venue.lightingStatus === 'no_lighting'
        ? 'Sem iluminação'
        : 'Iluminação desconhecida';
  return `${access} - ${lighting}`;
}

export function LocationsPage() {
  return (
    <main className="shell locations">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <LocationSetup />
    </main>
  );
}

export function LocationSetup({
  compact = false,
  onLocationSavingChange,
}: {
  compact?: boolean;
  onLocationSavingChange?: (saving: boolean) => void;
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [favorites, setFavorites] = useState<Venue[]>([]);
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [mode, setMode] = useState<'list' | 'court' | 'area'>(compact ? 'area' : 'court');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueDraft, setVenueDraft] = useState<VenueDraft>(blankVenueDraft());
  const [search, setSearch] = useState('');
  const [point, setPoint] = useState(defaultCenter);
  const [radius, setRadius] = useState(4000);
  const [label, setLabel] = useState('Perto de casa');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [areaSearchOpen, setAreaSearchOpen] = useState(false);
  const [savingArea, setSavingArea] = useState(false);

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
      setMessage('Não foi possível carregar os locais. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const favoriteIds = new Set(favorites.map((venue) => venue.id));
  const savedLocations = favorites.length + areas.length;
  const filteredVenues = venues.filter((venue) =>
    `${venue.name} ${venue.addressLabel ?? ''} ${venue.city}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const saveAreaAtPoint = async (selectedPoint: typeof point, selectedLabel: string) => {
    if (areas.length >= 5) {
      onLocationSavingChange?.(false);
      setMessage('Você atingiu o limite de cinco áreas.');
      return;
    }
    setSavingArea(true);
    onLocationSavingChange?.(true);
    try {
      const created = await locationApi.createPreferredArea({
        label: selectedLabel.trim() || 'Perto de você',
        ...roundPoint(selectedPoint),
        radiusMeters: radius,
        priority: areas.length,
      });
      setAreas((current) => [...current, created]);
      setMode('list');
      setMessage(
        selectedLabel.trim() === 'Perto de você' ? 'Área perto de você salva.' : 'Área salva.',
      );
    } catch {
      setMessage('Não foi possível salvar a área. Você pode tentar novamente.');
    } finally {
      setSavingArea(false);
      onLocationSavingChange?.(false);
    }
  };

  const useCurrentLocation = async () => {
    if (compact) onLocationSavingChange?.(true);
    const result = await requestBrowserLocation(locationMessages);
    if (!result.ok) {
      if (compact) onLocationSavingChange?.(false);
      setMessage(result.message);
      return;
    }

    const rounded = roundPoint({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setPoint(rounded);
    const selectedLabel = compact ? 'Perto de você' : 'Perto da minha região';
    setLabel(selectedLabel);
    if (compact) {
      await saveAreaAtPoint(rounded, selectedLabel);
      return;
    }
    setMessage('Área definida pela localização do seu dispositivo.');
  };

  const openAreaSearch = () => {
    setAreaSearchOpen(true);
    setMessage('');
  };

  const chooseMap = () => {
    setAreaSearchOpen(false);
    setMessage('Mova o mapa ou clique em um ponto para escolher uma área.');
  };

  const selectAreaPlace = (place: PlaceSearchResult) => {
    const rounded = roundPoint({ latitude: place.latitude, longitude: place.longitude });
    setPoint(rounded);
    const selectedLabel = `Perto de ${place.city}`;
    setLabel(selectedLabel);
    if (compact) {
      void saveAreaAtPoint(rounded, selectedLabel);
      return;
    }
    setMessage(`Área selecionada: ${place.city}.`);
  };

  const saveCourt = async (venue: Venue) => {
    try {
      await locationApi.favoriteVenue(venue.id);
      setFavorites((current) => (favoriteIds.has(venue.id) ? current : [...current, venue]));
      setSelectedVenue(null);
      setMode('list');
      setMessage('Quadra salva.');
    } catch {
      setMessage('Não foi possível salvar a quadra.');
    }
  };

  const saveCreatedCourt = async (venue: Venue) => {
    await locationApi.favoriteVenue(venue.id);
    setFavorites((current) =>
      current.some((item) => item.id === venue.id) ? current : [...current, venue],
    );
    setVenues((current) =>
      current.some((item) => item.id === venue.id) ? current : [...current, venue],
    );
    setMode('list');
    setMessage('Quadra salva.');
  };

  const removeCourt = async (venue: Venue) => {
    try {
      await locationApi.unfavoriteVenue(venue.id);
      setFavorites((current) => current.filter((item) => item.id !== venue.id));
    } catch {
      setMessage('Não foi possível remover a quadra.');
    }
  };

  const saveArea = async () => {
    if (!label.trim()) {
      setMessage('Informe um nome para esta área.');
      return;
    }
    await saveAreaAtPoint(point, label);
  };

  const selectAreaPoint = (latitude: number, longitude: number, explicit = false) => {
    const rounded = roundPoint({ latitude, longitude });
    setPoint(rounded);
    if (compact && explicit) void saveAreaAtPoint(rounded, 'Perto de você');
  };

  const removeArea = async (id: string) => {
    try {
      await locationApi.deletePreferredArea(id);
      setAreas((current) => current.filter((area) => area.id !== id));
    } catch {
      setMessage('Não foi possível remover a área.');
    }
  };

  return (
    <>
      <p className="eyebrow">Locais para jogar</p>
      {!compact && <h1>Onde você pode jogar?</h1>}
      <p className="lead">
        {compact
          ? 'Comece por uma área perto de você. Use sua localização ou marque um ponto no mapa; quadras específicas podem ser adicionadas depois.'
          : 'Escolha quadras que você já frequenta ou marque uma área geral. Suas áreas privadas são usadas apenas para encontrar combinações.'}
      </p>
      <div className="location-mode-switcher" role="group" aria-label="Escolha do local">
        <button
          className={mode === 'court' ? 'mode-tab selected' : 'mode-tab'}
          type="button"
          aria-pressed={mode === 'court'}
          onClick={() => setMode('court')}
        >
          Escolher uma quadra
        </button>
        <button
          className={mode === 'area' ? 'mode-tab selected' : 'mode-tab'}
          type="button"
          aria-pressed={mode === 'area'}
          onClick={() => setMode('area')}
        >
          Escolher uma área
        </button>
      </div>

      {mode === 'list' && (
        <section className="location-list">
          <h2>Seus locais para jogar</h2>
          {loading && <p role="status">Carregando locais...</p>}
          {!loading && savedLocations === 0 && (
            <div className="card">
              <h3>Escolha onde você poderia jogar</h3>
              <p>
                Adicione quadras que conhece ou marque uma área, como perto de casa ou do trabalho.
              </p>
              <p>Suas áreas salvas permanecem privadas.</p>
              <button className="button" type="button" onClick={() => setMode('court')}>
                Adicionar meu primeiro local
              </button>
            </div>
          )}
          {favorites.map((venue) => (
            <article className="card location-card" key={venue.id}>
              <div>
                <h3>{venue.name}</h3>
                <p>{venueLabel(venue)}</p>
                <p>{venue.addressLabel || venue.city}</p>
                <p>Preferida em qualquer horário</p>
              </div>
              <button className="text-button" type="button" onClick={() => removeCourt(venue)}>
                Remover
              </button>
            </article>
          ))}
          {areas.map((area) => (
            <article className="card location-card" key={area.id}>
              <div>
                <h3>{area.label}</h3>
                <p>Área privada</p>
                <p>Em um raio de {Math.round(area.radiusMeters / 1000)} km</p>
                <p>Qualquer disponibilidade</p>
              </div>
              <button className="text-button" type="button" onClick={() => removeArea(area.id)}>
                Remover
              </button>
            </article>
          ))}
        </section>
      )}

      {mode === 'court' && (
        <section className="card court-selection-card">
          <h2>Escolha uma quadra</h2>
          <p className="section-intro">
            Pesquise no Google Maps ou marque o local diretamente no mapa.
          </p>
          <VenueForm
            draft={venueDraft}
            onChange={setVenueDraft}
            onCreated={saveCreatedCourt}
            onPointSelected={
              compact
                ? (selectedPoint) => saveAreaAtPoint(roundPoint(selectedPoint), 'Perto de você')
                : undefined
            }
            buttonLabel="Adicionar quadra"
          />
          <details className="secondary-location-options">
            <summary>Escolher entre quadras já cadastradas</summary>
            <div className="secondary-location-content">
              <label>
                Pesquisar quadras ou bairros
                <input value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              {selectedVenue ? (
                <div className="venue-preview">
                  <h3>{selectedVenue.name}</h3>
                  <p>{venueLabel(selectedVenue)}</p>
                  <p>{selectedVenue.addressLabel || selectedVenue.city}</p>
                  <div
                    className="map-preview"
                    aria-label={`Prévia do mapa de ${selectedVenue.name}`}
                  />
                  <p>Quando você jogaria aqui?</p>
                  <label className="checks">
                    <span>
                      <input type="checkbox" defaultChecked /> Sempre que eu estiver disponível
                    </span>
                  </label>
                  <button className="button" type="button" onClick={() => saveCourt(selectedVenue)}>
                    Salvar quadra
                  </button>
                </div>
              ) : (
                <>
                  <h3>Próximas e populares</h3>
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
            </div>
          </details>
        </section>
      )}

      {mode === 'area' && (
        <section className="card">
          <h2>Escolha uma área onde você aceitaria jogar</h2>
          <div className="actions compact-actions">
            <button className="text-button" type="button" onClick={useCurrentLocation}>
              Usar minha localização atual
            </button>
            <button className="text-button" type="button" onClick={openAreaSearch}>
              Pesquisar no Google Maps
            </button>
            <button className="text-button" type="button" onClick={chooseMap}>
              Escolher diretamente no mapa
            </button>
          </div>
          {areaSearchOpen && (
            <>
              <label>
                Pesquisar no Google Maps
                <GooglePlaceSearch
                  point={point}
                  placeholder="Ex.: Praça Oswaldo Cruz"
                  onSelected={selectAreaPlace}
                  onUnavailable={() =>
                    setMessage(
                      (current) =>
                        current ||
                        'Pesquisa Google indisponível. Tente novamente ou escolha no mapa.',
                    )
                  }
                />
              </label>
            </>
          )}
          <MapPanel
            center={point}
            onSelect={(latitude, longitude) => selectAreaPoint(latitude, longitude)}
            onPointSelected={(latitude, longitude) => selectAreaPoint(latitude, longitude, true)}
          />
          <p className="hint">Perto de {label || 'área selecionada'}</p>
          <fieldset>
            <legend>Até onde você viajaria?</legend>
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
            Nome
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <p className="hint">
            Área privada. Outros jogadores verão apenas o local da partida proposta.
          </p>
          <button
            className="button"
            type="button"
            onClick={saveArea}
            disabled={areas.length >= 5 || savingArea}
          >
            {savingArea ? 'Salvando área...' : 'Salvar área'}
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
