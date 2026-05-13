import {
  MIN_HZ,
  MAX_HZ,
  clampHz,
  comfortableCarrier,
  btoaFallback,
  atobFallback,
  nextStreakCount,
  visibleStreak,
} from '../lib/binauralMath';

describe('clampHz', () => {
  test('rounds to integer', () => {
    expect(clampHz(200.7)).toBe(201);
    expect(clampHz(199.3)).toBe(199);
  });
  test('clamps below MIN_HZ', () => {
    expect(clampHz(0)).toBe(MIN_HZ);
    expect(clampHz(-100)).toBe(MIN_HZ);
  });
  test('clamps above MAX_HZ', () => {
    expect(clampHz(9999)).toBe(MAX_HZ);
    expect(clampHz(MAX_HZ + 1)).toBe(MAX_HZ);
  });
  test('passes through valid values', () => {
    expect(clampHz(200)).toBe(200);
    expect(clampHz(MIN_HZ)).toBe(MIN_HZ);
    expect(clampHz(MAX_HZ)).toBe(MAX_HZ);
  });
});

describe('comfortableCarrier', () => {
  test('Solfeggio frequencies octave-shift into safe range', () => {
    // All should land between 120 and 280 Hz inclusive
    [396, 417, 432, 528, 639, 741, 852, 963].forEach(hz => {
      const c = comfortableCarrier(hz);
      expect(c).toBeGreaterThanOrEqual(120);
      expect(c).toBeLessThanOrEqual(280);
    });
  });
  test('preserves octave relationship', () => {
    // 528 is C5, comfortableCarrier(528) should be C4 (264) or similar
    expect(comfortableCarrier(528)).toBe(264);
    expect(comfortableCarrier(963)).toBeCloseTo(240.75, 2);
    expect(comfortableCarrier(396)).toBe(198);
  });
  test('raises low frequencies into the comfortable range', () => {
    expect(comfortableCarrier(60)).toBeGreaterThanOrEqual(120);
    expect(comfortableCarrier(60)).toBeLessThanOrEqual(280);
  });
  test('passes through values already in range', () => {
    expect(comfortableCarrier(200)).toBe(200);
    expect(comfortableCarrier(150)).toBe(150);
  });
});

describe('btoaFallback / atobFallback', () => {
  test('round-trip ASCII strings', () => {
    const cases = ['hello world', '', 'a', 'ab', 'abc', 'tiwkay@gmail.com', 'Simply Ambient'];
    for (const s of cases) {
      expect(atobFallback(btoaFallback(s))).toBe(s);
    }
  });
  test('matches known Base64 fixtures', () => {
    expect(btoaFallback('Man')).toBe('TWFu');
    expect(btoaFallback('M')).toBe('TQ==');
    expect(btoaFallback('Ma')).toBe('TWE=');
    expect(atobFallback('TWFu')).toBe('Man');
    expect(atobFallback('dGl3a2F5QGdtYWlsLmNvbQ==')).toBe('tiwkay@gmail.com');
  });
});

describe('streak math', () => {
  const today = '2026-05-07';
  const yesterday = '2026-05-06';
  const longAgo = '2026-04-01';

  test('first activity ever starts a streak of 1', () => {
    expect(nextStreakCount({ lastDate: '', count: 0, today, yesterday })).toEqual({
      lastDate: today, count: 1,
    });
  });
  test('second activity same day is a no-op', () => {
    expect(nextStreakCount({ lastDate: today, count: 5, today, yesterday })).toEqual({
      lastDate: today, count: 5,
    });
  });
  test('activity on consecutive days increments', () => {
    expect(nextStreakCount({ lastDate: yesterday, count: 5, today, yesterday })).toEqual({
      lastDate: today, count: 6,
    });
  });
  test('gap of more than one day resets to 1', () => {
    expect(nextStreakCount({ lastDate: longAgo, count: 5, today, yesterday })).toEqual({
      lastDate: today, count: 1,
    });
  });

  test('visible streak shows count when last activity was today', () => {
    expect(visibleStreak({ lastDate: today, count: 7, today, yesterday })).toBe(7);
  });
  test('visible streak shows count when last activity was yesterday', () => {
    expect(visibleStreak({ lastDate: yesterday, count: 7, today, yesterday })).toBe(7);
  });
  test('visible streak is 0 when last activity was older than yesterday', () => {
    expect(visibleStreak({ lastDate: longAgo, count: 7, today, yesterday })).toBe(0);
  });
});
