import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueForm } from './VenueForm';
import { blankVenueDraft } from './venueDraft';
import type { VenueDraft } from './venueDraft';

const googleMapsMock = vi.hoisted(() => ({ loadGoogleMaps: vi.fn() }));
vi.mock('./googleMaps', () => googleMapsMock);

type MapEvent = { lngLat: { lat: number; lng: number } };
type MapHandler = (event?: MapEvent) => void;

const maplibreMock = vi.hoisted(() => {
  const instances: MockMap[] = [];
  class MockMap {
    handlers: Record<string, MapHandler> = {};
    remove = vi.fn();
    setCenter = vi.fn();

    constructor() {
      instances.push(this);
    }

    addControl() {
      return undefined;
    }

    on(event: string, handler: MapHandler) {
      this.handlers[event] = handler;
      return this;
    }
  }
  class MockMarker {
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
    remove = vi.fn();
  }
  return { instances, Map: MockMap, Marker: MockMarker, NavigationControl: vi.fn() };
});
vi.mock('maplibre-gl', () => ({
  default: {
    Map: maplibreMock.Map,
    Marker: maplibreMock.Marker,
    NavigationControl: maplibreMock.NavigationControl,
  },
}));

function response(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));
}

function Harness({ onChange }: { onChange: (draft: VenueDraft) => void }) {
  const [draft, setDraft] = useState(blankVenueDraft);
  return (
    <VenueForm
      draft={draft}
      onChange={(nextDraft) => {
        setDraft(nextDraft);
        onChange(nextDraft);
      }}
    />
  );
}

describe('VenueForm', () => {
  beforeEach(() => {
    maplibreMock.instances.length = 0;
    googleMapsMock.loadGoogleMaps.mockRejectedValue(new Error('Google Maps unavailable'));
    vi.stubGlobal('fetch', vi.fn(() => response({})));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not render manual address or city search fields', async () => {
    render(<Harness onChange={vi.fn()} />);
    await waitFor(() => expect(maplibreMock.instances.length).toBe(1));

    expect(screen.getByText(/pesquisar local no google maps/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/endereço da quadra/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/pesquisa de cidade/i)).not.toBeInTheDocument();
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
    await waitFor(() => expect(maplibreMock.instances.length).toBe(1));

    maplibreMock.instances[0]?.handlers.click?.({ lngLat: { lat: -25.44, lng: -49.28 } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          point: { latitude: -25.44, longitude: -49.28 },
          addressConfirmed: false,
        }),
      ),
    );
    expect(await screen.findByText(/pesquise o local no Google Maps/i)).toBeInTheDocument();
  });
});
