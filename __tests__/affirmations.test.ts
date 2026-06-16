import { NOTIF_AFFIRMATIONS } from '../lib/affirmations';

describe('affirmation pool', () => {
  test('generates exactly 1000 unique affirmations', () => {
    expect(NOTIF_AFFIRMATIONS).toHaveLength(1000);
    expect(new Set(NOTIF_AFFIRMATIONS).size).toBe(1000);
  });

  test('affirmations are non-empty sentences', () => {
    for (const affirmation of NOTIF_AFFIRMATIONS) {
      expect(affirmation.trim()).toBe(affirmation);
      expect(affirmation.length).toBeGreaterThan(20);
      expect(affirmation.endsWith('.')).toBe(true);
    }
  });
});
