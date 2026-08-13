import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, type Dashboard, type Game } from '../../api/client';
import { formatDate, weekdayShortLabels } from '../../i18n/pt-BR';
import { sortGamesForDisplay } from './gameOrdering';
import { MapChooser } from './MapChooser';

const days = weekdayShortLabels;

const dateLabel = (value: string) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });

function gameCard(game: Game) {
  return (
    <Link className="card game-card" key={game.id} to={`/games/${game.id}`}>
      <p className="eyebrow">
        {game.openSlots > 0
          ? game.openSlots === 1
            ? '1 vaga disponível'
            : `${game.openSlots} vagas disponíveis`
          : 'Partida confirmada'}
      </p>
      <h3>{game.title || 'Partida de vôlei de praia'}</h3>
      <p>
        {dateLabel(game.startsAt)} - {game.venueName}
      </p>
    </Link>
  );
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDashboard(await dashboardApi.get());
    } catch {
      setError('Não foi possível carregar seu painel. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <main className="shell">
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <div className="actions compact-actions">
            <button className="text-button" type="button" onClick={() => void load()}>
              Tentar novamente
            </button>
            <Link className="text-link" to="/login">
              Entrar
            </Link>
          </div>
        </div>
      </main>
    );

  if (loading || !dashboard)
    return (
      <main className="shell">
        <p role="status">Carregando painel...</p>
      </main>
    );

  const hasValue =
    dashboard.nextGame ||
    dashboard.openGames.length > 0 ||
    dashboard.availabilitySummary.length > 0;
  const firstName = dashboard.displayName.split(' ')[0] || dashboard.displayName;
  const orderedOpenGames = sortGamesForDisplay(dashboard.openGames);

  return (
    <main className="shell dashboard">
      <p className="eyebrow">Seu painel</p>
      <h1>Que bom ver você, {firstName}</h1>

      {dashboard.nextGame && (
        <section className="dashboard-section">
          <h2>Sua próxima partida</h2>
          <div className="card">
            <p className="lead">{dateLabel(dashboard.nextGame.startsAt)}</p>
            <p>
              <strong>{dashboard.nextGame.venueName}</strong>
              {dashboard.nextGame.addressLabel ? ` - ${dashboard.nextGame.addressLabel}` : ''}
            </p>
            <p>{dashboard.nextGame.confirmedPlayers} jogadores confirmados</p>
            <div className="actions compact-actions">
              <Link className="button" to={`/games/${dashboard.nextGame.id}`}>
                Ver partida
              </Link>
              <MapChooser
                actionLabel="Como chegar"
                latitude={dashboard.nextGame.latitude}
                longitude={dashboard.nextGame.longitude}
                label={`${dashboard.nextGame.venueName}${dashboard.nextGame.addressLabel ? `, ${dashboard.nextGame.addressLabel}` : ''}`}
              />
            </div>
          </div>
        </section>
      )}

      {dashboard.availabilitySummary.length > 0 && (
        <section className="dashboard-section">
          <h2>Sua disponibilidade</h2>
          <div className="card weekly-summary">
            {dashboard.availabilitySummary.map((rule) => (
              <p key={rule.id}>
                <strong>{days[rule.weekday]}</strong> {rule.start}-{rule.end}
                {rule.labels.length > 0 ? ` - ${rule.labels.join(', ')}` : ''}
              </p>
            ))}
            <Link className="text-link" to="/availability">
              Editar disponibilidade
            </Link>
          </div>
        </section>
      )}

      {dashboard.openGames.length > 0 && (
        <section className="dashboard-section">
          <h2>Partidas que podem funcionar</h2>
          <div className="game-list">{orderedOpenGames.map(gameCard)}</div>
        </section>
      )}

      {!hasValue && (
        <section className="card">
          <h2>Você está pronto</h2>
          <p>
            Ainda não temos jogadores compatíveis suficientes, mas você pode continuar avançando.
          </p>
          <div className="actions compact-actions">
            <Link className="button" to="/games/new">
              Criar uma partida
            </Link>
            <Link className="text-link" to="/availability">
              Adicionar mais horários disponíveis
            </Link>
            <Link className="text-link" to="/start">
              Convidar amigos
            </Link>
          </div>
        </section>
      )}

      {hasValue && (
        <section className="dashboard-section create-game-strip">
          <Link className="button" to="/games/new">
            Criar uma partida
          </Link>
          <p>Convide amigos ou abra a partida para jogadores compatíveis.</p>
        </section>
      )}
    </main>
  );
}
