import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  availabilityApi,
  locationApi,
  type AvailabilityRule,
  type PreferredArea,
  type Venue,
} from '../../api/client';
import { markGameAlertPromptReady } from '../notifications/gameAlertPromptState';
import { getDeviceTimeZone } from '../../platform/timeZone';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const today = new Date().toISOString().slice(0, 10);
const presets = [
  { id: 'weekend', label: 'This weekend', weekday: 6, start: '09:00', end: '13:00' },
  { id: 'mornings', label: 'Weekday mornings', weekday: 1, start: '07:00', end: '09:00' },
  { id: 'evenings', label: 'Weekday evenings', weekday: 3, start: '18:00', end: '20:00' },
  { id: 'custom', label: 'Choose specific times', weekday: 1, start: '07:00', end: '09:00' },
];
const defaultPreset = presets[0]!;

export function AvailabilityPage() {
  return (
    <main className="shell">
      <Link className="text-link" to="/">
        &lt;- Home
      </Link>
      <AvailabilityEditor />
    </main>
  );
}

export function AvailabilityEditor({ compact = false }: { compact?: boolean }) {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
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
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [nextRules, nextAreas, nextVenues] = await Promise.all([
        availabilityApi.rules(),
        locationApi.preferredAreas(),
        locationApi.favoriteVenues(),
      ]);
      setRules(Array.isArray(nextRules) ? nextRules : []);
      setAreas(Array.isArray(nextAreas) ? nextAreas.filter((area) => area.active) : []);
      setVenues(Array.isArray(nextVenues) ? nextVenues.filter((venue) => venue.active) : []);
    } catch {
      setError('Sign in to manage availability.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
    setError('');
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const weekday = Number(form.get('weekday'));
    const selected = specificLocations
      ? savedLocations.filter((location) => selectedLocationIds.includes(location.id))
      : savedLocations;
    try {
      await availabilityApi.createRule({
        weekday,
        start: String(form.get('start')),
        end: String(form.get('end')),
        timezone: getDeviceTimeZone(),
        validFrom: today,
        active: true,
        venueIds: selected.filter((location) => location.type === 'venue').map((item) => item.id),
        preferredAreaIds: selected
          .filter((location) => location.type === 'area')
          .map((item) => item.id),
      });
      formElement.reset();
      setMessage('Available time saved.');
      markGameAlertPromptReady();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save interval. Check times and location.',
      );
    }
  };

  const remove = async (id: string) => {
    try {
      await availabilityApi.deleteRule(id);
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch {
      setError('Could not remove interval.');
    }
  };

  const locationLabel = (id: string) =>
    savedLocations.find((location) => location.id === id)?.label ?? 'Saved location';

  if (loading)
    return (
      <section>
        <p>Loading availability...</p>
      </section>
    );

  return (
    <>
      <p className="eyebrow">Your schedule</p>
      {!compact && <h1>When would you most like to play next?</h1>}
      <p className="lead">Add one usable time now. You can add more times later.</p>
      {savedLocations.length === 0 && (
        <p className="hint">
          Add a playing location first.{' '}
          <Link className="text-link" to="/locations">
            Choose where you can play
          </Link>
        </p>
      )}
      <form className="card" onSubmit={create}>
        <fieldset>
          <legend>When would you most like to play next?</legend>
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
          Day
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
          <label>
            Start
            <input
              name="start"
              type="time"
              value={window.start}
              onChange={(event) => {
                setSelectedPresetId('custom');
                setWindow((current) => ({ ...current, start: event.target.value }));
              }}
              required
            />
          </label>
          <label>
            End
            <input
              name="end"
              type="time"
              value={window.end}
              onChange={(event) => {
                setSelectedPresetId('custom');
                setWindow((current) => ({ ...current, end: event.target.value }));
              }}
              required
            />
          </label>
        </div>
        <fieldset>
          <legend>Where could you play at this time?</legend>
          <label className="checks">
            <span>
              <input
                type="radio"
                checked={!specificLocations}
                onChange={() => setSpecificLocations(false)}
              />{' '}
              Any of my saved locations
            </span>
          </label>
          <label className="checks">
            <span>
              <input
                type="radio"
                checked={specificLocations}
                onChange={() => setSpecificLocations(true)}
              />{' '}
              Select locations
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
        <button className="button" type="submit" disabled={savedLocations.length === 0}>
          Add available time
        </button>
      </form>
      <section className="card weekly-summary">
        <h2>Your availability</h2>
        {rules.length === 0 ? (
          <p>No available times yet.</p>
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
                        {rule.start && rule.end ? `${rule.start}-${rule.end}` : 'Time not set'}
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
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null;
          })
        )}
      </section>
    </>
  );
}
