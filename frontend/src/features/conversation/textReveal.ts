// Bound visual catch-up without delaying protocol events or the next action.
export function nextRevealLength(current: number, total: number, elapsed: number, remainingMs: number) {
  if (remainingMs <= 0 || current >= total) return total
  return Math.min(total, current + Math.max(1, Math.ceil((total - current) * elapsed / remainingMs)))
}
