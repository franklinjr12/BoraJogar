import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  authApi,
  profileApi,
  type OnboardingReadiness,
  type PlayingStyle,
  type SkillLevel,
} from '../../api/client';
import { AvailabilityEditor } from '../availability/AvailabilityPage';
import { LocationSetup } from '../locations/LocationsPage';
import { blankProfile, skills, styles } from './options';
import { readinessLabel } from '../../i18n/pt-BR';
import { useOnlineStatus } from '../../platform/useOnlineStatus';

type OnboardingGoal = 'find_people' | 'create_game' | 'join_game';
type OnboardingStep = 0 | 1 | 2;
type OnboardingDraft = { step: OnboardingStep; profile: typeof blankProfile };

function storedGoal(): OnboardingGoal {
  const value = localStorage.getItem('borajogar_onboarding_goal');
  return value === 'create_game' || value === 'join_game' ? value : 'find_people';
}

function nextPathForGoal(goal: OnboardingGoal) {
  if (goal === 'create_game') return '/games/new';
  if (goal === 'join_game') return localStorage.getItem('borajogar_return_to') || '/games';
  return '/dashboard';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStep(value: unknown): value is OnboardingStep {
  return value === 0 || value === 1 || value === 2;
}

function isProfileDraft(value: unknown): value is typeof blankProfile {
  if (!isObject(value)) return false;
  return (
    typeof value.displayName === 'string' &&
    typeof value.timeZone === 'string' &&
    typeof value.skillLevel === 'string' &&
    typeof value.bio === 'string' &&
    Array.isArray(value.styles) &&
    value.styles.every((style) => typeof style === 'string') &&
    typeof value.preferredGameDurationMinutes === 'number' &&
    typeof value.minimumNoticeMinutes === 'number' &&
    typeof value.activeForMatchmaking === 'boolean'
  );
}

function storedDraft(): OnboardingDraft {
  const saved = localStorage.getItem('borajogar_onboarding');
  if (!saved) return { step: 0, profile: blankProfile };
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isObject(parsed)) return { step: 0, profile: blankProfile };
    return {
      step: isStep(parsed.step) ? parsed.step : 0,
      profile: isProfileDraft(parsed.profile) ? parsed.profile : blankProfile,
    };
  } catch {
    return { step: 0, profile: blankProfile };
  }
}

function stepForReadiness(readiness: OnboardingReadiness): OnboardingStep {
  if (!readiness.profile) return 0;
  if (!readiness.location) return 1;
  return 2;
}

function finishLabel(goal: OnboardingGoal) {
  if (goal === 'create_game') return 'Criar partida';
  if (goal === 'join_game') return 'Encontrar partidas';
  return 'Ir para o painel';
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const goal = (params.get('goal') as OnboardingGoal | null) ?? storedGoal();
  const quickJoin = goal === 'join_game';
  const initial = storedDraft();
  const [step, setStep] = useState<OnboardingStep>(quickJoin ? 0 : initial.step);
  const [profile, setProfile] = useState(initial.profile);
  const [readiness, setReadiness] = useState<OnboardingReadiness | null>(null);
  const [error, setError] = useState('');
  const [locationSaving, setLocationSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    localStorage.setItem('borajogar_onboarding_goal', goal);
    authApi
      .currentUser()
      .then((user) =>
        setProfile((current) => ({
          ...current,
          displayName: current.displayName.trim() ? current.displayName : user.displayName,
          timeZone: current.timeZone || user.timeZone,
        })),
      )
      .catch(() => undefined);
    profileApi
      .readiness()
      .then((nextReadiness) => {
        setReadiness(nextReadiness);
        if (quickJoin && nextReadiness.profile) {
          finishQuickJoin();
          return;
        }
        setStep(stepForReadiness(nextReadiness));
      })
      .catch(() => undefined);
  }, [goal]);

  useEffect(() => {
    localStorage.setItem('borajogar_onboarding', JSON.stringify({ step, profile }));
  }, [step, profile]);

  const update = <K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));

  const finishQuickJoin = () => {
    const nextPath = nextPathForGoal(goal);
    localStorage.removeItem('borajogar_onboarding_goal');
    localStorage.removeItem('borajogar_return_to');
    navigate(nextPath);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de continuar.');
      return;
    }
    if (profile.displayName.trim().length < 2) {
      setError('Escolha um nome com pelo menos 2 caracteres.');
      return;
    }
    if (profile.styles.length === 0) update('styles', ['mixed']);
    setSaving(true);
    try {
      await profileApi.update({
        ...profile,
        displayName: profile.displayName.trim(),
        styles: profile.styles.length ? profile.styles : ['mixed'],
      });
      localStorage.setItem('borajogar_timezone', profile.timeZone);
      await profileApi.saveProgress(1, [0]);
      const nextReadiness = await profileApi.readiness();
      setReadiness(nextReadiness);
      if (quickJoin) {
        finishQuickJoin();
        return;
      }
      if (nextReadiness.canComplete) {
        await profileApi.complete();
        localStorage.setItem('borajogar_install_prompt_ready', 'true');
        localStorage.removeItem('borajogar_onboarding');
        navigate(nextPathForGoal(goal));
        return;
      }
      setStep(stepForReadiness(nextReadiness));
    } catch {
      setError('Não foi possível salvar o perfil. Verifique a conexão e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const continueFromLocations = async () => {
    if (saving) return;
    setError('');
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de continuar.');
      return;
    }
    setSaving(true);
    const nextReadiness = await profileApi.readiness().catch(() => null);
    setReadiness(nextReadiness);
    if (!nextReadiness?.location) {
      setError('Adicione uma quadra ou área antes de continuar.');
      setSaving(false);
      return;
    }
    await profileApi.saveProgress(2, [0, 1]).catch(() => undefined);
    setStep(2);
    setSaving(false);
  };

  const completeAfterFirstAvailability = async () => {
    if (goal !== 'find_people') return;
    setSaving(true);
    try {
      await profileApi.complete();
      localStorage.setItem('borajogar_install_prompt_ready', 'true');
      localStorage.removeItem('borajogar_onboarding');
      localStorage.removeItem('borajogar_onboarding_goal');
      navigate('/dashboard');
    } catch {
      setError('Não foi possível concluir a configuração. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (saving) return;
    setError('');
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de concluir.');
      return;
    }
    setSaving(true);
    const nextReadiness = await profileApi.readiness().catch(() => null);
    setReadiness(nextReadiness);
    if (!nextReadiness?.availability) {
      setError('Adicione um horário disponível antes de continuar.');
      setSaving(false);
      return;
    }
    try {
      await profileApi.complete();
      localStorage.setItem('borajogar_install_prompt_ready', 'true');
      localStorage.removeItem('borajogar_onboarding');
      navigate(nextPathForGoal(goal));
    } catch {
      setError(
        'Não foi possível concluir a configuração. Adicione um local e um horário disponível.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="shell onboarding">
      <p className="eyebrow">Bora Jogar</p>
      {quickJoin ? (
        <p className="onboarding-progress" role="status">
          Perfil básico para entrar
        </p>
      ) : (
        <>
          <p className="onboarding-progress" role="status">
            Etapa {step + 1} de 3
          </p>
          <progress value={step + 1} max={3} aria-label={`Etapa ${step + 1} de 3`} />
        </>
      )}
      {step === 0 && (
        <>
          <h1>{quickJoin ? 'Informe seu nome e nível para entrar.' : 'Conte sobre seu jogo.'}</h1>
          <p className="lead">
            {quickJoin
              ? 'Só precisamos desses dados para identificar você e validar a partida.'
              : 'Só o básico para encontrar jogadores. O resto pode esperar.'}
          </p>
          <form className="card" onSubmit={saveProfile}>
            <label>
              Nome exibido
              <input
                value={profile.displayName}
                onChange={(event) => update('displayName', event.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <fieldset>
              <legend>Como você descreveria seu nível atual?</legend>
              <div className="choice-list">
                {skills.map((skill) => (
                  <button
                    className={profile.skillLevel === skill.value ? 'choice selected' : 'choice'}
                    key={skill.value}
                    type="button"
                    onClick={() => update('skillLevel', skill.value as SkillLevel)}
                  >
                    <strong>{skill.label}</strong>
                    <span>{skill.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Preferência de estilo
              <select
                value={profile.styles[0] ?? 'mixed'}
                onChange={(event) => update('styles', [event.target.value as PlayingStyle])}
              >
                {styles.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button" type="submit" disabled={saving || !isOnline}>
              {saving ? 'Salvando...' : 'Continuar'}
            </button>
          </form>
        </>
      )}
      {step === 1 && !quickJoin && (
        <>
          <LocationSetup compact onLocationSavingChange={setLocationSaving} />
          <div className="actions">
            <button
              className="button"
              type="button"
              onClick={() => void continueFromLocations()}
              disabled={locationSaving || saving || !isOnline}
            >
              {saving ? 'Verificando...' : 'Continuar'}
            </button>
            <button className="text-button" type="button" onClick={() => setStep(0)}>
              Voltar
            </button>
          </div>
        </>
      )}
      {step === 2 && !quickJoin && (
        <>
          <AvailabilityEditor compact onFirstAvailabilityCreated={completeAfterFirstAvailability} />
          <p className="hint">Você pode adicionar mais horários depois.</p>
          <div className="actions">
            <button
              className="button"
              type="button"
              onClick={() => void finish()}
              disabled={saving || !isOnline}
            >
              {saving ? 'Concluindo...' : finishLabel(goal)}
            </button>
            <button className="text-button" type="button" onClick={() => setStep(1)}>
              Voltar
            </button>
          </div>
        </>
      )}
      {readiness && !readiness.canComplete && step > 0 && (
        <p className="hint">Falta: {readiness.missing.map(readinessLabel).join(', ')}</p>
      )}
      {error && step > 0 && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>
        <Link className="text-link" to="/">
          Início
        </Link>
      </p>
    </main>
  );
}
