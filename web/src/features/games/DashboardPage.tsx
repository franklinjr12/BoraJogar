import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameApi, type Game } from '../../api/client';

const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DashboardPage() {
  const [games, setGames] = useState<Game[]>([]); const [error, setError] = useState('');
  useEffect(() => { gameApi.list().then(setGames).catch(() => setError('Could not load your dashboard. Sign in and try again.')); }, []);
  const confirmed = games.filter(game => game.currentUserStatus === 'confirmed');
  const open = games.filter(game => game.currentUserStatus !== 'confirmed' && game.openSlots > 0);
  const gameCard = (game: Game) => <Link className="card game-card" key={game.id} to={`/games/${game.id}`}><p className="eyebrow">{game.currentUserRole === 'organizer' ? 'Organized game' : game.openSlots > 0 ? `${game.openSlots} open slot${game.openSlots === 1 ? '' : 's'}` : 'Confirmed game'}</p><h3>{game.title || 'Beach volleyball game'}</h3><p>{dateLabel(game.startsAt)} · {game.venueName}</p></Link>;
  return <main className="shell"><p className="eyebrow">Your dashboard</p><h1>What’s next?</h1><p className="lead">Important game actions and commitments, ready at a glance.</p><div className="actions"><Link className="button" to="/games/new">Quick create game</Link><Link className="text-link" to="/calendar">Open full calendar</Link></div>{error && <p className="error" role="alert">{error}</p>}{!error && confirmed.length === 0 && open.length === 0 && <section className="card"><h2>No upcoming games.</h2><p>Set availability or create a game to start planning.</p><div className="actions"><Link className="button" to="/games/new">Create a game</Link><Link className="text-link" to="/availability">Set availability</Link></div></section>}{confirmed.length > 0 && <section className="dashboard-section"><h2>Upcoming confirmed games</h2><div className="game-list">{confirmed.map(gameCard)}</div></section>}{open.length > 0 && <section className="dashboard-section"><h2>Games with open slots</h2><div className="game-list">{open.map(gameCard)}</div></section>}{!error && confirmed.length === 0 && open.length > 0 && <section className="dashboard-section"><h2>Availability status</h2><p className="card">Your schedule can improve matches. <Link className="text-link" to="/availability">Review availability</Link></p></section>}</main>;
}
