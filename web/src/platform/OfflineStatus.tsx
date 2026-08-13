import { useOnlineStatus } from './useOnlineStatus';

export function OfflineStatus({
  onRetry = () => window.location.reload(),
}: {
  onRetry?: () => void;
}) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="offline-banner" role="status">
      <strong>Você está offline.</strong> Mostrando partidas futuras salvas. Ações que exigem
      confirmação estão desativadas.
      <button className="text-button" type="button" onClick={onRetry}>
        Tentar conexão novamente
      </button>
    </div>
  );
}
