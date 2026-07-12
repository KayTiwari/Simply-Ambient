export const SYNODIC_MONTH_DAYS = 29.5305882;

const TODAY_WINDOW_DAYS = 0.6;

export function lunarCountdownLabel(phase: number): string {
  if (!Number.isFinite(phase)) return 'Moon timing unavailable';
  const normalized = ((phase % 1) + 1) % 1;
  const daysFromNew = Math.min(normalized, 1 - normalized) * SYNODIC_MONTH_DAYS;
  const daysFromFull = Math.abs(normalized - 0.5) * SYNODIC_MONTH_DAYS;

  if (daysFromNew <= TODAY_WINDOW_DAYS) return 'New Moon today';
  if (daysFromFull <= TODAY_WINDOW_DAYS) return 'Full Moon today';

  const waxing = normalized < 0.5;
  const exactDays = waxing
    ? (0.5 - normalized) * SYNODIC_MONTH_DAYS
    : (1 - normalized) * SYNODIC_MONTH_DAYS;
  const days = Math.max(1, Math.ceil(exactDays - 1e-9));
  const target = waxing ? 'Full Moon' : 'New Moon';
  return `${days} ${days === 1 ? 'day' : 'days'} until ${target}`;
}
