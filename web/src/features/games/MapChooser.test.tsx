import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapChooser } from './MapChooser';

describe('MapChooser', () => {
  it('reveals Google Maps, Apple Maps, and Waze links', () => {
    render(<MapChooser latitude={-23.5} longitude={-46.6} label="Central court" />);

    const details = screen.getByText('Abrir mapa do local').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('Abrir mapa do local'));
    expect(details).toHaveAttribute('open');

    for (const provider of ['Google Maps', 'Apple Maps', 'Waze']) {
      const link = screen.getByRole('link', { name: provider });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });
});
