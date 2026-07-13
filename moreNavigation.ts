export type MorePageId =
  | 'profile'
  | 'compatibility'
  | 'natal'
  | 'insights'
  | 'routines'
  | 'soundscapes'
  | 'affirmations'
  | 'mood'
  | 'gratitude'
  | 'rant'
  | 'manifestation'
  | 'grounding'
  | 'support'
  | 'safety'
  | 'bug'
  | 'settings';

export type PinnableMorePageId = Exclude<
  MorePageId,
  'compatibility' | 'natal' | 'support' | 'safety' | 'bug' | 'settings'
>;

export type InitialMoreNavigationState = {
  page: MorePageId | null;
  hubReveal: 0 | 1;
  pageReveal: 0 | 1;
  destination: 'hub' | 'page';
};

export const MORE_PAGE_META: Record<MorePageId, {
  label: string;
  shortLabel: string;
  glyph: string;
  accent: string;
  pinnable: boolean;
  headerTitle: string;
}> = {
  profile: {
    label: 'Profile',
    shortLabel: 'Profile',
    glyph: '◇',
    accent: '#B39BE0',
    pinnable: true,
    headerTitle: 'Profile',
  },
  compatibility: {
    label: 'Compatibility',
    shortLabel: 'Match',
    glyph: '∞',
    accent: '#D8A0B0',
    pinnable: false,
    headerTitle: 'Compatibility',
  },
  natal: {
    label: 'Natal Chart',
    shortLabel: 'Natal',
    glyph: '✧',
    accent: '#B39BE0',
    pinnable: false,
    headerTitle: 'Natal Chart',
  },
  insights: {
    label: 'AI Insights',
    shortLabel: 'Insights',
    glyph: '◈',
    accent: '#8FB8DE',
    pinnable: true,
    headerTitle: 'AI Insights',
  },
  routines: {
    label: 'Routines',
    shortLabel: 'Routines',
    glyph: '↻',
    accent: '#9DC7AC',
    pinnable: true,
    headerTitle: 'Routines',
  },
  soundscapes: {
    label: 'Soundscapes',
    shortLabel: 'Scape',
    glyph: '≋',
    accent: '#8FB8DE',
    pinnable: true,
    headerTitle: 'Soundscapes',
  },
  affirmations: {
    label: 'Daily Affirmation',
    shortLabel: 'Affirm',
    glyph: '✦',
    accent: '#9DC7AC',
    pinnable: true,
    headerTitle: 'Daily Affirmation',
  },
  mood: {
    label: 'Mood',
    shortLabel: 'Mood',
    glyph: '◡',
    accent: '#8FB8DE',
    pinnable: true,
    headerTitle: 'Mood',
  },
  gratitude: {
    label: 'Gratitude',
    shortLabel: 'Thanks',
    glyph: '♡',
    accent: '#E0A470',
    pinnable: true,
    headerTitle: 'Gratitude',
  },
  rant: {
    label: 'Release the Noise',
    shortLabel: 'Release',
    glyph: '〰',
    accent: '#D68097',
    pinnable: true,
    headerTitle: 'Release the Noise',
  },
  manifestation: {
    label: 'Manifestation',
    shortLabel: 'Manifest',
    glyph: '△',
    accent: '#B39BE0',
    pinnable: true,
    headerTitle: 'Manifestation',
  },
  grounding: {
    label: '5-4-3-2-1 Grounding',
    shortLabel: 'Ground',
    glyph: '◎',
    accent: '#8F97DE',
    pinnable: true,
    headerTitle: '5-4-3-2-1 Grounding',
  },
  support: {
    label: 'Support',
    shortLabel: 'Support',
    glyph: '☕',
    accent: '#D9B35C',
    pinnable: false,
    headerTitle: 'Support',
  },
  safety: {
    label: 'Safety & Disclaimer',
    shortLabel: 'Safety',
    glyph: '⌾',
    accent: '#9AA0B4',
    pinnable: false,
    headerTitle: 'Safety & Disclaimer',
  },
  bug: {
    label: 'Feedback',
    shortLabel: 'Feedback',
    glyph: '!',
    accent: '#D68097',
    pinnable: false,
    headerTitle: 'Feedback',
  },
  settings: {
    label: 'Settings',
    shortLabel: 'Settings',
    glyph: '⚙',
    accent: '#D9B35C',
    pinnable: false,
    headerTitle: 'Settings',
  },
};

export const MORE_HEADER_TO_PAGE_ID: Record<string, MorePageId> = {
  Profile: 'profile',
  Compatibility: 'compatibility',
  'Natal Chart': 'natal',
  'AI Insights': 'insights',
  Routines: 'routines',
  Soundscapes: 'soundscapes',
  'Daily Affirmation': 'affirmations',
  Mood: 'mood',
  Gratitude: 'gratitude',
  'Release the Noise': 'rant',
  Manifestation: 'manifestation',
  '5-4-3-2-1 Grounding': 'grounding',
  Support: 'support',
  'Safety & Disclaimer': 'safety',
  Feedback: 'bug',
  Settings: 'settings',
};

const UNAVAILABLE_MORE_PAGE_IDS = new Set<MorePageId>(['natal', 'compatibility']);

export function isUnavailableMorePage(id: MorePageId): boolean {
  return UNAVAILABLE_MORE_PAGE_IDS.has(id);
}

/**
 * Resolves the very first More render before effects run. Pinned destinations
 * must start with the hub fully hidden, otherwise its accent can paint for one
 * browser/native frame underneath the requested room's glass header.
 *
 * The runtime membership check also makes a stale persisted page id fall back
 * to the hub instead of mounting an empty page layer.
 */
export function resolveInitialMoreNavigationState(
  requestedPage: MorePageId | 'hub' | string | null | undefined,
): InitialMoreNavigationState {
  const validPage = typeof requestedPage === 'string'
    && Object.prototype.hasOwnProperty.call(MORE_PAGE_META, requestedPage)
    && requestedPage !== 'hub'
    && !isUnavailableMorePage(requestedPage as MorePageId)
      ? requestedPage as MorePageId
      : null;

  return validPage === null
    ? { page: null, hubReveal: 1, pageReveal: 0, destination: 'hub' }
    : { page: validPage, hubReveal: 0, pageReveal: 1, destination: 'page' };
}

export function isPinnableMorePage(id: string): id is PinnableMorePageId {
  return Object.prototype.hasOwnProperty.call(MORE_PAGE_META, id)
    && MORE_PAGE_META[id as MorePageId].pinnable;
}
