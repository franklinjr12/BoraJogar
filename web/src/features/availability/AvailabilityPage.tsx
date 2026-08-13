import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  availabilityApi,
  locationApi,
  type AvailabilityRule,
  type AvailabilityException,
  type PreferredArea,
  type Venue,
} from '../../api/client';
import { markGameAlertPromptReady } from '../notifications/gameAlertPromptState';
import { getDeviceTimeZone } from '../../platform/timeZone';
import { weekdayLabels } from '../../i18n/pt-BR';
import { TimePickerField } from '../../components/DateTimePicker';
import { useOnlineStatus } from '../../platform/useOnlineStatus';
import { locationsChangedEvent } from '../locations/locationEvents';

const days = weekdayLabels;
function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
const presets = [
  { id: 'weekend', label: 'Neste fim de semana', weekday: 6, start: '09:00', end: '13:00' },
  { id: 'mornings', label: 'Manhãs durante a semana', weekday: 1, start: '07:00', end: '09:00' },
  { id: 'evenings', label: 'Noites durante a semana', weekday: 3, start: '18:00', end: '20:00' },
  {
    id: 'custom',
    label: 'Escolher horários específicos',
    weekday: 1,
    start: '07:00',
    end: '09:00',
  },
];
const defaultPreset = presets[0]!;

function parseExceptionType(value: string): AvailabilityException['type'] {
  if (value === 'unavailable_interval' || value === 'available_interval') return value;
  return 'unavailable_all_day';
}

export function AvailabilityPage() {
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        ← Início
      </Link>
      <AvailabilityEditor />
    </main>
  );
}

export function AvailabilityEditor({ compact = false }: { compact?: boolean }) {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [areas, setAreas] = useState<PreferredArea[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPreset.id);
  const [window, setWindow] = useState({
    weekday: defaultPreset.weekday,
    start: defaultPreset.start,
    end: defaultPreset.end,
  });
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [specificLocations, setSpecificLocations] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exceptionDate, setExceptionDate] = useState(localToday);
  const [exceptionType, setExceptionType] =
    useState<AvailabilityException['type']>('unavailable_all_day');
  const [exceptionStart, setExceptionStart] = useState('18:00');
  const [exceptionEnd, setExceptionEnd] = useState('20:00');
  const [savingException, setSavingException] = useState(false);
  const [removingExceptionId, setRemovingExceptionId] = useState('');
  const isOnline = useOnlineStatus();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextRules, nextExceptions, nextAreas, nextVenues] = await Promise.all([
        availabilityApi.rules(),
        availabilityApi.exceptions(),
        locationApi.preferredAreas(),
        locationApi.favoriteVenues(),
      ]);
      setRules(Array.isArray(nextRules) ? nextRules : []);
      setExceptions(Array.isArray(nextExceptions) ? nextExceptions : []);
      setAreas(Array.isArray(nextAreas) ? nextAreas.filter((area) => area.active) : []);
      setVenues(Array.isArray(nextVenues) ? nextVenues.filter((venue) => venue.active) : []);
    } catch {
      setLoadError('Não foi possível carregar sua disponibilidade. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    globalThis.window.addEventListener(locationsChangedEvent, refresh);
    return () => globalThis.window.removeEventListener(locationsChangedEvent, refresh);
  }, [load]);

  const savedLocations = useMemo(
    () => [
      ...venues.map((venue) => ({ id: venue.id, type: 'venue' as const, label: venue.name })),
      ...areas.map((area) => ({ id: area.id, type: 'area' as const, label: area.label })),
    ],
    [areas, venues],
  );

  useEffect(() => {
    setSelectedLocationIds(savedLocations.map((location) => location.id));
  }, [savedLocations]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setMessage('');
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de salvar sua disponibilidade.');
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const weekday = Number(form.get('weekday'));
    const start = String(form.get('start'));
    const end = String(form.get('end'));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
      setError('Informe horários válidos.');
      return;
    }
    if (start >= end) {
      setError('O horário de fim precisa ser depois do início.');
      return;
    }
    const selected = specificLocations
      ? savedLocations.filter((location) => selectedLocationIds.includes(location.id))
      : savedLocations;
    if (selected.length === 0) {
      setError('Selecione pelo menos um local para este horário.');
      return;
    }
    setSaving(true);
    try {
      await availabilityApi.createRule({
        weekday,
        start,
        end,
        timezone: getDeviceTimeZone(),
        validFrom: localToday(),
        active: true,
        venueIds: selected.filter((location) => location.type === 'venue').map((item) => item.id),
        preferredAreaIds: selected
          .filter((location) => location.type === 'area')
          .map((item) => item.id),
      });
      formElement.reset();
      setSelectedPresetId(defaultPreset.id);
      setWindow({
        weekday: defaultPreset.weekday,
        start: defaultPreset.start,
        end: defaultPreset.end,
      });
      setSpecificLocations(false);
      setMessage('Horário disponível salvo.');
      markGameAlertPromptReady();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível salvar o intervalo. Verifique os horários e o local.',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de alterar sua disponibilidade.');
      return;
    }
    try {
      await availabilityApi.deleteRule(id);
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch {
      setError('Não foi possível remover o intervalo.');
    }
  };

  const createException = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingException) return;
    setError('');
    setMessage('');
    if (!isOnline) {
      setError('Você está offline. Conecte-se antes de salvar uma exceção.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
      setError('Informe uma data vÃ¡lida.');
      return;
    }
    const hasInterval = exceptionType !== 'unavailable_all_day';
    if (
      hasInterval &&
      (!/^([01]\d|2[0-3]):[0-5]\d$/.test(exceptionStart) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(exceptionEnd))
    ) {
      setError('Informe horários válidos para a exceção.');
      return;
    }
    if (hasInterval && exceptionStart >= exceptionEnd) {
      setError('O horÃ¡rio de fim precisa ser depois do inÃ­cio.');
      return;
    }
    setSavingException(true);
    try {
      const created = await availabilityApi.createException({
        date: exceptionDate,
        type: exceptionType,
        timezone: getDeviceTimeZone(),
        ...(hasInterval ? { start: exceptionStart, end: exceptionEnd } : {}),
      });
      setExceptions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setMessage('ExceÃ§Ã£o de disponibilidade salva.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a exceção.');
    } finally {
      setSavingException(false);
    }
  };

  const removeException = async (id: string) => {
    if (removingExceptionId || !isOnline) {
      if (!isOnline) setError('Você está offline. Conecte-se antes de remover a exceção.');
      return;
    }
    setRemovingExceptionId(id);
    setError('');
    try {
      await availabilityApi.deleteException(id);
      setExceptions((current) => current.filter((item) => item.id !== id));
    } catch {
      setError('Não foi possível remover a exceção.');
    } finally {
      setRemovingExceptionId('');
    }
  };

  const exceptionLabel = (exception: AvailabilityException) => {
    if (exception.type === 'unavailable_all_day') return 'Indisponível o dia todo';
    if (exception.type === 'unavailable_interval')
      return `Indisponível das ${exception.start} às ${exception.end}`;
    return `Disponível das ${exception.start} às ${exception.end}`;
  };

  const locationLabel = (id: string) =>
    savedLocations.find((location) => location.id === id)?.label ?? 'Local salvo';

  if (loading)
    return (
      <section>
        <p>Carregando disponibilidade...</p>
      </section>
    );

  return (
    <>
      <p className="eyebrow">Sua agenda</p>
      {!compact && <h1>Quando você mais gostaria de jogar?</h1>}
      <p className="lead">
        Adicione um horário disponível agora. Você pode adicionar outros depois.
      </p>
      {loadError && (
        <div className="feedback-error" role="alert">
          <p className="error">{loadError}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {savedLocations.length === 0 && (
        <p className="hint">
          Adicione primeiro um local para jogar.{' '}
          <Link className="text-link" to="/locations">
            Escolha onde você pode jogar
          </Link>
        </p>
      )}
      <form className="card" onSubmit={create}>
        <fieldset>
          <legend>Quando você mais gostaria de jogar?</legend>
          <div className="choice-list">
            {presets.map((preset) => (
              <button
                className={selectedPresetId === preset.id ? 'choice selected' : 'choice'}
                key={preset.id}
                type="button"
                onClick={() => {
                  setSelectedPresetId(preset.id);
                  setWindow({ weekday: preset.weekday, start: preset.start, end: preset.end });
                }}
              >
                <strong>{preset.label}</strong>
                <span>
                  {days[preset.weekday]} {preset.start}-{preset.end}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Dia
          <select
            name="weekday"
            value={window.weekday}
            onChange={(event) => {
              setSelectedPresetId('custom');
              setWindow((current) => ({ ...current, weekday: Number(event.target.value) }));
            }}
          >
            {days.map((day, index) => (
              <option value={index} key={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <div className="time-fields">
          <TimePickerField
            name="start"
            label="Início"
            value={window.start}
            onChange={(start) => {
              setSelectedPresetId('custom');
              setWindow((current) => ({ ...current, start }));
            }}
            required
          />
          <TimePickerField
            name="end"
            label="Fim"
            value={window.end}
            onChange={(end) => {
              setSelectedPresetId('custom');
              setWindow((current) => ({ ...current, end }));
            }}
            required
          />
        </div>
        <fieldset>
          <legend>Onde você poderia jogar nesse horário?</legend>
          <label className="checks">
            <span>
              <input
                type="radio"
                checked={!specificLocations}
                onChange={() => setSpecificLocations(false)}
              />{' '}
              Qualquer um dos meus locais salvos
            </span>
          </label>
          <label className="checks">
            <span>
              <input
                type="radio"
                checked={specificLocations}
                onChange={() => setSpecificLocations(true)}
              />{' '}
              Selecionar locais
            </span>
          </label>
          {specificLocations && (
            <div className="checks">
              {savedLocations.map((location) => (
                <label key={location.id}>
                  <input
                    type="checkbox"
                    checked={selectedLocationIds.includes(location.id)}
                    onChange={(event) =>
                      setSelectedLocationIds((current) =>
                        event.target.checked
                          ? [...current, location.id]
                          : current.filter((id) => id !== location.id),
                      )
                    }
                  />
                  {location.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
        <button
          className="button"
          type="submit"
          disabled={savedLocations.length === 0 || saving || !isOnline}
        >
          {saving ? 'Salvando...' : 'Adicionar horário disponível'}
        </button>
      </form>
      <section className="card weekly-summary">
        <h2>Sua disponibilidade</h2>
        {rules.length === 0 ? (
          <p>Nenhum horário disponível ainda.</p>
        ) : (
          days.map((day, index) => {
            const dayRules = rules.filter((rule) => rule.weekday === index);
            return dayRules.length ? (
              <div className="availability-day" key={day}>
                <h3>{day}</h3>
                {dayRules.map((rule) => (
                  <div className="availability-row" key={rule.id}>
                    <span>
                      <strong>
                        {rule.start && rule.end
                          ? `${rule.start}-${rule.end}`
                          : 'Horário não definido'}
                      </strong>
                      <small>
                        {[...rule.venueIds, ...rule.preferredAreaIds].map(locationLabel).join(', ')}
                      </small>
                    </span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void remove(rule.id)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : null;
          })
        )}
      </section>
      <section className="card weekly-summary">
        <h2>Exceções de disponibilidade</h2>
        <p className="hint">
          Use uma exceção para bloquear um dia específico ou liberar um horário fora da sua rotina.
        </p>
        <form onSubmit={createException}>
          <label>
            Data
            <input
              type="date"
              value={exceptionDate}
              onChange={(event) => setExceptionDate(event.target.value)}
              required
            />
          </label>
          <label>
            Tipo de exceção
            <select
              value={exceptionType}
              onChange={(event) => setExceptionType(parseExceptionType(event.target.value))}
            >
              <option value="unavailable_all_day">Indisponível o dia todo</option>
              <option value="unavailable_interval">Indisponível em um intervalo</option>
              <option value="available_interval">Disponível em um intervalo</option>
            </select>
          </label>
          {exceptionType !== 'unavailable_all_day' && (
            <div className="time-fields">
              <label>
                InÃ­cio
                <input
                  type="time"
                  value={exceptionStart}
                  onChange={(event) => setExceptionStart(event.target.value)}
                  required
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={exceptionEnd}
                  onChange={(event) => setExceptionEnd(event.target.value)}
                  required
                />
              </label>
            </div>
          )}
          <button className="button" type="submit" disabled={savingException || !isOnline}>
            {savingException ? 'Salvando...' : 'Salvar exceção'}
          </button>
        </form>
        {exceptions.length > 0 && (
          <div className="exception-list">
            {exceptions.map((exception) => (
              <div className="availability-row" key={exception.id}>
                <span>
                  <strong>{exception.date}</strong>
                  <small>{exceptionLabel(exception)}</small>
                </span>
                <button
                  className="text-button"
                  type="button"
                  disabled={Boolean(removingExceptionId) || !isOnline}
                  onClick={() => void removeException(exception.id)}
                >
                  {removingExceptionId === exception.id ? 'Removendo...' : 'Remover'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
