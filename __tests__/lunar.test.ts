import { SYNODIC_MONTH_DAYS, lunarCountdownLabel } from '../lib/lunar';

describe('lunar countdown labels', () => {
  test('marks the New Moon date', () => {
    expect(lunarCountdownLabel(0)).toBe('New Moon today');
    expect(lunarCountdownLabel(1)).toBe('New Moon today');
  });

  test('counts waxing phases toward the Full Moon', () => {
    const threeDaysBeforeFull = 0.5 - 3 / SYNODIC_MONTH_DAYS;
    expect(lunarCountdownLabel(threeDaysBeforeFull)).toBe('3 days until Full Moon');
  });

  test('marks the Full Moon date on either side of the phase boundary', () => {
    expect(lunarCountdownLabel(0.5)).toBe('Full Moon today');
    expect(lunarCountdownLabel(0.5 + 0.25 / SYNODIC_MONTH_DAYS)).toBe('Full Moon today');
  });

  test('counts waning phases toward the New Moon', () => {
    const oneDayBeforeNew = 1 - 1 / SYNODIC_MONTH_DAYS;
    expect(lunarCountdownLabel(oneDayBeforeNew)).toBe('1 day until New Moon');
  });

  test('does not present invalid phase data as a lunar event', () => {
    expect(lunarCountdownLabel(Number.NaN)).toBe('Moon timing unavailable');
  });
});
