import { NavLink } from 'react-router-dom';
import { GameAlertPrompt } from '../features/notifications/GameAlertPrompt';
import { InstallPrompt } from './InstallPrompt';
import { OfflineStatus } from './OfflineStatus';

const links = [
  ['/', 'Home'],
  ['/games', 'Games'],
  ['/availability', 'Availability'],
  ['/notifications', 'Notifications'],
  ['/profile', 'Profile'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineStatus />
      <nav className="mobile-nav" aria-label="Primary navigation">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {label}
          </NavLink>
        ))}
        {localStorage.getItem('borajogar_role') === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      {children}
      <GameAlertPrompt />
      <InstallPrompt />
    </>
  );
}
