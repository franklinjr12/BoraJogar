import { NavLink } from 'react-router-dom';
import { GameAlertPrompt } from '../features/notifications/GameAlertPrompt';
import { InstallPrompt } from './InstallPrompt';
import { OfflineStatus } from './OfflineStatus';

const links = [
  ['/', 'Início'],
  ['/games', 'Partidas'],
  ['/locations', 'Quadras'],
  ['/availability', 'Disponibilidade'],
  ['/notifications', 'Notificações'],
  ['/profile', 'Perfil'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineStatus />
      <nav className="mobile-nav" aria-label="Navegação principal">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {label}
          </NavLink>
        ))}
        {localStorage.getItem('borajogar_role') === 'admin' && (
          <NavLink to="/admin">Administração</NavLink>
        )}
      </nav>
      {children}
      <GameAlertPrompt />
      <InstallPrompt />
    </>
  );
}
