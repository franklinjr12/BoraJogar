import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueForm } from './VenueForm';
import { blankVenueDraft } from './venueDraft';
import type { VenueDraft } from './venueDraft';
import type { Venue } from '../../api/client';

const googleMapsMock = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('./googleMaps', () => googleMapsMock);

type MapEvent = { latLng?: { lat: () => number; lng: () => number } };
type MapHandler = (event?: MapEvent) => void;

const googleMapMock = vi.hoisted(() => {
  const instances: MockMap[] = [];
  class MockMap {
    handlers: Record<string, MapHandler> = {};
    remove = vi.fn();
    setCenter = vi.fn();

    constructor() {
      instances.push(this);
    }

    addListener(event: string, handler: MapHandler) {
      this.handlers[event] = handler;
      return { remove: vi.fn() };
    }
  }
  class MockMarker {
    setMap = vi.fn();
    setPosition = vi.fn();
  }
  return { instances, Map: MockMap, Marker: MockMarker };
});

function response(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
}

function Harness({
  onChange,
  onPointSelected,
  onCreated,
}: {
  onChange: (draft: VenueDraft) => void;
  onPointSelected?: (point: { latitude: number; longitude: number }) => void;
  onCreated?: (venue: Venue) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(blankVenueDraft);
  return (
    <VenueForm
      draft={draft}
      onChange={(nextDraft) => {
        setDraft(nextDraft);
        onChange(nextDraft);
      }}
      onPointSelected={onPointSelected}
      onCreated={onCreated}
    />
  );
}

describe('VenueForm', () => {
  beforeEach(() => {
    googleMapMock.instances.length = 0;
    class DefaultAutocomplete extends HTMLElement {}
    googleMapsMock.loadGoogleMaps.mockResolvedValue({
      maps: googleMapMock,
      marker: { Marker: googleMapMock.Marker },
      places: { PlaceAutocompleteElement: DefaultAutocomplete },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response({})),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not render manual address or city search fields', async () => {
    render(<Harness onChange={vi.fn()} />);
    await waitFor(() => expect(googleMapMock.instances.length).toBe(1));

    expect(screen.getByText(/pesquisar local no google maps/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/endereço da quadra/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pesquisa de cidade/i)).not.toBeInTheDocument();
  });

  it('shows the map unavailable message when Google Maps fails', async () => {
    googleMapsMock.loadGoogleMaps.mockRejectedValue(new Error('Google Maps unavailable'));
    render(<Harness onChange={vi.fn()} />);

    expect(await screen.findByText(/mapa indisponível/i)).toBeInTheDocument();
  });

  it('uses Google place selection to fill venue details', async () => {
    const onChange = vi.fn();
    const autocompleteInstances: Array<{ emit: (event: Event) => void }> = [];
    class MockAutocomplete extends HTMLElement {
      private listener?: EventListener;

      constructor() {
        super();
        autocompleteInstances.push({ emit: (event) => this.listener?.(event) });
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        if (type === 'gmp-select' && typeof listener === 'function') this.listener = listener;
      }
    }
    class MockSelectEvent extends Event {
      constructor(public placePrediction: { toPlace: () => typeof place }) {
        super('gmp-select');
      }
    }
    customElements.define('gmp-place-autocomplete', MockAutocomplete);
    googleMapsMock.loadGoogleMaps.mockResolvedValue({
      maps: {
        Map: class MockGoogleMap {
          addListener() {
            return { remove: vi.fn() };
          }
          setCenter() {}
        },
      },
      marker: {
        Marker: class MockGoogleMarker {
          setMap() {}
          setPosition() {}
        },
      },
      places: { PlaceAutocompleteElement: MockAutocomplete },
    });
    render(<Harness onChange={onChange} />);

    await waitFor(() => expect(autocompleteInstances).toHaveLength(1));
    const place = {
      id: 'google-place-1',
      displayName: 'Arena Praia Central',
      formattedAddress: 'Rua XV de Novembro, 100, Curitiba - PR',
      addressComponents: [{ types: ['administrative_area_level_2'], longText: 'Curitiba' }],
      location: { lat: () => -25.43, lng: () => -49.27 },
      fetchFields: vi.fn(),
    };
    autocompleteInstances[0]?.emit(new MockSelectEvent({ toPlace: () => place }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Arena Praia Central',
          addressLabel: 'Rua XV de Novembro, 100, Curitiba - PR',
          city: 'Curitiba',
          addressConfirmed: true,
          point: { latitude: -25.43, longitude: -49.27 },
        }),
      ),
    );
    expect(place.fetchFields).toHaveBeenCalledWith({
      fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location'],
    });
  });

  it('keeps map-picked coordinates unconfirmed until Google place selection', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await waitFor(() => expect(googleMapMock.instances.length).toBe(1));

    googleMapMock.instances[0]?.handlers.click?.({
      latLng: { lat: () => -25.44, lng: () => -49.28 },
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Quadra escolhida no mapa',
          addressLabel: 'Localização escolhida no mapa',
          point: { latitude: -25.44, longitude: -49.28 },
          addressConfirmed: false,
        }),
      ),
    );
    expect(await screen.findByText(/ponto marcado.*nome padrão preenchido/i)).toBeInTheDocument();
  });

  it('reports explicit map points to onboarding location setup', async () => {
    const onPointSelected = vi.fn();
    render(<Harness onChange={vi.fn()} onPointSelected={onPointSelected} />);
    await waitFor(() => expect(googleMapMock.instances.length).toBe(1));

    googleMapMock.instances[0]?.handlers.click?.({
      latLng: { lat: () => -25.44, lng: () => -49.28 },
    });

    expect(onPointSelected).toHaveBeenCalledWith({ latitude: -25.44, longitude: -49.28 });
  });

  it('fills a default court name and address from current location', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: { latitude: -25.4289, longitude: -49.2738 } as GeolocationCoordinates,
        } as GeolocationPosition),
      ),
    };
    vi.stubGlobal('navigator', { ...navigator, geolocation });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: /usar minha localização atual/i }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Quadra perto de você',
          addressLabel: 'Localização atual',
          point: { latitude: -25.4289, longitude: -49.2738 },
        }),
      ),
    );
  });

  it('allows adding the court immediately after using current location', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: -25.4289, longitude: -49.2738 } as GeolocationCoordinates,
          } as GeolocationPosition),
      },
    });
    const fetchMock = vi.fn(() => response({}));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness onChange={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /usar minha localização atual/i }));
    await screen.findByText(/localização definida.*nome padrão preenchido/i);
    fireEvent.click(screen.getByRole('button', { name: /criar local/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/venues',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Quadra perto de você"'),
        }),
      ),
    );
  });
});
