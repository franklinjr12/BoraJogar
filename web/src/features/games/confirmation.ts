import type { Game } from '../../api/client';

export function isConfirmationWindowOpen(game: Game, now = Date.now()) {
  if (!game.confirmation?.enabled || game.status !== 'scheduled') return false;
  const startsAt = Date.parse(game.startsAt);
  const endsAt = Date.parse(game.endsAt);
  return (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    now >= startsAt - 24 * 60 * 60 * 1000 &&
    now <= endsAt
  );
}
