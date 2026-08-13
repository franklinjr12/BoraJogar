export const locationsChangedEvent = 'borajogar-locations-changed';

export function notifyLocationsChanged() {
  window.dispatchEvent(new Event(locationsChangedEvent));
}
