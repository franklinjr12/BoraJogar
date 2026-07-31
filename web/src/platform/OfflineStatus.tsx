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
      <strong>You are offline.</strong> Showing saved upcoming games. Actions needing confirmation
      are disabled.
      <button className="text-button" onClick={onRetry}>
        Retry connection
      </button>
    </div>
  );
}
