import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        if (String(url).includes('nominatim.openstreetmap.org/search')) {
          return response([
            {
              place_id: 1,
              display_name: 'Rua XV de Novembro, Curitiba',
              lat: '-25.43',
              lon: '-49.27',
              address: { city: 'Curitiba' },
            },
          ]);
        }
        return response({
          display_name: 'Rua XV, Curitiba',
          address: { road: 'Rua XV de Novembro', house_number: '100', city: 'Curitiba' },
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('searches manually entered address after blur, then pins selection', async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn(() =>
      response([
        {
          place_id: 1,
          display_name: 'Rua XV de Novembro, Curitiba',
          lat: '-25.43',
          lon: '-49.27',
          address: {
            road: 'Rua XV de Novembro',
            house_number: '100',
            city: 'Curitiba',
          },
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness onChange={onChange} />);
    await waitFor(() => expect(maplibreMock.instances.length).toBe(1));
    fetchMock.mockClear();

    const addressInput = screen.getByLabelText(/quadra/i);
    fireEvent.change(addressInput, { target: { value: 'Rua XV' } });
    fireEvent.blur(addressInput);

    const suggestion = await screen.findByRole('option', { name: /Rua XV de Novembro/i });
    fireEvent.click(suggestion);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLabel: 'Rua XV de Novembro, 100',
        city: 'Curitiba',
        point: { latitude: -25.43, longitude: -49.27 },
        addressConfirmed: true,
      }),
    );
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

  it('reverse geocodes map click into address and city', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await waitFor(() => expect(maplibreMock.instances.length).toBe(1));

    maplibreMock.instances[0]?.handlers.click?.({ lngLat: { lat: -25.44, lng: -49.28 } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Curitiba',
          addressLabel: 'Rua XV de Novembro, 100',
          point: { latitude: -25.44, longitude: -49.28 },
          addressConfirmed: true,
        }),
      ),
    );
    expect(await screen.findByText(/preenchido pelo mapa/i)).toBeInTheDocument();
  });
});
