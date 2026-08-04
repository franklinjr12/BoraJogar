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
    <aside className="install-prompt card" aria-label="Game alerts">
      <h2>Get notified when a game is found</h2>
      <p>We'll only alert you about proposals, confirmations, changes and reminders.</p>
      <div className="actions compact-actions">
        <button className="button" onClick={() => void enable()}>
          Enable game alerts
        </button>
        <button className="text-button" onClick={dismiss}>
          Use email only
        </button>
      </div>
    </aside>
  );
}
