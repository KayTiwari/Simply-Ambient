// Deep links and home screen quick actions resolve to one small set of
// in-app targets. Pure so the URL grammar is unit-tested; App decides what
// each target does once it has its state in hand.
//
//   simplyambient://tones
//   simplyambient://breathe            open the breath library
//   simplyambient://breathe/box        open a technique by id
//   simplyambient://routine/deep-sleep start a listening path
//   simplyambient://soundscape/boxfan  play a soundscape
//   simplyambient://more/mood          open a More room
//
// Expo development URLs carry the same path after "--/".

import { TECHNIQUES } from './content';

export const APP_URL_SCHEME = 'simplyambient';

export const ROUTINE_IDS = ['morning-focus', 'evening-windown', 'deep-sleep'] as const;
export type ShortcutRoutineId = (typeof ROUTINE_IDS)[number];

export type ShortcutTarget =
  | { kind: 'tones' }
  | { kind: 'breathe'; techniqueId: string | null }
  | { kind: 'routine'; id: ShortcutRoutineId }
  | { kind: 'soundscape'; id: string }
  | { kind: 'more'; page: string };

export type QuickActionSpec = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  params: { href: string };
};

// Both stores recommend at most four. Ordered by nightly-routine likelihood.
export const QUICK_ACTIONS: readonly QuickActionSpec[] = [
  {
    id: 'routine-deep-sleep',
    title: 'Deep Sleep',
    subtitle: 'Start the listening path',
    icon: 'symbol:moon.zzz',
    params: { href: `${APP_URL_SCHEME}://routine/deep-sleep` },
  },
  {
    id: 'routine-morning-focus',
    title: 'Morning Focus',
    subtitle: 'Start the listening path',
    icon: 'symbol:sunrise',
    params: { href: `${APP_URL_SCHEME}://routine/morning-focus` },
  },
  {
    id: 'breathe-box',
    title: 'Box Breathing',
    subtitle: 'Open the practice',
    icon: 'symbol:wind',
    params: { href: `${APP_URL_SCHEME}://breathe/box` },
  },
  {
    id: 'soundscapes',
    title: 'Soundscapes',
    subtitle: 'Pick a layer',
    icon: 'symbol:waveform',
    params: { href: `${APP_URL_SCHEME}://more/soundscapes` },
  },
];

function isRoutineId(value: string): value is ShortcutRoutineId {
  return (ROUTINE_IDS as readonly string[]).includes(value);
}

// The path segments after the scheme and host, or after Expo's "--/" marker.
export function shortcutPathSegments(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  let rest: string;
  const expoMarker = trimmed.indexOf('/--/');
  if (expoMarker >= 0) {
    rest = trimmed.slice(expoMarker + 4);
  } else {
    const schemeEnd = trimmed.indexOf('://');
    if (schemeEnd < 0) return [];
    const scheme = trimmed.slice(0, schemeEnd).toLowerCase();
    if (scheme !== APP_URL_SCHEME) return [];
    rest = trimmed.slice(schemeEnd + 3);
  }
  const noQuery = rest.split(/[?#]/)[0];
  return noQuery
    .split('/')
    .map(part => decodeURIComponent(part).trim().toLowerCase())
    .filter(Boolean);
}

export function parseShortcutUrl(url: string | null | undefined): ShortcutTarget | null {
  if (!url) return null;
  const [head, second] = shortcutPathSegments(url);
  if (!head) return null;
  switch (head) {
    case 'tones':
    case 'frequencies':
      return { kind: 'tones' };
    case 'breathe':
    case 'breath': {
      if (!second) return { kind: 'breathe', techniqueId: null };
      const known = TECHNIQUES.some(t => t.id.toLowerCase() === second);
      return { kind: 'breathe', techniqueId: known ? second : null };
    }
    case 'routine':
    case 'routines':
      return second && isRoutineId(second) ? { kind: 'routine', id: second } : { kind: 'more', page: 'routines' };
    case 'soundscape':
    case 'soundscapes':
      return second ? { kind: 'soundscape', id: second } : { kind: 'more', page: 'soundscapes' };
    case 'more':
      return second ? { kind: 'more', page: second } : { kind: 'more', page: 'hub' };
    default:
      return null;
  }
}

// A quick action carries its target as params.href; fall back to the id so a
// stale item registered by an older build still lands somewhere sensible.
export function parseQuickAction(action: { id?: string; params?: Record<string, unknown> | null } | null | undefined): ShortcutTarget | null {
  if (!action) return null;
  const href = action.params?.href;
  const fromHref = typeof href === 'string' ? parseShortcutUrl(href) : null;
  if (fromHref) return fromHref;
  const known = QUICK_ACTIONS.find(item => item.id === action.id);
  return known ? parseShortcutUrl(known.params.href) : null;
}
