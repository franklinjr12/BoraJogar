import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameApi, type Game } from '../../api/client';
import { formatDate, formatDateOnly } from '../../i18n/pt-BR';

type View = 'agenda' | 'month';
type Filter = 'all' | 'confirmed' | 'organized' | 'joined' | 'pending' | 'cancelled';
const dateLabel = (value: string) => formatDate(value, { dateStyle: 'full', timeStyle: 'short' });
const monthLabel = (value: string) => formatDateOnly(value, { month: 'long', year: 'numeric' });

export function CalendarPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>('agenda');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  useEffect(() => {
    gameApi
      .list(true)
      .then((page) => setGames(page.items))
      .catch(() => setError('Não foi possível carregar sua agenda. Entre e tente novamente.'));
  }, []);
  const filtered = useMemo(
    () =>
      games.filter((game) => {
        if (filter === 'cancelled') return game.status === 'cancelled';
        if (game.status === 'cancelled') return false;
        if (filter === 'confirmed') return game.currentUserStatus === 'confirmed';
        if (filter === 'organized') return game.currentUserRole === 'organizer';
        if (filter === 'joined')
          return game.currentUserStatus === 'confirmed' && game.currentUserRole !== 'organizer';
        if (filter === 'pending') return false;
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
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
          <button
            className={view === 'month' ? 'view-button selected' : 'view-button'}
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
            <option value="pending">Propostas pendentes</option>
            <option value="cancelled">Partidas canceladas</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {filtered.length === 0 && !error && (
        <section className="card">
          <h2>Nenhuma partida nesta visualização.</h2>
          <p className="hint">Crie ou entre em uma partida para começar a montar sua agenda.</p>
          <Link className="button" to="/games/new">
            Criar uma partida
          </Link>
        </section>
      )}
      {view === 'agenda' && (
        <div className="calendar-list">
          {filtered.map((game) => (
            <CalendarCard game={game} key={game.id} />
          ))}
        </div>
      )}
      {view === 'month' && (
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
    </main>
  );
}

function CalendarCard({ game, compact = false }: { game: Game; compact?: boolean }) {
  const mapURL = `https://www.openstreetmap.org/?mlat=${game.latitude}&mlon=${game.longitude}#map=18/${game.latitude}/${game.longitude}`;
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
        <a className="text-link" href={mapURL} target="_blank" rel="noreferrer">
          Abrir mapa do local
        </a>
        {game.status !== 'cancelled' && (
          <a className="text-link" href={gameApi.calendarURL(game.id)}>
            Adicionar ao calendário
          </a>
        )}
      </div>
    </article>
  );
}
