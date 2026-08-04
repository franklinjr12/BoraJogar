export interface LocationMessages {
  unavailable: string;
  insecure: string;
  denied: string;
  positionUnavailable: string;
  timeout: string;
  unknown: string;
}

export interface BrowserLocationSuccess {
  ok: true;
  latitude: number;
  longitude: number;
}

export interface BrowserLocationFailure {
  ok: false;
  message: string;
}

export type BrowserLocationResult = BrowserLocationSuccess | BrowserLocationFailure;

const LOCATION_TIMEOUT_MS = 10000;
const LOCATION_CACHE_MS = 60000;
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function secureContextBlocked() {
  return 'isSecureContext' in window && window.isSecureContext === false;
}

function geolocationErrorMessage(error: GeolocationPositionError, messages: LocationMessages) {
  if (error.code === PERMISSION_DENIED) return messages.denied;
  if (error.code === POSITION_UNAVAILABLE) return messages.positionUnavailable;
  if (error.code === TIMEOUT) return messages.timeout;
  return messages.unknown;
}

export function locationUnavailableMessage(messages: LocationMessages) {
  if (secureContextBlocked()) return messages.insecure;
  if (!navigator.geolocation) return messages.unavailable;
  return '';
}

export function requestBrowserLocation(messages: LocationMessages): Promise<BrowserLocationResult> {
  const unavailable = locationUnavailableMessage(messages);
  if (unavailable) return Promise.resolve({ ok: false, message: unavailable });

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => resolve({ ok: false, message: geolocationErrorMessage(error, messages) }),
      {
        enableHighAccuracy: false,
        maximumAge: LOCATION_CACHE_MS,
        timeout: LOCATION_TIMEOUT_MS,
      },
    );
  });
}
