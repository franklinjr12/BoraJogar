import type { Game } from '../../api/client';

export function sortGamesForDisplay(games: Game[], now = Date.now()): Game[] {
  return [...games].sort((left, right) => {
    const fullOrder = Number(left.openSlots <= 0) - Number(right.openSlots <= 0);
    if (fullOrder !== 0) return fullOrder;

    const leftStartsAt = Date.parse(left.startsAt);
    const rightStartsAt = Date.parse(right.startsAt);
    const leftDistance = Number.isNaN(leftStartsAt)
      ? Number.POSITIVE_INFINITY
      : Math.abs(leftStartsAt - now);
    const rightDistance = Number.isNaN(rightStartsAt)
      ? Number.POSITIVE_INFINITY
      : Math.abs(rightStartsAt - now);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return left.id.localeCompare(right.id);
  });
}
