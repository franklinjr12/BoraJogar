import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { authApi, notificationApi, type CurrentUser } from '../api/client';
import { GameAlertPrompt } from '../features/notifications/GameAlertPrompt';
import { notificationsChangedEvent } from '../features/notifications/notificationEvents';
import { InstallPrompt } from './InstallPrompt';
import { OfflineStatus } from './OfflineStatus';

const primaryLinks = [
  ['/dashboard', 'Painel'],
  ['/games', 'Partidas'],
  ['/calendar', 'Agenda'],
  ['/notifications', 'Notificações'],
] as const;

const secondaryLinks = [
  ['/locations', 'Quadras'],
  ['/availability', 'Disponibilidade'],
] as const;

function isPublicOnlyRoute(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/start' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/invite/')
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const currentUser = useQuery<CurrentUser>({
    queryKey: ['current-user'],
    queryFn: authApi.currentUser,
    retry: false,
  });
  const unread = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationApi.list(1, 1),
    enabled: Boolean(currentUser.data),
    staleTime: 30_000,
  });
  const showNavigation = !isPublicOnlyRoute(location.pathname);
  const notificationCount = unread.data?.unreadCount ?? 0;

  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    globalThis.window.addEventListener(notificationsChangedEvent, refresh);
    return () => globalThis.window.removeEventListener(notificationsChangedEvent, refresh);
  }, [queryClient]);

  useEffect(() => {
    if (currentUser.data?.timeZone) {
      localStorage.setItem('borajogar_timezone', currentUser.data.timeZone);
    }
  }, [currentUser.data]);

  const markNotificationsStale = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  };

  return (
    <>
      <OfflineStatus />
      {showNavigation && (
        <nav className="mobile-nav" aria-label="Navegação principal">
          {currentUser.data ? (
            <>
              {primaryLinks.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/dashboard'}>
                  {label}
                  {to === '/notifications' && notificationCount > 0 && (
                    <span className="nav-badge" aria-label={`${notificationCount} não lida(s)`}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </NavLink>
              ))}
              <NavLink to="/profile">Perfil</NavLink>
              <details className="nav-more" key={location.pathname}>
                <summary>Mais</summary>
                <div className="nav-more-links">
                  {secondaryLinks.map(([to, label]) => (
                    <NavLink key={to} to={to}>
                      {label}
                    </NavLink>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <NavLink to="/games">Partidas</NavLink>
          )}
        </nav>
      )}
      {children}
      <GameAlertPrompt onChanged={markNotificationsStale} />
      <InstallPrompt />
    </>
  );
}
