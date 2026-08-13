import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userApi, type BlockedUser } from '../../api/client';
import { useOnlineStatus } from '../../platform/useOnlineStatus';

export function SafetyPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isOnline = useOnlineStatus();

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    userApi
      .blockedUsers()
      .then(setBlockedUsers)
      .catch(() => setError('Não foi possível carregar seus bloqueios. Tente novamente.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => void load(), [load]);

  const unblock = async (userId: string) => {
    if (!isOnline || busyId) return;
    setBusyId(userId);
    setError('');
    try {
      await userApi.unblock(userId);
      setBlockedUsers((current) => current.filter((user) => user.userId !== userId));
    } catch {
      setError('Não foi possível desbloquear este jogador. Tente novamente.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="shell">
      <Link className="text-link" to="/profile">
        ← Perfil
      </Link>
      <p className="eyebrow">Privacidade e segurança</p>
      <h1>Controle suas interações.</h1>
      <p className="lead">Jogadores bloqueados não entram em novas combinações com você.</p>
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={load}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando bloqueios...</p>
      ) : blockedUsers.length === 0 ? (
        <section className="card empty-state">
          <h2>Nenhum jogador bloqueado.</h2>
          <p className="hint">Você poderá bloquear um jogador pelo perfil dele.</p>
        </section>
      ) : (
        <section className="choice-list" aria-label="Jogadores bloqueados">
          {blockedUsers.map((user) => (
            <article className="card location-card" key={user.userId}>
              <Link className="text-link" to={`/players/${user.userId}`}>
                {user.displayName}
              </Link>
              <button
                className="text-button"
                type="button"
                disabled={busyId === user.userId || !isOnline}
                onClick={() => void unblock(user.userId)}
              >
                {busyId === user.userId ? 'Atualizando...' : 'Desbloquear'}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
