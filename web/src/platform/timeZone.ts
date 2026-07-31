export function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}
