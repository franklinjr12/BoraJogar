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
  it('selects 24-hour time in five-minute steps and keeps value in hidden form input', () => {
    const onChange = vi.fn();
    render(<TimePickerField label="Horário" name="time" value="" onChange={onChange} required />);

    fireEvent.click(screen.getByLabelText('Horário'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '23' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '35' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '34' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '09' }));
    fireEvent.click(screen.getByRole('button', { name: '35' }));
    expect(onChange).toHaveBeenLastCalledWith('09:35');

    const hiddenInput = document.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="time"]',
    );
    expect(hiddenInput).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Concluído' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
