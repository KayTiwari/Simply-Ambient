// Pure decision logic for the rate-app prompt. Deliberately free of React
// Native imports so it runs under plain Node in jest, like binauralMath.ts.
//
// The prompt philosophy: ask once, ever, and only after the app has clearly
// earned it. A user must have opened the app several times across several
// days AND finished at least one real session before the in-app review
// dialog is even considered. The manual "Rate Simply Ambient" row in
// More -> Support is always available and never gated.

export type RateState = {
  /** ms epoch of the first recorded app open (0 = never recorded). */
  firstOpenAt: number;
  /** Count of app cold starts. */
  opens: number;
  /** Completed sessions: breath session finished, mala reached 108, or a sleep timer ran to its end. */
  sessions: number;
  /** ms epoch when the review dialog was requested; null if never. Once set, the prompt never fires again. */
  promptedAt: number | null;
};

export const INITIAL_RATE_STATE: RateState = {
  firstOpenAt: 0,
  opens: 0,
  sessions: 0,
  promptedAt: null,
};

export const MIN_OPENS = 5;
export const MIN_DAYS_SINCE_FIRST_OPEN = 3;
export const MIN_COMPLETED_SESSIONS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a stored JSON blob into a well-formed RateState, tolerating junk. */
export function normalizeRateState(raw: unknown): RateState {
  if (typeof raw !== 'object' || raw === null) return { ...INITIAL_RATE_STATE };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    firstOpenAt: num(r.firstOpenAt),
    opens: num(r.opens),
    sessions: num(r.sessions),
    promptedAt:
      typeof r.promptedAt === 'number' && Number.isFinite(r.promptedAt) && r.promptedAt > 0
        ? r.promptedAt
        : null,
  };
}

export function recordOpen(state: RateState, nowMs: number): RateState {
  return {
    ...state,
    firstOpenAt: state.firstOpenAt > 0 ? state.firstOpenAt : nowMs,
    opens: state.opens + 1,
  };
}

export function recordSession(state: RateState): RateState {
  return { ...state, sessions: state.sessions + 1 };
}

export function shouldRequestReview(state: RateState, nowMs: number): boolean {
  if (state.promptedAt !== null) return false;
  if (state.firstOpenAt <= 0) return false;
  if (state.opens < MIN_OPENS) return false;
  if (state.sessions < MIN_COMPLETED_SESSIONS) return false;
  if (nowMs - state.firstOpenAt < MIN_DAYS_SINCE_FIRST_OPEN * DAY_MS) return false;
  return true;
}

export function markPrompted(state: RateState, nowMs: number): RateState {
  return { ...state, promptedAt: nowMs };
}
