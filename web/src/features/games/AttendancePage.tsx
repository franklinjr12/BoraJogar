import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  attendanceApi,
  authApi,
  gameApi,
  type AttendanceEntry,
  type AttendanceStatus,
  type CurrentUser,
  type Game,
} from '../../api/client';
import { useOnlineStatus } from '../../platform/useOnlineStatus';

const statusLabels: Record<AttendanceStatus, string> = {
  unknown: 'Ainda não informado',
  attended: 'Compareceu',
  no_show: 'Não compareceu',
};

export function AttendancePage() {
  const { id = '' } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isOnline = useOnlineStatus();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextEntries, nextGame, user] = await Promise.all([
        attendanceApi.list(id),
        gameApi.get(id),
        authApi.currentUser(),
      ]);
      setEntries(nextEntries);
      setGame(nextGame);
      setCurrentUser(user);
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError && cause.status === 403
          ? 'Você não pode ver a presença desta partida.'
          : 'Não foi possível carregar a presença. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const record = async (userId: string, status: AttendanceStatus) => {
    if (!isOnline || busyUserId) return;
    setBusyUserId(userId);
    setError('');
    try {
      await attendanceApi.record(id, userId, status);
      setEntries((current) =>
        current.map((entry) => (entry.userId === userId ? { ...entry, status } : entry)),
      );
    } catch {
      setError('Não foi possível registrar a presença. Tente novamente.');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <main className="shell">
      <Link className="text-link" to={`/games/${id}`}>
        ← Partida
      </Link>
      <p className="eyebrow">Presença</p>
      <h1>{game?.title || 'Registrar presença'}</h1>
      <p className="lead">Confirme quem compareceu. Isso melhora futuras combinações.</p>
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando presença...</p>
      ) : (
        <section className="card attendance-list" aria-label="Presença dos jogadores">
          {entries.length === 0 && <p>Nenhum jogador confirmado nesta partida.</p>}
          {entries.map((entry) => {
            const canEdit =
              entry.userId === currentUser?.id || game?.currentUserRole === 'organizer';
            return (
              <article className="attendance-row" key={entry.userId}>
                <div>
                  <strong>{entry.displayName}</strong>
                  <span className="hint">{statusLabels[entry.status]}</span>
                </div>
                {canEdit && (
                  <div
                    className="segmented"
                    role="group"
                    aria-label={`Presença de ${entry.displayName}`}
                  >
                    <button
                      className={
                        entry.status === 'attended' ? 'view-button selected' : 'view-button'
                      }
                      type="button"
                      disabled={busyUserId === entry.userId || !isOnline}
                      onClick={() => void record(entry.userId, 'attended')}
                    >
                      Foi
                    </button>
                    {game?.currentUserRole === 'organizer' && (
                      <button
                        className={
                          entry.status === 'no_show' ? 'view-button selected' : 'view-button'
                        }
                        type="button"
                        disabled={busyUserId === entry.userId || !isOnline}
                        onClick={() => void record(entry.userId, 'no_show')}
                      >
                        Faltou
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
      {!isOnline && <p className="hint">Conecte-se para registrar alterações.</p>}
    </main>
  );
}
