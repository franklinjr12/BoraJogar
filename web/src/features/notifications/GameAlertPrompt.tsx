import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dismissGameAlertPrompt, gameAlertPromptReady } from './gameAlertPromptState';

export function GameAlertPrompt({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(() => gameAlertPromptReady());

  useEffect(() => {
    const show = () => {
      if (gameAlertPromptReady()) setOpen(true);
    };
    window.addEventListener('borajogar-game-alert-ready', show);
    return () => window.removeEventListener('borajogar-game-alert-ready', show);
  }, []);

  if (!open) return null;

  const dismiss = () => {
    dismissGameAlertPrompt();
    setOpen(false);
    onChanged?.();
  };

  return (
    <aside className="install-prompt card" aria-label="Alertas de partidas">
      <h2>Acompanhe os avisos das suas partidas</h2>
      <p>Propostas, confirmações, alterações e lembretes ficam reunidos na aba Avisos.</p>
      <div className="actions compact-actions">
        <Link className="button" to="/notifications" onClick={dismiss}>
          Ver avisos
        </Link>
        <button className="text-button" type="button" onClick={dismiss}>
          Agora não
        </button>
      </div>
    </aside>
  );
}
