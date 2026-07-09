import {
  INITIAL_RATE_STATE,
  MIN_COMPLETED_SESSIONS,
  MIN_DAYS_SINCE_FIRST_OPEN,
  MIN_OPENS,
  markPrompted,
  normalizeRateState,
  recordOpen,
  recordSession,
  shouldRequestReview,
  type RateState,
} from '../lib/rateGate';

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = 1_750_000_000_000; // fixed epoch for deterministic tests

/** A state that satisfies every gate condition at time `now`. */
function eligibleState(now: number): RateState {
  return {
    firstOpenAt: now - MIN_DAYS_SINCE_FIRST_OPEN * DAY_MS,
    opens: MIN_OPENS,
    sessions: MIN_COMPLETED_SESSIONS,
    promptedAt: null,
  };
}

describe('normalizeRateState', () => {
  test('null, junk, and non-objects fall back to the initial state', () => {
    expect(normalizeRateState(null)).toEqual(INITIAL_RATE_STATE);
    expect(normalizeRateState(undefined)).toEqual(INITIAL_RATE_STATE);
    expect(normalizeRateState('garbage')).toEqual(INITIAL_RATE_STATE);
    expect(normalizeRateState(42)).toEqual(INITIAL_RATE_STATE);
  });

  test('negative, NaN, and wrong-typed fields are zeroed', () => {
    const s = normalizeRateState({ firstOpenAt: -5, opens: NaN, sessions: '3', promptedAt: 0 });
    expect(s).toEqual(INITIAL_RATE_STATE);
  });

  test('well-formed state passes through', () => {
    const good = eligibleState(T0);
    expect(normalizeRateState(good)).toEqual(good);
  });
});

describe('recordOpen / recordSession', () => {
  test('first open stamps firstOpenAt; later opens keep it', () => {
    const s1 = recordOpen(INITIAL_RATE_STATE, T0);
    expect(s1.firstOpenAt).toBe(T0);
    expect(s1.opens).toBe(1);
    const s2 = recordOpen(s1, T0 + DAY_MS);
    expect(s2.firstOpenAt).toBe(T0);
    expect(s2.opens).toBe(2);
  });

  test('recordSession increments only the session counter', () => {
    const s = recordSession(eligibleState(T0));
    expect(s.sessions).toBe(MIN_COMPLETED_SESSIONS + 1);
    expect(s.opens).toBe(MIN_OPENS);
  });
});

describe('shouldRequestReview', () => {
  test('passes when every condition is met', () => {
    expect(shouldRequestReview(eligibleState(T0), T0)).toBe(true);
  });

  test('never prompts a brand-new install', () => {
    expect(shouldRequestReview(INITIAL_RATE_STATE, T0)).toBe(false);
  });

  test('requires enough opens', () => {
    const s = { ...eligibleState(T0), opens: MIN_OPENS - 1 };
    expect(shouldRequestReview(s, T0)).toBe(false);
  });

  test('requires at least one completed session', () => {
    const s = { ...eligibleState(T0), sessions: 0 };
    expect(shouldRequestReview(s, T0)).toBe(false);
  });

  test('requires enough days since first open', () => {
    const s = { ...eligibleState(T0), firstOpenAt: T0 - (MIN_DAYS_SINCE_FIRST_OPEN * DAY_MS - 1) };
    expect(shouldRequestReview(s, T0)).toBe(false);
  });

  test('never prompts twice', () => {
    const s = markPrompted(eligibleState(T0), T0);
    expect(shouldRequestReview(s, T0 + 365 * DAY_MS)).toBe(false);
  });

  test('a heavy first day is still not enough without elapsed days', () => {
    let s = INITIAL_RATE_STATE;
    for (let i = 0; i < 20; i++) s = recordOpen(s, T0);
    for (let i = 0; i < 20; i++) s = recordSession(s);
    expect(shouldRequestReview(s, T0)).toBe(false);
    expect(shouldRequestReview(s, T0 + MIN_DAYS_SINCE_FIRST_OPEN * DAY_MS)).toBe(true);
  });
});
