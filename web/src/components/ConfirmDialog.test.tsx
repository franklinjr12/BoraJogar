import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('supports cancel, confirm and Escape dismissal', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Cancelar partida?"
        message="Todos os jogadores serão avisados."
        confirmLabel="Cancelar partida"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('button', { name: /^Cancelar$/ })).toHaveFocus();
    const confirmButton = screen.getByRole('button', { name: 'Cancelar partida' });
    confirmButton.focus();
    fireEvent.keyDown(confirmButton, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /^Cancelar$/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/ }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar partida' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
