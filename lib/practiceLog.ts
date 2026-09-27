// Practice history: which local days carried a listening session, a breath
// session, a mood check-in, or a gratitude entry. Pure functions here; App
// owns the AsyncStorage calls through the small storage interface below so
// the log can be unit-tested in plain Node.

export type PracticeKind = 'listen' | 'breath' | 'mood' | 'gratitude';
export const PRACTICE_KINDS: readonly PracticeKind[] = ['listen', 'breath', 'mood', 'gratitude'];

// Day key -> kinds practiced that day. Keys are local calendar dates.
export type PracticeLog = Record<string, PracticeKind[]>;

export const STORAGE_KEY_PRACTICE = '@simply_ambient_practice_log_v1';
export const PRACTICE_LOG_MAX_DAYS = 400;

export function practiceDayKey(d: Date): string {
  // Local date parts: users experience local days, and UTC keys would shift
  // an evening session onto tomorrow for anyone west of UTC.
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isPracticeKind(value: unknown): value is PracticeKind {
  return typeof value === 'string' && (PRACTICE_KINDS as readonly string[]).includes(value);
}

export function normalizePracticeLog(raw: unknown): PracticeLog {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PracticeLog = {};
  for (const [key, kinds] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(kinds)) continue;
    const clean = kinds.filter(isPracticeKind);
    if (clean.length) out[key] = Array.from(new Set(clean));
  }
  return out;
}

function trimToMaxDays(log: PracticeLog): PracticeLog {
  const keys = Object.keys(log).sort();
  if (keys.length <= PRACTICE_LOG_MAX_DAYS) return log;
  const keep = new Set(keys.slice(keys.length - PRACTICE_LOG_MAX_DAYS));
  const out: PracticeLog = {};
  for (const key of keys) if (keep.has(key)) out[key] = log[key];
  return out;
}

export function addPractice(log: PracticeLog, kind: PracticeKind, date: Date = new Date()): PracticeLog {
  const key = practiceDayKey(date);
  const existing = log[key] ?? [];
  if (existing.includes(kind)) return log;
  return trimToMaxDays({ ...log, [key]: [...existing, kind] });
}

// Folds timestamps kept elsewhere (mood and gratitude entries predate this
// log) into a view of the log without writing them back.
export function mergePracticeTimestamps(
  log: PracticeLog,
  entries: ReadonlyArray<{ ts: number; kind: PracticeKind }>,
): PracticeLog {
  let out = log;
  for (const entry of entries) {
    if (!Number.isFinite(entry.ts)) continue;
    out = addPractice(out, entry.kind, new Date(entry.ts));
  }
  return out;
}

// Consecutive practiced days ending today, or ending yesterday when today is
// still open. Zero once a full day has been missed.
export function practiceStreak(log: PracticeLog, today: Date = new Date()): number {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!log[practiceDayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (log[practiceDayKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function practicedDaysInMonth(log: PracticeLog, year: number, monthIndex: number): number {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  return Object.keys(log).filter(key => key.startsWith(prefix)).length;
}

export type PracticeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export async function loadPracticeLog(storage: PracticeStorage): Promise<PracticeLog> {
  try {
    const raw = await storage.getItem(STORAGE_KEY_PRACTICE);
    return normalizePracticeLog(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export async function recordPractice(storage: PracticeStorage, kind: PracticeKind, date: Date = new Date()): Promise<void> {
  try {
    const current = await loadPracticeLog(storage);
    const next = addPractice(current, kind, date);
    if (next !== current) await storage.setItem(STORAGE_KEY_PRACTICE, JSON.stringify(next));
  } catch {}
}
