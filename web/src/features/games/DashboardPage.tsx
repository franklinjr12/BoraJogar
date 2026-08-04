import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, type Dashboard, type Game } from '../../api/client';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dateLabel = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function gameCard(game: Game) {
  return (
    <Link className="card game-card" key={game.id} to={`/games/${game.id}`}>
      <p className="eyebrow">
        {game.openSlots > 0
          ? `${game.openSlots} open slot${game.openSlots === 1 ? '' : 's'}`
          : 'Confirmed game'}
      </p>
      <h3>{game.title || 'Beach volleyball game'}</h3>
      <p>
        {dateLabel(game.startsAt)} - {game.venueName}
      </p>
    </Link>
  );
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dashboardApi
      .get()
      .then(setDashboard)
      .catch(() => setError('Could not load your dashboard. Sign in and try again.'));
  }, []);

  if (error)
    return (
      <main className="shell">
        <p className="error" role="alert">
          {error}
        </p>
        <Link className="text-link" to="/login">
          Sign in
        </Link>
      </main>
    );

  if (!dashboard)
    return (
      <main className="shell">
        <p>Loading dashboard...</p>
      </main>
    );

  const hasValue =
    dashboard.nextGame ||
    dashboard.openGames.length > 0 ||
    dashboard.availabilitySummary.length > 0;
  const firstName = dashboard.displayName.split(' ')[0] || dashboard.displayName;

  return (
    <main className="shell dashboard">
      <p className="eyebrow">Your dashboard</p>
      <h1>Good to see you, {firstName}</h1>

      {dashboard.nextGame && (
        <section className="dashboard-section">
          <h2>Your next game</h2>
          <div className="card">
            <p className="lead">{dateLabel(dashboard.nextGame.startsAt)}</p>
            <p>
              <strong>{dashboard.nextGame.venueName}</strong>
              {dashboard.nextGame.addressLabel ? ` - ${dashboard.nextGame.addressLabel}` : ''}
            </p>
            <p>{dashboard.nextGame.confirmedPlayers} players confirmed</p>
            <div className="actions compact-actions">
              <Link className="button" to={`/games/${dashboard.nextGame.id}`}>
                View game
              </Link>
              <a
                className="text-link"
                href={`https://www.openstreetmap.org/?mlat=${dashboard.nextGame.latitude}&mlon=${dashboard.nextGame.longitude}#map=18/${dashboard.nextGame.latitude}/${dashboard.nextGame.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Directions
              </a>
            </div>
          </div>
        </section>
      )}

      {dashboard.availabilitySummary.length > 0 && (
        <section className="dashboard-section">
          <h2>Your availability</h2>
          <div className="card weekly-summary">
            {dashboard.availabilitySummary.map((rule) => (
              <p key={rule.id}>
                <strong>{days[rule.weekday]}</strong> {rule.start}-{rule.end}
                {rule.labels.length > 0 ? ` - ${rule.labels.join(', ')}` : ''}
              </p>
            ))}
            <Link className="text-link" to="/availability">
              Edit availability
            </Link>
          </div>
        </section>
      )}

      {dashboard.openGames.length > 0 && (
        <section className="dashboard-section">
          <h2>Games that may work</h2>
          <div className="game-list">{dashboard.openGames.map(gameCard)}</div>
        </section>
      )}

      {!hasValue && (
        <section className="card">
          <h2>You're ready</h2>
          <p>We do not have enough compatible players yet, but you can keep things moving.</p>
          <div className="actions compact-actions">
            <Link className="button" to="/games/new">
              Create a game
            </Link>
            <Link className="text-link" to="/availability">
              Add more available times
            </Link>
            <Link className="text-link" to="/start">
              Invite friends
            </Link>
          </div>
        </section>
      )}

      {hasValue && (
        <section className="dashboard-section create-game-strip">
          <Link className="button" to="/games/new">
            Create a game
          </Link>
          <p>Invite friends or open it to compatible players.</p>
        </section>
      )}
    </main>
  );
}
