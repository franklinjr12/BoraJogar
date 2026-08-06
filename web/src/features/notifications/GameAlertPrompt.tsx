import { useEffect, useState } from 'react';
import { dismissGameAlertPrompt, gameAlertPromptReady } from './gameAlertPromptState';

export function GameAlertPrompt() {
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
  };

  const enable = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
    dismiss();
  };

  return (
    <aside className="install-prompt card" aria-label="Alertas de partidas">
      <h2>Receba avisos quando uma partida for encontrada</h2>
      <p>Avisaremos apenas sobre propostas, confirmações, alterações e lembretes.</p>
      <div className="actions compact-actions">
        <button className="button" onClick={() => void enable()}>
          Ativar alertas de partidas
        </button>
        <button className="text-button" onClick={dismiss}>
          Usar apenas e-mail
        </button>
      </div>
    </aside>
  );
}
