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
const wheelRowHeight = 56;

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

function isValidTimeInput(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function normalizeTypedTime(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function firstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
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
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | undefined>(() =>
    isValidTimeInput(props.value) ? Number(props.value.slice(0, 2)) : undefined,
  );
  const [selectedMinute, setSelectedMinute] = useState<number | undefined>(() =>
    isValidTimeInput(props.value) ? Number(props.value.slice(3, 5)) : 0,
  );
  const triggerRef = useRef<HTMLInputElement>(null);
  const hourWheelRef = useRef<HTMLDivElement>(null);
  const minuteWheelRef = useRef<HTMLDivElement>(null);
  const committedValueRef = useRef(props.value);
  const [typedValue, setTypedValue] = useState(props.value);
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

  useEffect(() => {
    if (props.value === committedValueRef.current) return;
    committedValueRef.current = props.value;
    setTypedValue(props.value);
  }, [props.value]);

  useEffect(() => {
    if (!isValidTimeInput(props.value)) {
      setSelectedHour(undefined);
      setSelectedMinute(0);
      return;
    }
    setSelectedHour(Number(props.value.slice(0, 2)));
    setSelectedMinute(Number(props.value.slice(3, 5)));
  }, [props.value]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const scrollWheelTo = useCallback((wheel: HTMLDivElement | null, index: number) => {
    if (!wheel) return;
    const top = index * wheelRowHeight;
    if (typeof wheel.scrollTo === 'function') {
      wheel.scrollTo({ top, behavior: 'smooth' });
    } else {
      wheel.scrollTop = top;
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (selectedHour !== undefined) scrollWheelTo(hourWheelRef.current, selectedHour);
      scrollWheelTo(minuteWheelRef.current, selectedMinute ?? 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, scrollWheelTo, selectedHour, selectedMinute]);
  const updateTime = (hour: number | undefined, minute: number) => {
    if (hour === undefined) return;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    committedValueRef.current = value;
    setTypedValue(value);
    props.onChange(value);
  };
  const selectHour = (hour: number) => {
    setSelectedHour(hour);
    updateTime(hour, selectedMinute ?? 0);
  };
  const selectMinute = (minute: number) => {
    setSelectedMinute(minute);
    updateTime(selectedHour, minute);
  };
  const handleHourScroll = () => {
    const wheel = hourWheelRef.current;
    if (!wheel) return;
    const hour = Math.max(0, Math.min(23, Math.round(wheel.scrollTop / wheelRowHeight)));
    if (hour !== selectedHour) selectHour(hour);
  };
  const handleMinuteScroll = () => {
    const wheel = minuteWheelRef.current;
    if (!wheel) return;
    const minute = Math.max(0, Math.min(59, Math.round(wheel.scrollTop / wheelRowHeight)));
    if (minute !== selectedMinute) selectMinute(minute);
  };
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const minutes = Array.from({ length: 60 }, (_, index) => index);

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
          value={typedValue}
          inputMode="numeric"
          maxLength={5}
          placeholder="HH:mm"
          required={props.required}
          aria-required={props.required || undefined}
          aria-label={props.label}
          onChange={(event) => {
            const value = normalizeTypedTime(event.target.value);
            setTypedValue(value);
            if (isValidTimeInput(value)) {
              committedValueRef.current = value;
              props.onChange(value);
            }
          }}
          onBlur={() => {
            if (typedValue.length > 0 && !isValidTimeInput(typedValue)) setTypedValue(props.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          className="date-time-picker-toggle"
          type="button"
          aria-label="Abrir seletor de horário"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${titleId}-dialog` : undefined}
          onClick={() => setOpen(true)}
        >
          ▾
        </button>
      </div>
      <input type="hidden" name={props.name} value={typedValue} />
      {open && (
        <div className="date-time-overlay" role="presentation">
          <div
            className="date-time-dialog time-picker-dialog"
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
                {isValidTimeInput(props.value) ? props.value : 'Selecionar horário'}
              </p>
            </div>
            <div className="time-picker-section">
              <div className="time-picker-wheels" aria-label="Selecionar horário">
                <div className="time-picker-wheel-column">
                  <span className="time-picker-label">Hora</span>
                  <div
                    className="time-picker-wheel"
                    ref={hourWheelRef}
                    role="listbox"
                    aria-label="Hora"
                    aria-activedescendant={
                      selectedHour === undefined ? undefined : `${titleId}-hour-${selectedHour}`
                    }
                    onScroll={handleHourScroll}
                  >
                    <span className="time-picker-wheel-spacer" aria-hidden="true" />
                    {hours.map((hour) => (
                      <button
                        className={`time-picker-wheel-option${selectedHour === hour ? ' selected' : ''}`}
                        id={`${titleId}-hour-${hour}`}
                        type="button"
                        role="option"
                        aria-selected={selectedHour === hour}
                        key={hour}
                        onClick={() => {
                          selectHour(hour);
                          scrollWheelTo(hourWheelRef.current, hour);
                        }}
                      >
                        {String(hour).padStart(2, '0')}
                      </button>
                    ))}
                    <span className="time-picker-wheel-spacer" aria-hidden="true" />
                  </div>
                </div>
                <div className="time-picker-wheel-column">
                  <span className="time-picker-label">Minutos</span>
                  <div
                    className="time-picker-wheel"
                    ref={minuteWheelRef}
                    role="listbox"
                    aria-label="Minutos"
                    aria-activedescendant={`${titleId}-minute-${selectedMinute ?? 0}`}
                    onScroll={handleMinuteScroll}
                  >
                    <span className="time-picker-wheel-spacer" aria-hidden="true" />
                    {minutes.map((minute) => (
                      <button
                        className={`time-picker-wheel-option${selectedMinute === minute ? ' selected' : ''}`}
                        id={`${titleId}-minute-${minute}`}
                        type="button"
                        role="option"
                        aria-selected={selectedMinute === minute}
                        key={minute}
                        onClick={() => {
                          selectMinute(minute);
                          scrollWheelTo(minuteWheelRef.current, minute);
                        }}
                      >
                        {String(minute).padStart(2, '0')}
                      </button>
                    ))}
                    <span className="time-picker-wheel-spacer" aria-hidden="true" />
                  </div>
                </div>
                <span className="time-picker-wheel-highlight" aria-hidden="true" />
              </div>
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
