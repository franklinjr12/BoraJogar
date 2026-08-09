export interface PlaceSearchResult {
  id: string;
  displayName: string;
  addressLabel?: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

function componentText(
  components: google.maps.places.AddressComponent[] | undefined,
  type: string,
) {
  return components?.find((component) => component.types.includes(type))?.longText?.trim();
}

export function googlePlaceToSearchResult(
  place: google.maps.places.Place,
): PlaceSearchResult | undefined {
  const displayName = place.displayName?.trim();
  const addressLabel = place.formattedAddress?.trim();
  const latitude = place.location?.lat();
  const longitude = place.location?.lng();
  const city =
    componentText(place.addressComponents, 'locality') ??
    componentText(place.addressComponents, 'administrative_area_level_2') ??
    componentText(place.addressComponents, 'postal_town');

  if (
    !displayName ||
    !addressLabel ||
    !city ||
    latitude === undefined ||
    longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return undefined;
  }

  return {
    id: place.id ?? displayName,
    displayName,
    addressLabel,
    city,
    latitude,
    longitude,
  };
}
