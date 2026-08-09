import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('selects time with vertical wheels and defaults minute to zero', () => {
    const onChange = vi.fn();
    render(<TimePickerField label="Horário" name="time" value="" onChange={onChange} required />);

    fireEvent.click(screen.getByRole('button', { name: /abrir seletor de horário/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const hourWheel = screen.getByRole('listbox', { name: 'Hora' });
    const minuteWheel = screen.getByRole('listbox', { name: 'Minutos' });
    expect(within(minuteWheel).getByRole('option', { name: '00' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(within(hourWheel).getByRole('option', { name: '09' }));
    fireEvent.click(within(minuteWheel).getByRole('option', { name: '35' }));
    expect(onChange).toHaveBeenLastCalledWith('09:35');

    const hiddenInput = document.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="time"]',
    );
    expect(hiddenInput).toHaveValue('09:35');
    fireEvent.click(screen.getByRole('button', { name: 'Concluído' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('accepts typed hours with or without a colon', () => {
    const onChange = vi.fn();
    render(<TimePickerField label="Horário" name="time" value="" onChange={onChange} />);

    const input = screen.getByLabelText('Horário');
    fireEvent.change(input, { target: { value: '1030' } });

    expect(input).toHaveValue('10:30');
    expect(onChange).toHaveBeenLastCalledWith('10:30');
  });
});
