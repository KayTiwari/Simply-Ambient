// Pure-JS audio + storage utilities. No React Native imports here so the
// module is unit-testable in plain Node and can't accidentally pull native
// code into jest.

export const MIN_HZ = 50;
// Capped at 500 Hz: binaural-beat phase-locking degrades above ~500 Hz, and
// sustained tones above this range are uncomfortable and a hearing-safety
// risk at non-trivial volumes.
export const MAX_HZ = 500;

export function clampHz(n: number): number {
  // Non-finite input (NaN / Infinity) would propagate NaN through the audio
  // engine; fall back to the floor of the safe range.
  if (!Number.isFinite(n)) return MIN_HZ;
  return Math.max(MIN_HZ, Math.min(MAX_HZ, Math.round(n)));
}

// Drop a high "symbolic" frequency (Solfeggio, chakra, dosha) by octaves
// into a comfortable carrier range (~150-260 Hz). Octaves preserve the same
// musical note, so the symbolism is intact, but the carrier is no longer
// piercing.
export function comfortableCarrier(hz: number): number {
  // Non-finite or non-positive input would loop forever (or pass NaN
  // straight through); fall back to a neutral mid-range carrier.
  if (!Number.isFinite(hz) || hz <= 0) return 200;
  let h = hz;
  while (h > 280) h = h / 2;
  while (h < 120) h = h * 2;
  return h;
}

// Split a beat + carrier into the (left, right) ear pair. The split must
// round-trip exactly: carrier = Math.round((l + r) / 2) and beat = r - l must
// reproduce the inputs. A naive round(carrier +/- beat/2) drifts by 1 Hz on
// odd beats, which feeds the controlled sliders a value the user did not set
// mid-drag and loops the update until React crashes (white screen).
// Splitting as [carrier - ceil(beat/2), carrier + floor(beat/2)] keeps
// beat = r - l exact, and (l + r) / 2 = carrier - 0.5 for odd beats, which
// Math.round takes back up to the carrier.
export function splitBeatCarrier(beat: number, carrier: number): [number, number] {
  const b = Number.isFinite(beat) ? Math.max(0, Math.round(beat)) : 0;
  const c = Math.round(Number.isFinite(carrier) ? carrier : 200);
  return [clampHz(c - Math.ceil(b / 2)), clampHz(c + Math.floor(b / 2))];
}

// Pure-JS Base64 encoder. Used as a fallback if globalThis.btoa is missing
// in some RN runtime variants. The audio engine builds a WAV per Hz change,
// so a missing btoa would silently break playback.
export function btoaFallback(binary: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < binary.length) {
    const b1 = binary.charCodeAt(i++) & 0xff;
    const b2 = i < binary.length ? binary.charCodeAt(i++) & 0xff : NaN;
    const b3 = i < binary.length ? binary.charCodeAt(i++) & 0xff : NaN;
    const e1 = b1 >> 2;
    const e2 = ((b1 & 3) << 4) | (Number.isNaN(b2) ? 0 : (b2 >> 4));
    const e3 = Number.isNaN(b2) ? 64 : (((b2 & 15) << 2) | (Number.isNaN(b3) ? 0 : (b3 >> 6)));
    const e4 = Number.isNaN(b3) ? 64 : (b3 & 63);
    out += chars[e1] + chars[e2] + (e3 === 64 ? '=' : chars[e3]) + (e4 === 64 ? '=' : chars[e4]);
  }
  return out;
}

// Minimal Base64 decoder. Mirror of btoaFallback for ASCII payloads.
export function atobFallback(b64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const s = b64.replace(/=+$/, '');
  let out = '';
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = chars.indexOf(s[i]);
    if (v === -1) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  return out;
}

// Streak math (extracted from getStreak/recordActivity in App.tsx) so the
// branching logic can be unit-tested without AsyncStorage mocks.
export function nextStreakCount(opts: {
  lastDate: string;
  count: number;
  today: string;
  yesterday: string;
}): { lastDate: string; count: number } {
  const { lastDate, count, today, yesterday } = opts;
  if (lastDate === today) return { lastDate, count };
  return { lastDate: today, count: lastDate === yesterday ? count + 1 : 1 };
}

// Visible streak (returned to UI). Drops to 0 if the last activity was not
// yesterday or today.
export function visibleStreak(opts: {
  lastDate: string;
  count: number;
  today: string;
  yesterday: string;
}): number {
  const { lastDate, count, today, yesterday } = opts;
  return lastDate === today || lastDate === yesterday ? count : 0;
}
