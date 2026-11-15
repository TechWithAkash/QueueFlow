/**
 * Fractional ordering for the waiting list.
 * Each waiting token has a numeric `position`; the list is sorted ascending.
 * Moving a token only rewrites that one token's position (the midpoint of its
 * new neighbours), so reordering is a single, conflict-free write.
 */
export const STEP = 1024;
const MIN_GAP = 1e-6;

/** Position for a token placed between `before` and `after` (either may be missing). */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return STEP;
  if (before == null) return (after as number) - STEP;
  if (after == null) return before + STEP;
  return (before + after) / 2;
}

/** True when two neighbours are too close to fit a midpoint reliably. */
export function needsRebalance(before: number | null, after: number | null): boolean {
  return before != null && after != null && Math.abs(after - before) < MIN_GAP;
}

/** Evenly spaced positions for n items, used when rebalancing. */
export function evenPositions(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i + 1) * STEP);
}

/**
 * Where a newly added token goes. Priority tokens join behind other waiting
 * priority tokens but ahead of every normal one; normal tokens go to the back.
 * `waiting` must be sorted by position.
 */
export function insertionNeighbours(
  waiting: { position: number; priority: boolean }[],
  priority: boolean,
): { before: number | null; after: number | null } {
  if (waiting.length === 0) return { before: null, after: null };
  if (!priority) return { before: waiting[waiting.length - 1].position, after: null };
  const firstNormal = waiting.findIndex((t) => !t.priority);
  if (firstNormal === -1) return { before: waiting[waiting.length - 1].position, after: null };
  return {
    before: firstNormal === 0 ? null : waiting[firstNormal - 1].position,
    after: waiting[firstNormal].position,
  };
}

/**
 * Estimated wait (seconds) for the token with `ahead` people in front of it.
 * Tokens are served in "rounds" of `counters` at a time; we assume the token
 * currently at the counter is on average half done.
 */
export function estimateWaitSec(ahead: number, avgServiceSec: number, counters: number): number {
  const c = Math.max(1, Math.floor(counters));
  const rounds = Math.ceil((ahead + 1) / c);
  return Math.max(0, Math.round(rounds * avgServiceSec - avgServiceSec / 2));
}
