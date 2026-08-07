import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './googleMaps';
import { googlePlaceToSearchResult } from './googlePlace';
import type { PlaceSearchResult } from './placeSearch';

export function GooglePlaceSearch({
  point,
  onSelected,
  onUnavailable,
  placeholder = 'Ex.: Arena Praia Central',
}: {
  point: { latitude: number; longitude: number };
  onSelected: (place: PlaceSearchResult) => void;
  onUnavailable: () => void;
  placeholder?: string;
}) {
  const node = useRef<HTMLDivElement>(null);
  const onSelectedRef = useRef(onSelected);
  const onUnavailableRef = useRef(onUnavailable);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectedRef.current = onSelected;
  }, [onSelected]);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    if (!node.current) return;
    let disposed = false;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | undefined;
    void loadGoogleMaps()
      .then(({ places }) => {
        if (disposed || !node.current) return;
        autocomplete = new places.PlaceAutocompleteElement({
          includedRegionCodes: ['br'],
          requestedLanguage: 'pt-BR',
          requestedRegion: 'BR',
        });
        autocomplete.placeholder = placeholder;
        autocomplete.description = 'Pesquisar nome, bairro ou endereço';
        autocomplete.locationBias = {
          center: { lat: point.latitude, lng: point.longitude },
          radius: 20000,
        };
        autocomplete.addEventListener('gmp-select', async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({
              fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location'],
            });
            const result = googlePlaceToSearchResult(place);
            if (!result) {
              setFailed(true);
              onUnavailableRef.current();
              return;
            }
            onSelectedRef.current(result);
          } catch {
            setFailed(true);
            onUnavailableRef.current();
          }
        });
        node.current.appendChild(autocomplete);
      })
      .catch(() => {
        if (disposed) return;
        setFailed(true);
        onUnavailableRef.current();
      });

    return () => {
      disposed = true;
      autocomplete?.remove();
    };
  }, [placeholder, point.latitude, point.longitude]);

  if (failed)
    return <p className="hint">Pesquisa Google indisponível. Informe o local manualmente.</p>;
  return <div ref={node} className="google-place-search" />;
}
