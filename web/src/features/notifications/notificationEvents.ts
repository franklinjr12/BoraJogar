export const notificationsChangedEvent = 'borajogar-notifications-changed';

export function notifyNotificationsChanged() {
  globalThis.window.dispatchEvent(new Event(notificationsChangedEvent));
}
