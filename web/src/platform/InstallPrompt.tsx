import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function platformGuide(): { title: string; text: string } {
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes('iphone') || agent.includes('ipad')) {
    return {
      title: 'Adicionar Bora Jogar à tela inicial',
      text: 'Toque em Compartilhar e depois em Adicionar à Tela de Início no Safari.',
    };
  }
  if (agent.includes('android')) {
    return {
      title: 'Instalar o Bora Jogar',
      text: 'Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial.',
    };
  }
  return {
    title: 'Instalar o Bora Jogar',
    text: 'Use o ícone de instalação na barra de endereço ou no menu do navegador Chromium.',
  };
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [ready] = useState(() => localStorage.getItem('borajogar_install_prompt_ready') === 'true');

  useEffect(() => {
    if (!ready) return;
    const onBeforeInstall = (nextEvent: Event) => {
      nextEvent.preventDefault();
      setEvent(nextEvent as BeforeInstallPromptEvent);
      setOpen(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [ready]);

  if (!open || !ready) return null;
  const guide = platformGuide();
  const install = async () => {
    if (event) {
      await event.prompt();
      await event.userChoice;
    }
    setOpen(false);
  };
  return (
    <aside className="install-prompt card" aria-label="Instalar o Bora Jogar">
      <h2>{guide.title}</h2>
      <p>{guide.text}</p>
      <div className="actions">
        {event && (
          <button className="button" type="button" onClick={install}>
            Instalar aplicativo
          </button>
        )}
        <button className="text-button" type="button" onClick={() => setOpen(false)}>
          Agora não
        </button>
      </div>
    </aside>
  );
}
