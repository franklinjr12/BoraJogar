import { useEffect, useId, useRef, useState } from 'react';

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
const minuteOptions = Array.from({ length: 12 }, (_, index) => index * 5);

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

function formatTimeLabel(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : 'Selecionar horário';
}

function isValidDateInput(value: string) {
  return parseDateValue(value) !== undefined;
}

function isValidTimeInput(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
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
    isValidTimeInput(props.value) ? Number(props.value.slice(3, 5)) : undefined,
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

  useEffect(() => {
    if (!isValidTimeInput(props.value)) {
      setSelectedHour(undefined);
      setSelectedMinute(undefined);
      return;
    }
    setSelectedHour(Number(props.value.slice(0, 2)));
    setSelectedMinute(Number(props.value.slice(3, 5)));
  }, [props.value]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const selectHour = (hour: number) => {
    setSelectedHour(hour);
    if (selectedMinute !== undefined)
      props.onChange(`${String(hour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`);
  };
  const selectMinute = (minute: number) => {
    setSelectedMinute(minute);
    if (selectedHour !== undefined)
      props.onChange(`${String(selectedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  };

  return (
    <div className="date-time-field">
      <label htmlFor={`${titleId}-trigger`}>{props.label}</label>
      <input
        id={`${titleId}-trigger`}
        ref={triggerRef}
        className="date-time-trigger"
        type="text"
        lang="pt-BR"
        value={formatTimeLabel(props.value)}
        readOnly
        required={props.required && props.value.length === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${titleId}-dialog` : undefined}
        aria-required={props.required || undefined}
        aria-label={props.label}
        onChange={(event) => {
          if (isValidTimeInput(event.target.value)) props.onChange(event.target.value);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      <input type="hidden" name={props.name} value={props.value} />
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
                {formatTimeLabel(props.value)}
              </p>
            </div>
            <div className="time-picker-section">
              <span className="time-picker-label">Hora</span>
              <div className="time-picker-grid time-picker-hours">
                {Array.from({ length: 24 }, (_, hour) => (
                  <button
                    className={`time-picker-option${selectedHour === hour ? ' selected' : ''}`}
                    type="button"
                    key={hour}
                    aria-pressed={selectedHour === hour}
                    onClick={() => selectHour(hour)}
                  >
                    {String(hour).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
            <div className="time-picker-section">
              <span className="time-picker-label">Minutos</span>
              <div className="time-picker-grid time-picker-minutes">
                {minuteOptions.map((minute) => (
                  <button
                    className={`time-picker-option${selectedMinute === minute ? ' selected' : ''}`}
                    type="button"
                    key={minute}
                    aria-pressed={selectedMinute === minute}
                    onClick={() => selectMinute(minute)}
                  >
                    {String(minute).padStart(2, '0')}
                  </button>
                ))}
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
