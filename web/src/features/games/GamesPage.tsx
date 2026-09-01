import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
import { MapChooser } from './MapChooser';
import {
  blankVenueDraft,
  createVenueFromDraft,
  defaultCity,
  venueDraftReady,
  type VenueDraft,
} from '../locations/venueDraft';
import { markGameAlertPromptReady } from '../notifications/gameAlertPromptState';
import { formatDate, gameVisibilityLabels, skillLabel } from '../../i18n/pt-BR';
import { sortGamesForDisplay } from './gameOrdering';
import { DatePickerField, TimePickerField } from '../../components/DateTimePicker';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useOnlineStatus } from '../../platform/useOnlineStatus';
import { GameChat } from './GameChat';
import { isConfirmationWindowOpen } from './confirmation';

const levels: GameSkillLevel[] = [
  'learning',
  'beginner',
  'intermediate',
  'advanced',
  'competitive',
];
const label = skillLabel;
const localDate = (value: string) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });
const minimumStartLeadMs = 15 * 60 * 1000;

interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

type ProfileRequiredGoal = 'create_game' | 'join_game';
const joinProfileRequiredMessage = 'Informe seu nome e nível para entrar nesta partida.';

interface ConflictingGame {
  id: string;
  title?: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  addressLabel?: string;
}

function conflictingGameFromError(cause: unknown): ConflictingGame | null {
  if (!(cause instanceof ApiError) || cause.code !== 'conflicting_game') return null;
  const fields = cause.fields;
  if (!fields.gameId || !fields.startsAt || !fields.endsAt || !fields.venueName) return null;
  return {
    id: fields.gameId,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
    venueName: fields.venueName,
    ...(fields.title ? { title: fields.title } : {}),
    ...(fields.addressLabel ? { addressLabel: fields.addressLabel } : {}),
  };
}

function isProfileRequiredError(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && cause.code === 'profile_required';
}

function ProfileRequiredRecovery({
  message,
  goal,
  returnTo,
}: {
  message: string;
  goal: ProfileRequiredGoal;
  returnTo?: string;
}) {
  const handleClick = () => {
    localStorage.setItem('borajogar_onboarding_goal', goal);
    if (returnTo) localStorage.setItem('borajogar_return_to', returnTo);
    else localStorage.removeItem('borajogar_return_to');
  };

  return (
    <div className="feedback-error" role="alert">
      <p className="error">{message}</p>
      <Link className="button" to={`/onboarding?goal=${goal}`} onClick={handleClick}>
        {goal === 'join_game' ? 'Configurar perfil' : 'Completar perfil'}
      </Link>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await gameApi.list(false, nextPage);
      setGames((current) =>
        sortGamesForDisplay(append ? [...current, ...result.items] : result.items),
      );
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch {
      setError('Não foi possível carregar as partidas. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Partidas
      </Link>
      <p className="eyebrow">Partidas manuais</p>
      <h1>Vamos jogar.</h1>
      <p className="lead">Crie uma partida, compartilhe o link e preencha as vagas.</p>
      <div className="actions">
        <Link className="button" to="/games/new">
          Criar uma partida
        </Link>
      </div>
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      <section className="game-list">
        {loading && <p role="status">Carregando partidas...</p>}
        {!loading && games.length === 0 && !error && (
          <section className="card empty-state">
            <h2>Nenhuma partida futura ainda.</h2>
            <p className="hint">
              Crie uma partida ou ajuste sua disponibilidade para encontrar jogadores.
            </p>
            <Link className="button" to="/games/new">
              Criar uma partida
            </Link>
          </section>
        )}
        {games.map((game) => (
          <Link className="card game-card" key={game.id} to={`/games/${game.id}`}>
            <p className="eyebrow">
              {game.visibility === 'link-only' ? 'Somente com link' : 'Partida aberta'}
            </p>
            <h2>{game.title || 'Partida de vôlei de praia'}</h2>
            <p>
              {localDate(game.startsAt)} · {game.venueName}
            </p>
            <p>
              {game.openSlots > 0
                ? `${game.openSlots} ${game.openSlots === 1 ? 'vaga disponível' : 'vagas disponíveis'}`
                : 'Partida lotada'}{' '}
              · {label(game.minimumSkillLevel)}–{label(game.maximumSkillLevel)}
            </p>
          </Link>
        ))}
      </section>
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

export function CreateGamePage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [profileRequired, setProfileRequired] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [locationChoice, setLocationChoice] = useState('');
  const [venueDraft, setVenueDraft] = useState<VenueDraft>(blankVenueDraft());
  const [saving, setSaving] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [confirmationEnabled, setConfirmationEnabled] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationError, setLocationError] = useState('');
  const isOnline = useOnlineStatus();
  const loadLocations = useCallback(() => {
    setLoadingLocations(true);
    setLocationError('');
    return Promise.all([
      locationApi.favoriteVenues(),
      locationApi.venues(),
      locationApi.preferredAreas(),
    ])
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
        const defaultLocation = favoriteVenues.length
          ? `venue:${favoriteVenues[0]!.id}`
          : nextAreas.length
            ? `area:${nextAreas[0]!.id}`
            : nextVenues.length
              ? `venue:${nextVenues[0]!.id}`
              : '';
        if (defaultLocation) setLocationChoice((current) => current || defaultLocation);
      })
      .catch(() => {
        setVenues([]);
        setAreas([]);
        setLocationError('Não foi possível carregar seus locais. Tente novamente.');
      })
      .finally(() => {
        setLoadingLocations(false);
      });
  }, []);
  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const selectedArea = locationChoice.startsWith('area:')
    ? areas.find((area) => `area:${area.id}` === locationChoice)
    : undefined;

  const createVenueFromArea = async (area: PreferredArea) =>
    locationApi.createVenue({
      name: area.label.trim().length >= 2 ? area.label.trim() : 'Local da partida',
      city: defaultCity,
      latitude: area.latitude,
      longitude: area.longitude,
      lightingStatus: 'unknown',
      surfaceType: 'sand',
      accessType: 'unknown',
    });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setProfileRequired(false);
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de criar uma partida.');
      return;
    }
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const date = String(form.get('date') ?? '');
      const time = String(form.get('time') ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        setError('Escolha uma data e um horário válidos.');
        return;
      }
      const starts = `${date}T${time}:00`;
      const startsAt = new Date(starts);
      if (
        Number.isNaN(startsAt.getTime()) ||
        startsAt.getTime() <= Date.now() + minimumStartLeadMs
      ) {
        setError('Escolha um horário de início com pelo menos 15 minutos de antecedência.');
        return;
      }
      const capacity = Number(form.get('capacity'));
      const minimumSkillLevel = String(form.get('minimum')) as GameSkillLevel;
      const maximumSkillLevel = String(form.get('maximum')) as GameSkillLevel;
      if (!Number.isInteger(capacity) || capacity < 2 || capacity > 12) {
        setError('Escolha entre 2 e 12 jogadores.');
        return;
      }
      if (levels.indexOf(minimumSkillLevel) > levels.indexOf(maximumSkillLevel)) {
        setError('A habilidade mínima não pode ser maior que a máxima.');
        return;
      }
      const waitlistSize = waitlistEnabled ? Number(form.get('waitlistSize')) : 0;
      if (
        waitlistEnabled &&
        (!Number.isInteger(waitlistSize) || waitlistSize < 1 || waitlistSize > 12)
      ) {
        setError('Escolha entre 1 e 12 pessoas na lista de espera.');
        return;
      }
      const submittedLocation = locationChoice;
      let gameVenueId = submittedLocation.startsWith('venue:')
        ? submittedLocation.replace('venue:', '')
        : '';
      if (!gameVenueId) {
        if (!selectedArea && !venueDraftReady(venueDraft)) {
          setError('Informe o nome e selecione um local no Google Maps ou escolha um local salvo.');
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
          setProfileRequired(isProfileRequiredError(cause));
          setError(
            cause instanceof ApiError
              ? `Não foi possível criar o local: ${cause.message}`
              : 'Não foi possível criar o local. Verifique o nome e a seleção no Google Maps.',
          );
          return;
        }
      }
      const input: GameInput = {
        startsAt: startsAt.toISOString(),
        durationMinutes: Number(form.get('duration')) as 60 | 90 | 120,
        venueId: gameVenueId,
        capacity,
        waitlistEnabled,
        waitlistSize,
        confirmationEnabled,
        minimumSkillLevel,
        maximumSkillLevel,
        visibility: String(form.get('visibility')) as GameVisibility,
        title: String(form.get('title') || '') || undefined,
        description: String(form.get('description') || '') || undefined,
      };
      try {
        const game = await gameApi.create(input);
        markGameAlertPromptReady();
        navigate(game.shareUrl ?? `/games/${game.id}`);
      } catch (cause: unknown) {
        setProfileRequired(isProfileRequiredError(cause));
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Não foi possível criar a partida. Verifique data, local e faixa de habilidade.',
        );
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="shell">
      <Link className="text-link" to="/games">
        ← Partidas
      </Link>
      <p className="eyebrow">Nova partida</p>
      <h1>Configure uma partida.</h1>
      <form className="card" onSubmit={save}>
        <DatePickerField
          name="date"
          label="Data"
          min={todayInputValue()}
          value={selectedDate}
          onChange={setSelectedDate}
          required
        />
        <TimePickerField
          name="time"
          label="Horário de início"
          value={selectedTime}
          onChange={setSelectedTime}
          required
        />
        <label>
          Duração
          <select name="duration" defaultValue="90">
            <option value="60">60 minutos</option>
            <option value="90">90 minutos</option>
            <option value="120">120 minutos</option>
          </select>
        </label>
        <section className="inline-panel" aria-label="Local">
          <h2>Local</h2>
          {loadingLocations && <p role="status">Carregando locais...</p>}
          {locationError && (
            <div className="feedback-error" role="alert">
              <p className="error">{locationError}</p>
              <button className="text-button" type="button" onClick={() => void loadLocations()}>
                Tentar novamente
              </button>
            </div>
          )}
          <label>
            Quadra
            <select
              name="venueId"
              value={locationChoice}
              disabled={loadingLocations || saving}
              onChange={(event) => setLocationChoice(event.target.value)}
            >
              <option value="">Criar uma nova quadra</option>
              {venues.length > 0 && (
                <optgroup label="Quadras">
                  {venues.map((venue) => (
                    <option key={venue.id} value={`venue:${venue.id}`}>
                      {venue.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {areas.length > 0 && (
                <optgroup label="Áreas salvas">
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
              Esta partida usará {selectedArea.label}. Você pode escolher uma quadra salva ou criar
              uma nova.
            </p>
          ) : locationChoice.startsWith('venue:') ? (
            <p className="hint">
              Esta partida usará{' '}
              {venues.find((venue) => `venue:${venue.id}` === locationChoice)?.name ??
                'a quadra selecionada'}
              .
            </p>
          ) : (
            <VenueForm draft={venueDraft} onChange={setVenueDraft} disabled={!isOnline} />
          )}
        </section>
        <label>
          Número de jogadores
          <input name="capacity" type="number" min="2" max="12" defaultValue="4" required />
        </label>
        <label>
          <span>Ativar lista de espera</span>
          <input
            name="waitlistEnabled"
            type="checkbox"
            checked={waitlistEnabled}
            onChange={(event) => setWaitlistEnabled(event.target.checked)}
          />
        </label>
        {waitlistEnabled && (
          <label>
            Tamanho da lista de espera
            <input name="waitlistSize" type="number" min="1" max="12" defaultValue="1" required />
          </label>
        )}
        <label>
          <span>{'Ativar confirma\u00e7\u00e3o de presen\u00e7a'}</span>
          <input
            name="confirmationEnabled"
            type="checkbox"
            checked={confirmationEnabled}
            onChange={(event) => setConfirmationEnabled(event.target.checked)}
          />
        </label>
        <div className="time-fields skill-fields">
          <label>
            Habilidade mínima
            <select name="minimum" defaultValue="beginner">
              {levels.map((level) => (
                <option key={level} value={level}>
                  {label(level)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Habilidade máxima
            <select name="maximum" defaultValue="advanced">
              {levels.map((level) => (
                <option key={level} value={level}>
                  {label(level)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Visibilidade
          <select name="visibility" defaultValue="link-only">
            <option value="link-only">{gameVisibilityLabels['link-only']}</option>
            <option value="public">{gameVisibilityLabels.public}</option>
            <option value="private">{gameVisibilityLabels.private}</option>
          </select>
        </label>
        <label>
          Título (opcional)
          <input name="title" maxLength={120} />
        </label>
        <label>
          Observações (opcional)
          <textarea name="description" maxLength={2000} />
        </label>
        {error &&
          (profileRequired ? (
            <ProfileRequiredRecovery message={error} goal="create_game" />
          ) : (
            <p className="error" role="alert">
              {error}
            </p>
          ))}
        <button className="button" type="submit" disabled={saving || !isOnline}>
          {saving ? 'Criando partida...' : 'Criar partida'}
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
  const [profileRequired, setProfileRequired] = useState(false);
  const [conflictingGame, setConflictingGame] = useState<ConflictingGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [confirmationNow, setConfirmationNow] = useState(() => Date.now());
  const isOnline = useOnlineStatus();
  useEffect(() => {
    const timer = window.setInterval(() => setConfirmationNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setError('');
    setProfileRequired(false);
    setConflictingGame(null);
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
          .catch(() => setError('Partida indisponível ou link de acesso expirado.')),
      );
  }, [id, params]);
  if (error && !game)
    return (
      <main className="shell">
        <Link className="text-link" to="/games">
          ← Partidas
        </Link>
        {profileRequired ? (
          <ProfileRequiredRecovery
            message={joinProfileRequiredMessage}
            goal="join_game"
            returnTo={`${currentLocation.pathname}${currentLocation.search}`}
          />
        ) : (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  if (!game && preview)
    return (
      <main className="shell">
        <Link className="text-link" to="/games">
          ← Partidas
        </Link>
        <p className="eyebrow">Convite para partida</p>
        <h1>{preview.title || 'Partida de vôlei de praia'}</h1>
        <section className="card">
          <p className="lead">{localDate(preview.startsAt)}</p>
          <p>
            <strong>{preview.venueName}</strong>
            {preview.addressLabel ? ` - ${preview.addressLabel}` : ''}
          </p>
          <p>
            {preview.confirmedPlayers}/{preview.capacity} jogadores · {preview.openSlots}{' '}
            {preview.openSlots === 1 ? 'vaga disponível' : 'vagas disponíveis'} ·{' '}
            {label(preview.minimumSkillLevel)}-{label(preview.maximumSkillLevel)}
          </p>
          {preview.openSlots > 0 || preview.waitlistEnabled ? (
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
              {preview.openSlots > 0 ? 'Entre para participar' : 'Entre para entrar na espera'}
            </Link>
          ) : (
            <p className="hint">Esta partida está lotada e não tem lista de espera.</p>
          )}
        </section>
      </main>
    );
  if (!game)
    return (
      <main className="shell">
        <p>Carregando partida…</p>
      </main>
    );
  const action = async (fn: () => Promise<unknown>) => {
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de atualizar esta partida.');
      return;
    }
    setBusy(true);
    setError('');
    setProfileRequired(false);
    setConflictingGame(null);
    try {
      await fn();
      markGameAlertPromptReady();
      const refreshed = await gameApi.get(id, params.get('access') ?? undefined);
      setGame(refreshed);
    } catch (cause: unknown) {
      const nextConflictingGame = conflictingGameFromError(cause);
      setProfileRequired(isProfileRequiredError(cause));
      setConflictingGame(nextConflictingGame);
      setError(
        cause instanceof ApiError ? cause.message : 'Não foi possível atualizar esta partida.',
      );
    } finally {
      setBusy(false);
    }
  };
  const accessToken = params.get('access');
  const sharePath =
    game.shareUrl ??
    (game.visibility === 'link-only'
      ? accessToken
        ? `${currentLocation.pathname}?access=${encodeURIComponent(accessToken)}`
        : undefined
      : currentLocation.pathname);
  const shareURL =
    game.currentUserRole === 'organizer' && sharePath
      ? new URL(sharePath, window.location.origin).toString()
      : '';
  const copyShareURL = async () => {
    if (!shareURL) return;
    if (!navigator.clipboard) {
      setShareMessage('Copie o link manualmente.');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareURL);
      setShareMessage('Link copiado.');
    } catch {
      setShareMessage('Não foi possível copiar. Copie o link manualmente.');
    }
  };
  const removePlayer = (playerID: string, displayName: string) => {
    setConfirmation({
      title: 'Remover jogador?',
      message: `${displayName} perderá a vaga nesta partida.`,
      confirmLabel: 'Remover jogador',
      onConfirm: () => {
        setConfirmation(null);
        void action(() => gameApi.removePlayer(id, playerID));
      },
    });
  };
  const cancelGame = () => {
    setConfirmation({
      title: 'Cancelar partida?',
      message: 'Todos os jogadores serão avisados e a partida não acontecerá.',
      confirmLabel: 'Cancelar partida',
      onConfirm: () => {
        setConfirmation(null);
        void action(() => gameApi.cancel(id));
      },
    });
  };
  const confirmationWindowOpen = isConfirmationWindowOpen(game, confirmationNow);
  return (
    <main className="shell">
      <Link className="text-link" to="/games">
        ← Partidas
      </Link>
      <p className="eyebrow">Detalhes da partida</p>
      <h1>{game.title || 'Partida de vôlei de praia'}</h1>
      {game.status === 'cancelled' && (
        <section className="cancellation-banner" role="alert" aria-label="Partida cancelada">
          <strong>Partida cancelada</strong>
          <span>Esta partida não acontecerá.</span>
        </section>
      )}
      <section className="card">
        <p className="lead">{localDate(game.startsAt)}</p>
        <p>
          <strong>{game.venueName}</strong>
          {game.addressLabel ? ` · ${game.addressLabel}` : ''}
        </p>
        <div className="calendar-links">
          <MapChooser
            latitude={game.latitude}
            longitude={game.longitude}
            label={`${game.venueName}${game.addressLabel ? `, ${game.addressLabel}` : ''}`}
          />
          {game.status !== 'cancelled' && (
            <a
              className="text-link"
              href={gameApi.calendarURL(game.id, params.get('access') ?? undefined)}
            >
              Adicionar ao calendário
            </a>
          )}
        </div>
        <p>
          {game.confirmedPlayers}/{game.capacity} jogadores · {game.openSlots}{' '}
          {game.openSlots === 1 ? 'vaga disponível' : 'vagas disponíveis'} ·{' '}
          {label(game.minimumSkillLevel)}–{label(game.maximumSkillLevel)}
        </p>
        {game.status === 'scheduled' && game.openSlots === 0 && !game.waitlistEnabled && (
          <p className="hint">Esta partida está lotada e não tem lista de espera.</p>
        )}
        {game.description && <p>{game.description}</p>}
        {game.currentUserStatus === 'removed' && (
          <p className="error" role="alert">
            O organizador removeu você desta partida.
          </p>
        )}
        {error &&
          (profileRequired ? (
            <ProfileRequiredRecovery
              message={joinProfileRequiredMessage}
              goal="join_game"
              returnTo={`${currentLocation.pathname}${currentLocation.search}`}
            />
          ) : (
            <div className="feedback-error" role="alert">
              <p className="error">{error}</p>
              {conflictingGame && (
                <>
                  <p>
                    Partida conflitante:{' '}
                    <strong>{conflictingGame.title || 'Partida de vôlei de praia'}</strong>
                    {' · '}
                    {localDate(conflictingGame.startsAt)}
                    {' · '}
                    {conflictingGame.venueName}
                  </p>
                  <Link className="button" to={`/games/${conflictingGame.id}`}>
                    Ver partida conflitante
                  </Link>
                </>
              )}
            </div>
          ))}
        {game.status !== 'cancelled' && shareURL && game.currentUserRole === 'organizer' && (
          <section className="inline-panel" aria-label="Link da partida">
            <h2>Link para convidar jogadores</h2>
            <input aria-label="Link da partida" readOnly value={shareURL} />
            <button
              className="text-button"
              type="button"
              disabled={!isOnline}
              onClick={() => void copyShareURL()}
            >
              Copiar link
            </button>
            {shareMessage && (
              <p className="hint" role="status">
                {shareMessage}
              </p>
            )}
          </section>
        )}
        <h2>Jogadores</h2>
        {game.confirmation?.enabled && game.currentUserStatus === 'confirmed' && (
          <section
            className="inline-panel confirmation-panel"
            aria-label={'Confirma\u00e7\u00e3o de presen\u00e7a'}
          >
            <p>
              {'Confirma\u00e7\u00f5es: '}
              {game.confirmation.confirmedCount}/{game.confirmation.totalPlayers}
            </p>
            {!confirmationWindowOpen && game.status === 'scheduled' && (
              <p className="hint">
                {'A confirma\u00e7\u00e3o estar\u00e1 dispon\u00edvel 24 horas antes da partida.'}
              </p>
            )}
          </section>
        )}
        {game.players?.map((player) => (
          <p key={player.id}>
            <Link
              className="text-link"
              to={`/players/${player.id}?gameId=${encodeURIComponent(game.id)}`}
            >
              {player.displayName}
            </Link>
            {player.role === 'organizer' ? ' · organizador' : ''}
            {game.confirmation?.enabled && (
              <label className="confirmation-player">
                <span className="sr-only">
                  {'Confirmar presen\u00e7a de '}
                  {player.displayName}
                </span>
                <input
                  className="confirmation-checkbox"
                  type="checkbox"
                  checked={player.confirmationConfirmed === true}
                  disabled={!player.isCurrentUser || busy || !isOnline || !confirmationWindowOpen}
                  aria-label={`Confirmar presen\u00e7a de ${player.displayName}`}
                  onChange={(event) =>
                    void action(() => gameApi.setConfirmation(id, event.currentTarget.checked))
                  }
                />
                <span className="confirmation-status">
                  {player.confirmationConfirmed ? 'Confirmado' : 'Ainda n\u00e3o confirmado'}
                </span>
              </label>
            )}
          </p>
        ))}
        {game.status !== 'cancelled' &&
          game.currentUserRole === 'organizer' &&
          game.players?.some((player) => player.role !== 'organizer') && (
            <section className="inline-panel" aria-label="Gerenciar jogadores">
              <h2>Gerenciar jogadores</h2>
              <div className="player-removal-actions">
                {game.players
                  ?.filter((player) => player.role !== 'organizer')
                  .map((player) => (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      key={player.id}
                      onClick={() => removePlayer(player.id, player.displayName)}
                    >
                      Remover {player.displayName}
                    </button>
                  ))}
              </div>
            </section>
          )}
        {game.waitlistEnabled && (
          <p className="hint">
            Lista de espera: {game.waitlistCount}/{game.waitlistSize}
          </p>
        )}
        {game.waitlist && game.waitlist.length > 0 && (
          <>
            <h2>Lista de espera</h2>
            {game.waitlist.map((player) => (
              <p key={player.id}>{player.displayName}</p>
            ))}
          </>
        )}
        {game.status !== 'cancelled' &&
          game.currentUserStatus !== 'confirmed' &&
          game.currentUserStatus !== 'removed' &&
          (game.openSlots > 0 ||
            (game.waitlistEnabled && game.currentUserStatus !== 'waitlisted')) && (
            <button
              className="button"
              disabled={busy || !isOnline}
              onClick={() => action(() => gameApi.join(id))}
            >
              {game.currentUserStatus === 'waitlisted'
                ? 'Tentar pegar a vaga'
                : game.openSlots > 0
                  ? 'Participar da partida'
                  : 'Entrar na lista de espera'}
            </button>
          )}
        {game.status !== 'cancelled' && game.currentUserStatus === 'waitlisted' && (
          <button
            className="text-button"
            disabled={busy || !isOnline}
            onClick={() => action(() => gameApi.leaveWaitlist(id))}
          >
            Sair da lista de espera
          </button>
        )}
        {game.status !== 'cancelled' &&
          game.currentUserStatus === 'confirmed' &&
          game.currentUserRole !== 'organizer' && (
            <button
              className="text-button"
              disabled={busy || !isOnline}
              onClick={() => action(() => gameApi.leave(id))}
            >
              Sair da partida
            </button>
          )}
        {game.status === 'scheduled' && game.currentUserRole === 'organizer' && (
          <button
            className="text-button danger"
            type="button"
            disabled={busy || !isOnline}
            onClick={cancelGame}
          >
            Cancelar partida
          </button>
        )}
      </section>
      {game.currentUserStatus === 'confirmed' && (
        <GameChat gameId={game.id} isOnline={isOnline} canSend={game.status === 'scheduled'} />
      )}
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </main>
  );
}
