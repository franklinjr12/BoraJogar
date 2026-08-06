import { locationApi } from '../../api/client';

export const defaultVenuePoint = { latitude: -25.4284, longitude: -49.2733 };
export const defaultCity = 'Curitiba';

export interface VenueDraft {
  name: string;
  city: string;
  addressLabel: string;
  point: { latitude: number; longitude: number };
  addressConfirmed: boolean;
}

export function blankVenueDraft(): VenueDraft {
  return {
    name: '',
    city: defaultCity,
    addressLabel: '',
    point: defaultVenuePoint,
    addressConfirmed: false,
  };
}

export function venueDraftReady(draft: VenueDraft) {
  return (
    draft.name.trim().length >= 2 &&
    draft.city.trim().length > 0 &&
    draft.addressLabel.trim().length >= 4 &&
    Number.isFinite(draft.point.latitude) &&
    Number.isFinite(draft.point.longitude)
  );
}

export function createVenueFromDraft(draft: VenueDraft) {
  return locationApi.createVenue({
    name: draft.name.trim(),
    city: draft.city.trim(),
    addressLabel: draft.addressLabel.trim() || undefined,
    latitude: draft.point.latitude,
    longitude: draft.point.longitude,
    lightingStatus: 'unknown',
    surfaceType: 'sand',
    accessType: 'unknown',
  });
}
