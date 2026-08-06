import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueForm } from './VenueForm';
import { blankVenueDraft } from './venueDraft';
import type { VenueDraft } from './venueDraft';

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

  it('suggests addresses after four characters and 500ms, then pins selection', async () => {
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
    vi.useFakeTimers();
    render(<Harness onChange={onChange} />);

    const addressInput = screen.getByLabelText(/quadra/i);
    fireEvent.change(addressInput, { target: { value: 'Rua' } });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(addressInput, { target: { value: 'Rua XV' } });
    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    const suggestion = screen.getByRole('option', { name: /Rua XV de Novembro/i });
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

  it('geocodes typed address and accepts default Curitiba city', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(screen.getByLabelText(/pesquisa de cidade/i)).toHaveValue('Curitiba');
    fireEvent.change(screen.getByLabelText(/quadra/i), {
      target: { value: 'Rua XV de Novembro, 100' },
    });
    fireEvent.blur(screen.getByLabelText(/quadra/i));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Curitiba',
          addressConfirmed: true,
          point: { latitude: -25.43, longitude: -49.27 },
        }),
      ),
    );
    expect(await screen.findByText(/marcado no mapa/i)).toBeInTheDocument();
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
