import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePickerField, TimePickerField } from './DateTimePicker';

afterEach(cleanup);

describe('DatePickerField', () => {
  it('navigates calendar, blocks dates before minimum and returns focus after closing', async () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        label="Data"
        name="date"
        min="2026-08-10"
        value="2026-08-10"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByLabelText('Data');
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /10 de agosto de 2026/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'dom., 9 de agosto de 2026' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /15 de setembro de 2026/i }));
    expect(onChange).toHaveBeenCalledWith('2026-09-15');

    fireEvent.click(screen.getByRole('button', { name: 'Concluído' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes with Escape without changing selected date', async () => {
    const onChange = vi.fn();
    render(
      <DatePickerField
        label="Data"
        name="date"
        min="2026-08-01"
        value="2026-08-10"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Data'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Data')));
  });
});

describe('TimePickerField', () => {
  it('uses native time input with one-minute precision', () => {
    const onChange = vi.fn();
    const view = render(
      <TimePickerField label="Horário" name="time" value="09:00" onChange={onChange} required />,
    );

    const input = screen.getByLabelText('Horário');
    expect(input).toHaveAttribute('type', 'time');
    expect(input).toHaveAttribute('step', '60');
    expect(input).toHaveAttribute('lang', 'pt-BR');
    expect(input).toBeRequired();
    expect(input).toHaveValue('09:00');

    fireEvent.change(input, { target: { value: '09:35' } });
    expect(onChange).toHaveBeenLastCalledWith('09:35');
    view.rerender(
      <TimePickerField label="Horário" name="time" value="09:35" onChange={onChange} required />,
    );

    const hiddenInput = document.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="time"]',
    );
    expect(hiddenInput).toHaveValue('09:35');
  });

  it('offers a large non-scrolling mobile picker with cancel and apply', () => {
    const onChange = vi.fn();
    render(<TimePickerField label="Horário" name="time" value="09:35" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '09:35, abrir seletor de horário' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar hora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar minutos' }));
    expect(screen.getByText('10:36')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Definir' }));
    expect(onChange).toHaveBeenLastCalledWith('10:36');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('normalizes leading zeroes while typing mobile time values', () => {
    render(<TimePickerField label="Horário" name="time" value="09:05" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '09:05, abrir seletor de horário' }));
    const hourInput = screen.getByLabelText('Hora');
    const minuteInput = screen.getByLabelText('Minutos');
    fireEvent.change(hourInput, { target: { value: '013' } });
    fireEvent.change(minuteInput, { target: { value: '050' } });

    expect(hourInput).toHaveValue('13');
    expect(minuteInput).toHaveValue('50');
  });
});
