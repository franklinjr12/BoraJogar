import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  availabilityApi,
  locationApi,
  type AvailabilityRule,
  type PreferredArea,
} from '../../api/client';
import { getDeviceTimeZone } from '../../platform/timeZone';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const today = new Date().toISOString().slice(0, 10);

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const [nextRules, nextAreas] = await Promise.all([
        availabilityApi.rules(),
        locationApi.preferredAreas(),
      ]);
      setRules(Array.isArray(nextRules) ? nextRules : []);
      setAreas(Array.isArray(nextAreas) ? nextAreas.filter((area) => area.active) : []);
    } catch {
      setError('Sign in to manage availability.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await availabilityApi.createRule({
        weekday: Number(form.get('weekday')),
        start: String(form.get('start')),
        end: String(form.get('end')),
        timezone: getDeviceTimeZone(),
        validFrom: today,
        active: true,
        venueIds: [],
        preferredAreaIds: [String(form.get('area'))],
      });
      formElement.reset();
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
  const areaLabel = (id: string) => areas.find((area) => area.id === id)?.label ?? 'Preferred area';
  if (loading)
    return (
      <section>
        <p>Loading availability...</p>
      </section>
    );
  return (
    <>
      <p className="eyebrow">Your schedule</p>
      {!compact && <h1>Weekly availability.</h1>}
      <p className="lead">
        Tell us when you can play. Rules repeat weekly; exceptions handle one-off changes.
      </p>
      {areas.length === 0 && (
        <p className="hint">
          Add a preferred area first so each interval has a place to match against.{' '}
          <Link className="text-link" to="/locations">
            Create preferred area
          </Link>
        </p>
      )}
      <form className="card" onSubmit={create}>
        <label>
          Day
          <select name="weekday" defaultValue="1">
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
            <input name="start" type="time" defaultValue="07:00" required />
          </label>
          <label>
            End
            <input name="end" type="time" defaultValue="09:00" required />
          </label>
        </div>
        <label>
          Preferred area
          <select name="area" required defaultValue="" disabled={areas.length === 0}>
            <option value="" disabled>
              Choose an area
            </option>
            {areas.map((area) => (
              <option value={area.id} key={area.id}>
                {area.label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit" disabled={areas.length === 0}>
          Add interval
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="card weekly-summary">
        <h2>This week</h2>
        {rules.length === 0 ? (
          <p>No recurring intervals yet.</p>
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
                      {rule.preferredAreaIds.length > 0 && (
                        <small>{rule.preferredAreaIds.map(areaLabel).join(', ')}</small>
                      )}
                    </span>
                    <button className="text-button" onClick={() => void remove(rule.id)}>
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
