import {
  addPractice,
  mergePracticeTimestamps,
  normalizePracticeLog,
  practiceDayKey,
  practiceStreak,
  practicedDaysInMonth,
  recordPractice,
  loadPracticeLog,
  PRACTICE_LOG_MAX_DAYS,
  STORAGE_KEY_PRACTICE,
  type PracticeLog,
} from '../lib/practiceLog';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('practice log', () => {
  it('keys days in local time', () => {
    expect(practiceDayKey(day(2026, 9, 27, 0))).toBe('2026-09-27');
    expect(practiceDayKey(day(2026, 9, 27, 23))).toBe('2026-09-27');
    expect(practiceDayKey(day(2026, 1, 5))).toBe('2026-01-05');
  });

  it('adds kinds once per day and returns the same log when nothing changes', () => {
    let log: PracticeLog = {};
    log = addPractice(log, 'breath', day(2026, 9, 27));
    log = addPractice(log, 'listen', day(2026, 9, 27));
    const again = addPractice(log, 'listen', day(2026, 9, 27));
    expect(again).toBe(log);
    expect(log['2026-09-27']).toEqual(['breath', 'listen']);
  });

  it('keeps only the most recent days past the cap', () => {
    let log: PracticeLog = {};
    const start = day(2024, 1, 1);
    for (let i = 0; i < PRACTICE_LOG_MAX_DAYS + 25; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      log = addPractice(log, 'mood', d);
    }
    const keys = Object.keys(log).sort();
    expect(keys).toHaveLength(PRACTICE_LOG_MAX_DAYS);
    expect(keys[0] > '2024-01-01').toBe(true);
  });

  it('drops malformed stored data', () => {
    expect(normalizePracticeLog(null)).toEqual({});
    expect(normalizePracticeLog([1, 2])).toEqual({});
    expect(normalizePracticeLog({
      '2026-09-27': ['breath', 'nap', 'breath'],
      'not-a-day': ['listen'],
      '2026-09-26': 'listen',
    })).toEqual({ '2026-09-27': ['breath'] });
  });

  it('counts a streak through today, or through yesterday while today is open', () => {
    const today = day(2026, 9, 27);
    let log: PracticeLog = {};
    log = addPractice(log, 'breath', day(2026, 9, 24));
    log = addPractice(log, 'breath', day(2026, 9, 25));
    log = addPractice(log, 'listen', day(2026, 9, 26));
    expect(practiceStreak(log, today)).toBe(3);
    log = addPractice(log, 'mood', today);
    expect(practiceStreak(log, today)).toBe(4);
    // A missed day two days ago ends the run.
    expect(practiceStreak({ '2026-09-27': ['mood'], '2026-09-25': ['mood'] }, today)).toBe(1);
    expect(practiceStreak({ '2026-09-25': ['mood'] }, today)).toBe(0);
  });

  it('folds mood and gratitude timestamps into the view without duplicates', () => {
    const log = addPractice({}, 'breath', day(2026, 9, 20));
    const merged = mergePracticeTimestamps(log, [
      { ts: day(2026, 9, 20).getTime(), kind: 'mood' },
      { ts: day(2026, 9, 21).getTime(), kind: 'gratitude' },
      { ts: day(2026, 9, 21).getTime(), kind: 'gratitude' },
      { ts: Number.NaN, kind: 'gratitude' },
    ]);
    expect(merged['2026-09-20']).toEqual(['breath', 'mood']);
    expect(merged['2026-09-21']).toEqual(['gratitude']);
    expect(practicedDaysInMonth(merged, 2026, 8)).toBe(2);
    expect(practicedDaysInMonth(merged, 2026, 7)).toBe(0);
  });

  it('records through the storage interface and skips writes when nothing changed', async () => {
    const store = new Map<string, string>();
    let writes = 0;
    const storage = {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { writes += 1; store.set(k, v); },
    };
    await recordPractice(storage, 'listen', day(2026, 9, 27));
    await recordPractice(storage, 'listen', day(2026, 9, 27));
    await recordPractice(storage, 'breath', day(2026, 9, 27));
    expect(writes).toBe(2);
    expect(await loadPracticeLog(storage)).toEqual({ '2026-09-27': ['listen', 'breath'] });
    store.set(STORAGE_KEY_PRACTICE, '{oops');
    expect(await loadPracticeLog(storage)).toEqual({});
  });
});
