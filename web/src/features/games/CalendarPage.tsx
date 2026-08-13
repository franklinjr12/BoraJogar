import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameApi, type Game } from '../../api/client';
import { formatDate, formatDateOnly } from '../../i18n/pt-BR';
import { MapChooser } from './MapChooser';

type View = 'agenda' | 'month';
type Filter = 'all' | 'confirmed' | 'organized' | 'joined' | 'cancelled';
const dateLabel = (value: string) => formatDate(value, { dateStyle: 'full', timeStyle: 'short' });
const monthLabel = (value: string) => formatDateOnly(value, { month: 'long', year: 'numeric' });

export function CalendarPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>('agenda');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await gameApi.list(true, nextPage);
      setGames((current) => (append ? [...current, ...result.items] : result.items));
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      setError('Não foi possível carregar sua agenda. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      games.filter((game) => {
        if (filter === 'cancelled') return game.status === 'cancelled';
        if (game.status === 'cancelled') return false;
        if (filter === 'confirmed') return game.currentUserStatus === 'confirmed';
        if (filter === 'organized') return game.currentUserRole === 'organizer';
        if (filter === 'joined')
          return game.currentUserStatus === 'confirmed' && game.currentUserRole !== 'organizer';
        return true;
      }),
    [games, filter],
  );
  const months = Array.from(new Set(filtered.map((game) => monthLabel(game.startsAt))));
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <p className="eyebrow">Agenda</p>
      <h1>Seu calendário.</h1>
      <p className="lead">
        Compromissos futuros, partidas abertas e detalhes dos locais em um só lugar.
      </p>
      <div className="calendar-toolbar">
        <div role="group" aria-label="Visualização do calendário">
          <button
            className={view === 'agenda' ? 'view-button selected' : 'view-button'}
            type="button"
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
          <button
            className={view === 'month' ? 'view-button selected' : 'view-button'}
            type="button"
            onClick={() => setView('month')}
          >
            Mês
          </button>
        </div>
        <label className="filter-label">
          Filtro
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">Todas as partidas</option>
            <option value="confirmed">Partidas confirmadas</option>
            <option value="organized">Partidas organizadas</option>
            <option value="joined">Partidas em que entrei</option>
            <option value="cancelled">Partidas canceladas</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading && <p role="status">Carregando agenda...</p>}
      {!loading && filtered.length === 0 && !error && (
        <section className="card">
          <h2>Nenhuma partida nesta visualização.</h2>
          <p className="hint">Crie ou entre em uma partida para começar a montar sua agenda.</p>
          <Link className="button" to="/games/new">
            Criar uma partida
          </Link>
        </section>
      )}
      {!loading && view === 'agenda' && (
        <div className="calendar-list">
          {filtered.map((game) => (
            <CalendarCard game={game} key={game.id} />
          ))}
        </div>
      )}
      {!loading && view === 'month' && (
        <div className="month-grid">
          {months.map((month) => (
            <section className="card" key={month}>
              <h2>{month}</h2>
              {filtered
                .filter((game) => monthLabel(game.startsAt) === month)
                .map((game) => (
                  <CalendarCard game={game} key={game.id} compact />
                ))}
            </section>
          ))}
        </div>
      )}
      {hasMore && (
        <button
          className="button load-more-button"
          type="button"
          disabled={loadingMore}
          onClick={() => void load(page + 1, true)}
        >
          {loadingMore ? 'Carregando...' : 'Carregar mais partidas'}
        </button>
      )}
    </main>
  );
}

function CalendarCard({ game, compact = false }: { game: Game; compact?: boolean }) {
  return (
    <article className={compact ? 'calendar-card compact' : 'card calendar-card'}>
      <p className="eyebrow">
        {game.status === 'cancelled'
          ? 'Cancelada'
          : game.currentUserRole === 'organizer'
            ? 'Partida organizada'
            : game.openSlots > 0
              ? game.openSlots === 1
                ? '1 vaga disponível'
                : `${game.openSlots} vagas disponíveis`
              : 'Partida confirmada'}
      </p>
      <h2>
        <Link to={`/games/${game.id}`}>{game.title || 'Partida de vôlei de praia'}</Link>
      </h2>
      <p>
        <strong>{dateLabel(game.startsAt)}</strong>
      </p>
      <p>
        {game.venueName}
        {game.addressLabel ? ` · ${game.addressLabel}` : ''}
      </p>
      <div className="calendar-links">
        <MapChooser
          latitude={game.latitude}
          longitude={game.longitude}
          label={`${game.venueName}${game.addressLabel ? `, ${game.addressLabel}` : ''}`}
        />
        {game.status !== 'cancelled' && (
          <a className="text-link" href={gameApi.calendarURL(game.id)}>
            Adicionar ao calendário
          </a>
        )}
      </div>
    </article>
  );
}
