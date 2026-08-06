import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ApiError,
  authApi,
  profileApi,
  type CurrentUser,
  type PlayingStyle,
  type Profile,
  type SkillLevel,
} from '../api/client';
import { LocationSetup, LocationsPage } from '../features/locations/LocationsPage';
import { AvailabilityEditor, AvailabilityPage } from '../features/availability/AvailabilityPage';
import { CreateGamePage, GameDetailsPage, GamesPage } from '../features/games/GamesPage';
import { CalendarPage } from '../features/games/CalendarPage';
import { DashboardPage } from '../features/games/DashboardPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { blankProfile, skills, styles } from '../features/onboarding/options';
import { AppShell } from '../platform/AppShell';
import { getDeviceTimeZone } from '../platform/timeZone';

function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ['current-user'],
    queryFn: authApi.currentUser,
    retry: false,
  });
}

function safeAppPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '';
  return value;
}

function Home() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;
  const primaryAction = user ? (
    <Link className="button" to={user.onboardingComplete ? '/dashboard' : '/onboarding'}>
      {user.onboardingComplete ? 'Ir para o painel' : 'Continuar configuração'}
    </Link>
  ) : (
    <Link className="button" to="/start">
      Começar
    </Link>
  );
  const secondaryAction =
    user && user.onboardingComplete ? (
      <Link className="text-link" to="/games/new">
        Criar uma partida
      </Link>
    ) : currentUser.isPending || user ? null : (
      <Link className="text-link" to="/login">
        Já tem uma conta? Entrar
      </Link>
    );

  return (
    <main className="shell">
      <p className="eyebrow">Bora Jogar</p>
      <h1>Encontre pessoas para jogar vôlei de praia</h1>
      <p className="lead">
        Conte quando e onde você pode jogar. A gente ajuda a completar seu grupo.
      </p>
      <div className="actions">
        {primaryAction}
        {secondaryAction}
      </div>
      <section className="card">
        <p>Combine horários compatíveis</p>
        <p>Encontre jogadores do seu nível</p>
        <p>Organize partidas com amigos</p>
      </section>
    </main>
  );
}

function Start() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;
  const choose = (goal: string, returnTo?: string) => {
    localStorage.setItem('borajogar_onboarding_goal', goal);
    if (returnTo) localStorage.setItem('borajogar_return_to', returnTo);
    else localStorage.removeItem('borajogar_return_to');
  };
  const routeFor = (goal: 'find_people' | 'create_game' | 'join_game') => {
    if (!user) {
      if (goal === 'create_game') return '/login?returnTo=/onboarding?goal=create_game';
      if (goal === 'join_game') return '/login?returnTo=/onboarding?goal=join_game';
      return '/login?returnTo=/onboarding';
    }
    if (user.onboardingComplete) {
      if (goal === 'create_game') return '/games/new';
      if (goal === 'join_game') return '/games';
      return '/dashboard';
    }
    if (goal === 'create_game') return '/onboarding?goal=create_game';
    if (goal === 'join_game') return '/onboarding?goal=join_game';
    return '/onboarding';
  };
  const returnToFor = (goal: 'find_people' | 'create_game' | 'join_game') =>
    user ? undefined : routeFor(goal).replace('/login?returnTo=', '');

  return (
    <main className="shell">
      <p className="eyebrow">Primeiro passo</p>
      <h1>O que você gostaria de fazer primeiro?</h1>
      {currentUser.isPending ? (
        <p className="lead">Verificando sua sessão...</p>
      ) : (
        <div className="choice-list goal-list">
          <Link
            className="choice"
            to={routeFor('find_people')}
            onClick={() => choose('find_people', returnToFor('find_people'))}
          >
            <strong>Encontrar pessoas para jogar</strong>
            <span>Defina sua disponibilidade e receba sugestões de partidas.</span>
          </Link>
          <Link
            className="choice"
            to={routeFor('create_game')}
            onClick={() => choose('create_game', returnToFor('create_game'))}
          >
            <strong>Criar uma partida</strong>
            <span>Escolha horário e local, depois convide jogadores.</span>
          </Link>
          <Link
            className="choice"
            to={routeFor('join_game')}
            onClick={() => choose('join_game', returnToFor('join_game'))}
          >
            <strong>Entrar em uma partida</strong>
            <span>Abra um convite ou explore partidas disponíveis.</span>
          </Link>
        </div>
      )}
    </main>
  );
}
function Login() {
  const [params] = useSearchParams();
  const invitation = params.get('invite');
  const returnTo = safeAppPath(
    params.get('returnTo') ?? localStorage.getItem('borajogar_return_to'),
  );
  const error = params.get('error');
  const currentUser = useCurrentUser();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const url = new URL('/api/v1/auth/google', window.location.origin);
  if (invitation) url.searchParams.set('invitation', invitation);
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const result =
        mode === 'signup'
          ? await authApi.emailSignup({
              email: String(form.get('email')),
              password: String(form.get('password')),
              displayName: String(form.get('displayName')),
              returnTo,
            })
          : await authApi.emailLogin({
              email: String(form.get('email')),
              password: String(form.get('password')),
              returnTo,
            });
      window.location.assign(result.redirectTo);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };
  if (currentUser.data) {
    return (
      <Navigate
        replace
        to={returnTo || (currentUser.data.onboardingComplete ? '/dashboard' : '/onboarding')}
      />
    );
  }

  return (
    <main className="shell">
      <Link className="text-link" to="/">
        Início
      </Link>
      <p className="eyebrow">Acesso de jogador</p>
      <h1>Entre para jogar.</h1>
      <p className="lead">Use e-mail e senha ou continue com o Google.</p>
      {error && (
        <p className="error" role="alert">
          Não foi possível concluir o acesso. Tente novamente.
        </p>
      )}
      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}
      <div className="actions">
        <button
          className={mode === 'signup' ? 'button' : 'text-button'}
          type="button"
          onClick={() => setMode('signup')}
        >
          Criar conta
        </button>
        <button
          className={mode === 'login' ? 'button' : 'text-button'}
          type="button"
          onClick={() => setMode('login')}
        >
          Entrar
        </button>
      </div>
      <form className="card" onSubmit={submitEmail}>
        {mode === 'signup' && (
          <label>
            Nome exibido
            <input name="displayName" autoComplete="name" />
          </label>
        )}
        <label>
          E-mail
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Processando...' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
        </button>
      </form>
      <a className="button" href={url.toString()}>
        Continuar com o Google
      </a>
      {invitation && <p className="hint">Código de convite pronto para entrar com o Google.</p>}
    </main>
  );
}
function Invite() {
  const { code } = useParams();
  return <Navigate replace to={`/login?invite=${encodeURIComponent(code ?? '')}`} />;
}

export function LegacyOnboarding() {
  const saved = localStorage.getItem('borajogar_onboarding');
  const initial = saved
    ? (JSON.parse(saved) as { step: number; profile: typeof blankProfile })
    : { step: 0, profile: blankProfile };
  const [step, setStep] = useState(initial.step);
  const [profile, setProfile] = useState(initial.profile);
  const [error, setError] = useState('');
  const total = 9;
  useEffect(() => {
    setProfile((current) => ({ ...current, timeZone: getDeviceTimeZone() }));
    authApi
      .currentUser()
      .then((user) =>
        setProfile((current) => ({
          ...current,
          displayName: current.displayName.trim() ? current.displayName : user.displayName,
          timeZone: getDeviceTimeZone() || user.timeZone || 'America/Sao_Paulo',
        })),
      )
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    localStorage.setItem('borajogar_onboarding', JSON.stringify({ step, profile }));
  }, [step, profile]);
  const update = <K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));
  const next = async () => {
    setError('');
    if (step === 1 && profile.displayName.trim().length < 2) {
      setError('Escolha um nome com pelo menos 2 caracteres.');
      return;
    }
    if (step === 2 && !profile.skillLevel) {
      setError('Escolha um nível de habilidade.');
      return;
    }
    if (step === 3 && profile.styles.length === 0) {
      setError('Escolha pelo menos um estilo.');
      return;
    }
    try {
      await profileApi.saveProgress(Math.min(step + 1, 8), [
        ...Array.from({ length: step + 1 }, (_, i) => i),
      ]);
    } catch {
      /* Auth/API may be unavailable during local shell use; local progress remains. */
    }
    if (step < total - 1) setStep(step + 1);
    else {
      try {
        await profileApi.update(profile);
        await profileApi.complete();
        localStorage.setItem('borajogar_install_prompt_ready', 'true');
        localStorage.removeItem('borajogar_onboarding');
      } catch {
        setError('Não foi possível salvar o perfil. Verifique a conexão e tente novamente.');
        return;
      }
      setStep(total);
    }
  };
  if (step === total)
    return (
      <main className="shell">
        <p className="eyebrow">Tudo pronto</p>
        <h1>Perfil completo.</h1>
        <p className="lead">Agora você pode descobrir partidas e receber propostas compatíveis.</p>
        <Link className="button" to="/profile">
          Ver perfil
        </Link>
      </main>
    );
  return (
    <main className="shell onboarding">
      <p className="eyebrow">
        Etapa {step + 1} de {total}
      </p>
      <progress value={step + 1} max={total} />
      <h1>
        {
          [
            'Bem-vindo ao Bora Jogar',
            'Seu nome',
            'Seu nível de jogo',
            'Seu estilo de jogo',
            'Fuso horário',
            'Locais preferidos',
            'Disponibilidade semanal',
            'Notificações',
            'Revisão',
          ][step]
        }
      </h1>
      <p className="lead">
        {step === 0 &&
          'Encontre jogadores de vôlei de praia compatíveis sem mensagens intermináveis em grupos.'}
        {step === 1 && 'Use o nome que os outros jogadores devem ver.'}
        {step === 2 && 'Escolha a descrição que mais combina com você hoje.'}
        {step === 3 &&
          'Escolha um ou mais. Isso ajuda nas combinações, mas nunca impede uma boa partida.'}
        {step === 4 &&
          `Encontramos ${profile.timeZone}. As partidas aparecem no seu horário local.`}
        {step === 5 && 'Agora, escolha quadras ou áreas onde você gosta de jogar.'}
        {step === 6 && 'Agora, conte quando você geralmente tem tempo.'}
        {step === 7 &&
          'Vamos explicar propostas e lembretes de partidas quando as notificações estiverem disponíveis.'}
        {step === 8 && 'Confira seus dados antes de entrar na comunidade.'}
      </p>
      {step === 1 && (
        <label>
          Nome exibido
          <input
            value={profile.displayName}
            onChange={(e) => update('displayName', e.target.value)}
            autoFocus
          />
        </label>
      )}
      {step === 2 && (
        <div className="choice-list">
          {skills.map((skill) => (
            <button
              className={profile.skillLevel === skill.value ? 'choice selected' : 'choice'}
              key={skill.value}
              onClick={() => update('skillLevel', skill.value)}
            >
              <strong>{skill.label}</strong>
              <span>{skill.description}</span>
            </button>
          ))}
        </div>
      )}
      {step === 3 && (
        <div className="checks">
          {styles.map((style) => (
            <label key={style.value}>
              <input
                type="checkbox"
                checked={profile.styles.includes(style.value)}
                onChange={(e) =>
                  update(
                    'styles',
                    e.target.checked
                      ? [...profile.styles, style.value]
                      : profile.styles.filter((item) => item !== style.value),
                  )
                }
              />
              {style.label}
            </label>
          ))}
        </div>
      )}
      {step === 4 && <p className="card">Fuso horário: {profile.timeZone}</p>}
      {step === 5 && <LocationSetup compact />}
      {step === 6 && <AvailabilityEditor compact />}
      {step === 8 && (
        <section className="card summary">
          <p>
            <strong>{profile.displayName || 'Seu nome'}</strong>
          </p>
          <p>{skills.find((skill) => skill.value === profile.skillLevel)?.label}</p>
          <p>
            {profile.styles
              .map((style) => styles.find((item) => item.value === style)?.label)
              .join(', ')}
          </p>
          <p>{profile.timeZone}</p>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="button" onClick={next}>
          {step === total - 1
            ? 'Concluir configuração'
            : step === 0
              ? 'Vamos começar'
              : 'Continuar'}
        </button>
        {step > 0 && (
          <button className="text-button" onClick={() => setStep(step - 1)}>
            Voltar
          </button>
        )}
      </div>
    </main>
  );
}

function ProfilePage() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    if (!currentUser.data) return;
    setError('');
    profileApi
      .get()
      .then((nextProfile) => setProfile(nextProfile))
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 401
            ? 'Entre para ver seu perfil.'
            : 'Conclua a configuração do perfil antes de visualizá-lo.',
        ),
      );
  }, [currentUser.data]);
  if (currentUser.isPending)
    return (
      <main className="shell">
        <p>Carregando perfil...</p>
      </main>
    );
  if (!currentUser.data)
    return (
      <main className="shell">
        <p className="error">Entre para ver seu perfil.</p>
        <Link to="/login">Entrar</Link>
      </main>
    );
  if (error)
    return (
      <main className="shell">
        <p className="error">{error}</p>
        <Link to={error.startsWith('Entre para') ? '/login' : '/onboarding'}>
          {error.startsWith('Entre para') ? 'Entrar' : 'Continuar configuração'}
        </Link>
      </main>
    );
  if (!profile)
    return (
      <main className="shell">
        <p>Carregando perfil…</p>
      </main>
    );
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const updated = await profileApi.update({
        displayName: String(form.get('displayName')),
        timeZone: String(form.get('timeZone')),
        skillLevel: String(form.get('skillLevel')) as SkillLevel,
        bio: String(form.get('bio')),
        styles: Array.from(form.getAll('styles')).map(String) as PlayingStyle[],
        preferredGameDurationMinutes: Number(form.get('duration')) as 60 | 90 | 120,
        minimumNoticeMinutes: Number(form.get('notice')),
        activeForMatchmaking: form.get('active') === 'on',
      });
      setProfile(updated);
      setEditing(false);
    } catch {
      setError('Não foi possível salvar o perfil. Verifique os campos e tente novamente.');
    }
  };
  const signOut = async () => {
    setError('');
    setSigningOut(true);
    try {
      await authApi.logout();
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch {
      setError('Não foi possível sair. Verifique a conexão e tente novamente.');
      setSigningOut(false);
    }
  };
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <p className="eyebrow">Seu perfil</p>
      <h1>{profile.displayName}</h1>
      {editing ? (
        <form className="card" onSubmit={save}>
          <label>
            Nome exibido
            <input name="displayName" defaultValue={profile.displayName} required minLength={2} />
          </label>
          <label>
            Nível de habilidade
            <select name="skillLevel" defaultValue={profile.skillLevel}>
              {skills.map((skill) => (
                <option key={skill.value} value={skill.value}>
                  {skill.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Estilos de jogo</legend>
            {styles.map((style) => (
              <label className="checks" key={style.value}>
                <span>
                  <input
                    name="styles"
                    type="checkbox"
                    value={style.value}
                    defaultChecked={profile.styles.includes(style.value)}
                  />{' '}
                  {style.label}
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Biografia
            <textarea name="bio" defaultValue={profile.bio} maxLength={280} />
          </label>
          <label>
            Fuso horário
            <input name="timeZone" defaultValue={profile.timeZone} required />
          </label>
          <label>
            Duração preferida
            <select name="duration" defaultValue={profile.preferredGameDurationMinutes}>
              <option value="60">60 minutos</option>
              <option value="90">90 minutos</option>
              <option value="120">120 minutos</option>
            </select>
          </label>
          <label>
            Antecedência mínima (minutos)
            <input
              name="notice"
              type="number"
              min="0"
              max="10080"
              defaultValue={profile.minimumNoticeMinutes}
            />
          </label>
          <label className="checks">
            <span>
              <input name="active" type="checkbox" defaultChecked={profile.activeForMatchmaking} />{' '}
              Disponível para combinações
            </span>
          </label>
          <button className="button" type="submit">
            Salvar alterações
          </button>
        </form>
      ) : (
        <section className="card">
          <p className="lead">
            {skills.find((skill) => skill.value === profile.skillLevel)?.label} · {profile.timeZone}
          </p>
          <p>
            {profile.bio ||
              'Adicione uma breve biografia para ajudar os jogadores a conhecerem você.'}
          </p>
          <p>
            {profile.styles
              .map((style) => styles.find((item) => item.value === style)?.label)
              .join(', ')}
          </p>
          <p>
            {profile.activeForMatchmaking ? 'Disponível para combinações' : 'Combinações pausadas'}
          </p>
          <button className="button" onClick={() => setEditing(true)}>
            Editar perfil
          </button>
        </section>
      )}
      <button className="text-button" type="button" onClick={signOut} disabled={signingOut}>
        {signingOut ? 'Saindo...' : 'Sair'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <h1>{title}</h1>
      <p className="lead">Este recurso estará disponível em uma próxima etapa.</p>
    </main>
  );
}
export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/start" element={<Start />} />
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:code" element={<Invite />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/availability" element={<AvailabilityPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/new" element={<CreateGamePage />} />
        <Route path="/games/:id" element={<GameDetailsPage />} />
        <Route path="*" element={<Placeholder title="Página não encontrada" />} />
      </Routes>
    </AppShell>
  );
}
