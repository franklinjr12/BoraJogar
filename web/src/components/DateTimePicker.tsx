import { useCallback, useEffect, useId, useRef, useState } from 'react';

type PickerFieldProps = {
  label: string;
  name: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
};

type DatePickerFieldProps = PickerFieldProps & {
  min?: string;
};

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function localToday() {
  const date = new Date();
  return formatDateValue(date);
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return undefined;
  }
  return date;
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function formatDateLabel(value: string) {
  const date = parseDateValue(value);
  if (!date) return 'Selecionar data';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatMonthLabel(date: Date) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isValidDateInput(value: string) {
  return parseDateValue(value) !== undefined;
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

type TimeValue = {
  hour: number;
  minute: number;
};

function parseTimeValue(value: string): TimeValue | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return undefined;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatTimeValue({ hour, minute }: TimeValue) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function clampTimeValue(value: number, maximum: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.round(value))) : 0;
}

function parseTypedTimeValue(value: string, maximum: number) {
  const digits = value
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 2);
  return clampTimeValue(Number(digits), maximum);
}

export function DatePickerField({ min = localToday(), ...props }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    firstDayOfMonth(parseDateValue(props.value) ?? parseDateValue(min) ?? new Date()),
  );
  const triggerRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const focusTarget = document.querySelector<HTMLElement>(`[data-picker-title="${titleId}"]`);
    focusTarget?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, titleId]);

  const date = parseDateValue(props.value);
  const minimum = parseDateValue(min) ?? new Date();
  const monthStart = firstDayOfMonth(visibleMonth);
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const dates = Array.from({ length: leadingDays + monthDays }, (_, index) => {
    if (index < leadingDays) return undefined;
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), index - leadingDays + 1);
  });
  const previousMonth = shiftMonth(monthStart, -1);
  const canGoPrevious = previousMonth.getTime() >= firstDayOfMonth(minimum).getTime();
  const close = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const selectDate = (nextDate: Date) => {
    if (nextDate < minimum) return;
    props.onChange(formatDateValue(nextDate));
  };

  return (
    <div className="date-time-field">
      <label htmlFor={`${titleId}-trigger`}>{props.label}</label>
      <div className="date-time-input-row">
        <input
          id={`${titleId}-trigger`}
          ref={triggerRef}
          className="date-time-trigger"
          type="text"
          lang="pt-BR"
          value={formatDateLabel(props.value)}
          readOnly
          required={props.required && props.value.length === 0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${titleId}-dialog` : undefined}
          aria-required={props.required || undefined}
          aria-label={props.label}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (isValidDateInput(nextValue) && nextValue >= min) props.onChange(nextValue);
          }}
          onClick={() => {
            setVisibleMonth(firstDayOfMonth(date ?? minimum));
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setVisibleMonth(firstDayOfMonth(date ?? minimum));
              setOpen(true);
            }
          }}
        />
      </div>
      <input type="hidden" name={props.name} value={props.value} />
      {open && (
        <div className="date-time-overlay" role="presentation">
          <div
            className="date-time-dialog"
            id={`${titleId}-dialog`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="date-time-dialog-header">
              <p className="date-time-dialog-kicker">{props.label}</p>
              <p
                id={titleId}
                className="date-time-dialog-value"
                tabIndex={-1}
                data-picker-title={titleId}
              >
                {formatDateLabel(props.value)}
              </p>
            </div>
            <div className="date-time-calendar-header">
              <button
                className="date-time-icon-button"
                type="button"
                aria-label="Mês anterior"
                disabled={!canGoPrevious}
                onClick={() => setVisibleMonth(previousMonth)}
              >
                ‹
              </button>
              <strong>{formatMonthLabel(monthStart)}</strong>
              <button
                className="date-time-icon-button"
                type="button"
                aria-label="Próximo mês"
                onClick={() => setVisibleMonth(shiftMonth(monthStart, 1))}
              >
                ›
              </button>
            </div>
            <div className="date-time-calendar-grid" aria-label={formatMonthLabel(monthStart)}>
              {weekDays.map((weekDay) => (
                <span className="date-time-weekday" key={weekDay}>
                  {weekDay}
                </span>
              ))}
              {dates.map((day, index) => {
                if (!day) return <span className="date-time-empty" key={`empty-${index}`} />;
                const dayValue = formatDateValue(day);
                const selected = dayValue === props.value;
                const today = dayValue === localToday();
                const disabled = day < minimum;
                return (
                  <button
                    className={`date-time-day${selected ? ' selected' : ''}${today ? ' today' : ''}`}
                    type="button"
                    key={dayValue}
                    disabled={disabled}
                    aria-label={formatDateLabel(dayValue)}
                    aria-pressed={selected}
                    onClick={() => selectDate(day)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="date-time-dialog-actions">
              <button className="text-button" type="button" onClick={close}>
                Concluído
              </button>
            </div>
          </div>
          <button
            className="date-time-backdrop"
            type="button"
            aria-label="Fechar"
            onClick={close}
          />
        </div>
      )}
    </div>
  );
}

export function TimePickerField(props: PickerFieldProps) {
  const inputId = useId();
  const labelId = `${inputId}-label`;
  const dialogId = `${inputId}-dialog`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const currentTime = parseTimeValue(props.value);
  const [draftHour, setDraftHour] = useState(currentTime?.hour ?? 0);
  const [draftMinute, setDraftMinute] = useState(currentTime?.minute ?? 0);
  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    hourInputRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  const openPicker = () => {
    const nextTime = parseTimeValue(props.value);
    setDraftHour(nextTime?.hour ?? 0);
    setDraftMinute(nextTime?.minute ?? 0);
    setOpen(true);
  };
  const apply = () => {
    props.onChange(formatTimeValue({ hour: draftHour, minute: draftMinute }));
    close();
  };
  const adjustHour = (amount: number) => {
    setDraftHour((value) => (value + amount + 24) % 24);
  };
  const adjustMinute = (amount: number) => {
    setDraftMinute((value) => (value + amount + 60) % 60);
  };
  const displayedValue = currentTime ? formatTimeValue(currentTime) : 'Selecionar horário';

  return (
    <div className="date-time-field">
      <label id={labelId} htmlFor={inputId}>
        {props.label}
      </label>
      <input
        id={inputId}
        className="native-time-input desktop-time-input"
        type="time"
        lang="pt-BR"
        step="60"
        value={props.value}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <div className="mobile-time-control">
        <button
          ref={triggerRef}
          className="mobile-time-trigger"
          type="button"
          aria-label={`${displayedValue}, abrir seletor de horário`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          onClick={openPicker}
        >
          {displayedValue}
        </button>
      </div>
      <input type="hidden" name={props.name} value={props.value} />
      {open && (
        <div className="date-time-overlay" role="presentation">
          <div
            className="date-time-dialog time-picker-dialog"
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelId}
          >
            <div className="date-time-dialog-header">
              <p className="date-time-dialog-kicker">{props.label}</p>
              <p className="date-time-dialog-value">
                {formatTimeValue({ hour: draftHour, minute: draftMinute })}
              </p>
            </div>
            <div className="custom-time-controls">
              <div className="custom-time-control">
                <label htmlFor={`${dialogId}-hour`}>Hora</label>
                <div className="custom-time-stepper">
                  <input
                    id={`${dialogId}-hour`}
                    ref={hourInputRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={draftHour}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setDraftHour(parseTypedTimeValue(event.target.value, 23))}
                  />
                  <div className="custom-time-stepper-actions">
                    <button type="button" aria-label="Diminuir hora" onClick={() => adjustHour(-1)}>
                      −
                    </button>
                    <button type="button" aria-label="Aumentar hora" onClick={() => adjustHour(1)}>
                      +
                    </button>
                  </div>
                </div>
              </div>
              <span className="custom-time-separator" aria-hidden="true">
                :
              </span>
              <div className="custom-time-control">
                <label htmlFor={`${dialogId}-minute`}>Minutos</label>
                <div className="custom-time-stepper">
                  <input
                    id={`${dialogId}-minute`}
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={draftMinute}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setDraftMinute(parseTypedTimeValue(event.target.value, 59))
                    }
                  />
                  <div className="custom-time-stepper-actions">
                    <button
                      type="button"
                      aria-label="Diminuir minutos"
                      onClick={() => adjustMinute(-1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label="Aumentar minutos"
                      onClick={() => adjustMinute(1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="date-time-dialog-actions custom-time-actions">
              <button className="text-button" type="button" onClick={close}>
                Cancelar
              </button>
              <button className="button" type="button" onClick={apply}>
                Definir
              </button>
            </div>
          </div>
          <button
            className="date-time-backdrop"
            type="button"
            aria-label="Fechar"
            onClick={close}
          />
        </div>
      )}
    </div>
  );
}
