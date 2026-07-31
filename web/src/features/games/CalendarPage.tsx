import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameApi, type Game } from '../../api/client';

type View = 'agenda' | 'month';
type Filter = 'all' | 'confirmed' | 'organized' | 'joined' | 'pending' | 'cancelled';
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
const monthLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function CalendarPage() {
  const [games, setGames] = useState<Game[]>([]); const [view, setView] = useState<View>('agenda'); const [filter, setFilter] = useState<Filter>('all'); const [error, setError] = useState('');
  useEffect(() => { gameApi.list(true).then(setGames).catch(() => setError('Could not load your calendar. Sign in and try again.')); }, []);
  const filtered = useMemo(() => games.filter(game => {
    if (filter === 'cancelled') return game.status === 'cancelled';
    if (game.status === 'cancelled') return false;
    if (filter === 'confirmed') return game.currentUserStatus === 'confirmed';
    if (filter === 'organized') return game.currentUserRole === 'organizer';
    if (filter === 'joined') return game.currentUserStatus === 'confirmed' && game.currentUserRole !== 'organizer';
    if (filter === 'pending') return false;
    return true;
  }), [games, filter]);
  const months = Array.from(new Set(filtered.map(game => monthLabel(game.startsAt))));
  return <main className="shell"><Link className="text-link" to="/">← Home</Link><p className="eyebrow">Schedule</p><h1>Your calendar.</h1><p className="lead">Upcoming commitments, open games, and venue details in one place.</p><div className="calendar-toolbar"><div role="group" aria-label="Calendar view"><button className={view === 'agenda' ? 'view-button selected' : 'view-button'} onClick={() => setView('agenda')}>Agenda</button><button className={view === 'month' ? 'view-button selected' : 'view-button'} onClick={() => setView('month')}>Month</button></div><label className="filter-label">Filter<select value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">All games</option><option value="confirmed">Confirmed games</option><option value="organized">Organized games</option><option value="joined">Joined games</option><option value="pending">Pending proposals</option><option value="cancelled">Cancelled games</option></select></label></div>{error && <p className="error" role="alert">{error}</p>}{filtered.length === 0 && !error && <section className="card"><h2>No games in this view.</h2><p className="hint">Create a game or join one to start building your schedule.</p><Link className="button" to="/games/new">Create a game</Link></section>}{view === 'agenda' && <div className="calendar-list">{filtered.map(game => <CalendarCard game={game} key={game.id} />)}</div>}{view === 'month' && <div className="month-grid">{months.map(month => <section className="card" key={month}><h2>{month}</h2>{filtered.filter(game => monthLabel(game.startsAt) === month).map(game => <CalendarCard game={game} key={game.id} compact />)}</section>)}</div>}</main>;
}

function CalendarCard({ game, compact = false }: { game: Game; compact?: boolean }) { const mapURL = `https://www.openstreetmap.org/?mlat=${game.latitude}&mlon=${game.longitude}#map=18/${game.latitude}/${game.longitude}`; return <article className={compact ? 'calendar-card compact' : 'card calendar-card'}><p className="eyebrow">{game.status === 'cancelled' ? 'Cancelled' : game.currentUserRole === 'organizer' ? 'Organized game' : game.openSlots > 0 ? `${game.openSlots} open slot${game.openSlots === 1 ? '' : 's'}` : 'Confirmed game'}</p><h2><Link to={`/games/${game.id}`}>{game.title || 'Beach volleyball game'}</Link></h2><p><strong>{dateLabel(game.startsAt)}</strong></p><p>{game.venueName}{game.addressLabel ? ` · ${game.addressLabel}` : ''}</p><div className="calendar-links"><a className="text-link" href={mapURL} target="_blank" rel="noreferrer">Open venue map</a>{game.status !== 'cancelled' && <a className="text-link" href={gameApi.calendarURL(game.id)}>Add to calendar</a>}</div></article>; }
