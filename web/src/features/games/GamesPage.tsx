import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  gameApi,
  locationApi,
  ApiError,
  type Game,
  type GameInput,
  type GamePreview,
  type GameSkillLevel,
  type GameVisibility,
  type PreferredArea,
} from '../../api/client';
import { VenueForm } from '../locations/VenueForm';
import {
  blankVenueDraft,
  createVenueFromDraft,
  venueDraftReady,
  type VenueDraft,
} from '../locations/venueDraft';
import { markGameAlertPromptReady } from '../notifications/gameAlertPromptState';

const levels: GameSkillLevel[] = [
  'learning',
  'beginner',
  'intermediate',
  'advanced',
  'competitive',
];
const label = (value: string) =>
  value.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const localDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const minimumStartLeadMs = 15 * 60 * 1000;

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    gameApi
      .list()
      .then((page) => setGames(page.items))
      .catch(() => setError('Could not load games. Sign in and try again.'));
  }, []);
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Home
      </Link>
      <p className="eyebrow">Manual games</p>
      <h1>Get on court.</h1>
      <p className="lead">Create a game, share the link, and fill the open slots.</p>
      <div className="actions">
        <Link className="button" to="/games/new">
          Create a game
        </Link>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="game-list">
        {games.length === 0 && !error && <p className="hint">No upcoming games yet.</p>}
        {games.map((game) => (
          <Link className="card game-card" key={game.id} to={`/games/${game.id}`}>
            <p className="eyebrow">{game.visibility === 'link-only' ? 'Link-only' : 'Open game'}</p>
            <h2>{game.title || 'Beach volleyball game'}</h2>
            <p>
              {localDate(game.startsAt)} · {game.venueName}
            </p>
            <p>
              {game.openSlots} open {game.openSlots === 1 ? 'slot' : 'slots'} ·{' '}
              {label(game.minimumSkillLevel)}–{label(game.maximumSkillLevel)}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}

export function CreateGamePage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [locationChoice, setLocationChoice] = useState('');
  const [venueDraft, setVenueDraft] = useState<VenueDraft>(blankVenueDraft());
  useEffect(() => {
    Promise.all([locationApi.favoriteVenues(), locationApi.venues(), locationApi.preferredAreas()])
      .then(([favoriteVenues, availableVenues, preferredAreas]) => {
        const seenVenueIds = new Set<string>();
        const nextVenues = [...favoriteVenues, ...availableVenues]
          .filter((venue) => {
            if (seenVenueIds.has(venue.id)) return false;
            seenVenueIds.add(venue.id);
            return true;
          })
          .map(({ id, name }) => ({ id, name }));
        const nextAreas = preferredAreas.filter((area) => area.active);
        setVenues(nextVenues);
        setAreas(nextAreas);
        if (favoriteVenues.length > 0) setLocationChoice(`venue:${favoriteVenues[0]!.id}`);
        else if (nextAreas.length > 0) setLocationChoice(`area:${nextAreas[0]!.id}`);
        else if (nextVenues.length > 0) setLocationChoice(`venue:${nextVenues[0]!.id}`);
      })
      .catch(() => {
        setVenues([]);
        setAreas([]);
      });
  }, []);

  const selectedArea = locationChoice.startsWith('area:')
    ? areas.find((area) => `area:${area.id}` === locationChoice)
    : undefined;

  const createVenueFromArea = async (area: PreferredArea) =>
    locationApi.createVenue({
      name: area.label.trim().length >= 2 ? area.label.trim() : 'Game location',
      city: 'S\u00e3o Paulo',
      latitude: area.latitude,
      longitude: area.longitude,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
    });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const starts = `${String(form.get('date'))}T${String(form.get('time'))}:00`;
    const startsAt = new Date(starts);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now() + minimumStartLeadMs) {
      setError('Choose a start time at least 15 minutes from now.');
      return;
    }
    let gameVenueId = locationChoice.startsWith('venue:')
      ? locationChoice.replace('venue:', '')
      : '';
    if (!gameVenueId) {
      if (!selectedArea && !venueDraftReady(venueDraft)) {
        setError('Enter location name and city, or choose a saved location.');
        return;
      }
      try {
        const created = selectedArea
          ? await createVenueFromArea(selectedArea)
          : await createVenueFromDraft(venueDraft);
        gameVenueId = created.id;
        setVenues((current) => [...current, { id: created.id, name: created.name }]);
        setLocationChoice(`venue:${created.id}`);
        setVenueDraft(blankVenueDraft());
      } catch (cause: unknown) {
        setError(
          cause instanceof Error
            ? `Could not create location: ${cause.message}`
            : 'Could not create location. Check name, city, and address.',
        );
        return;
      }
    }
    const input: GameInput = {
      startsAt: startsAt.toISOString(),
      durationMinutes: Number(form.get('duration')) as 60 | 90 | 120,
      venueId: gameVenueId,
      capacity: Number(form.get('capacity')),
      minimumSkillLevel: String(form.get('minimum')) as GameSkillLevel,
      maximumSkillLevel: String(form.get('maximum')) as GameSkillLevel,
      visibility: String(form.get('visibility')) as GameVisibility,
      title: String(form.get('title') || '') || undefined,
      description: String(form.get('description') || '') || undefined,
    };
    try {
      const game = await gameApi.create(input);
      markGameAlertPromptReady();
      navigate(`/games/${game.id}`);
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError(cause.message);
      } else {
        setError('Could not create game. Check the date, venue, and skill range.');
      }
    }
  };
  return (
    <main className="shell">
      <Link className="text-link" to="/games">
        ← Games
      </Link>
      <p className="eyebrow">New game</p>
      <h1>Set up a game.</h1>
      <form className="card" onSubmit={save}>
        <label>
          Date
          <input
            name="date"
            type="date"
            min={todayInputValue()}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            required
          />
        </label>
        <label>
          Start time
          <input name="time" type="time" required />
        </label>
        <label>
          Duration
          <select name="duration" defaultValue="90">
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
            <option value="120">120 minutes</option>
          </select>
        </label>
        <section className="inline-panel" aria-label="Location">
          <h2>Location</h2>
          <label>
            Venue
            <select
              name="venueId"
              value={locationChoice}
              onChange={(event) => setLocationChoice(event.target.value)}
            >
              <option value="">Create a new court</option>
              {venues.length > 0 && (
                <optgroup label="Courts">
                  {venues.map((venue) => (
                    <option key={venue.id} value={`venue:${venue.id}`}>
                      {venue.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {areas.length > 0 && (
                <optgroup label="Saved areas">
                  {areas.map((area) => (
                    <option key={area.id} value={`area:${area.id}`}>
                      {area.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {selectedArea ? (
            <p className="hint">
              This game will use {selectedArea.label}. You can choose a saved court or create a new
              court instead.
            </p>
          ) : (
            <VenueForm draft={venueDraft} onChange={setVenueDraft} />
          )}
        </section>
        <label>
          Capacity
          <input name="capacity" type="number" min="2" max="12" defaultValue="4" required />
        </label>
        <div className="time-fields">
          <label>
            Minimum skill
            <select name="minimum" defaultValue="beginner">
              {levels.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            Maximum skill
            <select name="maximum" defaultValue="advanced">
              {levels.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Visibility
          <select name="visibility" defaultValue="link-only">
            <option value="link-only">Link-only</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label>
          Title (optional)
          <input name="title" maxLength={120} />
        </label>
        <label>
          Notes (optional)
          <textarea name="description" maxLength={2000} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" type="submit">
          Create game
        </button>
      </form>
    </main>
  );
}

export function GameDetailsPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const currentLocation = useLocation();
  const [game, setGame] = useState<Game | null>(null);
  const [preview, setPreview] = useState<GamePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    gameApi
      .get(id, params.get('access') ?? undefined)
      .then(setGame)
      .catch(() =>
        gameApi
          .preview(id, params.get('access') ?? undefined)
          .then((nextPreview) => {
            setPreview(nextPreview);
            setError('');
          })
          .catch(() => setError('Game unavailable or access link expired.')),
      );
  }, [id, params]);
  if (error)
    return (
      <main className="shell">
        <Link className="text-link" to="/games">
          ← Games
        </Link>
        <p className="error" role="alert">
          {error}
        </p>
      </main>
    );
  if (!game && preview)
    return (
      <main className="shell">
        <Link className="text-link" to="/games">
          &lt;- Games
        </Link>
        <p className="eyebrow">Game invitation</p>
        <h1>{preview.title || 'Beach volleyball game'}</h1>
        <section className="card">
          <p className="lead">{localDate(preview.startsAt)}</p>
          <p>
            <strong>{preview.venueName}</strong>
            {preview.addressLabel ? ` - ${preview.addressLabel}` : ''}
          </p>
          <p>
            {preview.openSlots} open {preview.openSlots === 1 ? 'slot' : 'slots'} -{' '}
            {label(preview.minimumSkillLevel)}-{label(preview.maximumSkillLevel)}
          </p>
          <Link
            className="button"
            to={`/login?returnTo=${encodeURIComponent(`${currentLocation.pathname}${currentLocation.search}`)}`}
            onClick={() =>
              localStorage.setItem(
                'borajogar_return_to',
                `${currentLocation.pathname}${currentLocation.search}`,
              )
            }
          >
            Sign in to join
          </Link>
        </section>
      </main>
    );
  if (!game)
    return (
      <main className="shell">
        <p>Loading game…</p>
      </main>
    );
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      markGameAlertPromptReady();
      const refreshed = await gameApi.get(id, params.get('access') ?? undefined);
      setGame(refreshed);
    } catch {
      setError('Could not update this game.');
    } finally {
      setBusy(false);
    }
  };
  const mapURL = `https://www.openstreetmap.org/?mlat=${game.latitude}&mlon=${game.longitude}#map=18/${game.latitude}/${game.longitude}`;
  return (
    <main className="shell">
      <Link className="text-link" to="/games">
        ← Games
      </Link>
      <p className="eyebrow">Game details</p>
      <h1>{game.title || 'Beach volleyball game'}</h1>
      <section className="card">
        <p className="lead">{localDate(game.startsAt)}</p>
        <p>
          <strong>{game.venueName}</strong>
          {game.addressLabel ? ` · ${game.addressLabel}` : ''}
        </p>
        <p className="calendar-links">
          <a className="text-link" href={mapURL} target="_blank" rel="noreferrer">
            Open venue map
          </a>
          <a
            className="text-link"
            href={gameApi.calendarURL(game.id, params.get('access') ?? undefined)}
          >
            Add to calendar
          </a>
        </p>
        <p>
          {label(game.minimumSkillLevel)}–{label(game.maximumSkillLevel)} · {game.openSlots} open
          slots
        </p>
        {game.description && <p>{game.description}</p>}
        <h2>Players</h2>
        {game.players?.map((player) => (
          <p key={player.id}>
            {player.displayName}
            {player.role === 'organizer' ? ' · organizer' : ''}
          </p>
        ))}
        {game.waitlist && game.waitlist.length > 0 && (
          <>
            <h2>Waitlist</h2>
            {game.waitlist.map((player) => (
              <p key={player.id}>{player.displayName}</p>
            ))}
          </>
        )}
        {game.currentUserStatus !== 'confirmed' && (
          <button className="button" disabled={busy} onClick={() => action(() => gameApi.join(id))}>
            Join game
          </button>
        )}
        {game.currentUserStatus === 'confirmed' && game.currentUserRole !== 'organizer' && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => action(() => gameApi.leave(id))}
          >
            Leave game
          </button>
        )}
      </section>
    </main>
  );
}
