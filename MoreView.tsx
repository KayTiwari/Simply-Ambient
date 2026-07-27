import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Linking,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Slider from '@react-native-community/slider';
import Svg, { Circle, Line, Path, Circle as SvgCircle, Line as SvgLine, Path as SvgPath } from 'react-native-svg';
import {
  CaretLeft,
  CaretRight,
  GearSix,
  ArrowsClockwise,
  X,
  Plus,
  Play,
  PushPin,
  Stop,
  Waveform,
  CloudLightning,
  Coffee,
  ShieldCheck,
  ChatCircleText,
  type IconProps,
} from 'phosphor-react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AmbientPageShell,
  GlowCard,
  EmptyStateCard,
  ActionPill,
  PromptChip,
  MoreSectionGroup,
} from './MoreUI';
import { SoundscapeScene, TileScene } from './SoundscapeScenes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CornerRipples, HeaderGlass } from './AmbientUI';

import { recordActivity, getStreak, notify, scheduleGratitudeReminder } from './App';
import {
  buildTarotInterpretationPrompt,
  GEMINI_ERRORS,
  GeminiRequestError,
  isAbortError,
  requestGeminiReflection,
} from './lib/gemini';
import {
  loadGeminiApiKey,
  removeGeminiApiKey,
  saveGeminiApiKey,
} from './lib/geminiKeyStorage';
import { openStoreListing } from './lib/rateApp';
import { ZODIAC, type BandKey, type Zodiac } from './lib/content';
import {
  MORE_HEADER_TO_PAGE_ID,
  MORE_PAGE_META,
  isPinnableMorePage,
  isUnavailableMorePage,
  resolveInitialMoreNavigationState,
  type MorePageId,
  type PinnableMorePageId,
} from './moreNavigation';

// The store the current platform rates on. The app ships on Google Play
// today; a future iOS build gets truthful copy for free.
const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

const STORAGE_MOOD = '@simply_ambient_mood_log_v1';
const STORAGE_GRAT = '@simply_ambient_gratitude_v1';
const STORAGE_RANT = '@simply_ambient_rant_v1';
const STORAGE_MANIFEST = '@simply_ambient_manifestation_v1';
const STORAGE_AI_SOURCES = '@simply_ambient_ai_sources_v1';

type AISourceKey = 'mood' | 'gratitude' | 'rant' | 'manifestation';
type AISources = Record<AISourceKey, boolean>;
const DEFAULT_AI_SOURCES: AISources = {
  mood: true,
  gratitude: true,
  rant: false,        // Sensitive; opt in
  manifestation: true,
};

// Email obfuscated so it doesn't appear as plaintext in the bundle.
const REPORT_EMAIL_B64 = 'dGl3a2F5QGdtYWlsLmNvbQ==';
function atobFallback(b64: string): string {
  // Minimal Base64 decoder. Used if globalThis.atob is unavailable in some
  // RN runtimes. Pure ASCII output is sufficient for an email address.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = b64.replace(/=+$/, '');
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
function decodeReportEmail(): string {
  try {
    // @ts-ignore. Atob exists in most React Native runtimes
    if (typeof globalThis.atob === 'function') return globalThis.atob(REPORT_EMAIL_B64);
  } catch {}
  return atobFallback(REPORT_EMAIL_B64);
}

// Donation link. Replace with your own Buy Me a Coffee / Ko-fi handle.
const SUPPORT_URL = 'https://www.buymeacoffee.com/likechess';

export type NotifPref = 'off' | 'daily' | 'thrice';

type MoodEntry = { ts: number; value: number };
type GratEntry = { ts: number; text: string };
type RantEntry = { ts: number; text: string };
type ManifestEntry = { ts: number; text: string; manifested: boolean; manifestedAt?: number };

export type RoutinePathId = 'morning-focus' | 'evening-windown' | 'deep-sleep';
export type RoutineBandTarget = Extract<BandKey, 'delta' | 'theta' | 'alpha' | 'beta'>;

export type RoutinePathStep = {
  id: string;
  order: number;
  presetId: RoutineBandTarget;
  bandTarget: RoutineBandTarget;
  targetHz: number;
  durationMinutes: number;
};

// This is the App-facing handoff for a future sequencer. More only requests
// that a path start or stop; App remains the source of truth for whether it is
// active and is responsible for applying each preset on schedule.
export type RoutinePathPayload = {
  id: RoutinePathId;
  name: string;
  steps: readonly RoutinePathStep[];
};

type Props = {
  notifPref: NotifPref;
  onChangeNotifPref: (p: NotifPref) => void;
  affirmation: string | null;
  affirmationLoading: boolean;
  onRefreshAffirmation: () => void;
  isExpoGo: boolean;
  soundscapes: SoundscapeOption[];
  activeSoundscapeId: string | null;
  isSoundscapePlaying: boolean;
  soundscapeVolume: number;
  onToggleSoundscape: (id: string) => void;
  onChangeSoundscapeVolume: (v: number) => void;
  activeRoutineId?: RoutinePathId | null;
  onStartRoutine?: (routine: RoutinePathPayload) => void;
  onStopRoutine?: (routine: RoutinePathPayload) => void;
  // App owns and persists the compact shortcuts; More exposes the same pin
  // affordance in every eligible room header.
  pinnedMorePages: PinnableMorePageId[];
  onTogglePinnedMorePage: (id: PinnableMorePageId, next: boolean) => void;
  onClearPinnedMorePages: () => void;
  // Deep link from elsewhere in the app (e.g. the mini player opening the
  // Soundscapes page). Set to a sub-page id, consumed via the handler.
  requestedPage?: MorePageId | 'hub' | null;
  onRequestedPageHandled?: () => void;
  onPageChange?: (page: SubPage) => void;
  // "Single app color" setting: null = animated band transitions.
  singleColor: string | null;
  // Live accent from the root ambient canvas. The More hub keeps its own
  // editorial colors while allowing the current listening palette through.
  ambientAccent: string;
  onChangeSingleColor: (c: string | null) => void;
  // Re-show the first-run walkthrough (replay mode skips legal + profile).
  onReplayOnboarding: () => void;
  // App owns cross-tab state, audio players, notifications, cache files, and
  // persistence. More clears its local journal mirrors only after this
  // verified destructive operation resolves.
  onWipeAllData: () => Promise<void>;
};

type SoundscapeOption = {
  id: string;
  name: string;
  blurb: string;
  Icon: React.ComponentType<IconProps>;
  color: string;
};

type SubPage = MorePageId | null;

type PinnedMorePagesContextValue = {
  pinnedMorePages: PinnableMorePageId[];
  onTogglePinnedMorePage: (id: PinnableMorePageId, next: boolean) => void;
};

const PinnedMorePagesContext = React.createContext<PinnedMorePagesContextValue | null>(null);
const ReducedMotionContext = React.createContext(false);

const STORAGE_PROFILE = '@simply_ambient_profile_v1';
const STORAGE_PARTNER = '@simply_ambient_partner_v1';
// Written by onboarding: what brings the user here (sleep/focus/calm/energy).
const STORAGE_INTENT = '@simply_ambient_intent_v1';

type Intent = 'sleep' | 'focus' | 'calm' | 'energy';

type Profile = {
  name?: string;
  birthDate?: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  birthLocation?: string;
  mbti?: string;      // e.g. 'INFJ'
  // Personality-quiz answers, one per question, so a returning user sees
  // their previous choices selected.
  mbtiAnswers?: Array<0 | 1 | null>;
};

const MOOD_COLORS = ['#E07A66', '#FF8A38', '#D9BE7A', '#9DC7AC', '#8FB8DE'];
const MOOD_LABELS = ['Low', 'Off', 'OK', 'Good', 'Great'];
const MOOD_FACE_DESCRIPTIONS = ['unhappy', 'subdued', 'neutral', 'softly happy', 'delighted'];

// Defensive accessors. If storage is corrupted and a mood value is outside
// 1..5, render a placeholder rather than "undefined".
function moodLabel(value: number): string {
  const idx = Math.max(1, Math.min(5, Math.round(value))) - 1;
  return MOOD_LABELS[idx];
}
function moodColor(value: number): string {
  const idx = Math.max(1, Math.min(5, Math.round(value))) - 1;
  return MOOD_COLORS[idx];
}

function MoodFace({
  value,
  color,
  size = 38,
  announce = true,
}: {
  value: number | null;
  color: string;
  size?: number;
  announce?: boolean;
}) {
  const level = value == null ? 3 : Math.max(1, Math.min(5, Math.round(value)));
  const description = value == null
    ? 'No mood selected yet, neutral face'
    : `Mood ${level} of 5, ${MOOD_FACE_DESCRIPTIONS[level - 1]} face`;

  return (
    <View
      pointerEvents="none"
      accessible={announce}
      accessibilityRole={announce ? 'image' : undefined}
      accessibilityLabel={announce ? description : undefined}
      importantForAccessibility={announce ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={24} r={20} fill={color + '0F'} stroke={color} strokeWidth={1.6} />
        {level === 5 ? (
          <>
            <Path d="M12.5 19 C15 15.5 18.5 15.5 21 19" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M27 19 C29.5 15.5 33 15.5 35.5 19" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx={16.5} cy={19.5} r={level === 2 ? 1.5 : 1.8} fill={color} />
            <Circle cx={31.5} cy={19.5} r={level === 2 ? 1.5 : 1.8} fill={color} />
          </>
        )}
        {level === 1 ? (
          <>
            <Line x1={12.5} y1={16} x2={19.5} y2={17.5} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
            <Line x1={28.5} y1={17.5} x2={35.5} y2={16} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
            <Path d="M14 35 C18.5 27 29.5 27 34 35" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          </>
        ) : level === 2 ? (
          <Path d="M15 33 C20 29.5 28 29.5 33 32" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        ) : level === 3 ? (
          <Line x1={16} y1={31.5} x2={32} y2={31.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
        ) : level === 4 ? (
          <Path d="M14.5 29 C18.5 36.5 29.5 36.5 33.5 29" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        ) : (
          <Path d="M13.5 28.5 C17 40 31 40 34.5 28.5 C29 31 19 31 13.5 28.5 Z" fill={color + '24'} stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
}

// True when two timestamps fall on the same local calendar day. Mood is
// day-scoped: one entry per day, so saves and deletes work in day units.
function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// "Today" / "Yesterday" / "Jul 3" for day-level history rows.
function friendlyDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Safely parse JSON from AsyncStorage. Returns fallback on any error so a
// corrupted storage entry can't crash the app or poison subsequent reads.
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// Parses a birth date string and returns the matching sun sign, or null.
// Accepts YYYY-MM-DD, and tolerates MM/DD/YYYY and M/D/YYYY. The date must
// be a real calendar date in the past.
function sunSignFromBirthDate(birthDate: string | undefined): Zodiac | null {
  if (!birthDate) return null;
  const s = birthDate.trim();
  let year: number;
  let month: number;
  let day: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    month = Number(m[1]);
    day = Number(m[2]);
    year = Number(m[3]);
  }
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (d.getTime() > Date.now()) return null;
  for (const z of ZODIAC) {
    const onOrAfterStart = month > z.startMonth || (month === z.startMonth && day >= z.startDay);
    const onOrBeforeEnd = month < z.endMonth || (month === z.endMonth && day <= z.endDay);
    if (z.startMonth <= z.endMonth) {
      if (onOrAfterStart && onOrBeforeEnd) return z;
    } else if (onOrAfterStart || onOrBeforeEnd) {
      // Capricorn wraps the year end: late December or early January.
      return z;
    }
  }
  return null;
}

// Sub-page scroll bodies clear the tab bar on gesture-nav devices. 120 was
// close on classic nav bars and short on tall insets.
function useSubBodyPad() {
  const insets = useSafeAreaInsets();
  // Clearance for the tallest bottom obstruction: the tab bar in its
  // six-tab form plus a docked mini player. Short of measuring the real
  // bar, generous beats a calendar row trapped underneath it.
  return { paddingBottom: insets.bottom + 148 };
}

export default function MoreView({
  notifPref, onChangeNotifPref,
  affirmation, affirmationLoading, onRefreshAffirmation,
  isExpoGo,
  soundscapes,
  activeSoundscapeId,
  isSoundscapePlaying,
  soundscapeVolume,
  onToggleSoundscape,
  onChangeSoundscapeVolume,
  activeRoutineId = null,
  onStartRoutine,
  onStopRoutine,
  pinnedMorePages,
  onTogglePinnedMorePage,
  onClearPinnedMorePages,
  requestedPage,
  onRequestedPageHandled,
  onPageChange,
  singleColor,
  ambientAccent,
  onChangeSingleColor,
  onReplayOnboarding,
  onWipeAllData,
}: Props) {
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [gratitude, setGratitude] = useState<GratEntry[]>([]);
  const [rants, setRants] = useState<RantEntry[]>([]);
  const [manifestations, setManifestations] = useState<ManifestEntry[]>([]);
  const [streak, setStreak] = useState(0);
  // Personalizes the hub greeting. The intent is loaded alongside the name so
  // the hub can lean on it as personalization grows.
  const [profileName, setProfileName] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
        setProfileName(parsed.name);
      }
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_INTENT).then(v => {
      if (v === 'sleep' || v === 'focus' || v === 'calm' || v === 'energy') setIntent(v);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_MOOD).then(v => {
      const parsed = safeParse<MoodEntry[]>(v, []);
      if (Array.isArray(parsed)) setMoodLog(parsed);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_GRAT).then(v => {
      const parsed = safeParse<GratEntry[]>(v, []);
      if (Array.isArray(parsed)) setGratitude(parsed);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_RANT).then(v => {
      const parsed = safeParse<RantEntry[]>(v, []);
      if (Array.isArray(parsed)) setRants(parsed);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_MANIFEST).then(v => {
      const parsed = safeParse<ManifestEntry[]>(v, []);
      if (Array.isArray(parsed)) setManifestations(parsed);
    }).catch(() => {});
    getStreak().then(setStreak);
  }, []);

  // Mood is day-scoped: saving replaces any earlier entry for that local
  // day, so tapping a second mood simply updates today's entry.
  function saveMood(value: number) {
    const now = Date.now();
    const next = [{ ts: now, value }, ...moodLog.filter(m => !sameLocalDay(m.ts, now))]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 365);
    setMoodLog(next);
    AsyncStorage.setItem(STORAGE_MOOD, JSON.stringify(next)).catch(() => {});
  }

  // Retroactive mood logging from the calendar. Replaces any entries on the
  // target day and keeps the log sorted newest-first so the History list and
  // day buckets stay consistent.
  function saveMoodAt(ts: number, value: number) {
    if (ts > Date.now()) return; // Never log a future date.
    const next = [{ ts, value }, ...moodLog.filter(m => !sameLocalDay(m.ts, ts))]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 365);
    setMoodLog(next);
    AsyncStorage.setItem(STORAGE_MOOD, JSON.stringify(next)).catch(() => {});
  }

  // Removes every mood entry on the given local day (History delete).
  function deleteMoodDay(dayTs: number) {
    const next = moodLog.filter(m => !sameLocalDay(m.ts, dayTs));
    setMoodLog(next);
    AsyncStorage.setItem(STORAGE_MOOD, JSON.stringify(next)).catch(() => {});
  }

  function saveGratitude(text: string) {
    const t = text.trim();
    if (!t) return;
    const next = [{ ts: Date.now(), text: t }, ...gratitude].slice(0, 1000);
    setGratitude(next);
    AsyncStorage.setItem(STORAGE_GRAT, JSON.stringify(next)).catch(() => {});
    recordActivity().then(() => getStreak().then(setStreak)).catch(() => {});
  }

  function saveRant(text: string) {
    const t = text.trim();
    if (!t) return;
    const next = [{ ts: Date.now(), text: t }, ...rants].slice(0, 500);
    setRants(next);
    AsyncStorage.setItem(STORAGE_RANT, JSON.stringify(next)).catch(() => {});
  }

  function deleteRant(ts: number) {
    const next = rants.filter(r => r.ts !== ts);
    setRants(next);
    AsyncStorage.setItem(STORAGE_RANT, JSON.stringify(next)).catch(() => {});
  }

  function saveManifestation(text: string) {
    const t = text.trim();
    if (!t) return;
    const next = [{ ts: Date.now(), text: t, manifested: false }, ...manifestations].slice(0, 500);
    setManifestations(next);
    AsyncStorage.setItem(STORAGE_MANIFEST, JSON.stringify(next)).catch(() => {});
  }

  function toggleManifestation(ts: number) {
    let turnedOn = false;
    const next = manifestations.map(m => {
      if (m.ts !== ts) return m;
      if (m.manifested) {
        // Toggling off clears the arrival stamp. JSON.stringify drops the
        // undefined field, so storage stays clean.
        return { ...m, manifested: false, manifestedAt: undefined };
      }
      turnedOn = true;
      return { ...m, manifested: true, manifestedAt: Date.now() };
    });
    setManifestations(next);
    AsyncStorage.setItem(STORAGE_MANIFEST, JSON.stringify(next)).catch(() => {});
    if (turnedOn) notify('It arrived', 'Marked as manifested.');
  }

  function deleteManifestation(ts: number) {
    const next = manifestations.filter(m => m.ts !== ts);
    setManifestations(next);
    AsyncStorage.setItem(STORAGE_MANIFEST, JSON.stringify(next)).catch(() => {});
  }

  function deleteGratitude(ts: number) {
    const next = gratitude.filter(g => g.ts !== ts);
    setGratitude(next);
    AsyncStorage.setItem(STORAGE_GRAT, JSON.stringify(next)).catch(() => {});
  }

  // App verifies the destructive cross-tab cleanup. Clear these local mirrors
  // after every attempt, including a partial platform failure, so a later save
  // cannot resurrect entries that another cleanup step already removed. The
  // original rejection still reaches Safety, which never reports success.
  async function wipeAllData() {
    try {
      await onWipeAllData();
    } finally {
      setMoodLog([]);
      setGratitude([]);
      setRants([]);
      setManifestations([]);
      setStreak(0);
      setProfileName(null);
      setIntent(null);
    }
  }

  // More-page navigation, as the released app had it. Individual rooms stay
  // in the same mounted layer; only their opacity and a tiny vertical settle
  // change between destinations, with the hub crossfading underneath.
  // A pinned More shortcut mounts this view with its destination already in
  // props. Seed both layers at that destination so the hub's accent never
  // paints for one frame before the requested room appears.
  const initialNavigation = useRef(resolveInitialMoreNavigationState(requestedPage)).current;
  const [page, setPage] = useState<SubPage>(initialNavigation.page);
  const [pageHistory, setPageHistory] = useState<Array<Exclude<SubPage, null>>>([]);
  const hubReveal = useRef(new Animated.Value(initialNavigation.hubReveal)).current;
  const pageReveal = useRef(new Animated.Value(initialNavigation.pageReveal)).current;
  const transitionToken = useRef(0);
  const transitionDestination = useRef<'hub' | 'page'>(initialNavigation.destination);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pageTransitioning, setPageTransitioning] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (active) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // If the preference changes during a transition, finish at the destination
  // that was already requested instead of reviving the page being dismissed.
  useEffect(() => {
    if (!reduceMotion) return;
    transitionToken.current += 1;
    hubReveal.stopAnimation();
    pageReveal.stopAnimation();
    if (transitionDestination.current === 'hub') {
      hubReveal.setValue(1);
      pageReveal.setValue(0);
      setPage(null);
      setPageHistory([]);
    } else {
      hubReveal.setValue(0);
      pageReveal.setValue(1);
    }
    setPageTransitioning(false);
  }, [hubReveal, pageReveal, reduceMotion]);

  function animateOpen() {
    transitionDestination.current = 'page';
    transitionToken.current += 1;
    const myToken = transitionToken.current;
    hubReveal.stopAnimation();
    pageReveal.stopAnimation();
    if (reduceMotion) {
      hubReveal.setValue(0);
      pageReveal.setValue(1);
      setPageTransitioning(false);
      return;
    }

    // Reset only the page layer: switching between two More rooms gets its
    // own quiet entrance without flashing the hub behind it.
    setPageTransitioning(true);
    pageReveal.setValue(0);
    Animated.parallel([
      Animated.timing(hubReveal, {
        toValue: 0, duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageReveal, {
        toValue: 1, duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || myToken !== transitionToken.current) return;
      setPageTransitioning(false);
    });
  }

  function open(p: Exclude<SubPage, null>) {
    if (isUnavailableMorePage(p)) {
      closeToHub();
      return;
    }
    if (page === p && transitionDestination.current === 'page') return;
    animateOpen();
    if (page === p) return;
    if (page !== null) {
      setPageHistory(history => [...history, page]);
      setPage(p);
      return;
    }
    setPageHistory([]);
    setPage(p);
  }

  // External destinations (navbar and mini player) behave like roots, not
  // nested More links: Back always returns to the hub.
  function openRoot(p: Exclude<SubPage, null>) {
    if (isUnavailableMorePage(p)) {
      closeToHub();
      return;
    }
    if (page === p && transitionDestination.current === 'page') {
      setPageHistory([]);
      return;
    }
    animateOpen();
    setPageHistory([]);
    setPage(p);
  }

  function close() {
    if (pageHistory.length > 0) {
      animateOpen();
      const previous = pageHistory[pageHistory.length - 1];
      setPageHistory(history => history.slice(0, -1));
      setPage(previous);
      return;
    }
    closeToHub();
  }

  function closeToHub() {
    if (page === null) return;
    transitionDestination.current = 'hub';
    transitionToken.current += 1;
    const myToken = transitionToken.current;
    hubReveal.stopAnimation();
    pageReveal.stopAnimation();
    setPageHistory([]);
    if (reduceMotion) {
      hubReveal.setValue(1);
      pageReveal.setValue(0);
      setPage(null);
      setPageTransitioning(false);
      return;
    }
    setPageTransitioning(true);
    Animated.parallel([
      Animated.timing(pageReveal, {
        toValue: 0, duration: 170,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(hubReveal, {
        toValue: 1, duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || myToken !== transitionToken.current) return;
      setPage(null);
      setPageHistory([]);
      setPageTransitioning(false);
    });
  }

  useEffect(() => {
    onPageChange?.(page);
  }, [onPageChange, page]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === null) return false;
      close();
      return true;
    });
    return () => subscription.remove();
  }, [page, pageHistory]);

  // Honor deep links into a specific sub-page (mini player -> Soundscapes).
  useEffect(() => {
    if (requestedPage) {
      const requestedNavigation = resolveInitialMoreNavigationState(requestedPage);
      if (requestedNavigation.page === null) closeToHub();
      else openRoot(requestedNavigation.page);
      onRequestedPageHandled?.();
    }
  }, [requestedPage]);

  const today = new Date();
  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === today.toDateString(),
  );
  const pinnedPagesContext = useMemo(() => ({
    pinnedMorePages,
    onTogglePinnedMorePage,
  }), [onTogglePinnedMorePage, pinnedMorePages]);

  const pageSettleY = pageReveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <ReducedMotionContext.Provider value={reduceMotion}>
    <PinnedMorePagesContext.Provider value={pinnedPagesContext}>
    <View style={{ flex: 1 }}>
      <Animated.View
        pointerEvents={page === null ? 'auto' : 'none'}
        // React Native Web does not currently emit an aria-hidden attribute
        // for accessibilityElementsHidden, so make the web accessibility-tree
        // boundary explicit while the faded hub remains mounted underneath.
        aria-hidden={page !== null}
        accessibilityElementsHidden={page !== null}
        importantForAccessibility={page === null ? 'auto' : 'no-hide-descendants'}
        // Fade as one offscreen group so translucent cards do not shimmer;
        // engages only while opacity is below 1.
        needsOffscreenAlphaCompositing
        style={{ flex: 1, opacity: hubReveal }}
      >
        <Hub
          notifPref={notifPref}
          affirmationPreview={affirmation}
          moodToday={moodToday}
          moodLog={moodLog}
          gratitude={gratitude}
          streak={streak}
          profileName={profileName}
          intent={intent}
          ambientAccent={ambientAccent}
          onOpen={open}
        />
      </Animated.View>

      {page !== null && (
        <Animated.View
          pointerEvents={pageTransitioning ? 'none' : 'auto'}
          // Keep the arriving/departing room out of the web accessibility tree
          // until its short visual transition has finished.
          aria-hidden={pageTransitioning}
          accessibilityElementsHidden={pageTransitioning}
          importantForAccessibility={pageTransitioning ? 'no-hide-descendants' : 'auto'}
          // Fade as one offscreen group so translucent cards do not shimmer;
          // engages only while opacity is below 1.
          needsOffscreenAlphaCompositing
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: pageReveal,
              transform: [{ translateY: pageSettleY }],
              backgroundColor: 'transparent',
            },
          ]}
        >
          {/* Moonlit base so sub-pages sit on layered depth instead of one
              flat navy field; each page adds its own accent wash on top. */}
          <LinearGradient
            colors={[
              'rgba(20,21,48,0.08)',
              'rgba(11,11,31,0.12)',
              'rgba(10,11,34,0.20)',
            ]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {page === 'profile' && (
            <ProfilePage
              onBack={close}
              onProfileChange={next => setProfileName(next.name?.trim() || null)}
            />
          )}
          {page === 'natal' && (
            <NatalChartPage onBack={close} />
          )}
          {page === 'compatibility' && (
            <CompatibilityPage onBack={close} />
          )}
          {page === 'insights' && (
            <InsightsPage
              onBack={close}
              counts={{
                mood: moodLog.length,
                gratitude: gratitude.length,
                rant: rants.length,
                manifestation: manifestations.length,
              }}
            />
          )}
          {page === 'routines' && (
            <RoutinesPage
              onBack={close}
              activeRoutineId={activeRoutineId}
              onStartRoutine={onStartRoutine}
              onStopRoutine={onStopRoutine}
            />
          )}
          {page === 'soundscapes' && (
            <SoundscapesPage
              onBack={close}
              soundscapes={soundscapes}
              activeSoundscapeId={activeSoundscapeId}
              isSoundscapePlaying={isSoundscapePlaying}
              soundscapeVolume={soundscapeVolume}
              onToggleSoundscape={onToggleSoundscape}
              onChangeSoundscapeVolume={onChangeSoundscapeVolume}
            />
          )}
          {page === 'affirmations' && (
            <AffirmationsPage
              affirmation={affirmation}
              loading={affirmationLoading}
              onRefresh={onRefreshAffirmation}
              notifPref={notifPref}
              onChangeNotifPref={onChangeNotifPref}
              isExpoGo={isExpoGo}
              onBack={close}
            />
          )}
          {page === 'mood' && (
            <MoodPage
              moodLog={moodLog}
              onSaveMood={saveMood}
              onSaveMoodAt={saveMoodAt}
              onDeleteDay={deleteMoodDay}
              onBack={close}
            />
          )}
          {page === 'gratitude' && (
            <GratitudePage
              entries={gratitude}
              onSave={saveGratitude}
              onDelete={deleteGratitude}
              isExpoGo={isExpoGo}
              onBack={close}
            />
          )}
          {page === 'rant' && (
            <RantPage
              entries={rants}
              onSave={saveRant}
              onDelete={deleteRant}
              onOpenGrounding={() => open('grounding')}
              onBack={close}
            />
          )}
          {page === 'manifestation' && (
            <ManifestationPage
              entries={manifestations}
              onSave={saveManifestation}
              onToggle={toggleManifestation}
              onDelete={deleteManifestation}
              onBack={close}
            />
          )}
          {page === 'grounding' && (
            <GroundingPage onBack={close} />
          )}
          {page === 'support' && (
            <SupportPage onBack={close} />
          )}
          {page === 'safety' && (
            <SafetyPage onBack={close} onWipe={wipeAllData} />
          )}
          {page === 'settings' && (
            <SettingsPage
              onBack={close}
              singleColor={singleColor}
              onChangeSingleColor={onChangeSingleColor}
              onReplayOnboarding={onReplayOnboarding}
              notifPref={notifPref}
              onOpenAffirmations={() => open('affirmations')}
            />
          )}
          {page === 'bug' && (
            <BugReportPage onBack={close} />
          )}
        </Animated.View>
      )}
    </View>
    </PinnedMorePagesContext.Provider>
    </ReducedMotionContext.Provider>
  );
}

// ===========================================================================
//   Hub
// ===========================================================================

type SubPageWithProfile =
  | Exclude<SubPage, null>
  | 'profile'
  | 'compatibility'
  | 'insights';

type HubProps = {
  notifPref: NotifPref;
  affirmationPreview: string | null;
  moodToday: MoodEntry | undefined;
  moodLog: MoodEntry[];
  gratitude: GratEntry[];
  streak: number;
  profileName: string | null;
  intent: Intent | null;
  ambientAccent: string;
  onOpen: (p: Exclude<SubPage, null>) => void;
};

// First word of a display name, for the greeting.
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0];
}

function Hub({
  notifPref,
  affirmationPreview,
  moodToday,
  moodLog,
  gratitude,
  streak,
  profileName,
  intent,
  ambientAccent,
  onOpen,
}: HubProps) {
  // Weekly insights, derived from the parent's live state. The Hub stays
  // mounted underneath the softly fading sub-pages, so a one-shot storage read
  // here would go stale as soon as the user logs an entry.
  // Mood averages over the past 7 days, trend against the 7 days before.
  const weekly = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const recent = moodLog.filter(m => now - m.ts < 7 * dayMs);
    const prev = moodLog.filter(m => now - m.ts >= 7 * dayMs && now - m.ts < 14 * dayMs);
    const avg = (arr: MoodEntry[]) =>
      arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null;
    const a = avg(recent);
    const b = avg(prev);
    const trend: 'up' | 'down' | 'flat' =
      a === null || b === null ? 'flat' :
      a - b >= 0.25 ? 'up' :
      a - b <= -0.25 ? 'down' : 'flat';
    return {
      moodAvg: a,
      // Distinct local days logged in the window; the average appears once
      // three logged days support it.
      moodDays: new Set(recent.map(m => new Date(m.ts).toDateString())).size,
      gratCount: gratitude.filter(g => now - g.ts < 7 * dayMs).length,
      moodTrend: trend,
    };
  }, [moodLog, gratitude]);

  // Time-aware greeting, with the first name when the profile has one.
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const trimmedName = profileName?.trim();
  const greeting = trimmedName ? `${timeGreeting}, ${firstWord(trimmedName)}` : timeGreeting;

  // Each chip earns its place. Zero values stay hidden, and the mood average
  // waits for three logged days in the window.
  const showStreakChip = streak > 0;
  const showMoodChip = weekly.moodAvg !== null && weekly.moodDays >= 3;
  const showGratChip = weekly.gratCount > 0;

  const intentionCopy: Record<Intent, string> = {
    sleep: 'You came here for softer landings and deeper rest.',
    focus: 'You came here to make a little more room for focus.',
    calm: 'You came here to find steadiness when the day feels loud.',
    energy: 'You came here to meet the day with clearer energy.',
  };
  const heroTitle = moodToday
    ? `Today feels ${moodLabel(moodToday.value).toLowerCase()}.`
    : 'How are you feeling right now?';
  const heroCopy = moodToday
    ? 'You already checked in. You can change it anytime, or choose what would support you now.'
    : intent
      ? intentionCopy[intent]
      : 'Start with a five-second check-in, then choose only what feels useful.';
  const heroMoodColor = moodToday ? moodColor(moodToday.value) : '#8FB8DE';

  return (
    <AmbientPageShell accent={ambientAccent}>
      <ScrollView
        contentContainerStyle={styles.hubScrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={Platform.OS === 'android' ? undefined : [0]}
      >
        <View
          style={[
            styles.headerWrap,
            Platform.OS === 'android' && styles.headerWrapAndroid,
          ]}
        >
          {Platform.OS === 'android' ? null : (
            <HeaderGlass accent={ambientAccent} variant="soft" />
          )}
          <View style={styles.hubBrandRow}>
            <Text style={styles.ambience}>Simply Ambient</Text>
          </View>
          <Text style={styles.hubHeadline}>A quiet corner,{`\n`}made for you.</Text>
          <Text style={styles.hubIntro}>
            Reflect, restore, or simply notice what you need.
          </Text>
        </View>

        <View style={styles.hubScrollBody}>
          <GlowCard accent="#8F97DE" style={styles.hubHeroCard}>
          <View style={styles.hubHeroTopline}>
            <View style={styles.hubLiveDot} />
            <Text style={styles.hubHeroGreeting}>{greeting.toUpperCase()}</Text>
          </View>
          <View style={styles.hubHeroMain}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hubHeroTitle}>{heroTitle}</Text>
              <Text style={styles.hubHeroCopy}>{heroCopy}</Text>
            </View>
            <View
              style={[
                styles.hubMoodOrb,
                { borderColor: heroMoodColor + '66', backgroundColor: heroMoodColor + '12' },
              ]}
            >
              <MoodFace value={moodToday?.value ?? null} color={heroMoodColor} size={38} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.hubHeroAction}
            onPress={() => onOpen('mood')}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Open mood check-in"
          >
            <Text style={styles.hubHeroActionText}>
              {moodToday ? 'Revisit today’s check-in' : 'Take a five-second check-in'}
            </Text>
            <CaretRight size={16} color="#0B0B1F" weight="bold" />
          </TouchableOpacity>

          {showStreakChip || showMoodChip || showGratChip ? (
            <View style={styles.pulseRow}>
              {showStreakChip ? (
                <View style={styles.pulseChip}>
                  <Text style={[styles.pulseNum, { color: '#9DC7AC' }]}>{streak}</Text>
                  <Text style={styles.pulseCap}>GRATITUDE STREAK</Text>
                </View>
              ) : null}
              {showMoodChip && weekly.moodAvg !== null ? (
                <View style={styles.pulseChip}>
                  <Text style={[styles.pulseNum, { color: '#8FB8DE' }]}>
                    {weekly.moodAvg.toFixed(1)}
                    {weekly.moodTrend === 'up' ? ' ↑' : weekly.moodTrend === 'down' ? ' ↓' : ''}
                  </Text>
                  <Text style={styles.pulseCap}>MOOD · 7D</Text>
                </View>
              ) : null}
              {showGratChip ? (
                <View style={styles.pulseChip}>
                  <Text style={[styles.pulseNum, { color: '#E0A470' }]}>{weekly.gratCount}</Text>
                  <Text style={styles.pulseCap}>THANKS · 7D</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.hubPrivacyStrip}>
              <Text style={styles.hubPrivacyText}>LOCAL ONLY</Text>
              <View style={styles.hubPrivacyDot} />
              <Text style={styles.hubPrivacyText}>NO ACCOUNT</Text>
              <View style={styles.hubPrivacyDot} />
              <Text style={styles.hubPrivacyText}>YOURS</Text>
            </View>
          )}
        </GlowCard>

        <MoreSectionGroup
          eyebrow="REFLECT"
          title="Clear a little space"
          accent="#D68097"
        >
          <View style={styles.tileGrid}>
            <HubTile
              glyph="≋"
              accent="#D68097"
              label="Release"
              kicker="PRIVATE RITUAL"
              sub="Pour out what is heavy. Keep it only if it helps."
              variant="feature"
              onPress={() => onOpen('rant')}
            />
            <HubTile
              glyph="❀"
              accent="#E0A470"
              label="Gratitude"
              sub={
                gratitude.length === 0
                  ? 'Notice one good thing'
                  : `${gratitude.length} private ${gratitude.length === 1 ? 'entry' : 'entries'}`
              }
              variant="half"
              onPress={() => onOpen('gratitude')}
            />
            <HubTile
              glyph="✷"
              accent="#B39BE0"
              label="Intentions"
              sub="Name what you are calling in"
              variant="half"
              onPress={() => onOpen('manifestation')}
            />
            <HubTile
              glyph="⌁"
              accent="#8FB8DE"
              label="AI Insights"
              kicker="OPT-IN REFLECTION"
              sub="Read patterns from only the journal sources you choose."
              variant="wide"
              onPress={() => onOpen('insights')}
            />
          </View>
        </MoreSectionGroup>

        <MoreSectionGroup
          eyebrow="RESTORE"
          title="Come back to yourself"
          accent="#9DC7AC"
        >
          <View style={styles.tileGrid}>
            <HubTile
              glyph="⌖"
              accent="#9DC7AC"
              label="5-4-3-2-1 Grounding"
              kicker="2 MINUTES · FIVE SENSES"
              sub="A paced ritual for returning to the room."
              variant="feature"
              onPress={() => onOpen('grounding')}
            />
            <HubTile
              glyph="☉"
              accent="#D9BE7A"
              label="Affirmation"
              sub={affirmationPreview ? `“${affirmationPreview}”` : 'One thought for today'}
              badge={notifPref === 'off' ? null : notifPref === 'daily' ? '1×' : '3×'}
              variant="half"
              onPress={() => onOpen('affirmations')}
            />
            <HubTile
              scene={<TileScene kind="routines" color="#9DC7AC" />}
              accent="#9DC7AC"
              label="Routines"
              sub="Follow a ready-made session path"
              variant="half"
              onPress={() => onOpen('routines')}
            />
            <HubTile
              scene={<TileScene kind="soundscapes" color="#8FB8DE" />}
              accent="#8FB8DE"
              label="Soundscapes"
              kicker="BUILT IN · OFFLINE"
              sub="13 offline layers: rain, ocean, night air, distant thunder, travel hum, fire, and steady noise."
              variant="wide"
              onPress={() => onOpen('soundscapes')}
            />
          </View>
        </MoreSectionGroup>

        <MoreSectionGroup
          eyebrow="UNDERSTAND"
          title="Know your own shape"
          accent="#B39BE0"
        >
          <View style={styles.tileGrid}>
            <HubTile
              glyph="◯"
              accent="#B39BE0"
              label="Profile"
              sub={trimmedName ? `${firstWord(trimmedName)} · private profile` : 'Birth details and personality'}
              variant="half"
              onPress={() => onOpen('profile')}
            />
            <HubTile
              glyph="☉"
              accent="#D9BE7A"
              label="Natal"
              sub="A fuller birth-chart room is being prepared."
              badge="COMING SOON"
              variant="half"
              disabled
            />
            <HubTile
              glyph="☌"
              accent="#D8A0B0"
              label="Compatibility"
              kicker="TWO PROFILES"
              sub="A grounded reflection for two profiles is being prepared."
              badge="COMING SOON"
              variant="wide"
              disabled
            />
          </View>
        </MoreSectionGroup>

        <MoreSectionGroup
          eyebrow="THE APP"
          title="Care for your space"
          accent="#D9BE7A"
        >
          <View style={styles.tileGrid}>
            <HubTile
              Icon={GearSix}
              accent="#D9BE7A"
              label="Settings"
              sub="Atmosphere and reminders"
              variant="half"
              onPress={() => onOpen('settings')}
            />
            <HubTile
              Icon={ShieldCheck}
              accent="#9DC7AC"
              label="Safety"
              sub="Listen gently · know your data"
              variant="half"
              onPress={() => onOpen('safety')}
            />
            <HubTile
              Icon={Coffee}
              accent="#E0A470"
              label="Support"
              sub="Help me keep building"
              variant="half"
              onPress={() => onOpen('support')}
            />
            <HubTile
              Icon={ChatCircleText}
              accent="#D68097"
              label="Feedback"
              sub="Ideas, notes, and bug reports"
              variant="half"
              onPress={() => onOpen('bug')}
            />
          </View>
          </MoreSectionGroup>
        </View>
      </ScrollView>
    </AmbientPageShell>
  );
}

function HubTile({
  glyph, Icon, scene, accent, label, sub, kicker, badge, badgeColor, variant = 'half', onPress, disabled = false,
}: {
  // Either a unicode glyph (kept for spiritual symbols: ensō, flower, sparkle)
  // or a Phosphor icon component (used for utility items: Soundscapes, Bug, etc.)
  glyph?: string;
  Icon?: React.ComponentType<IconProps>;
  // Full-bleed scene art; when set it replaces the oversized wallpaper icon.
  scene?: React.ReactNode;
  accent: string;
  label: string;
  sub: string;
  kicker?: string;
  badge?: string | null;
  // Optional tint for the badge text; falls back to the section accent.
  badgeColor?: string;
  variant?: 'half' | 'wide' | 'feature';
  onPress?: () => void;
  disabled?: boolean;
}) {
  const horizontal = variant === 'wide';
  const feature = variant === 'feature';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.tile,
        variant === 'half' && styles.tileHalf,
        horizontal && styles.tileWide,
        feature && styles.tileFeature,
        disabled && styles.tileDisabled,
        { borderColor: accent + '32', shadowColor: accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${label}. Coming soon. ${sub}` : `${label}. ${sub}`}
      accessibilityState={{ disabled }}
    >
      <LinearGradient
        colors={[accent + (feature ? '2D' : '20'), 'rgba(28,29,53,0.94)', 'rgba(14,15,33,0.98)']}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {scene ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, disabled && { opacity: 0.08 }]}>
          {scene}
        </View>
      ) : (
      <View
        pointerEvents="none"
        style={[
          styles.tileWallpaper,
          feature ? styles.tileWallpaperFeature : horizontal ? styles.tileWallpaperWide : styles.tileWallpaperHalf,
          disabled && { opacity: 0.08 },
        ]}
      >
        {Icon ? (
          <Icon
            size={feature ? 118 : horizontal ? 94 : 86}
            weight="thin"
            color={accent}
          />
        ) : (
          <Text style={[
            styles.tileWallpaperGlyph,
            feature && styles.tileWallpaperGlyphFeature,
            { color: accent },
          ]}>
            {glyph}
          </Text>
        )}
      </View>
      )}
      {badge ? (
        <View style={[styles.tileBadgeWrap, { borderColor: (badgeColor ?? accent) + '55' }]}>
          <Text style={[styles.tileBadge, { color: badgeColor ?? accent }]}>{badge}</Text>
        </View>
      ) : null}
      <View style={[
        styles.tileCopy,
        !horizontal && !feature && styles.tileCopyHalf,
        (horizontal || feature) && styles.tileCopyHorizontal,
        (horizontal || feature) && { flex: 1 },
      ]}>
        {kicker ? <Text style={[styles.tileKicker, { color: accent }]}>{kicker}</Text> : null}
        <Text
          style={[styles.tileLabel, feature && styles.tileLabelFeature]}
          numberOfLines={feature ? 2 : 1}
        >
          {label}
        </Text>
        <Text style={[styles.tileSub, (horizontal || feature) && styles.tileSubLeft]} numberOfLines={feature ? 2 : 3}>
          {sub}
        </Text>
      </View>
      {!disabled && (horizontal || feature) ? (
        <View style={[styles.tileArrow, { borderColor: accent + '40' }]}>
          <CaretRight size={15} color={accent} weight="bold" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ===========================================================================
//   Sub-page header
// ===========================================================================

const SUBPAGE_PRESENTATION: Record<string, {
  displayTitle: string;
  mode: string;
  subtitle?: string;
  glyph: string;
}> = {
  'Daily Affirmation': {
    displayTitle: 'A Thought to Carry',
    mode: 'RESTORE',
    subtitle: 'Choose one gentle sentence and let it frame the day.',
    glyph: '◌',
  },
  Mood: {
    displayTitle: 'Meet Your Mood',
    mode: 'REFLECT',
    subtitle: 'Notice today without judging it. A few honest seconds is enough.',
    glyph: '◡',
  },
  Gratitude: {
    displayTitle: 'Notice the Good',
    mode: 'REFLECT',
    subtitle: 'Give one bright, ordinary moment a place to stay.',
    glyph: '❀',
  },
  'Release the Noise': {
    displayTitle: 'Release the Noise',
    mode: 'RELEASE',
    glyph: '≋',
  },
  Manifestation: {
    displayTitle: 'Name the Direction',
    mode: 'PREPARE',
    subtitle: 'Turn a vague hope into an intention you can return to.',
    glyph: '✷',
  },
  '5-4-3-2-1 Grounding': {
    displayTitle: 'Return to the Room',
    mode: 'RESTORE',
    glyph: '⌖',
  },
  Support: {
    displayTitle: 'Help It Grow',
    mode: 'SUPPORT',
    subtitle: 'See what I’m building and help shape what comes next.',
    glyph: '↟',
  },
  Settings: {
    displayTitle: 'Make It Yours',
    mode: 'PERSONALIZE',
    subtitle: 'Tune the atmosphere, reminders, and privacy to fit your rhythm.',
    glyph: '◐',
  },
  'Safety & Disclaimer': {
    displayTitle: 'Use With Care',
    mode: 'UNDERSTAND',
    glyph: '◇',
  },
  Feedback: {
    displayTitle: 'Leave a Note',
    mode: 'SUPPORT',
    subtitle: 'Share an idea, a kind word, or something that needs fixing.',
    glyph: '✎',
  },
  Profile: {
    displayTitle: 'Your Constellation',
    mode: 'PERSONALIZE',
    glyph: '☾',
  },
  'Natal Chart': {
    displayTitle: 'Begin With Your Sun',
    mode: 'UNDERSTAND',
    subtitle: 'Start with what your birth date can honestly reveal today.',
    glyph: '☉',
  },
  Routines: {
    displayTitle: 'Choose a Path',
    mode: 'RESTORE',
    subtitle: 'Follow a calm sequence when deciding what comes next feels like work.',
    glyph: '△',
  },
  Soundscapes: {
    displayTitle: 'Layer the Room',
    mode: 'WIND DOWN',
    subtitle: 'Set the weather around your practice with quiet, offline ambience.',
    glyph: '≈',
  },
  Compatibility: {
    displayTitle: 'Two Energies',
    mode: 'UNDERSTAND',
    glyph: '☌',
  },
  'AI Insights': {
    displayTitle: 'Read the Pattern',
    mode: 'REFLECT',
    subtitle: 'Invite a gentle reading from only the journal sources you choose.',
    glyph: '⌁',
  },
};

// Every More-room hero uses the same quiet medallion motion. Only the inner
// ring breathes; the outer orbit and its editorial copy stay anchored.
function BreathingGlyphMedallion({ accent, glyph }: { accent: string; glyph: string }) {
  const reduceMotion = React.useContext(ReducedMotionContext);
  // A perpetual loop keeps the display pipeline compositing at refresh rate
  // for as long as the room is open, audio or not, which warms the phone.
  // Android holds the ring still per the motion budget.
  const breathingEnabled = !reduceMotion && Platform.OS !== 'android';
  const scale = useRef(new Animated.Value(1)).current;
  const ringOpacity = scale.interpolate({
    inputRange: [1, 1.075],
    outputRange: [0.58, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    scale.stopAnimation();
    scale.setValue(1);
    if (!breathingEnabled) return;

    // Non-zero endpoint velocity makes the ring reverse like a soft bounce
    // instead of overshooting, settling, and visibly pausing at full size.
    const continuousTurn = Easing.bezier(0.38, 0.12, 0.62, 0.88);
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.075,
          duration: 1450,
          easing: continuousTurn,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1450,
          easing: continuousTurn,
          useNativeDriver: true,
        }),
      ]),
    );
    breathing.start();
    return () => {
      breathing.stop();
      scale.stopAnimation();
      scale.setValue(1);
    };
  }, [breathingEnabled, scale]);

  return (
    <View style={styles.subGlyphInner}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.subGlyphBreathingRing,
          {
            borderColor: accent + '66',
            opacity: breathingEnabled ? ringOpacity : 0.72,
            transform: [{ scale }],
          },
        ]}
      />
      <Text style={[styles.subGlyph, { color: accent }]}>{glyph}</Text>
    </View>
  );
}

function SubHeader({
  title,
  accent,
  onBack,
}: {
  title: string;
  accent: string;
  onBack: () => void;
}) {
  const presentation = SUBPAGE_PRESENTATION[title] ?? {
    displayTitle: title,
    mode: 'SIMPLY AMBIENT',
    glyph: '·',
  };
  const pinContext = React.useContext(PinnedMorePagesContext);
  const pageId = MORE_HEADER_TO_PAGE_ID[title];
  const pinMeta = pageId ? MORE_PAGE_META[pageId] : null;
  const pinnablePageId = pageId && isPinnableMorePage(pageId) ? pageId : null;
  const pinned = pinnablePageId
    ? pinContext?.pinnedMorePages.includes(pinnablePageId) ?? false
    : false;
  const { height } = useWindowDimensions();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const renderPinAction = () => {
    if (!pinContext || !pinnablePageId || !pinMeta) {
      return <View style={[styles.subNavDot, { backgroundColor: accent }]} />;
    }
    return (
      <TouchableOpacity
        onPress={() => pinContext.onTogglePinnedMorePage(pinnablePageId, !pinned)}
        activeOpacity={0.78}
        accessibilityRole="switch"
        accessibilityLabel={`${pinned ? 'Unpin' : 'Pin'} ${pinMeta.label} ${pinned ? 'from' : 'to'} the app navbar`}
        accessibilityHint={pinned
          ? `${pinMeta.label} will remain available in More.`
          : `Adds a ${pinMeta.shortLabel} shortcut to the navbar.`}
        // RN Web keeps the switch role but does not currently forward the
        // checked member of accessibilityState to the required ARIA state.
        aria-checked={pinned}
        accessibilityState={{ checked: pinned }}
        style={[
          styles.subPinBtn,
          { borderColor: pinMeta.accent + (pinned ? '88' : '38') },
          pinned && { backgroundColor: pinMeta.accent + '18' },
        ]}
      >
        <PushPin
          size={18}
          weight={pinned ? 'fill' : 'regular'}
          color={pinned ? pinMeta.accent : '#AAA9B8'}
        />
      </TouchableOpacity>
    );
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // While a keyboard is open, the large editorial header yields the room to
  // the field being edited. Very short web/mobile viewports use the same
  // compact treatment so the focused input is not trapped behind chrome.
  if (keyboardOpen || height < 480) {
    return (
      <View style={styles.subHeaderCompact}>
        <HeaderGlass accent={accent} variant="soft" />
        <TouchableOpacity
          onPress={onBack}
          style={[styles.subBackBtnCompact, { borderColor: accent + '38', backgroundColor: accent + '12' }]}
          activeOpacity={0.7}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <CaretLeft size={18} color={accent} weight="regular" />
        </TouchableOpacity>
        <View style={styles.subCompactCopy}>
          <Text style={[styles.subCompactMode, { color: accent }]}>{presentation.mode}</Text>
          <Text style={styles.subCompactTitle} numberOfLines={1}>{presentation.displayTitle}</Text>
        </View>
        {renderPinAction()}
      </View>
    );
  }

  return (
    <View style={styles.subHeader}>
      <HeaderGlass accent={accent} variant="soft" />
      <View style={styles.subNavRow}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.subBackBtn, { borderColor: accent + '38', backgroundColor: accent + '12' }]}
          activeOpacity={0.7}
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <CaretLeft size={20} color={accent} weight="regular" />
        </TouchableOpacity>
        <Text style={styles.subBrand}>SIMPLY AMBIENT</Text>
        {renderPinAction()}
      </View>

      <View style={styles.subHeroRow}>
        <View style={styles.subHeroCopy}>
          <View style={styles.subModeRow}>
            <View style={[styles.subModeLine, { backgroundColor: accent }]} />
            <Text style={[styles.subMode, { color: accent }]}>{presentation.mode}</Text>
          </View>
          <Text style={styles.subTitle} numberOfLines={2} adjustsFontSizeToFit>
            {presentation.displayTitle}
          </Text>
          {presentation.subtitle ? (
            <Text style={styles.subHeaderSubtitle}>{presentation.subtitle}</Text>
          ) : null}
        </View>
        <View style={[styles.subGlyphOrbit, { borderColor: accent + '3A' }]}>
          <LinearGradient
            colors={[accent + '36', accent + '0D']}
            style={StyleSheet.absoluteFill}
          />
          <BreathingGlyphMedallion accent={accent} glyph={presentation.glyph} />
        </View>
      </View>
    </View>
  );
}

type StickySubpageScrollProps = Omit<
  React.ComponentProps<typeof ScrollView>,
  'children' | 'contentContainerStyle' | 'stickyHeaderIndices'
> & {
  title: string;
  accent: string;
  onBack: () => void;
  bodyStyle?: React.ComponentProps<typeof View>['style'];
  children: React.ReactNode;
};

function StickySubpageScroll({
  title,
  accent,
  onBack,
  bodyStyle,
  children,
  ...scrollProps
}: StickySubpageScrollProps) {
  // Android's new architecture hit-tests a stuck sticky header at its
  // pre-translation position, so the back button goes dead once the page
  // scrolls. An index-0 sticky header pins from the first pixel anyway, so
  // a fixed sibling above the scroll looks identical and keeps its taps.
  if (Platform.OS === 'android') {
    return (
      <View style={styles.subShell}>
        <SubHeader title={title} accent={accent} onBack={onBack} />
        <ScrollView {...scrollProps} contentContainerStyle={styles.subScrollContent}>
          <View style={[styles.subBody, bodyStyle]}>{children}</View>
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView
      {...scrollProps}
      stickyHeaderIndices={[0]}
      contentContainerStyle={styles.subScrollContent}
    >
      <SubHeader title={title} accent={accent} onBack={onBack} />
      <View style={[styles.subBody, bodyStyle]}>{children}</View>
    </ScrollView>
  );
}

function PageClosing({ accent, glyph, label }: { accent: string; glyph: string; label: string }) {
  return (
    <View style={styles.pageClosing}>
      <View style={[styles.pageClosingLine, { backgroundColor: accent + '42' }]} />
      <Text style={[styles.pageClosingGlyph, { color: accent }]}>{glyph}</Text>
      <View style={[styles.pageClosingLine, { backgroundColor: accent + '42' }]} />
      <Text style={styles.pageClosingLabel}>{label}</Text>
    </View>
  );
}

// ===========================================================================
//   Affirmations sub-page
// ===========================================================================

function AffirmationsPage({
  affirmation, loading, onRefresh, notifPref, onChangeNotifPref, isExpoGo, onBack,
}: {
  affirmation: string | null;
  loading: boolean;
  onRefresh: () => void;
  notifPref: NotifPref;
  onChangeNotifPref: (p: NotifPref) => void;
  isExpoGo: boolean;
  onBack: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  // Warn when a reminder is chosen but the OS has notifications turned off.
  // Skipped on web and in Expo Go, where local notifications don't apply.
  const [notifBlocked, setNotifBlocked] = useState(false);
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  useEffect(() => {
    if (notifPref === 'off' || Platform.OS === 'web' || isExpoGo) {
      setNotifBlocked(false);
      return;
    }
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then(res => { if (!cancelled) setNotifBlocked(res.status === 'denied'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [notifPref, isExpoGo]);

  return (
    <AmbientPageShell accent="#9DC7AC">
      <StickySubpageScroll
        title="Daily Affirmation"
        accent="#9DC7AC"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
      >
        <GlowCard
          accent="#9DC7AC"
          style={styles.affirmTalisman}
        >
          <View style={styles.affirmSunOuter} pointerEvents="none">
            <View style={styles.affirmSunInner} />
          </View>
          <Text style={styles.affirmDate}>{todayLabel.toUpperCase()}</Text>
          <View style={styles.affirmRule} />
          {loading ? (
            <ActivityIndicator color="#9DC7AC" />
          ) : (
            <Text style={styles.bigAffirmText}>“{affirmation ?? 'You are exactly where you need to be.'}”</Text>
          )}
          <TouchableOpacity
            onPress={onRefresh}
            style={styles.bigRefreshBtn}
            activeOpacity={0.85}
            accessibilityLabel="Choose another affirmation"
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ArrowsClockwise size={14} color="#0B0B1F" weight="regular" />
              <Text style={[styles.bigRefreshText, { marginLeft: 8 }]}>Choose another</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.affirmCarry}>Read it slowly. Keep only what feels true.</Text>
        </GlowCard>

        <Text style={styles.sectionLabel}>CARRY IT WITH YOU</Text>
        <Text style={styles.sectionSub}>Choose whether this thought should gently return later.</Text>
        <View style={styles.notifPills}>
          {(['off', 'daily', 'thrice'] as NotifPref[]).map(p => {
            const active = p === notifPref;
            const label = p === 'off' ? 'Off' : p === 'daily' ? '1×/day' : '3×/day';
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.85}
                onPress={() => onChangeNotifPref(p)}
                accessibilityRole="switch"
                accessibilityLabel={`Affirmation notifications: ${label}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.notifPill,
                  active && { borderColor: '#9DC7AC', backgroundColor: '#9DC7AC22' },
                ]}
              >
                <Text style={[styles.notifPillText, active && { color: '#9DC7AC' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {notifPref !== 'off' ? (
          <Text style={styles.notifHint}>
            {notifPref === 'daily' ? 'A gentle nudge at 9 a.m.' : 'Nudges at 9 a.m., 1 p.m., 6 p.m.'}
          </Text>
        ) : null}
        {notifBlocked ? (
          <Text style={styles.notifWarn}>
            Notifications are turned off for this app in system settings. Turn them on there
            and these reminders will resume.
          </Text>
        ) : null}
        {isExpoGo ? (
          <Text style={styles.notifWarn}>
            Notifications require a standalone build (EAS / TestFlight / Play Store). They are inactive in Expo Go.
          </Text>
        ) : null}
        <PageClosing accent="#9DC7AC" glyph="◌" label="ONE THOUGHT · ONE DAY" />
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Mood sub-page (with graph)
// ===========================================================================

function MoodPage({
  moodLog, onSaveMood, onSaveMoodAt, onDeleteDay, onBack,
}: {
  moodLog: MoodEntry[];
  onSaveMood: (v: number) => void;
  onSaveMoodAt: (ts: number, v: number) => void;
  onDeleteDay: (dayTs: number) => void;
  onBack: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  const today = new Date();
  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === today.toDateString(),
  );
  const todayMoodValue = moodToday?.value ?? null;
  const todayMoodColor = todayMoodValue == null ? '#8FB8DE' : moodColor(todayMoodValue);

  // Day selected on the calendar for retroactive logging, behind a
  // disclosure row so the page leads with today.
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillDate, setBackfillDate] = useState<Date | null>(null);

  function toggleBackfill() {
    if (backfillOpen) setBackfillDate(null);
    setBackfillOpen(!backfillOpen);
  }

  function selectBackfillDay(date: Date) {
    // Compare local day starts. Calendar cells sit at noon, so a raw
    // Date.now() comparison would wrongly reject today before noon.
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (dayStart.getTime() > todayStart.getTime()) return; // Future days stay off limits.
    // Tapping the selected day again deselects it.
    setBackfillDate(prev =>
      prev && prev.toDateString() === date.toDateString() ? null : date,
    );
  }

  function saveBackfill(value: number) {
    if (!backfillDate) return;
    const at = new Date(backfillDate);
    at.setHours(12, 0, 0, 0); // Noon local, a neutral time for a whole day.
    onSaveMoodAt(at.getTime(), value);
    setBackfillDate(null);
  }

  // Per-day average over last 14 days for the graph.
  const dayBuckets = useMemo(() => {
    const days = 14;
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const out: Array<{ date: Date; avg: number | null }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = start.getTime() - i * dayMs;
      const dayEnd = dayStart + dayMs;
      const inDay = moodLog.filter(e => e.ts >= dayStart && e.ts < dayEnd);
      out.push({
        date: new Date(dayStart),
        avg: inDay.length ? inDay.reduce((s, e) => s + e.value, 0) / inDay.length : null,
      });
    }
    return out;
  }, [moodLog]);

  // Distinct local days with at least one entry, for the graph's empty and
  // sparse states.
  const loggedDays = useMemo(() => {
    const days = new Set<string>();
    for (const m of moodLog) days.add(new Date(m.ts).toDateString());
    return days.size;
  }, [moodLog]);

  // History shows one row per local day, newest first. Legacy days with
  // multiple entries collapse to their rounded average.
  const historyDays = useMemo(() => {
    const map = new Map<string, { dayTs: number; sum: number; n: number }>();
    for (const m of moodLog) {
      const key = new Date(m.ts).toDateString();
      const cur = map.get(key);
      if (cur) {
        cur.sum += m.value;
        cur.n += 1;
        cur.dayTs = Math.max(cur.dayTs, m.ts);
      } else {
        map.set(key, { dayTs: m.ts, sum: m.value, n: 1 });
      }
    }
    return [...map.values()]
      .map(d => ({ dayTs: d.dayTs, value: Math.round(d.sum / d.n) }))
      .sort((a, b) => b.dayTs - a.dayTs);
  }, [moodLog]);

  return (
    <AmbientPageShell accent="#8FB8DE">
      <StickySubpageScroll
        title="Mood"
        accent="#8FB8DE"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
      >
        <GlowCard accent="#8FB8DE" style={{ padding: 16, marginTop: 12 }}>
          <View style={styles.moodHeroHeading}>
            <View style={styles.moodHeroCopy}>
              <Text style={styles.moodHeroKicker}>TODAY’S MOOD</Text>
              <Text style={styles.moodHeroPrompt}>
                {moodToday ? `Feeling ${moodLabel(moodToday.value).toLowerCase()}` : 'How do you feel right now?'}
              </Text>
            </View>
            <View style={styles.moodHeroAside}>
              <View
                style={[
                  styles.moodHeroFaceOrb,
                  { borderColor: todayMoodColor + '66', backgroundColor: todayMoodColor + '12' },
                ]}
              >
                <MoodFace value={todayMoodValue} color={todayMoodColor} size={44} />
              </View>
              <Text style={styles.moodHeroStatus}>{moodToday ? 'CHECKED IN' : '5 SECONDS'}</Text>
            </View>
          </View>
          <View style={styles.moodRow}>
            {[1, 2, 3, 4, 5].map(v => {
              const active = moodToday?.value === v;
              return (
                <TouchableOpacity
                  key={v}
                  activeOpacity={0.85}
                  onPress={() => {
                    onSaveMood(v);
                    notify('Noted', `Logged as ${MOOD_LABELS[v - 1]} for today.`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Mood ${v} of 5, ${MOOD_FACE_DESCRIPTIONS[v - 1]}, ${MOOD_LABELS[v - 1]}`}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.moodBtn,
                    {
                      borderColor: active ? MOOD_COLORS[v - 1] : 'rgba(255,255,255,0.09)',
                      backgroundColor: active ? MOOD_COLORS[v - 1] + '22' : 'rgba(255,255,255,0.045)',
                    },
                  ]}
                >
                  {active ? (
                    <View style={[styles.moodActiveHalo, { borderColor: MOOD_COLORS[v - 1] + '55' }]} />
                  ) : null}
                  <MoodFace
                    value={v}
                    color={MOOD_COLORS[v - 1]}
                    size={25}
                    announce={false}
                  />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[styles.moodLabel, { color: active ? MOOD_COLORS[v - 1] : '#ffffff88' }]}
                  >
                    {v} · {MOOD_LABELS[v - 1]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlowCard>

        <Text style={styles.sectionLabel}>LAST 14 DAYS</Text>
        <MoodGraph buckets={dayBuckets} loggedDays={loggedDays} />

        <TouchableOpacity
          style={[styles.settingRow, { marginTop: 24 }]}
          onPress={toggleBackfill}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Missed a day? Log a past day"
          accessibilityState={{ expanded: backfillOpen }}
        >
          <Text style={styles.settingLabel}>Missed a day?</Text>
          <Text style={[styles.settingRowChevron, backfillOpen && { transform: [{ rotate: '90deg' }] }]}>
            ›
          </Text>
        </TouchableOpacity>

        {backfillOpen ? (
          <>
            <Text style={[styles.sectionSub, { marginTop: 12 }]}>
              Pick a day, then choose how you remember feeling.
            </Text>
            <BackfillCalendar
              moodLog={moodLog}
              selected={backfillDate}
              onSelectDay={selectBackfillDay}
            />
          </>
        ) : null}

        {backfillOpen && backfillDate ? (
          <View style={styles.backfillCard}>
            <View style={styles.backfillHeader}>
              <Text style={styles.backfillTitle}>
                Logging for {backfillDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => setBackfillDate(null)}
                accessibilityLabel="Cancel retroactive logging"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={14} color="#ffffff55" weight="thin" />
              </TouchableOpacity>
            </View>
            <View style={styles.moodRow}>
              {[1, 2, 3, 4, 5].map(v => (
                <TouchableOpacity
                  key={v}
                  activeOpacity={0.85}
                  onPress={() => saveBackfill(v)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mood ${v}, ${MOOD_LABELS[v - 1]}`}
                  style={[
                    styles.moodBtn,
                    {
                      borderColor: 'rgba(255,255,255,0.09)',
                      backgroundColor: 'rgba(255,255,255,0.045)',
                    },
                  ]}
                >
                  <Text style={[styles.moodValue, { color: MOOD_COLORS[v - 1] }]}>{v}</Text>
                  <Text style={[styles.moodLabel, { color: '#ffffff88' }]}>
                    {MOOD_LABELS[v - 1]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>HISTORY</Text>
        {historyDays.length === 0 ? (
          <EmptyStateCard
            glyph="◦"
            accent="#8FB8DE"
            line="No days logged yet."
            hint="Your first check-in starts the chart above."
          />
        ) : (
          historyDays.slice(0, 30).map(d => (
            <View key={d.dayTs} style={styles.moodHistoryRow}>
              <Text style={[styles.moodHistoryDot, { backgroundColor: moodColor(d.value) }]} />
              <Text style={styles.moodHistoryDate}>{friendlyDay(d.dayTs)}</Text>
              <Text style={[styles.moodHistoryLabel, { color: moodColor(d.value) }]}>
                {moodLabel(d.value)}
              </Text>
              <TouchableOpacity
                onPress={() => onDeleteDay(d.dayTs)}
                style={[styles.gratDelBtn, { marginLeft: 10 }]}
                accessibilityLabel={`Delete the mood logged for ${friendlyDay(d.dayTs)}`}
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={14} color="#ffffff55" weight="thin" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

function MoodGraph({
  buckets, loggedDays,
}: {
  buckets: Array<{ date: Date; avg: number | null }>;
  // Distinct days ever logged; drives the empty and sparse states.
  loggedDays: number;
}) {
  const { width: screenW } = useWindowDimensions();
  // The app renders inside a centered max-width column on web, so the window
  // can be far wider than the layout. Size the chart from the measured
  // container, with a window-derived guess only for the first frame.
  const [measuredW, setMeasuredW] = useState<number | null>(null);
  const W = measuredW ?? Math.min(screenW - 40, 560);
  const H = 160;
  const padX = 18;
  const padTop = 14;
  const padBottom = 26;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  // y for value v (1..5): 1 at bottom, 5 at top
  const yFor = (v: number) => padTop + ((5 - v) / 4) * innerH;
  const xFor = (i: number) => padX + (i / Math.max(1, buckets.length - 1)) * innerW;

  // Build a path through points that have data; gap-aware (start a new sub-path
  // after each null).
  const segments: string[] = [];
  let current = '';
  buckets.forEach((b, i) => {
    if (b.avg === null) {
      if (current) { segments.push(current); current = ''; }
    } else {
      const x = xFor(i).toFixed(1);
      const y = yFor(b.avg).toFixed(1);
      current += current ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }
  });
  if (current) segments.push(current);

  // Before the first check-in, keep the card but swap the chart for a
  // welcoming line.
  if (loggedDays === 0) {
    return (
      <View style={[styles.graphCard, { width: '100%', height: H, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.emptyText, { textAlign: 'center', marginTop: 0 }]}>
          Your first check-in starts this chart.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{ width: '100%' }}
      onLayout={e => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== measuredW) setMeasuredW(w);
      }}
    >
    <View style={[styles.graphCard, { width: W, height: H }]}>
      <Svg width={W} height={H}>
        {/* Horizontal grid lines for 1..5 */}
        {[1, 2, 3, 4, 5].map(v => (
          <Line
            key={v}
            x1={padX} y1={yFor(v)}
            x2={W - padX} y2={yFor(v)}
            stroke={MOOD_COLORS[v - 1] + (v === 3 ? '33' : '14')}
            strokeWidth={v === 3 ? 1 : 0.6}
          />
        ))}
        {/* Connecting line(s) */}
        {segments.map((d, idx) => (
          <Path
            key={idx}
            d={d}
            stroke="#8FB8DE"
            strokeWidth={2}
            fill="none"
          />
        ))}
        {/* Dots */}
        {buckets.map((b, i) =>
          b.avg !== null ? (
            <Circle
              key={i}
              cx={xFor(i)}
              cy={yFor(b.avg)}
              r={4}
              fill={moodColor(b.avg)}
            />
          ) : null,
        )}
      </Svg>
      <View style={styles.graphLabelRow} pointerEvents="none">
        <Text style={styles.graphLabelText}>14d ago</Text>
        <Text style={styles.graphLabelText}>today</Text>
      </View>
    </View>
    {loggedDays <= 2 ? (
      <Text style={[styles.notifHint, { marginTop: 6 }]}>
        A few more days and a shape appears.
      </Text>
    ) : null}
    </View>
  );
}

// Compact month calendar for retroactive mood logging. Days with entries
// show a dot in their mood color; future days are disabled.
function BackfillCalendar({
  moodLog, selected, onSelectDay,
}: {
  moodLog: MoodEntry[];
  selected: Date | null;
  onSelectDay: (date: Date) => void;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Average mood per day of this month, for the dots.
  const dayAvg = useMemo(() => {
    const map = new Map<number, { sum: number; n: number }>();
    for (const e of moodLog) {
      const d = new Date(e.ts);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const cur = map.get(d.getDate()) ?? { sum: 0, n: 0 };
      map.set(d.getDate(), { sum: cur.sum + e.value, n: cur.n + 1 });
    }
    const avg = new Map<number, number>();
    map.forEach((v, day) => avg.set(day, v.sum / v.n));
    return avg;
  }, [moodLog, year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthTitle = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function shiftMonth(delta: number) {
    setMonthAnchor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <View style={styles.calCard}>
      <View style={styles.calHeader}>
        <TouchableOpacity
          onPress={() => shiftMonth(-1)}
          style={styles.calNavBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CaretLeft size={16} color="#ffffff88" weight="regular" />
        </TouchableOpacity>
        <Text style={styles.calTitle}>{monthTitle}</Text>
        <TouchableOpacity
          onPress={() => shiftMonth(1)}
          style={[styles.calNavBtn, isCurrentMonth && { opacity: 0.25 }]}
          activeOpacity={0.7}
          disabled={isCurrentMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CaretRight size={16} color="#ffffff88" weight="regular" />
        </TouchableOpacity>
      </View>
      <View style={styles.calGrid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={`${d}${i}`} style={styles.calWeekday}>{d}</Text>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={styles.calCell} />;
          const date = new Date(year, month, day, 12, 0, 0, 0);
          const future = date.getTime() > Date.now() && date.toDateString() !== now.toDateString();
          const isSelected = selected?.toDateString() === date.toDateString();
          const avg = dayAvg.get(day);
          return (
            <TouchableOpacity
              key={day}
              style={[styles.calCell, isSelected && styles.calCellSelected]}
              disabled={future}
              activeOpacity={0.7}
              onPress={() => onSelectDay(date)}
              accessibilityRole="button"
              accessibilityLabel={`Log mood for ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}
              accessibilityState={{ selected: isSelected, disabled: future }}
            >
              <Text style={[styles.calDay, future && { color: '#ffffff28' }, isSelected && { color: '#8FB8DE' }]}>
                {day}
              </Text>
              <View
                style={[
                  styles.calDot,
                  avg !== undefined
                    ? { backgroundColor: moodColor(avg) }
                    : { backgroundColor: 'transparent' },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ===========================================================================
//   Gratitude sub-page
// ===========================================================================

const STORAGE_GRAT_REMINDER = '@simply_ambient_grat_reminder_v1';
type GratReminderPref = string;
type ReminderMeridiem = 'am' | 'pm';

const GRAT_REMINDER_PRESETS = [
  { id: 'off', label: 'Off' },
  { id: '21:00', label: '9 pm' },
  { id: '22:00', label: '10 pm' },
  { id: '23:00', label: '11 pm' },
] as const;

function parseReminderPref(value: string | null): { hour: number; minute: number } | null {
  if (!value || value === 'off') return null;
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function normalizedReminderPref(value: string | null): GratReminderPref | null {
  if (value === 'off') return 'off';
  const parsed = parseReminderPref(value);
  if (!parsed) return null;
  return `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
}

function reminderTimeLabel(value: string): string {
  const parsed = parseReminderPref(value);
  if (!parsed) return 'Custom';
  const hour12 = parsed.hour % 12 || 12;
  const meridiem = parsed.hour >= 12 ? 'pm' : 'am';
  return `${hour12}:${String(parsed.minute).padStart(2, '0')} ${meridiem}`;
}

// Prompt rotates with the calendar so the page feels alive on return visits.
const GRAT_PLACEHOLDERS = [
  'A small or large thing…',
  'Someone who made today easier…',
  'Something your body did for you…',
  'A moment you would happily relive…',
];

// Starter prompts for a blank entry; tapping one begins the draft.
const GRAT_PROMPTS = [
  'Someone who helped…',
  'A small comfort…',
  'Something that went right…',
];

function GratitudePage({
  entries, onSave, onDelete, isExpoGo, onBack,
}: {
  entries: GratEntry[];
  onSave: (text: string) => void;
  onDelete: (ts: number) => void;
  isExpoGo: boolean;
  onBack: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  const [text, setText] = useState('');
  const [reminder, setReminder] = useState<GratReminderPref>('off');
  const [customReminderOpen, setCustomReminderOpen] = useState(false);
  const [customHour, setCustomHour] = useState('9');
  const [customMinute, setCustomMinute] = useState('00');
  const [customMeridiem, setCustomMeridiem] = useState<ReminderMeridiem>('pm');

  // Deterministic pick by day of year, so the prompt holds steady all day.
  const placeholder = useMemo(() => {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
    return GRAT_PLACEHOLDERS[dayOfYear % GRAT_PLACEHOLDERS.length];
  }, []);

  const canSave = text.trim().length > 0;
  // Entries arrive newest-first, so the head tells us about today.
  const savedToday =
    entries.length > 0 &&
    new Date(entries[0].ts).toDateString() === new Date().toDateString();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_GRAT_REMINDER).then(v => {
      const normalized = normalizedReminderPref(v);
      if (normalized) setReminder(normalized);
    }).catch(() => {});
  }, []);

  // Warn when a reminder hour is chosen but the OS has notifications turned
  // off. Skipped on web, where local notifications don't apply.
  const [notifBlocked, setNotifBlocked] = useState(false);
  useEffect(() => {
    if (reminder === 'off' || Platform.OS === 'web') {
      setNotifBlocked(false);
      return;
    }
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then(res => { if (!cancelled) setNotifBlocked(res.status === 'denied'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reminder]);

  function setReminderPref(p: GratReminderPref) {
    setReminder(p);
    AsyncStorage.setItem(STORAGE_GRAT_REMINDER, p).catch(() => {});
    // Schedule (or cancel) the actual notification; the pref alone does nothing.
    scheduleGratitudeReminder(p);
  }

  function openCustomReminder() {
    const parsed = parseReminderPref(reminder) ?? { hour: 21, minute: 0 };
    setCustomHour(String(parsed.hour % 12 || 12));
    setCustomMinute(String(parsed.minute).padStart(2, '0'));
    setCustomMeridiem(parsed.hour >= 12 ? 'pm' : 'am');
    setCustomReminderOpen(true);
  }

  function saveCustomReminder() {
    const hour12 = Number(customHour);
    const minute = Number(customMinute);
    if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) {
      notify('Check the hour', 'Choose an hour from 1 to 12.');
      return;
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      notify('Check the minutes', 'Choose minutes from 00 to 59.');
      return;
    }
    const hour24 = (hour12 % 12) + (customMeridiem === 'pm' ? 12 : 0);
    const next = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    setReminderPref(next);
    setCustomReminderOpen(false);
  }

  function commit() {
    onSave(text);
    setText('');
  }

  // Group entries by date
  const grouped = useMemo(() => {
    const map: Record<string, GratEntry[]> = {};
    for (const e of entries) {
      const key = new Date(e.ts).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return Object.entries(map);
  }, [entries]);

  return (
    <AmbientPageShell accent="#E0A470">
      <StickySubpageScroll
        title="Gratitude"
        accent="#E0A470"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.sectionLabel}>TODAY</Text>
        <Text style={styles.sectionSub}>
          {savedToday
            ? 'Saved for today. Add another if more comes to mind.'
            : "One thing you appreciate, named daily, shifts attention toward what's working. Saved only on this device."}
        </Text>
        <GlowCard accent="#E0A470" style={styles.journalSheet}>
          <View style={styles.journalSheetHeading}>
            <View>
              <Text style={styles.journalSheetKicker}>A NOTE FROM TODAY</Text>
              <Text style={styles.journalSheetDate}>
                {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              </Text>
            </View>
            <Text style={styles.journalFlower}>❀</Text>
          </View>
          <View style={styles.journalRule} pointerEvents="none" />
          <View style={styles.journalEditor}>
            <TextInput
              style={[styles.rantInput, styles.journalInput]}
              accessibilityLabel="Gratitude entry"
              placeholder={placeholder}
              placeholderTextColor="#A8A5AF"
              selectionColor="#E0A470"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
          </View>
        </GlowCard>
        {!text.trim() ? (
          <View style={styles.rantChipsRow}>
            {GRAT_PROMPTS.map(p => (
              <PromptChip key={p} label={p} accent="#E0A470" onPress={() => setText(p + ' ')} />
            ))}
          </View>
        ) : null}
        <View style={styles.rantActionsRow}>
          <ActionPill
            label="Save privately"
            accent="#E0A470"
            disabled={!canSave}
            onPress={commit}
          />
        </View>

        <Text style={styles.sectionLabel}>EVENING REMINDER</Text>
        <Text style={styles.sectionSub}>
          A gentle nudge each evening at the hour you choose.
        </Text>
        <View style={[styles.notifPills, isExpoGo && { opacity: 0.4 }]}>
          {GRAT_REMINDER_PRESETS.map(o => {
            const active = reminder === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.85}
                disabled={isExpoGo}
                onPress={() => {
                  setCustomReminderOpen(false);
                  setReminderPref(o.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Evening reminder: ${o.label}`}
                accessibilityState={{ selected: active, disabled: isExpoGo }}
                style={[
                  styles.notifPill,
                  active && { borderColor: '#E0A470', backgroundColor: '#E0A47022' },
                ]}
              >
                <Text style={[styles.notifPillText, active && { color: '#E0A470' }]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isExpoGo}
            onPress={openCustomReminder}
            accessibilityRole="button"
            accessibilityLabel={reminder !== 'off' && !GRAT_REMINDER_PRESETS.some(option => option.id === reminder)
              ? `Custom evening reminder, ${reminderTimeLabel(reminder)}`
              : 'Choose a custom evening reminder time'}
            accessibilityState={{
              selected: customReminderOpen || (reminder !== 'off' && !GRAT_REMINDER_PRESETS.some(option => option.id === reminder)),
              expanded: customReminderOpen,
              disabled: isExpoGo,
            }}
            style={[
              styles.notifPill,
              (customReminderOpen || (reminder !== 'off' && !GRAT_REMINDER_PRESETS.some(option => option.id === reminder)))
                && { borderColor: '#E0A470', backgroundColor: '#E0A47022' },
            ]}
          >
            <Text
              style={[
                styles.notifPillText,
                (customReminderOpen || (reminder !== 'off' && !GRAT_REMINDER_PRESETS.some(option => option.id === reminder)))
                  && { color: '#E0A470' },
              ]}
            >
              {reminder !== 'off' && !GRAT_REMINDER_PRESETS.some(option => option.id === reminder)
                ? reminderTimeLabel(reminder)
                : 'Custom'}
            </Text>
          </TouchableOpacity>
        </View>
        {customReminderOpen && !isExpoGo ? (
          <GlowCard accent="#E0A470" quiet style={styles.customReminderCard}>
            <View style={styles.customReminderHeading}>
              <View>
                <Text style={styles.customReminderKicker}>CUSTOM TIME</Text>
                <Text style={styles.customReminderTitle}>When should I nudge you?</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomReminderOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close custom reminder time"
                style={styles.customReminderClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color="#A6A4B2" weight="regular" />
              </TouchableOpacity>
            </View>
            <View style={styles.customReminderTimeRow}>
              <View style={styles.customReminderFieldWrap}>
                <Text style={styles.customReminderFieldLabel}>HOUR</Text>
                <TextInput
                  value={customHour}
                  onChangeText={value => setCustomHour(value.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={2}
                  selectTextOnFocus
                  style={styles.customReminderField}
                  placeholder="9"
                  placeholderTextColor="#696A7D"
                  accessibilityLabel="Custom reminder hour"
                />
              </View>
              <Text style={styles.customReminderColon}>:</Text>
              <View style={styles.customReminderFieldWrap}>
                <Text style={styles.customReminderFieldLabel}>MINUTE</Text>
                <TextInput
                  value={customMinute}
                  onChangeText={value => setCustomMinute(value.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={2}
                  selectTextOnFocus
                  style={styles.customReminderField}
                  placeholder="00"
                  placeholderTextColor="#696A7D"
                  accessibilityLabel="Custom reminder minute"
                />
              </View>
              <View style={styles.customReminderMeridiem} accessibilityRole="radiogroup">
                {(['am', 'pm'] as ReminderMeridiem[]).map(value => {
                  const active = customMeridiem === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setCustomMeridiem(value)}
                      accessibilityRole="radio"
                      accessibilityLabel={value.toUpperCase()}
                      accessibilityState={{ checked: active }}
                      style={[
                        styles.customReminderMeridiemBtn,
                        active && styles.customReminderMeridiemBtnActive,
                      ]}
                    >
                      <Text style={[
                        styles.customReminderMeridiemText,
                        active && styles.customReminderMeridiemTextActive,
                      ]}>
                        {value.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TouchableOpacity
              onPress={saveCustomReminder}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Save custom reminder time"
              style={styles.customReminderSave}
            >
              <Text style={styles.customReminderSaveText}>SAVE TIME</Text>
            </TouchableOpacity>
          </GlowCard>
        ) : null}
        {isExpoGo ? (
          <Text style={styles.notifWarn}>
            Reminders are unavailable in this preview build.
          </Text>
        ) : null}
        {notifBlocked ? (
          <Text style={styles.notifWarn}>
            Notifications are blocked in system settings, so these will not fire.
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>JOURNAL</Text>
        {entries.length === 0 ? (
          <EmptyStateCard
            glyph="❀"
            accent="#E0A470"
            line="Nothing noted yet."
            hint="One good thing from today is enough to begin."
          />
        ) : (
          grouped.map(([dateKey, items]) => (
            <View key={dateKey} style={{ marginBottom: 8 }}>
              <Text style={styles.gratDateHeader}>
                {new Date(dateKey).toLocaleDateString(undefined, {
                  weekday: 'long', month: 'short', day: 'numeric',
                })}
              </Text>
              {items.map(g => (
                <View key={g.ts} style={[styles.gratItem, styles.gratitudeSlip]}>
                  <Text style={styles.gratitudeQuote}>“</Text>
                  <Text style={styles.gratItemText}>{g.text}</Text>
                  <TouchableOpacity
                    onPress={() => onDelete(g.ts)}
                    style={styles.gratDelBtn}
                    accessibilityLabel="Delete this gratitude entry"
                    accessibilityRole="button"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <X size={14} color="#ffffff55" weight="thin" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Rant
// ===========================================================================

// Starter prompts for a stuck mind; tapping one begins the draft.
const RANT_PROMPTS = [
  'I’m frustrated because…',
  'I keep replaying…',
  'What I wish I could say is…',
  'I can let go of…',
];

function RantPage({
  entries, onSave, onDelete, onOpenGrounding, onBack,
}: {
  entries: RantEntry[];
  onSave: (text: string) => void;
  onDelete: (ts: number) => void;
  onOpenGrounding?: () => void;
  onBack: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  const [text, setText] = useState('');
  // True once a rant has been kept this visit; gates the grounding hint.
  const [justKept, setJustKept] = useState(false);
  // Timestamps of history items expanded past their two-line preview.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function commit() {
    if (!text.trim()) return;
    onSave(text);
    setText('');
    setJustKept(true);
  }

  // The release path: the draft vanishes and nothing is stored.
  function release() {
    if (!text) return;
    setText('');
    notify('Released', 'Nothing was kept.');
  }

  function toggleExpanded(ts: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ts)) next.delete(ts);
      else next.add(ts);
      return next;
    });
  }

  return (
    <AmbientPageShell accent="#D68097">
      <StickySubpageScroll
        title="Release the Noise"
        accent="#D68097"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <GlowCard accent="#D68097" style={styles.releaseSheet}>
          <View style={styles.releaseSheetTop}>
            <View style={styles.releaseCloudMark}>
              <View style={[styles.releaseCloudDot, { width: 18 }]} />
              <View style={[styles.releaseCloudDot, { width: 12, marginLeft: -4, opacity: 0.55 }]} />
              <View style={[styles.releaseCloudDot, { width: 7, marginLeft: 5, opacity: 0.25 }]} />
            </View>
            <Text style={styles.releaseSheetMeta}>UNFILTERED · PRIVATE</Text>
            <Text style={styles.releaseCount}>{text.length} / 4000</Text>
          </View>
          <View style={styles.releaseRule} />
          <TextInput
            style={[styles.rantInput, styles.releaseInput]}
            accessibilityLabel="Private release entry"
            placeholder="What feels loud right now?"
            placeholderTextColor="#ffffff88"
            selectionColor="#D68097"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={4000}
          />
        </GlowCard>
        {!text.trim() ? (
          <>
            <Text style={styles.releasePromptLabel}>NEED A STARTING THREAD?</Text>
            <View style={styles.rantChipsRow}>
              {RANT_PROMPTS.map(p => (
                <PromptChip key={p} label={p} accent="#D68097" onPress={() => setText(p + ' ')} />
              ))}
            </View>
          </>
        ) : null}
        <View style={styles.rantActionsRow}>
          <ActionPill
            label="Release it"
            accent="#D68097"
            kind="ghost"
            disabled={!text.trim()}
            onPress={release}
          />
          <ActionPill
            label="Keep privately"
            accent="#D68097"
            disabled={!text.trim()}
            onPress={commit}
          />
        </View>
        <View style={styles.releasePrivacyBar}>
          <ShieldCheck size={15} color="#D68097" weight="duotone" />
          <Text style={styles.releasePrivacyText}>
            Stays here. AI Insights sees it only if you explicitly opt in there.
          </Text>
        </View>
        {justKept ? (
          <TouchableOpacity
            onPress={onOpenGrounding}
            disabled={!onOpenGrounding}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open the 5-4-3-2-1 grounding walk"
          >
            <Text style={[styles.notifHint, { textAlign: 'center' }]}>
              Still buzzing? The 5-4-3-2-1 grounding walk can help.
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionLabel}>KEPT REFLECTIONS</Text>
        {entries.length === 0 ? (
          <EmptyStateCard
            glyph="☁"
            accent="#D68097"
            line="Your mind is clear here for now."
            hint="When a thought feels worth keeping, it will rest here privately."
          />
        ) : (
          entries.map(r => (
            <View key={r.ts} style={[styles.gratItem, styles.releaseNote]}>
              <View style={styles.releaseNoteFold} pointerEvents="none" />
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => toggleExpanded(r.ts)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={expanded.has(r.ts) ? 'Collapse this rant' : 'Expand this rant'}
              >
                <Text style={styles.rantDate}>
                  {new Date(r.ts).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
                <Text
                  style={styles.gratItemText}
                  numberOfLines={expanded.has(r.ts) ? undefined : 2}
                >
                  {r.text}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDelete(r.ts)}
                style={styles.gratDelBtn}
                accessibilityLabel="Delete this rant"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={14} color="#ffffff55" weight="thin" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Manifestation
// ===========================================================================

function ManifestationPage({
  entries, onSave, onToggle, onDelete, onBack,
}: {
  entries: ManifestEntry[];
  onSave: (text: string) => void;
  onToggle: (ts: number) => void;
  onDelete: (ts: number) => void;
  onBack: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  const [text, setText] = useState('');

  function commit() {
    if (!text.trim()) return;
    onSave(text);
    setText('');
  }

  const pending = entries.filter(e => !e.manifested);
  const manifested = entries.filter(e => e.manifested);

  return (
    <AmbientPageShell accent="#B39BE0">
      <StickySubpageScroll
        title="Manifestation"
        accent="#B39BE0"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.sectionLabel}>NEW INTENTION</Text>
        <Text style={styles.sectionSub}>
          Writing what you're calling in clarifies it. Mark it manifested when it lands.
        </Text>
        <GlowCard accent="#B39BE0" style={{ marginTop: 10 }}>
          <View style={styles.manifestComposerTop}>
            <View style={styles.manifestSeed}>
              <Text style={styles.manifestSeedGlyph}>✷</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.manifestComposerKicker}>PLANT AN INTENTION</Text>
              <Text style={styles.manifestComposerHint}>Specific enough to remember. Open enough to breathe.</Text>
            </View>
          </View>
          <TextInput
            style={[styles.rantInput, { minHeight: 90 }]}
            accessibilityLabel="New intention"
            placeholder="I am calling in…"
            placeholderTextColor="#ffffff77"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <View style={[styles.rantActionsRow, { marginTop: 0, paddingHorizontal: 16, paddingBottom: 14 }]}>
            <ActionPill
              label="Call it in"
              accent="#B39BE0"
              disabled={!text.trim()}
              onPress={commit}
            />
          </View>
        </GlowCard>

        {manifested.length >= 2 ? (
          <Text style={[styles.sectionSub, { marginTop: 18, marginBottom: 0 }]}>
            {manifested.length} arrived so far.
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>CALLING IN</Text>
        {pending.length === 0 ? (
          <EmptyStateCard
            glyph="✷"
            accent="#B39BE0"
            line="Nothing called in yet."
            hint="Name what you are drawing toward. Mark it when it arrives."
          />
        ) : (
          pending.map(m => (
            <ManifestRow key={m.ts} item={m} onToggle={onToggle} onDelete={onDelete} />
          ))
        )}

        {manifested.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>ARRIVED</Text>
            {manifested.map(m => (
              <ManifestRow key={m.ts} item={m} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </>
        ) : null}
        <PageClosing accent="#B39BE0" glyph="✷" label="HELD HERE · UNTIL IT ARRIVES" />
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

function ManifestRow({
  item, onToggle, onDelete,
}: {
  item: ManifestEntry;
  onToggle: (ts: number) => void;
  onDelete: (ts: number) => void;
}) {
  const fmtDay = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View style={[
      styles.gratItem,
      styles.manifestOrbitItem,
      item.manifested && styles.manifestArrived,
    ]}>
      <View style={[styles.manifestOrbitLine, item.manifested && { backgroundColor: '#D9BE7A55' }]} />
      <TouchableOpacity
        onPress={() => onToggle(item.ts)}
        activeOpacity={0.8}
        style={styles.manifestCheck}
        accessibilityRole="checkbox"
        accessibilityLabel={item.manifested ? 'Mark as not yet manifested' : 'Mark as manifested'}
        accessibilityState={{ checked: item.manifested }}
      >
        <View style={[
          styles.manifestCheckBox,
          item.manifested && { backgroundColor: '#B39BE0', borderColor: '#B39BE0' },
        ]}>
          {item.manifested ? <Text style={styles.manifestCheckMark}>✓</Text> : null}
        </View>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.gratItemText}>{item.text}</Text>
        {item.manifested ? (
          item.manifestedAt ? (
            <Text style={[styles.rantDate, { marginTop: 4, marginBottom: 0 }]}>
              Arrived {fmtDay(item.manifestedAt)}
            </Text>
          ) : null
        ) : (
          <Text style={[styles.rantDate, { marginTop: 4, marginBottom: 0 }]}>
            Since {fmtDay(item.ts)}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => onDelete(item.ts)}
        style={styles.gratDelBtn}
        accessibilityLabel="Delete this manifestation"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <X size={14} color="#ffffff55" weight="thin" />
      </TouchableOpacity>
    </View>
  );
}

// ===========================================================================
//   Grounding / Support / Bug Report
// ===========================================================================

// One sense at a time, so the app holds the tempo for an anxious mind.
const GROUND_STEPS = [
  { num: 5, color: '#E07A66', sense: 'see',   guide: 'Look around. Name them one at a time, slowly.' },
  { num: 4, color: '#E0A470', sense: 'touch', guide: 'Your clothes, the chair, the air on your skin.' },
  { num: 3, color: '#D9BE7A', sense: 'hear',  guide: 'Near or far. Let each sound arrive on its own.' },
  { num: 2, color: '#9DC7AC', sense: 'smell', guide: 'Lean into them, even if they are faint.' },
  { num: 1, color: '#8FB8DE', sense: 'taste', guide: 'Even just the inside of your mouth counts.' },
];

function GroundingPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  const reduceMotion = React.useContext(ReducedMotionContext);
  // Position in the walk this visit. Ephemeral by design: the state lives
  // in this component, so leaving the page resets the ritual.
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const stepReveal = useRef(new Animated.Value(1)).current;
  const transitionToken = useRef(0);
  const transitioningRef = useRef(false);
  const pendingStep = useRef<number | null>(null);
  const finished = step >= GROUND_STEPS.length;
  const current = finished ? null : GROUND_STEPS[step];
  const stepSettleY = stepReveal.interpolate({ inputRange: [0, 1], outputRange: [5, 0] });

  function changeStep(nextStep: number) {
    const destination = Math.max(0, Math.min(GROUND_STEPS.length, nextStep));
    if (destination === step || transitioningRef.current) return;

    transitionToken.current += 1;
    const myToken = transitionToken.current;
    pendingStep.current = destination;
    stepReveal.stopAnimation();

    if (reduceMotion) {
      setStep(destination);
      stepReveal.setValue(1);
      pendingStep.current = null;
      transitioningRef.current = false;
      setTransitioning(false);
      return;
    }

    transitioningRef.current = true;
    setTransitioning(true);
    Animated.timing(stepReveal, {
      toValue: 0,
      duration: 90,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished: settledOut }) => {
      if (!settledOut || myToken !== transitionToken.current) return;
      setStep(destination);
      stepReveal.setValue(0);
      Animated.timing(stepReveal, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished: settled }) => {
        if (!settled || myToken !== transitionToken.current) return;
        pendingStep.current = null;
        transitioningRef.current = false;
        setTransitioning(false);
      });
    });
  }

  // If Reduce Motion is enabled mid-transition, finish at the already chosen
  // step immediately rather than leaving a half-moved card or stale controls.
  useEffect(() => {
    if (!reduceMotion) return;
    transitionToken.current += 1;
    stepReveal.stopAnimation();
    if (pendingStep.current !== null) setStep(pendingStep.current);
    pendingStep.current = null;
    stepReveal.setValue(1);
    transitioningRef.current = false;
    setTransitioning(false);
  }, [reduceMotion, stepReveal]);

  useEffect(() => () => {
    transitionToken.current += 1;
    stepReveal.stopAnimation();
  }, [stepReveal]);

  return (
    <AmbientPageShell accent="#8F97DE">
      <StickySubpageScroll
        title="5-4-3-2-1 Grounding"
        accent="#8F97DE"
        onBack={onBack}
        bodyStyle={subBodyPad}
      >
        <Text style={styles.sectionLabel}>THE PRACTICE</Text>
        <Text style={styles.sectionSub}>
          Five senses pull a looping mind back into the room, in a minute or two.
          Move slowly and breathe between each.
        </Text>
        <Text style={[styles.notifHint, { marginTop: 0, marginBottom: 12 }]}>
          A soundscape underneath can help. Soft Rain suits this well.
        </Text>

        <Animated.View
          pointerEvents={transitioning ? 'none' : 'auto'}
          accessibilityLiveRegion="polite"
          style={{ transform: [{ translateY: stepSettleY }] }}
        >
          {current ? (
            <GlowCard
              accent={current.color}
              style={styles.groundStepCard}
            >
              <View style={styles.groundCompass} pointerEvents="none">
                <View style={[styles.groundRing, styles.groundRingOuter, { borderColor: current.color + '24' }]} />
                <View style={[styles.groundRing, styles.groundRingMiddle, { borderColor: current.color + '32' }]} />
                <View style={[styles.groundRing, styles.groundRingInner, { borderColor: current.color + '44' }]} />
              </View>
              <Text style={styles.groundStepLabel}>STEP {step + 1} OF {GROUND_STEPS.length}</Text>
              <Text style={[styles.groundBigNum, styles.groundStepNum, { color: current.color }]}>
                {current.num}
              </Text>
              <Text style={styles.groundStepText}>
                {current.num === 1 ? 'thing' : 'things'} you can{' '}
                <Text style={styles.groundEm}>{current.sense}</Text>
              </Text>
              <Text style={styles.groundGuide}>{current.guide}</Text>
            </GlowCard>
          ) : (
            <GlowCard accent="#8F97DE" style={styles.groundStepCard}>
              <View style={styles.groundCompass} pointerEvents="none">
                <View style={[styles.groundRing, styles.groundRingOuter, { borderColor: '#8F97DE24' }]} />
                <View style={[styles.groundRing, styles.groundRingMiddle, { borderColor: '#8F97DE32' }]} />
              </View>
              <Text style={styles.groundStepLabel}>COMPLETE</Text>
              <Text style={styles.groundGuide}>
                You are here. Take one more slow breath before you go.
              </Text>
            </GlowCard>
          )}
        </Animated.View>

        <View
          style={styles.groundDotsRow}
          accessibilityLabel={finished ? 'Grounding complete, 5 of 5 steps' : `Step ${step + 1} of 5`}
        >
          {GROUND_STEPS.map((s, i) => (
            <View
              key={s.num}
              style={[
                styles.groundDot,
                i < step && { backgroundColor: s.color },
                i === step && !finished && { backgroundColor: 'rgba(255,255,255,0.85)' },
              ]}
            />
          ))}
        </View>

        <View style={styles.rantActionsRow}>
          {step > 0 ? (
            <ActionPill
              label="Begin again"
              accent="#8F97DE"
              kind="ghost"
              disabled={transitioning}
              onPress={() => changeStep(0)}
            />
          ) : null}
          {!finished ? (
            <ActionPill
              label={step === GROUND_STEPS.length - 1 ? 'Finish' : 'Done, next'}
              accent={current?.color ?? '#8F97DE'}
              disabled={transitioning}
              onPress={() => changeStep(step + 1)}
            />
          ) : null}
        </View>

        {!finished ? (
          <Text style={styles.groundOutro}>
            Notice them slowly. Name them aloud or silently. Let each one anchor
            you a little more firmly to the present.
          </Text>
        ) : null}
        <PageClosing accent="#8F97DE" glyph="·" label="INHALE · EXHALE · HERE" />
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// dotOpacity signals confidence: solid for NEXT UP, fainter as plans get
// softer. Groups with shipped: true render a green check instead of a dot.
const ROADMAP: Array<{
  phase: string;
  dotOpacity?: number;
  shipped?: boolean;
  items: Array<{ title: string; blurb: string }>;
}> = [
  {
    phase: 'NEXT UP',
    dotOpacity: 1,
    items: [
      { title: 'Custom routine builder', blurb: 'Build your own preset chains with smooth fades between steps.' },
      { title: 'In-app natal chart',                blurb: 'Planet positions, houses, and aspects without leaving the app.' },
      { title: 'Bija mantra audio',                 blurb: 'Short loops of LAM / VAM / RAM / OM for chakra meditation.' },
    ],
  },
  {
    phase: 'AFTER THAT',
    dotOpacity: 0.6,
    items: [
      { title: 'Apple Health & Google Fit',         blurb: 'Log breath sessions as mindfulness minutes; mood as wellbeing data.' },
      { title: 'Synastry compatibility',            blurb: 'Full natal-chart matching between two people once the chart pipeline ships.' },
      { title: 'Widget + lock-screen',              blurb: 'Daily affirmation widget; quick-play preset from the home screen.' },
      { title: 'iCloud / Drive backup',             blurb: 'Sync presets, gratitude, and mood log between devices.' },
    ],
  },
  {
    phase: 'CONSIDERING',
    dotOpacity: 0.35,
    items: [
      { title: 'Light theme',           blurb: 'Alternate palette for daytime use.' },
      { title: 'Sleep mode',            blurb: 'Dimmed screen, gentle fade-out, optional white/brown-noise overlay for falling asleep.' },
      { title: 'Sacred geometry visualizer', blurb: 'Frequency-reactive cymatic patterns behind the play screen.' },
      { title: 'Shareable preset cards',   blurb: 'Render a beautiful image of a saved preset to share.' },
      { title: 'Yoga Nidra',              blurb: 'Guided body-scan audio or text.' },
    ],
  },
  {
    phase: 'SHIPPED',
    shipped: true,
    items: [
      { title: 'Built-in soundscapes', blurb: 'Thirteen offline layers, including rain, thunder, forest, travel hum, and steady noise.' },
      { title: 'Listening paths', blurb: 'Morning Focus, Evening Wind-down, and Deep Sleep now advance through their tones automatically.' },
      { title: 'Eyes-closed breath cues', blurb: 'Optional inhale, hold, and exhale tones make the practice possible without watching the screen.' },
      { title: 'Tarot spreads and lunar countdowns', blurb: 'Draw richer spreads and see which major moon phase comes next.' },
      { title: 'Pinnable reflection rooms', blurb: 'Keep the More tools you use most inside the scrollable app navbar.' },
      { title: 'Still background colors', blurb: 'Pin the backdrop to one calm color any time.' },
    ],
  },
];

function SupportPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  return (
    <AmbientPageShell accent="#d9b35c">
      <StickySubpageScroll
        title="Support"
        accent="#d9b35c"
        onBack={onBack}
        bodyStyle={subBodyPad}
      >
        <GlowCard accent="#d9b35c" style={{ padding: 22, marginTop: 8, alignItems: 'center' }}>
          <View style={styles.supportSeal}>
            <Coffee size={28} color="#D9BE7A" weight="duotone" />
          </View>
          <Text style={styles.supportKicker}>A NOTE FROM ME</Text>
          <Text style={styles.supportHeadline}>I’m building this with care</Text>
          <Text style={styles.supportText}>
            I built Simply Ambient and maintain it myself. If it has brought you some peace and you
            would like to see it grow, your support directly funds the features below.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(SUPPORT_URL).catch(() => {})}
            style={styles.supportBtn}
            activeOpacity={0.85}
            accessibilityRole="link"
            accessibilityLabel="Support Simply Ambient and its next features"
          >
            <Text style={styles.supportBtnText}>Support the next chapter</Text>
          </TouchableOpacity>
        </GlowCard>

        {ROADMAP.map(group => (
          <View key={group.phase} style={styles.roadmapGroup}>
            <View style={styles.roadmapGroupHeader}>
              <Text style={styles.sectionLabel}>{group.phase}</Text>
              <Text style={styles.roadmapGroupCount}>{group.items.length}</Text>
            </View>
            {group.items.map(item => (
              <View key={item.title} style={styles.roadmapItem}>
                {group.shipped ? (
                  <Text style={[styles.privacyCheck, { marginRight: 12, marginTop: 2 }]}>✓</Text>
                ) : (
                  <View style={[styles.roadmapDot, { opacity: group.dotOpacity ?? 1 }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.roadmapTitle}>{item.title}</Text>
                  <Text style={styles.roadmapBlurb}>{item.blurb}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.sectionLabel}>ANOTHER WAY TO HELP</Text>
        <Text style={styles.sectionSub}>
          A rating on {STORE_NAME} helps other people find the app. It costs nothing and means a lot.
        </Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => { openStoreListing().catch(() => {}); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Rate Simply Ambient on ${STORE_NAME}`}
        >
          <Text style={styles.settingLabel}>Rate Simply Ambient</Text>
          <Text style={styles.settingRowChevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.supportFootnote}>
          Donations are entirely optional. Thank you for being here either way.
        </Text>
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Safety & Disclaimer
// ===========================================================================

function SafetyPanel({
  number, title, accent, children,
}: {
  number: string;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <GlowCard accent={accent} quiet style={styles.safetyPanel}>
      <View style={styles.safetyPanelHeading}>
        <Text style={[styles.safetyPanelNumber, { color: accent }]}>{number}</Text>
        <Text style={styles.safetyPanelTitle}>{title}</Text>
      </View>
      {children}
    </GlowCard>
  );
}

export function SafetyContent() {
  return (
    <View style={styles.safetyPanelStack}>
      <SafetyPanel number="01" title="Listen gently" accent="#8FB8DE">
        <Text style={styles.safetyBody}>
          Always begin at a low volume and raise gradually only if needed. Sustained
          listening through headphones can damage hearing at high volumes regardless
          of frequency. If anything feels piercing, sharp, or uncomfortable, stop
          immediately and lower the volume.
        </Text>
      </SafetyPanel>

      <SafetyPanel number="02" title="Know your body" accent="#E0A470">
        <Text style={styles.safetyBody}>
          Simply Ambient is a wellness and mindfulness tool, not a medical device or
          a substitute for professional medical, psychological, or psychiatric care.
          Its practices are presented for contemplative and educational use only.
        </Text>
        <Text style={styles.safetyMiniHeading}>TALK WITH A PHYSICIAN FIRST</Text>
        {[
          'Pregnancy',
          'A pacemaker',
          'A history of seizures or epilepsy',
          'A heart condition',
          'Proneness to dissociation',
          'Medication that affects the nervous system',
        ].map(item => (
          <View key={item} style={styles.privacyRow}>
            <Text style={[styles.privacyCheck, { color: '#E0A470' }]}>•</Text>
            <Text style={styles.privacyText}>{item}</Text>
          </View>
        ))}
        <Text style={styles.safetyMiniHeading}>STOP AND SEEK CARE</Text>
        <Text style={styles.safetyBody}>
          If you notice dizziness, nausea, headache, ringing in the ears, chest pain,
          panic, or any other unusual symptom. Never use the app while driving,
          operating machinery, or anywhere focused attention is required.
        </Text>
      </SafetyPanel>

      <SafetyPanel number="03" title="Your data, plainly" accent="#9DC7AC">
        <Text style={styles.safetyBody}>
          Journals, mood, manifestations, and profile stay on this device. Horoscopes
          send only sign and period. Filtered crash diagnostics exclude journals and
          saved keys. Journal Themes sends sources shown as enabled only after you tap
          analyse. Interpret Tarot sends the drawn card name, orientation, matching
          meaning, and description. Feedback travels through a simple mail relay.
        </Text>
      </SafetyPanel>

      <SafetyPanel number="04" title="Terms of use" accent="#9AA0B4">
        <Text style={styles.safetyBody}>
          This app is provided “as is” without warranty. Use it at your own risk. By
          using Simply Ambient you accept that the developer is not liable for direct
          or indirect harm, including hearing damage, arising from use. If you do not
          agree, do not use the app.
        </Text>
      </SafetyPanel>

      <Text style={styles.safetyClosing}>
        This app should always feel gentle. If it ever does not, pause and rest.
      </Text>
    </View>
  );
}

const PRIVACY_POLICY_URL = 'https://kaytiwari.github.io/Simply-Ambient/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://kaytiwari.github.io/Simply-Ambient/terms-of-service.html';

// Shared confirm-before-leaving-the-app modal for external document links.
function LinkConfirmModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Modal visible={url !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.linkConfirmBackdrop}>
        <View style={styles.linkConfirmCard}>
          <Text style={styles.linkConfirmTitle}>Open in browser?</Text>
          <Text style={styles.linkConfirmUrl}>{url ?? ''}</Text>
          <Text style={styles.linkConfirmHint}>You'll leave the app to view this document.</Text>
          <View style={styles.linkConfirmActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClose}
              style={styles.linkConfirmCancelBtn}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={styles.linkConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                if (url) Linking.openURL(url).catch(() => {});
              }}
              style={styles.linkConfirmOpenBtn}
              accessibilityLabel="Open link in browser"
              accessibilityRole="link"
            >
              <Text style={styles.linkConfirmOpenText}>Open</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// At-a-glance privacy facts. Every line here is verified against the actual
// implementation; update this list if a new network call is ever added.
const PRIVACY_FACTS: string[] = [
  'Journals, mood, profile, and presets stay on this device.',
  'No account, no sign-in, no ads, no tracking across apps.',
  'Horoscopes send only your sign and the period.',
  'Filtered crash diagnostics may include a stack trace and basic device, OS, and app context. Journals and saved keys stay out.',
  'Journal Themes sends sources shown as enabled only when you tap analyse.',
  'Interpret Tarot sends the drawn card name, orientation, matching meaning, and description only when you tap it.',
  'Feedback messages reach the developer through a simple mail relay. Journals never ride along.',
];

// ===========================================================================
//   Settings sub-page
// ===========================================================================

const SINGLE_COLOR_CHOICES = [
  { hex: '#0B0B1F', name: 'Midnight' },
  { hex: '#101018', name: 'Ink' },
  { hex: '#151226', name: 'Violet night' },
  { hex: '#0A1420', name: 'Deep sea' },
  { hex: '#0E1A14', name: 'Forest night' },
  { hex: '#000000', name: 'Black' },
];

function stillColorFromHue(hue: number): string {
  const h = (((hue % 360) + 360) % 360) / 360;
  const saturation = 0.48;
  const lightness = 0.11;
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    const value = t < 1 / 6
      ? p + (q - p) * 6 * t
      : t < 1 / 2
        ? q
        : t < 2 / 3
          ? p + (q - p) * (2 / 3 - t) * 6
          : p;
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(1 / 3)}${channel(0)}${channel(-1 / 3)}`.toUpperCase();
}

// Ring color for the atmosphere preview: hue-faithful to the chosen color,
// lifted toward white just enough that rings stay visible on colors as dark
// as Midnight. Bright accents pass through untouched.
function rippleTint(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma >= 140) return hex;
  const mix = (140 - luma) / (255 - luma);
  const lift = (c: number) => Math.round(c + (255 - c) * mix);
  const to2 = (c: number) => lift(c).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function hueFromHex(hex: string | null): number | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 225;
  const raw = max === r
    ? ((g - b) / delta) % 6
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}

function hueName(hue: number): string {
  const normalized = ((hue % 360) + 360) % 360;
  if (normalized < 20 || normalized >= 345) return 'Rose night';
  if (normalized < 48) return 'Ember night';
  if (normalized < 78) return 'Golden night';
  if (normalized < 155) return 'Forest night';
  if (normalized < 195) return 'Teal night';
  if (normalized < 250) return 'Deep blue';
  if (normalized < 295) return 'Violet night';
  return 'Plum night';
}

const CUSTOM_HUE_COLORS = [0, 45, 90, 145, 190, 235, 280, 325, 360]
  .map(stillColorFromHue);

function SettingsPage({
  onBack, singleColor, onChangeSingleColor, onReplayOnboarding, notifPref, onOpenAffirmations,
}: {
  onBack: () => void;
  singleColor: string | null;
  onChangeSingleColor: (c: string | null) => void;
  onReplayOnboarding: () => void;
  notifPref: NotifPref;
  onOpenAffirmations: () => void;
}) {
  const subBodyPad = useSubBodyPad();
  const on = singleColor != null;
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  const [customHue, setCustomHue] = useState(() => hueFromHex(singleColor) ?? 225);
  const customColor = stillColorFromHue(customHue);
  const selectedColorName = singleColor
    ? SINGLE_COLOR_CHOICES.find(choice => choice.hex === singleColor)?.name
      ?? hueName(hueFromHex(singleColor) ?? customHue)
    : null;

  const [previewReduceMotion, setPreviewReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setPreviewReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setPreviewReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const selectedHue = hueFromHex(singleColor);
    if (selectedHue != null) setCustomHue(selectedHue);
  }, [singleColor]);

  return (
    <AmbientPageShell accent="#d9b35c">
      <StickySubpageScroll
        title="Settings"
        accent="#d9b35c"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
      >
        <GlowCard accent={singleColor ?? '#8F97DE'} style={styles.settingsPreview}>
          <LinearGradient
            colors={
              singleColor
                ? [singleColor, singleColor, '#080919']
                : ['#8F97DE88', '#B39BE044', '#0A1320']
            }
            locations={[0, 0.52, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* The corner ripples ARE the preview: live or pinned, they swirl
              in the atmosphere's own color, lifted only enough to stay
              visible on the darkest choices. */}
          <CornerRipples
            accent={rippleTint(singleColor ?? '#8F97DE')}
            active={!previewReduceMotion}
            periodMs={5200}
          />
          <View style={styles.settingsPreviewCopy}>
            <Text style={styles.settingsPreviewKicker}>YOUR ATMOSPHERE</Text>
            <Text style={styles.settingsPreviewTitle}>
              {on ? selectedColorName : 'Moves with the sound'}
            </Text>
            <Text style={styles.settingsPreviewHint}>{on ? 'Held still' : 'Frequency-responsive'}</Text>
          </View>
          <View style={styles.settingsPreviewStatus}>
            <Text style={styles.settingsPreviewStatusText}>{on ? 'STILL' : 'LIVE'}</Text>
          </View>
        </GlowCard>

        <Text style={styles.sectionLabel}>BACKGROUND</Text>
        <Text style={styles.sectionSub}>
          The backdrop normally shifts color with the active frequency band.
          Pin it to a single color if you prefer stillness.
        </Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Still background</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onChangeSingleColor(on ? null : SINGLE_COLOR_CHOICES[0].hex)}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel="Still background"
            style={[styles.settingToggle, on && { borderColor: '#d9b35c', backgroundColor: '#d9b35c22' }]}
          >
            <Text style={[styles.settingToggleText, on && { color: '#d9b35c' }]}>
              {on ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>
        {on ? (
          <>
            <View style={styles.swatchRow}>
              {SINGLE_COLOR_CHOICES.map(c => {
                const active = singleColor === c.hex;
                return (
                  <TouchableOpacity
                    key={c.hex}
                    activeOpacity={0.85}
                    onPress={() => onChangeSingleColor(c.hex)}
                    accessibilityRole="button"
                    accessibilityLabel={`Background color ${c.name}`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.swatch,
                      { backgroundColor: c.hex },
                      active && { borderColor: '#d9b35c' },
                    ]}
                  >
                    {active ? <Text style={styles.swatchCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.bugAppInfoHint}>
              {selectedColorName}
            </Text>
            <View style={styles.customColorPicker}>
              <View style={styles.customColorHeading}>
                <View>
                  <Text style={styles.customColorKicker}>COLOR SELECT</Text>
                  <Text style={styles.customColorName}>{hueName(customHue)}</Text>
                </View>
                <View
                  style={[
                    styles.customColorSample,
                    { backgroundColor: customColor, borderColor: customColor + 'CC' },
                  ]}
                />
              </View>
              <View style={styles.customHueControl}>
                <LinearGradient
                  colors={CUSTOM_HUE_COLORS as [string, string, ...string[]]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.customHueGradient}
                  pointerEvents="none"
                />
                <Slider
                  style={styles.customHueSlider}
                  minimumValue={0}
                  maximumValue={360}
                  step={1}
                  value={customHue}
                  minimumTrackTintColor="transparent"
                  maximumTrackTintColor="transparent"
                  thumbTintColor={customColor}
                  onValueChange={setCustomHue}
                  onSlidingComplete={value => onChangeSingleColor(stillColorFromHue(value))}
                  accessibilityLabel="Still background color"
                  accessibilityValue={{
                    min: 0,
                    max: 360,
                    now: Math.round(customHue),
                    text: hueName(customHue),
                  }}
                />
              </View>
              <Text style={styles.customColorHint}>Drag to choose a custom still color.</Text>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>WALKTHROUGH</Text>
        <Text style={styles.sectionSub}>
          The short intro from your first launch: what brings you here, tailored
          recommendations, and a few good-to-know tips.
        </Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={onReplayOnboarding}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Replay the intro walkthrough"
        >
          <Text style={styles.settingLabel}>Replay the intro</Text>
          <Text style={styles.settingRowChevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>REMINDERS</Text>
        <Text style={styles.sectionSub}>
          Affirmation and gratitude nudges live with their pages.
        </Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={onOpenAffirmations}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Affirmation reminders, currently ${
            notifPref === 'off' ? 'off' : notifPref === 'daily' ? '1x per day' : '3x per day'
          }`}
        >
          <Text style={styles.settingLabel}>Affirmation reminders</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.bugAppInfoPreview, { marginTop: 0, marginRight: 8 }]}>
              {notifPref === 'off' ? 'Off' : notifPref === 'daily' ? '1x per day' : '3x per day'}
            </Text>
            <Text style={styles.settingRowChevron}>›</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>YOUR PRIVACY</Text>
        <View style={styles.privacyCard}>
          {PRIVACY_FACTS.map(fact => (
            <View key={fact} style={styles.privacyRow}>
              <Text style={styles.privacyCheck}>✓</Text>
              <Text style={styles.privacyText}>{fact}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.settingRow, { marginTop: 10 }]}
          onPress={() => setPendingOpenUrl(PRIVACY_POLICY_URL)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Read the full privacy policy"
        >
          <Text style={styles.settingLabel}>Read the privacy policy</Text>
          <Text style={styles.settingRowChevron}>›</Text>
        </TouchableOpacity>
        <Text style={styles.bugAppInfoHint}>
          Delete everything the app stores any time under More → Safety → Wipe all data.
        </Text>

        <Text style={styles.sectionLabel}>RATE THE APP</Text>
        <Text style={styles.sectionSub}>
          A rating on {STORE_NAME} helps other people find Simply Ambient.
        </Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => { openStoreListing().catch(() => {}); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Rate Simply Ambient on ${STORE_NAME}`}
        >
          <Text style={styles.settingLabel}>Rate Simply Ambient</Text>
          <Text style={styles.settingRowChevron}>›</Text>
        </TouchableOpacity>
      </StickySubpageScroll>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />
    </AmbientPageShell>
  );
}

function SafetyPage({ onBack, onWipe }: { onBack: () => void; onWipe: () => Promise<void> }) {
  const subBodyPad = useSubBodyPad();
  // Holds the URL to confirm-open, or null. Used by both the Privacy Policy
  // and Terms of Service links so we have one confirm modal, two triggers.
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  async function wipeAllData() {
    if (isWiping) return;
    setIsWiping(true);
    try {
      await onWipe();
      setConfirmWipe(false);
      notify(
        'Data wiped',
        'Everything the app stored on this device has been deleted, including journals, profile, presets, settings, imported audio copies, and your saved AI key. Restarting the app gives you a clean start.',
      );
    } catch {
      notify(
        'Wipe not completed',
        'Simply Ambient could not verify that every local item was deleted. Nothing has been reported as fully wiped. Please try again.',
      );
    } finally {
      setIsWiping(false);
    }
  }

  return (
    <AmbientPageShell accent="#9aa0b4">
      <StickySubpageScroll
        title="Safety & Disclaimer"
        accent="#9aa0b4"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
      >
        <GlowCard accent="#9DC7AC" style={styles.safetyHero}>
          <View style={styles.safetyShieldWrap}>
            <ShieldCheck size={32} color="#9DC7AC" weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.safetyHeroKicker}>THE THREE THINGS TO REMEMBER</Text>
            <Text style={styles.safetyHeroTitle}>Low volume. Stop if it hurts. Stay present.</Text>
            <Text style={styles.safetyHeroCopy}>
              Never listen while driving or doing anything that needs your full attention.
            </Text>
          </View>
        </GlowCard>
        <SafetyContent />

        <Text style={styles.sectionLabel}>PRIVACY POLICY</Text>
        <Text style={styles.safetyBody}>
          The full privacy policy is published at{' '}
          <Text
            style={styles.linkText}
            onPress={() => setPendingOpenUrl(PRIVACY_POLICY_URL)}
            accessibilityRole="link"
          >
            kaytiwari.github.io/Simply-Ambient
          </Text>
          . It explains exactly what data the app handles and what it does not.
        </Text>

        <Text style={styles.sectionLabel}>TERMS OF SERVICE</Text>
        <Text style={styles.safetyBody}>
          The full Terms of Service are published at{' '}
          <Text
            style={styles.linkText}
            onPress={() => setPendingOpenUrl(TERMS_OF_SERVICE_URL)}
            accessibilityRole="link"
          >
            kaytiwari.github.io/Simply-Ambient
          </Text>
          . By using Simply Ambient you accept them. They include hearing-safety,
          medical-disclaimer, liability, and dispute-resolution terms.
        </Text>

        <Text style={styles.sectionLabel}>WIPE ALL DATA</Text>
        <Text style={styles.safetyBody}>
          Permanently delete everything the app stores on this device: journals
          (mood, gratitude, rants, manifestations), profile, presets, settings,
          imported audio cache copies, and your saved AI key. Cannot be undone.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setConfirmWipe(true)}
          style={styles.wipeBtn}
          accessibilityLabel="Wipe all data on this device"
          accessibilityRole="button"
        >
          <Text style={styles.wipeBtnText}>WIPE ALL DATA</Text>
        </TouchableOpacity>
      </StickySubpageScroll>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />

      <Modal
        visible={confirmWipe}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!isWiping) setConfirmWipe(false); }}
      >
        <View style={styles.linkConfirmBackdrop}>
          <View style={styles.linkConfirmCard}>
            <Text style={styles.linkConfirmTitle}>Wipe all data?</Text>
            <Text style={styles.linkConfirmHint}>
              This permanently deletes your journals (mood, gratitude, rants,
              manifestations), profile, presets, settings, imported audio cache
              copies, and your saved AI key from this device. There is no undo.
            </Text>
            <View style={styles.linkConfirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { if (!isWiping) setConfirmWipe(false); }}
                disabled={isWiping}
                style={[styles.linkConfirmCancelBtn, isWiping && { opacity: 0.48 }]}
                accessibilityLabel="Cancel wipe"
                accessibilityRole="button"
              >
                <Text style={styles.linkConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={wipeAllData}
                disabled={isWiping}
                style={[
                  styles.linkConfirmOpenBtn,
                  { backgroundColor: '#E07A66' },
                  isWiping && { opacity: 0.72 },
                ]}
                accessibilityLabel="Confirm wipe all data"
                accessibilityRole="button"
                accessibilityState={{ disabled: isWiping, busy: isWiping }}
              >
                {isWiping ? (
                  <ActivityIndicator color="#111426" size="small" />
                ) : (
                  <Text style={styles.linkConfirmOpenText}>WIPE</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AmbientPageShell>
  );
}

type MessageKind = 'feedback' | 'idea' | 'bug';

const MESSAGE_KINDS: Array<{ id: MessageKind; label: string; fallbackSubject: string }> = [
  { id: 'feedback', label: 'Feedback', fallbackSubject: 'Feedback' },
  { id: 'idea',     label: 'Idea',     fallbackSubject: 'Feature idea' },
  { id: 'bug',      label: 'Bug',      fallbackSubject: 'Bug report' },
];

// One transparent line of context, shown verbatim in the form before sending.
// No identifiers, no journal content; just enough to reproduce bugs.
function buildAppInfoLine(): string {
  const version = Constants.expoConfig?.version ?? 'unknown version';
  // react-native-web hardcodes Platform.Version to '0.0.0', so the web build
  // reports just the platform name.
  const os = Platform.OS === 'web' ? 'web' : `${Platform.OS} ${Platform.Version}`;
  return `Simply Ambient ${version} · ${os}`;
}

function BugReportPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  const [kind, setKind] = useState<MessageKind>('feedback');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeAppInfo, setIncludeAppInfo] = useState(true);
  const [sending, setSending] = useState(false);
  // Shows an inline confirmation under SEND after a silent send lands.
  // Cleared as soon as the user starts a new message.
  const [sentInline, setSentInline] = useState(false);
  const appInfoLine = useMemo(buildAppInfoLine, []);

  async function submit() {
    if (!subject.trim() && !body.trim()) {
      notify('Empty message', 'Add a subject or write a few words first.');
      return;
    }
    setSending(true);

    const email = decodeReportEmail();
    const kindMeta = MESSAGE_KINDS.find(k => k.id === kind) ?? MESSAGE_KINDS[0];
    const fullSubject = `[Simply Ambient] ${kindMeta.label}: ${subject || kindMeta.fallbackSubject}`;
    const fullBody = [body.trim(), includeAppInfo ? appInfoLine : ''].filter(Boolean).join('\n\n');

    // 1) Try the silent FormSubmit AJAX endpoint first. Time-boxed: a stalled
    // mobile connection would otherwise leave SEND disabled indefinitely.
    let sentSilently = false;
    try {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 15000);
      try {
        const url = `https://formsubmit.co/ajax/${email}`;
        const res = await fetch(url, {
          method: 'POST',
          signal: abort.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'https://simply-ambient.app',
          },
          body: JSON.stringify({
            _subject: fullSubject,
            _captcha: 'false',
            _template: 'box',
            subject,
            message: fullBody,
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => ({} as any));
          sentSilently = json?.success === true || json?.success === 'true';
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {}

    if (sentSilently) {
      notify('Sent', 'Thank you. The developer will see it soon.');
      setSubject('');
      setBody('');
      setSentInline(true);
      setSending(false);
      return;
    }

    // 2) Fallback: open the user's mail app pre-filled. Reliable on every
    // device and doesn't depend on a third-party service activating an email.
    // The draft stays in the form; the user may cancel the mail compose and
    // come back to it.
    const mailto =
      `mailto:${email}` +
      `?subject=${encodeURIComponent(fullSubject)}` +
      `&body=${encodeURIComponent(fullBody)}`;
    try {
      await Linking.openURL(mailto);
      notify(
        'One more tap',
        'Your mail app is opening with the message pre-filled. Tap Send there to complete.',
      );
    } catch {
      notify('Could not send', 'No mail app available on this device.');
    }
    setSending(false);
  }

  return (
    <AmbientPageShell accent="#D68097">
      <StickySubpageScroll
        title="Feedback"
        accent="#D68097"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.sectionLabel}>MESSAGE TYPE</Text>
        <View style={styles.feedbackStampRow}>
          {MESSAGE_KINDS.map(k => (
            <TouchableOpacity
              key={k.id}
              onPress={() => setKind(k.id)}
              style={[
                styles.feedbackStamp,
                kind === k.id && { borderColor: '#D68097', backgroundColor: '#D6809722' },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k.id }}
            >
              <Text style={[styles.feedbackStampMark, kind === k.id && { color: '#D68097' }]}>
                {k.id === 'feedback' ? '♡' : k.id === 'idea' ? '✦' : '!'}
              </Text>
              <Text style={[styles.feedbackStampText, kind === k.id && { color: '#fff' }]}>
                {k.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>YOUR MESSAGE</Text>
        <Text style={styles.sectionSub}>
          Delivered to the developer through a simple mail relay. If that fails,
          your mail app opens with everything pre-filled.
        </Text>
        <GlowCard accent="#D68097" style={styles.feedbackPostcard}>
          <View style={styles.feedbackPostcardTop}>
            <Text style={styles.feedbackPostcardFrom}>A NOTE FOR SIMPLY AMBIENT</Text>
            <View style={styles.feedbackPostmark}>
              <Text style={styles.feedbackPostmarkText}>SA</Text>
            </View>
          </View>
          <TextInput
            style={styles.bugSubjectInput}
            accessibilityLabel="Message subject"
            placeholder="Subject"
            placeholderTextColor="#ffffff77"
            value={subject}
            onChangeText={t => { setSubject(t); setSentInline(false); }}
            maxLength={120}
          />
          <View style={styles.bugInputDivider} />
          <TextInput
            style={[styles.rantInput, { minHeight: 140 }]}
            accessibilityLabel="Message body"
            placeholder={
              kind === 'bug'
                ? 'Describe what happened, what you expected, and what device you’re on…'
                : 'What’s on your mind? Anything helps, from a single line to an essay…'
            }
            placeholderTextColor="#ffffff77"
            value={body}
            onChangeText={t => { setBody(t); setSentInline(false); }}
            multiline
            maxLength={2000}
          />
        </GlowCard>
        {body.length >= 1800 ? (
          <Text style={styles.bugAppInfoPreview}>{body.length} / 2000</Text>
        ) : null}

        <TouchableOpacity
          onPress={() => setIncludeAppInfo(v => !v)}
          style={[styles.settingRow, { marginTop: 16 }]}
          activeOpacity={0.85}
          accessibilityRole="switch"
          accessibilityState={{ checked: includeAppInfo }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.settingLabel}>Attach app info</Text>
            <Text style={styles.bugAppInfoPreview}>{appInfoLine}</Text>
          </View>
          <View style={[styles.settingToggle, includeAppInfo && { borderColor: '#D68097', backgroundColor: '#D6809722' }]}>
            <Text style={[styles.settingToggleText, includeAppInfo && { color: '#D68097' }]}>
              {includeAppInfo ? 'ON' : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.bugAppInfoHint}>
          Just the line above. Nothing from your journals or profile is ever attached.
        </Text>

        <TouchableOpacity
          onPress={submit}
          disabled={sending}
          style={[styles.bugSendBtn, sending && { opacity: 0.5 }]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Send this note"
          accessibilityState={{ disabled: sending }}
        >
          {sending ? (
            <ActivityIndicator color="#0B0B1F" />
          ) : (
            <Text style={styles.bugSendText}>Send this note  →</Text>
          )}
        </TouchableOpacity>
        {sentInline ? (
          <Text style={styles.notifHint}>
            Sent. Thank you, the developer will see it soon.
          </Text>
        ) : null}
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Profile sub-page (birth details + MBTI mini-quiz)
// ===========================================================================

const MBTI_QUESTIONS: Array<{
  q: string;
  letters: [string, string]; // [first option letter, second option letter]
  options: [string, string];
}> = [
  { q: 'At a gathering, you',           letters: ['E', 'I'], options: ['energise from interacting',  'recharge by stepping back'] },
  { q: 'When solving a problem, you',   letters: ['S', 'N'], options: ['focus on facts and details', 'see patterns and possibilities'] },
  { q: 'When deciding, you weigh',      letters: ['T', 'F'], options: ['logic and consistency',      'values and people'] },
  { q: 'You prefer to live',            letters: ['J', 'P'], options: ['planned and structured',     'flexible and spontaneous'] },
];

const MBTI_GROUPS: Record<string, { name: string; blurb: string }> = {
  NT: { name: 'Analyst',   blurb: 'Strategic, objective, big-picture.' },
  NF: { name: 'Diplomat',  blurb: 'Empathetic, idealistic, meaning-driven.' },
  SJ: { name: 'Sentinel',  blurb: 'Practical, dedicated, structured.' },
  SP: { name: 'Explorer',  blurb: 'Adventurous, hands-on, present-tense.' },
};

function mbtiGroupFor(type: string) {
  if (type.length !== 4) return null;
  const key = type[1] + (type[1] === 'N' ? type[2] : type[3]);
  return MBTI_GROUPS[key] ?? null;
}

// Shared sun-sign payoff card: glyph tinted with the sign's color, name,
// element and qualities, with an optional intention line.
function SunSignCard({
  sign, caption, showIntention,
}: {
  sign: Zodiac;
  caption: string;
  showIntention?: boolean;
}) {
  return (
    <GlowCard accent="#B39BE0" style={[styles.sunSignCard, { padding: 14 }]}>
      <Text style={[styles.sunSignGlyph, { color: sign.color }]}>{sign.glyph + '\uFE0E'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.compatName}>{sign.name}</Text>
        <Text style={styles.compatMeta}>{sign.element} · {sign.qualities}</Text>
        {showIntention ? (
          <Text style={styles.sunSignIntention}>{sign.intention}</Text>
        ) : null}
        <Text style={styles.sunSignCaption}>{caption}</Text>
      </View>
    </GlowCard>
  );
}

function ProfilePage({
  onBack,
  onProfileChange,
}: {
  onBack: () => void;
  onProfileChange?: (profile: Profile) => void;
}) {
  const subBodyPad = useSubBodyPad();
  const [profile, setProfile] = useState<Profile>({});
  const [answers, setAnswers] = useState<Array<0 | 1 | null>>([null, null, null, null]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') {
        setProfile(parsed);
        if (Array.isArray(parsed.mbtiAnswers) && parsed.mbtiAnswers.length === MBTI_QUESTIONS.length) {
          setAnswers(parsed.mbtiAnswers.map(a => (a === 0 || a === 1 ? a : null)));
        }
      }
    }).catch(() => {});
  }, []);

  function persist(next: Profile) {
    setProfile(next);
    onProfileChange?.(next);
    AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(next)).catch(() => {});
  }

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    persist({ ...profile, [key]: value });
  }

  function setAnswer(qIdx: number, choice: 0 | 1) {
    const next = answers.slice() as Array<0 | 1 | null>;
    next[qIdx] = choice;
    setAnswers(next);
    // Answers are saved alongside the type, and the type recomputes whenever
    // all four are in place, including after changing a single answer.
    const nextProfile: Profile = { ...profile, mbtiAnswers: next };
    if (next.every(a => a !== null)) {
      nextProfile.mbti = next.map((a, i) => MBTI_QUESTIONS[i].letters[a as 0 | 1]).join('');
    }
    persist(nextProfile);
  }

  function retakeQuiz() {
    setAnswers([null, null, null, null]);
    const next = { ...profile };
    delete next.mbti;
    delete next.mbtiAnswers;
    persist(next);
  }

  const mbtiGroup = profile.mbti ? mbtiGroupFor(profile.mbti) : null;
  const sunSign = sunSignFromBirthDate(profile.birthDate);

  return (
    <AmbientPageShell accent="#B39BE0">
      <StickySubpageScroll
        title="Profile"
        accent="#B39BE0"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <GlowCard accent="#B39BE0" style={styles.identityAtlas}>
          <View style={styles.identityCrest}>
            <LinearGradient
              colors={['#B39BE044', '#B39BE010']}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.identityInitial}>
              {profile.name?.trim()?.charAt(0).toUpperCase() || sunSign?.glyph || '·'}
            </Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityKicker}>YOUR PRIVATE ATLAS</Text>
            <Text style={styles.identityName}>{profile.name?.trim() || 'Begin with your name'}</Text>
            <View style={styles.identityTokens}>
              <Text style={styles.identityToken}>{sunSign?.name ?? 'SUN · OPEN'}</Text>
              <Text style={styles.identityToken}>{profile.mbti ?? 'TYPE · OPEN'}</Text>
            </View>
          </View>
        </GlowCard>

        <Text style={styles.sectionLabel}>YOUR COORDINATES</Text>
        <Text style={styles.sectionSub}>
          Used for your natal chart and compatibility. Stored only on this device.
        </Text>

        <GlowCard accent="#B39BE0" quiet style={styles.profileCoordinates}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            accessibilityLabel="Your name"
            placeholder="Your name"
            placeholderTextColor="#ffffff77"
            value={profile.name ?? ''}
            onChangeText={t => update('name', t)}
            maxLength={60}
          />
          <View style={styles.profileFieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Birth date</Text>
              <TextInput
                style={styles.fieldInput}
                accessibilityLabel="Your birth date"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#ffffff77"
                value={profile.birthDate ?? ''}
                onChangeText={t => update('birthDate', t)}
                maxLength={10}
              />
            </View>
            <View style={{ width: 96 }}>
              <Text style={styles.fieldLabel}>Birth time</Text>
              <TextInput
                style={styles.fieldInput}
                accessibilityLabel="Your birth time"
                placeholder="HH:MM"
                placeholderTextColor="#ffffff77"
                value={profile.birthTime ?? ''}
                onChangeText={t => update('birthTime', t)}
                maxLength={5}
              />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Birth location</Text>
          <TextInput
            style={styles.fieldInput}
            accessibilityLabel="Your birth location"
            placeholder="City, country"
            placeholderTextColor="#ffffff77"
            value={profile.birthLocation ?? ''}
            onChangeText={t => update('birthLocation', t)}
            maxLength={120}
          />
          <Text style={styles.profilePrivacyLine}>LOCKED TO THIS DEVICE · NO ACCOUNT</Text>
        </GlowCard>

        {sunSign ? (
          <SunSignCard sign={sunSign} caption="Your sun sign, from your birth date." />
        ) : (profile.birthDate ?? '').trim() ? (
          <Text style={styles.notifHint}>
            That date does not look complete yet. YYYY-MM-DD works best.
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>PERSONALITY SKETCH</Text>
        <Text style={styles.sectionSub}>
          Four quick questions for a rough sketch. Take it lightly.
        </Text>
        {MBTI_QUESTIONS.map((q, i) => (
          <View key={i} style={styles.mbtiCard}>
            <Text style={styles.mbtiQuestion}>{q.q}</Text>
            {[0, 1].map(idx => {
              const active = answers[i] === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.85}
                  onPress={() => setAnswer(i, idx as 0 | 1)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${q.q} ${q.options[idx]}`}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.mbtiOption,
                    active && { borderColor: '#B39BE0', backgroundColor: '#B39BE022' },
                  ]}
                >
                  <Text style={[styles.mbtiOptionText, active && { color: '#fff' }]}>
                    {q.options[idx]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {profile.mbti ? (
          <>
            <GlowCard accent="#B39BE0" style={{ marginTop: 18, padding: 18, alignItems: 'center' }}>
              <Text style={styles.mbtiResultType}>{profile.mbti}</Text>
              {mbtiGroup ? (
                <>
                  <Text style={styles.mbtiResultGroup}>{mbtiGroup.name}</Text>
                  <Text style={styles.mbtiResultBlurb}>{mbtiGroup.blurb}</Text>
                </>
              ) : null}
            </GlowCard>
            <TouchableOpacity
              onPress={retakeQuiz}
              style={styles.rantLetGoBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retake the personality questions"
            >
              <Text style={styles.rantLetGoText}>Retake</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Natal Chart sub-page (uses Profile data + external chart link)
// ===========================================================================

// astro-seek's free natal chart calculator.
const NATAL_CALCULATOR_URL = 'https://horoscopes.astro-seek.com/birth-chart-horoscope-online';

function NatalWheel({ sign }: { sign: Zodiac | null }) {
  const size = 236;
  const center = size / 2;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 12 - Math.PI / 2;
    const inner = 91;
    const outer = 104;
    return {
      x1: center + Math.cos(angle) * inner,
      y1: center + Math.sin(angle) * inner,
      x2: center + Math.cos(angle) * outer,
      y2: center + Math.sin(angle) * outer,
    };
  });
  const accent = sign?.color ?? '#B39BE0';

  return (
    <GlowCard accent={accent} style={styles.natalWheelCard}>
      <Text style={styles.natalWheelKicker}>THE SKY, HONESTLY KNOWN</Text>
      <View style={styles.natalWheelWrap}>
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={105} fill="none" stroke={accent + '42'} strokeWidth={1} />
          <Circle cx={center} cy={center} r={78} fill="none" stroke={accent + '26'} strokeWidth={1} />
          <Circle cx={center} cy={center} r={51} fill={accent + '0D'} stroke={accent + '34'} strokeWidth={1} />
          {ticks.map((tick, i) => (
            <Line
              key={i}
              {...tick}
              stroke={i === 0 && sign ? accent : 'rgba(255,255,255,0.20)'}
              strokeWidth={i === 0 && sign ? 3 : 1}
            />
          ))}
          <Line x1={center} y1={13} x2={center} y2={40} stroke={accent + '55'} strokeWidth={1} />
          <Line x1={center} y1={196} x2={center} y2={223} stroke={accent + '30'} strokeWidth={1} />
          <Line x1={13} y1={center} x2={40} y2={center} stroke={accent + '30'} strokeWidth={1} />
          <Line x1={196} y1={center} x2={223} y2={center} stroke={accent + '30'} strokeWidth={1} />
        </Svg>
        <View style={styles.natalWheelCenter}>
          <Text style={[styles.natalWheelGlyph, { color: accent }]}>
            {sign ? sign.glyph + '\uFE0E' : '·'}
          </Text>
          <Text style={styles.natalWheelSign}>{sign?.name ?? 'Sun unknown'}</Text>
          <Text style={styles.natalWheelMeta}>{sign ? `${sign.element} · SUN SIGN` : 'ADD A BIRTH DATE'}</Text>
        </View>
      </View>
      <Text style={styles.natalWheelCaption}>
        {sign
          ? 'Only your Sun is highlighted here. Planets and houses require a full chart calculation.'
          : 'This wheel stays unfilled until your birth date gives us one honest point: your Sun sign.'}
      </Text>
    </GlowCard>
  );
}

function NatalChartPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  const [profile, setProfile] = useState<Profile>({});
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') setProfile(parsed);
    }).catch(() => {});
  }, []);

  const sunSign = sunSignFromBirthDate(profile.birthDate);
  const ready = sunSign !== null;

  return (
    <AmbientPageShell accent="#B39BE0">
      <StickySubpageScroll
        title="Natal Chart"
        accent="#B39BE0"
        onBack={onBack}
        bodyStyle={subBodyPad}
      >
        <NatalWheel sign={sunSign} />

        <Text style={styles.sectionLabel}>YOUR BIRTH DETAILS</Text>
        {profile.name?.trim() || profile.birthDate ? (
          <View style={styles.compatCard}>
            {profile.name?.trim() ? (
              <Text style={styles.compatName}>{profile.name}</Text>
            ) : null}
            <Text style={styles.compatMeta}>
              {profile.birthDate ?? 'Birth date not set'}
              {profile.birthTime ? ` · ${profile.birthTime}` : ' · time not set'}
            </Text>
            {profile.birthLocation ? (
              <Text style={styles.compatMeta}>{profile.birthLocation}</Text>
            ) : (
              <Text style={styles.compatMeta}>Birth location not set</Text>
            )}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Open the Profile page first and fill in your birth details.
          </Text>
        )}

        <Text style={styles.sectionLabel}>WHAT'S A NATAL CHART?</Text>
        <Text style={styles.sectionSub}>
          A snapshot of the sky at the moment you were born. Sun, Moon, and planets across the
          zodiac and the twelve houses sketch a map of inclinations.
        </Text>

        <View style={styles.compatComingSoon}>
          <Text style={[styles.compatComingTitle, { color: '#B39BE0' }]}>
            In-app chart
          </Text>
          <Text style={styles.compatComingText}>
            A built-in chart with houses and aspects is on the roadmap.
          </Text>
          <TouchableOpacity
            onPress={() => setPendingOpenUrl(NATAL_CALCULATOR_URL)}
            disabled={!ready}
            style={[
              styles.aiBtn,
              { backgroundColor: '#B39BE0', marginTop: 14, opacity: ready ? 1 : 0.4 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open a free chart calculator in your browser"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={styles.aiBtnText}>OPEN CHART CALCULATOR</Text>
          </TouchableOpacity>
          {!ready ? (
            <Text style={styles.notifHint}>
              Add your birth date on Profile to continue.
            </Text>
          ) : null}
        </View>
      </StickySubpageScroll>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Routines (basic. Sample routines, simple sequencer scaffolded)
// ===========================================================================

type Routine = RoutinePathPayload & { description: string; color: string };

const ROUTINE_BAND_LABELS: Record<RoutineBandTarget, string> = {
  delta: 'Delta',
  theta: 'Theta',
  alpha: 'Alpha',
  beta: 'Beta',
};

function routineStepLabel(step: RoutinePathStep) {
  return `${ROUTINE_BAND_LABELS[step.bandTarget]} · ${step.targetHz} Hz`;
}

const SAMPLE_ROUTINES: Routine[] = [
  {
    id: 'morning-focus',
    name: 'Morning Focus',
    description: 'Wake the mind, then settle it into focus.',
    color: '#E0A470',
    steps: [
      { id: 'morning-focus-1', order: 1, presetId: 'beta', bandTarget: 'beta', targetHz: 18, durationMinutes: 5 },
      { id: 'morning-focus-2', order: 2, presetId: 'alpha', bandTarget: 'alpha', targetHz: 10, durationMinutes: 10 },
    ],
  },
  {
    id: 'evening-windown',
    name: 'Evening Wind-down',
    description: 'Release the day, then soften toward rest.',
    color: '#A498E8',
    steps: [
      { id: 'evening-windown-1', order: 1, presetId: 'alpha', bandTarget: 'alpha', targetHz: 10, durationMinutes: 10 },
      { id: 'evening-windown-2', order: 2, presetId: 'theta', bandTarget: 'theta', targetHz: 6, durationMinutes: 15 },
    ],
  },
  {
    id: 'deep-sleep',
    name: 'Deep Sleep',
    description: 'Drop in gently, then rest deeply.',
    color: '#8F97DE',
    steps: [
      { id: 'deep-sleep-1', order: 1, presetId: 'theta', bandTarget: 'theta', targetHz: 6, durationMinutes: 10 },
      { id: 'deep-sleep-2', order: 2, presetId: 'delta', bandTarget: 'delta', targetHz: 2, durationMinutes: 30 },
    ],
  },
];

// Hand-drawn backdrop sigils, one per routine journey: a rising sun for the
// morning path, a setting sun for the wind-down, a crescent over deep water
// for sleep. Same stroke language as the chakra sigils.
function RoutineSigil({ routineId, color, size }: { routineId: string; color: string; size: number }) {
  const stroke = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  let mark: React.ReactNode;
  switch (routineId) {
    case 'morning-focus':
      mark = (
        <>
          {/* Sun climbing above the horizon, rays reaching up */}
          <SvgLine x1={3} y1={16} x2={21} y2={16} {...stroke} />
          <SvgPath d="M7.5 16 A4.5 4.5 0 0 1 16.5 16" {...stroke} />
          <SvgLine x1={12} y1={6} x2={12} y2={8.4} {...stroke} />
          <SvgLine x1={5.8} y1={8.6} x2={7.4} y2={10.2} {...stroke} />
          <SvgLine x1={18.2} y1={8.6} x2={16.6} y2={10.2} {...stroke} />
          <SvgCircle cx={12} cy={19} r={0.9} fill={color} />
        </>
      );
      break;
    case 'evening-windown':
      mark = (
        <>
          {/* Sun slipping below the horizon, last light settling */}
          <SvgLine x1={3} y1={11} x2={21} y2={11} {...stroke} />
          <SvgPath d="M7.5 11 A4.5 4.5 0 0 0 16.5 11" {...stroke} />
          <SvgLine x1={8.2} y1={7.6} x2={9.4} y2={8.8} {...stroke} strokeOpacity={0.65} />
          <SvgLine x1={12} y1={6.6} x2={12} y2={8.2} {...stroke} strokeOpacity={0.65} />
          <SvgLine x1={15.8} y1={7.6} x2={14.6} y2={8.8} {...stroke} strokeOpacity={0.65} />
          <SvgPath d="M5 19 C8 17.6 10.5 20 13.5 18.6 S19 17.6 21 18.8" {...stroke} strokeOpacity={0.55} />
        </>
      );
      break;
    default:
      mark = (
        <>
          {/* Crescent over deep water, two far stars */}
          <SvgPath d="M14.5 4.5 A5.6 5.6 0 1 0 14.5 15.5 A4.4 4.4 0 1 1 14.5 4.5 Z" {...stroke} />
          <SvgCircle cx={18.6} cy={6.4} r={0.7} fill={color} />
          <SvgCircle cx={20.2} cy={10.2} r={0.5} fill={color} opacity={0.7} />
          <SvgPath d="M3.5 18.4 C6 17 8.5 19.4 11.5 18 S17 17 19.5 18.2" {...stroke} strokeOpacity={0.7} />
          <SvgPath d="M5 21 C7.5 19.8 10 21.8 13 20.6 S18 19.8 20.5 20.8" {...stroke} strokeOpacity={0.4} />
        </>
      );
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {mark}
    </Svg>
  );
}

type RoutinesPageProps = {
  onBack: () => void;
  activeRoutineId: RoutinePathId | null;
  onStartRoutine?: (routine: RoutinePathPayload) => void;
  onStopRoutine?: (routine: RoutinePathPayload) => void;
};

function RoutinesPage({
  onBack,
  activeRoutineId,
  onStartRoutine,
  onStopRoutine,
}: RoutinesPageProps) {
  const subBodyPad = useSubBodyPad();
  return (
    <AmbientPageShell accent="#9DC7AC">
      <StickySubpageScroll
        title="Routines"
        accent="#9DC7AC"
        onBack={onBack}
        bodyStyle={subBodyPad}
      >
        <Text style={styles.sectionLabel}>SESSION GUIDES</Text>
        <Text style={styles.sectionSub}>
          Choose a ready-made sequence. Every step shows the tone it targets and how long it lasts.
        </Text>
        {SAMPLE_ROUTINES.map(r => {
          const steps = [...r.steps].sort((a, b) => a.order - b.order);
          const totalMinutes = steps.reduce((sum, step) => sum + step.durationMinutes, 0);
          const isActive = activeRoutineId === r.id;
          const canControl = isActive ? Boolean(onStopRoutine) : Boolean(onStartRoutine);
          const stepSummary = steps
            .map(step => `Step ${step.order}, ${routineStepLabel(step)}, ${step.durationMinutes} minutes`)
            .join('. ');

          return (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.82}
              disabled={!canControl}
              onPress={() => {
                if (isActive) onStopRoutine?.(r);
                else onStartRoutine?.(r);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${isActive ? 'Active' : 'Start'} ${r.name} path, ${totalMinutes} minutes. ${stepSummary}`}
              accessibilityHint={isActive ? 'Stops this routine path' : 'Starts this routine path from step one'}
              accessibilityState={{ disabled: !canControl, selected: isActive }}
              accessibilityValue={{ text: isActive ? 'Path active' : 'Ready to start' }}
              style={!canControl ? styles.routinePressableDisabled : undefined}
            >
              <GlowCard
                accent={r.color}
                quiet
                style={isActive
                  ? [styles.routineCard, { borderColor: r.color, borderWidth: 2 }]
                  : styles.routineCard}
              >
                <View style={styles.routineBackdropSigil} pointerEvents="none">
                  <RoutineSigil routineId={r.id} color={r.color} size={150} />
                </View>
                <Text style={[styles.routineEyebrow, { color: r.color }]}>SESSION PATH</Text>
                <View style={styles.routineTitleRow}>
                  <Text style={[styles.routineName, { color: r.color }]}>{r.name}</Text>
                  <Text style={styles.routineTotal}>{totalMinutes} MIN TOTAL</Text>
                </View>
                <Text style={styles.routineDesc}>{r.description}</Text>
                <View style={styles.routinePath}>
                  <View style={[styles.routinePathLine, { backgroundColor: r.color + '3A' }]} />
                  {steps.map(step => (
                    <View key={step.id} style={styles.routineStep}>
                      <View style={[styles.routineStepNode, { borderColor: r.color, backgroundColor: r.color + '22' }]}>
                        <Text style={[styles.routineStepNum, { color: r.color }]}>{step.order}</Text>
                      </View>
                      <Text style={styles.routineStepLabel}>{routineStepLabel(step)}</Text>
                      <Text style={styles.routineStepTime}>{step.durationMinutes} min</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.routineActionRow, { borderTopColor: r.color + '32' }]}>
                  <View style={styles.routineStatusWrap}>
                    <View style={[styles.routineStatusDot, { backgroundColor: isActive ? r.color : r.color + '66' }]} />
                    <Text style={[styles.routineStatusText, isActive && { color: r.color }]}>
                      {isActive ? 'PATH ACTIVE' : 'READY WHEN YOU ARE'}
                    </Text>
                  </View>
                  <View style={[styles.routineAction, { borderColor: r.color + '66', backgroundColor: r.color + '18' }]}>
                    {isActive
                      ? <Stop size={13} color={r.color} weight="fill" />
                      : <Play size={13} color={r.color} weight="fill" />}
                    <Text style={[styles.routineActionText, { color: r.color }]}>
                      {isActive ? 'Stop path' : 'Start path'}
                    </Text>
                  </View>
                </View>
              </GlowCard>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.notifHint}>
          Custom paths are still on the roadmap. These starter paths always follow the order shown.
        </Text>
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Soundscapes
// ===========================================================================

function solidAccent(color: string): string {
  return /^#[0-9a-f]{8}$/i.test(color) ? color.slice(0, 7) : color;
}

function SoundscapesPage({
  onBack,
  soundscapes,
  activeSoundscapeId,
  isSoundscapePlaying,
  soundscapeVolume,
  onToggleSoundscape,
  onChangeSoundscapeVolume,
}: {
  onBack: () => void;
  soundscapes: SoundscapeOption[];
  activeSoundscapeId: string | null;
  isSoundscapePlaying: boolean;
  soundscapeVolume: number;
  onToggleSoundscape: (id: string) => void;
  onChangeSoundscapeVolume: (v: number) => void;
}) {
  const subBodyPad = useSubBodyPad();
  const activeSoundscape = activeSoundscapeId
    ? soundscapes.find(s => s.id === activeSoundscapeId) ?? null
    : null;
  const activeName = activeSoundscape?.name ?? 'No layer selected';
  const heroAccent = solidAccent(activeSoundscape?.color ?? '#8FB8DE');

  // Two families, rendered under their own section labels.
  const NATURE_IDS = ['rain', 'ocean', 'forest', 'stream', 'fire', 'breeze', 'night', 'thunder'];
  const natureScapes = soundscapes.filter(s => NATURE_IDS.includes(s.id));
  const steadyScapes = soundscapes.filter(s => !NATURE_IDS.includes(s.id));

  const renderCard = (s: SoundscapeOption) => {
    const active = activeSoundscapeId === s.id && isSoundscapePlaying;
    // Dynamic alpha suffixes require an opaque six-digit base. Normalize
    // legacy accents such as White Noise's former #ffffffcc before composing
    // native gradient and border colors.
    const tileAccent = solidAccent(s.color);
    return (
      <TouchableOpacity
        key={s.id}
        activeOpacity={0.85}
        onPress={() => onToggleSoundscape(s.id)}
        accessibilityRole="button"
        accessibilityLabel={`${active ? 'Stop' : 'Play'} ${s.name}. ${s.blurb}`}
        accessibilityState={{ selected: active }}
        style={[
          styles.soundscapeCard,
          { borderColor: tileAccent + '32' },
          active && {
            borderColor: tileAccent,
            backgroundColor: tileAccent + '18',
          },
        ]}
      >
        <LinearGradient
          colors={[tileAccent + '22', 'rgba(25,26,48,0.94)', 'rgba(13,14,31,0.98)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.soundscapeTileTop}>
          <View style={[styles.soundscapeGlyphBox, { backgroundColor: tileAccent + '22', borderColor: tileAccent + '77' }]}>
            <s.Icon size={22} color={tileAccent} weight="duotone" />
          </View>
          <Text style={[styles.soundscapeSoon, active && { color: tileAccent, borderColor: tileAccent }]}>
            {active ? 'STOP' : 'PLAY'}
          </Text>
        </View>
        <View style={styles.soundscapeTileCopy}>
          <Text style={styles.soundscapeName}>{s.name}</Text>
          <Text style={styles.soundscapeBlurb} numberOfLines={2}>{s.blurb}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <AmbientPageShell accent="#8FB8DE" rippleActive={isSoundscapePlaying}>
      <StickySubpageScroll
        title="Soundscapes"
        accent="#8FB8DE"
        onBack={onBack}
        bodyStyle={subBodyPad}
      >
        <Text style={styles.sectionLabel}>NATURAL AMBIENCE</Text>
        <Text style={styles.sectionSub}>
          A soft ambient layer under your binaural tones, built in and available offline.
          It follows you through the app in the mini player.
        </Text>

        <GlowCard accent={heroAccent} style={styles.soundscapeHero}>
          <SoundscapeScene soundscape={activeSoundscape} playing={isSoundscapePlaying} />
          <View style={styles.soundscapeTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.soundscapeActiveLabel, { color: heroAccent }]}>CURRENT</Text>
              <Text style={styles.soundscapeActiveName}>{activeName}</Text>
              <Text style={styles.soundscapeActiveMeta}>
                {activeSoundscapeId
                  ? isSoundscapePlaying ? 'Playing now' : 'Paused'
                  : 'Pick a layer below to begin.'}
              </Text>
            </View>
            <View style={styles.soundscapeHeroActions}>
              {activeSoundscapeId ? (
                <TouchableOpacity
                  onPress={() => onToggleSoundscape(activeSoundscapeId)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={isSoundscapePlaying ? 'Stop the soundscape' : 'Play the soundscape'}
                  style={[
                    styles.soundscapeHeroTransport,
                    {
                      borderColor: heroAccent + '70',
                      backgroundColor: heroAccent + '14',
                    },
                  ]}
                >
                  {isSoundscapePlaying ? (
                    <Stop size={18} color={heroAccent} weight="fill" />
                  ) : (
                    <Play size={19} color={heroAccent} weight="fill" />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {activeSoundscapeId ? (
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.soundscapeVolLabel, { color: heroAccent }]}>VOLUME · {Math.round(soundscapeVolume * 100)}%</Text>
              <Slider
                style={{ width: '100%', height: 34 }}
                minimumValue={0}
                maximumValue={1}
                value={soundscapeVolume}
                minimumTrackTintColor={heroAccent}
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor={heroAccent}
                onValueChange={onChangeSoundscapeVolume}
                accessibilityLabel="Soundscape volume"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(soundscapeVolume * 100),
                  text: `${Math.round(soundscapeVolume * 100)}%`,
                }}
              />
            </View>
          ) : null}
        </GlowCard>

        <Text style={styles.sectionLabel}>NATURE</Text>
        <View style={styles.soundscapeGrid}>{natureScapes.map(renderCard)}</View>

        <Text style={styles.sectionLabel}>STEADY & RHYTHMIC</Text>
        <View style={styles.soundscapeGrid}>{steadyScapes.map(renderCard)}</View>
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Compatibility scaffold
// ===========================================================================

type ZodiacElement = Zodiac['element'];

// Honest, non-predictive reflections on how two elements traditionally sit
// together. Same-element pairs share one voice per element; cross pairs are
// keyed by the two elements sorted alphabetically.
const SAME_ELEMENT_REFLECTIONS: Record<ZodiacElement, string> = {
  Fire:
    'Two Fire signs share a language of heat and momentum. Enthusiasm builds fast between you, and so can friction. Leaving room for both flames keeps the warmth generous.',
  Earth:
    'Two Earth signs share a language of steadiness and care. You build slowly and value what lasts. Tending the routine keeps comfort from going quiet.',
  Air:
    'Two Air signs share a language of ideas and conversation. Talk flows easily and curiosity keeps things fresh. Grounding the words in small acts helps them land.',
  Water:
    'Two Water signs share a language of feeling and intuition. You often read each other without much explaining. Naming things out loud now and then keeps the depth clear.',
};

const CROSS_ELEMENT_REFLECTIONS: Record<string, string> = {
  'Air+Fire':
    'Fire and Air tend to feed each other. Air fans the flame with ideas, and Fire gives those ideas heat and motion. The pairing is lively, so rest is worth planning on purpose.',
  'Fire+Water':
    'Fire and Water make steam. Water can soften Fire\'s edges, and Fire can warm Water\'s depths, though each can also dampen or scorch the other. This pairing asks for care and honest pacing.',
  'Earth+Fire':
    'Fire brings the spark and Earth brings the steadiness. One starts things, the other sees them through. Respecting each other\'s tempo turns the difference into a strength.',
  'Air+Water':
    'Air leads with ideas and Water leads with feeling. When both stay curious about the other\'s language, conversations can bridge head and heart.',
  'Air+Earth':
    'Air sketches the plan and Earth checks the ground. Together the vision gains structure and the structure gets fresh air. Patience with each other\'s pace helps.',
  'Earth+Water':
    'Earth and Water are a garden pairing. Water nourishes and Earth holds, so growth between you can feel natural. Keeping the flow moving helps nothing stagnate.',
};

function elementReflection(a: ZodiacElement, b: ZodiacElement): string {
  if (a === b) return SAME_ELEMENT_REFLECTIONS[a];
  return CROSS_ELEMENT_REFLECTIONS[[a, b].sort().join('+')] ?? '';
}

function CompatibilityPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  const [self, setSelf] = useState<Profile>({});
  const [partner, setPartner] = useState<Profile>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') setSelf(parsed);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_PARTNER).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') setPartner(parsed);
    }).catch(() => {});
  }, []);

  function updatePartner<K extends keyof Profile>(key: K, value: Profile[K]) {
    const next = { ...partner, [key]: value };
    setPartner(next);
    AsyncStorage.setItem(STORAGE_PARTNER, JSON.stringify(next)).catch(() => {});
  }

  function clearPartner() {
    setPartner({});
    AsyncStorage.removeItem(STORAGE_PARTNER).catch(() => {});
  }

  const selfSign = sunSignFromBirthDate(self.birthDate);
  const partnerSign = sunSignFromBirthDate(partner.birthDate);
  const hasPartnerData = !!(
    partner.name || partner.birthDate || partner.birthTime || partner.birthLocation
  );

  return (
    <AmbientPageShell accent="#D8A0B0">
      <StickySubpageScroll
        title="Compatibility"
        accent="#D8A0B0"
        onBack={onBack}
        bodyStyle={subBodyPad}
        automaticallyAdjustKeyboardInsets
      >
        <GlowCard accent="#D8A0B0" style={styles.compatOrbitCard}>
          <Text style={styles.compatOrbitKicker}>TWO ORBITS · ONE MEETING PLACE</Text>
          <View style={styles.compatOrbitRow}>
            <View style={[styles.compatOrbit, styles.compatOrbitSelf, { borderColor: selfSign?.color ?? '#B39BE0' }]}>
              <Text style={[styles.compatOrbitGlyph, { color: selfSign?.color ?? '#B39BE0' }]}>
                {selfSign ? selfSign.glyph + '\uFE0E' : '·'}
              </Text>
              <Text style={styles.compatOrbitName}>{self.name?.trim() || 'You'}</Text>
            </View>
            <View style={[styles.compatOrbit, styles.compatOrbitPartner, { borderColor: partnerSign?.color ?? '#D8A0B0' }]}>
              <Text style={[styles.compatOrbitGlyph, { color: partnerSign?.color ?? '#D8A0B0' }]}>
                {partnerSign ? partnerSign.glyph + '\uFE0E' : '?'}
              </Text>
              <Text style={styles.compatOrbitName}>{partner.name?.trim() || 'Them'}</Text>
            </View>
            <View style={styles.compatOrbitJoin}><Text style={styles.compatOrbitJoinText}>☌</Text></View>
          </View>
          <Text style={styles.compatOrbitHint}>
            {selfSign && partnerSign
              ? `${selfSign.element} meets ${partnerSign.element}. Your reflection is ready below.`
              : 'Add two birth dates to reveal a simple element reflection.'}
          </Text>
        </GlowCard>

        <Text style={styles.sectionLabel}>YOUR PROFILE</Text>
        {self.name || self.birthDate ? (
          <View style={styles.compatCard}>
            <Text style={styles.compatName}>{self.name ?? '·'}</Text>
            <Text style={styles.compatMeta}>
              {self.birthDate ?? 'No birth date set'}
              {self.birthTime ? ` · ${self.birthTime}` : ''}
            </Text>
            {self.birthLocation ? <Text style={styles.compatMeta}>{self.birthLocation}</Text> : null}
            {self.mbti ? <Text style={styles.compatMbti}>{self.mbti}</Text> : null}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Set your details on the Profile page first.
          </Text>
        )}

        <Text style={styles.sectionLabel}>OTHER PERSON</Text>
        <Text style={styles.sectionSub}>Their birth details, stored only on this device.</Text>
        <GlowCard accent="#D8A0B0" quiet style={styles.profileCoordinates}>
          <Text style={styles.fieldLabel}>Birth date · needed for the match</Text>
          <TextInput
            style={styles.fieldInput}
            accessibilityLabel="Other person's birth date"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#ffffff77"
            value={partner.birthDate ?? ''}
            onChangeText={t => updatePartner('birthDate', t)}
            maxLength={10}
          />
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.fieldInput}
            accessibilityLabel="Other person's name"
            placeholder="Their name"
            placeholderTextColor="#ffffff77"
            value={partner.name ?? ''}
            onChangeText={t => updatePartner('name', t)}
            maxLength={60}
          />
          <View style={styles.profileFieldRow}>
            <View style={{ width: 96 }}>
              <Text style={styles.fieldLabel}>Birth time</Text>
              <TextInput
                style={styles.fieldInput}
                accessibilityLabel="Other person's birth time"
                placeholder="HH:MM"
                placeholderTextColor="#ffffff77"
                value={partner.birthTime ?? ''}
                onChangeText={t => updatePartner('birthTime', t)}
                maxLength={5}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Birth location</Text>
              <TextInput
                style={styles.fieldInput}
                accessibilityLabel="Other person's birth location"
                placeholder="City, country"
                placeholderTextColor="#ffffff77"
                value={partner.birthLocation ?? ''}
                onChangeText={t => updatePartner('birthLocation', t)}
                maxLength={120}
              />
            </View>
          </View>
        </GlowCard>
        {hasPartnerData ? (
          <TouchableOpacity
            onPress={clearPartner}
            style={styles.rantLetGoBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Clear this person's saved details"
          >
            <Text style={styles.rantLetGoText}>Clear this person</Text>
          </TouchableOpacity>
        ) : null}

        {selfSign && partnerSign ? (
          <>
            <Text style={styles.sectionLabel}>HOW YOUR SIGNS MEET</Text>
            <GlowCard accent="#D8A0B0" style={{ padding: 14 }}>
              <View style={styles.compatSignsRow}>
                <View style={styles.compatSignCol}>
                  <Text style={[styles.compatPairGlyph, { color: selfSign.color }]}>
                    {selfSign.glyph + '\uFE0E'}
                  </Text>
                  <Text style={styles.compatName}>{selfSign.name}</Text>
                  <Text style={styles.compatMeta}>{selfSign.element}</Text>
                </View>
                <Text style={styles.compatPairJoin}>+</Text>
                <View style={styles.compatSignCol}>
                  <Text style={[styles.compatPairGlyph, { color: partnerSign.color }]}>
                    {partnerSign.glyph + '\uFE0E'}
                  </Text>
                  <Text style={styles.compatName}>{partnerSign.name}</Text>
                  <Text style={styles.compatMeta}>{partnerSign.element}</Text>
                </View>
              </View>
              <Text style={styles.compatReflection}>
                {elementReflection(selfSign.element, partnerSign.element)}
              </Text>
              <Text style={styles.sunSignCaption}>
                A traditional astrology lens on how your elements meet. Take what resonates.
              </Text>
            </GlowCard>
          </>
        ) : null}

        <View style={styles.compatComingSoon}>
          <Text style={styles.compatComingTitle}>Full chart comparison</Text>
          <Text style={styles.compatComingText}>
            A planet-by-planet reading is on the roadmap. Your saved details will be ready for it.
          </Text>
        </View>
      </StickySubpageScroll>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   AI Insights (Gemini)
// ===========================================================================

const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';
const STORAGE_TAROT = '@simply_ambient_tarot_v1';
const STORAGE_LAST_REFLECTION = '@simply_ambient_last_reflection_v1';

// Shown before a key is saved, so the page demonstrates its value first.
const EXAMPLE_REFLECTION =
  'This week leaned tired, with low evenings and slow mornings. Still, small gratitudes kept ' +
  'surfacing: the light through the kitchen window, a friend who called at the right moment. ' +
  'Rest seems to be asking for a little more room.';

type SavedReflection = { ts: number; kind: 'themes' | 'tarot'; text: string };

function InsightsPage({
  onBack, counts,
}: {
  onBack: () => void;
  // Live entry counts from the parent's state, one per toggleable source.
  counts: Record<AISourceKey, number>;
}) {
  const subBodyPad = useSubBodyPad();
  const [savedKey, setSavedKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyInputOpen, setKeyInputOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reflection, setReflection] = useState<SavedReflection | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpenLink, setConfirmOpenLink] = useState(false);
  const [sources, setSources] = useState<AISources>(DEFAULT_AI_SOURCES);
  const [hasTarot, setHasTarot] = useState(false);

  useEffect(() => {
    loadGeminiApiKey().then(v => {
      if (v) {
        setSavedKey(v);
        setKeyDraft(v);
      }
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_AI_SOURCES).then(v => {
      if (!v) return;
      try {
        const parsed = JSON.parse(v) as Partial<AISources>;
        setSources({ ...DEFAULT_AI_SOURCES, ...parsed });
      } catch {}
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_TAROT).then(v => {
      const parsed = safeParse<{ card?: unknown }>(v, {});
      setHasTarot(!!(parsed && typeof parsed === 'object' && parsed.card));
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_LAST_REFLECTION).then(v => {
      const parsed = safeParse<SavedReflection | null>(v, null);
      if (
        parsed && typeof parsed === 'object' &&
        typeof parsed.ts === 'number' &&
        typeof parsed.text === 'string' &&
        (parsed.kind === 'themes' || parsed.kind === 'tarot')
      ) {
        setReflection(parsed);
      }
    }).catch(() => {});
  }, []);

  const hasKey = savedKey.trim().length > 0;

  // Persists only non-empty values, so clearing the field can never silently
  // erase a stored key. Removal happens only through the explicit button.
  function handleKeyInput(value: string) {
    setKeyDraft(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!hasKey) setKeyInputOpen(true); // Keep the field visible as the layout switches.
    setSavedKey(trimmed);
    saveGeminiApiKey(trimmed).catch(() => {});
  }

  async function removeKey() {
    try {
      await removeGeminiApiKey();
      setSavedKey('');
      setKeyDraft('');
      setKeyInputOpen(false);
    } catch {
      notify(
        'Could not remove key',
        'Secure storage did not confirm the deletion. Please try again.',
      );
    }
  }

  function toggleSource(k: AISourceKey) {
    const next = { ...sources, [k]: !sources[k] };
    setSources(next);
    AsyncStorage.setItem(STORAGE_AI_SOURCES, JSON.stringify(next)).catch(() => {});
  }

  // The journal reading needs at least one enabled source that has entries.
  const canRunJournal = (Object.keys(sources) as AISourceKey[])
    .some(k => sources[k] && counts[k] > 0);

  async function runAnalysis(kind: 'journal' | 'tarot') {
    if (!savedKey.trim()) {
      notify('Add your Gemini API key', 'Create or view a key at aistudio.google.com and paste it above.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      let prompt = '';
      if (kind === 'journal') {
        const enabled = (Object.keys(sources) as AISourceKey[]).filter(k => sources[k]);
        if (enabled.length === 0) {
          notify('No data sources enabled', 'Toggle at least one source on below to give the AI something to reflect on.');
          setLoading(false);
          return;
        }
        const [moodRaw, gratRaw, rantRaw, manifestRaw] = await Promise.all([
          sources.mood ? AsyncStorage.getItem(STORAGE_MOOD) : Promise.resolve(null),
          sources.gratitude ? AsyncStorage.getItem(STORAGE_GRAT) : Promise.resolve(null),
          sources.rant ? AsyncStorage.getItem(STORAGE_RANT) : Promise.resolve(null),
          sources.manifestation ? AsyncStorage.getItem(STORAGE_MANIFEST) : Promise.resolve(null),
        ]);
        const moodsParsed = safeParse<MoodEntry[]>(moodRaw, []);
        const gratsParsed = safeParse<GratEntry[]>(gratRaw, []);
        const rantsParsed = safeParse<RantEntry[]>(rantRaw, []);
        const manifestsParsed = safeParse<ManifestEntry[]>(manifestRaw, []);
        const moods: MoodEntry[] = Array.isArray(moodsParsed) ? moodsParsed : [];
        const grats: GratEntry[] = Array.isArray(gratsParsed) ? gratsParsed : [];
        const rants: RantEntry[] = Array.isArray(rantsParsed) ? rantsParsed : [];
        const manifests: ManifestEntry[] = Array.isArray(manifestsParsed) ? manifestsParsed : [];
        const sections: string[] = [];
        if (sources.mood) {
          const moodLines = moods.slice(0, 30).map(m =>
            `${new Date(m.ts).toISOString().slice(0, 10)} · mood ${m.value}/5 (${moodLabel(m.value)})`,
          ).join('\n');
          sections.push('MOOD ENTRIES (newest first):\n' + (moodLines || '(no entries)'));
        }
        if (sources.gratitude) {
          const gratLines = grats.slice(0, 30).map(g =>
            `${new Date(g.ts).toISOString().slice(0, 10)}: ${g.text}`,
          ).join('\n');
          sections.push('GRATITUDE ENTRIES (newest first):\n' + (gratLines || '(no entries)'));
        }
        if (sources.rant) {
          const rantLines = rants.slice(0, 15).map(r =>
            `${new Date(r.ts).toISOString().slice(0, 10)}: ${r.text.slice(0, 600)}`,
          ).join('\n---\n');
          sections.push('RANTS (newest first):\n' + (rantLines || '(no entries)'));
        }
        if (sources.manifestation) {
          const manifestLines = manifests.slice(0, 30).map(m =>
            `${m.manifested ? '[✓ manifested]' : '[calling in]'} ${m.text}`,
          ).join('\n');
          sections.push('MANIFESTATIONS:\n' + (manifestLines || '(no entries)'));
        }
        prompt =
          'You are a thoughtful, grounded reflection companion writing entries for a dream-journal-style ' +
          'reflection page. Identify 3-5 honest themes you notice across the data the user has chosen to share. ' +
          'Be specific and gentle. If both manifestations and rants/mood are present, notice tension between ' +
          'what they say they want and what they feel underneath. Avoid clichés, woo, or diagnoses. ' +
          'Write in flowing prose suitable for reading by candlelight. Under 260 words.\n\n' +
          sections.join('\n\n');
      } else {
        const tarotRaw = await AsyncStorage.getItem(STORAGE_TAROT);
        const tarotParsed = safeParse<unknown>(tarotRaw, null);
        const tarotPrompt = buildTarotInterpretationPrompt(tarotParsed);
        if (!tarotPrompt) {
          notify('No card drawn', 'Open Stars and draw a card first.');
          setLoading(false);
          return;
        }
        prompt = tarotPrompt;
      }

      const text = await requestGeminiReflection(savedKey.trim(), prompt);
      const entry: SavedReflection = {
        ts: Date.now(),
        kind: kind === 'journal' ? 'themes' : 'tarot',
        text,
      };
      setReflection(entry);
      AsyncStorage.setItem(STORAGE_LAST_REFLECTION, JSON.stringify(entry)).catch(() => {});
    } catch (e) {
      if (e instanceof GeminiRequestError) {
        setErrorMsg(e.userMessage);
      } else if (isAbortError(e)) {
        setErrorMsg(GEMINI_ERRORS.timeout);
      } else {
        setErrorMsg(GEMINI_ERRORS.network);
      }
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <AmbientPageShell accent="#8FB8DE">
      <StickySubpageScroll
        title="AI Insights"
        accent="#8FB8DE"
        onBack={onBack}
        bodyStyle={subBodyPad}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        {!hasKey ? (
          <>
            <GlowCard accent="#8FB8DE" style={{ marginTop: 16, padding: 22, alignItems: 'center' }}>
              <Text style={styles.supportHeadline}>A quiet reader for your journal</Text>
              <Text style={[styles.supportText, { marginBottom: 0 }]}>
                Your mood, gratitude, and manifestations already hold patterns. With your own
                Gemini key, this page writes you a short reflection in the style of a dream
                journal. Everything stays on this device until you choose to share it.
              </Text>
            </GlowCard>
            <View style={styles.dreamPage}>
              <LinearGradient
                colors={['#d9b35c14', 'transparent']}
                style={styles.dreamGlow}
                pointerEvents="none"
              />
              <Text style={styles.dreamDate}>A week, read gently</Text>
              <View style={styles.dreamRule} />
              <Text style={styles.dreamBody}>{EXAMPLE_REFLECTION}</Text>
              <Text style={styles.dreamSig}>· example</Text>
            </View>
          </>
        ) : null}

        <GlowCard accent="#8FB8DE" quiet style={styles.aiIngredientsTray}>
        <View style={styles.aiIngredientsHeading}>
          <View>
            <Text style={styles.aiIngredientsKicker}>INGREDIENTS FOR A READING</Text>
            <Text style={styles.aiIngredientsTitle}>You decide what enters the room</Text>
          </View>
          <Text style={styles.aiIngredientsGlyph}>⌁</Text>
        </View>
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>GEMINI API KEY</Text>
        {hasKey ? (
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.settingLabel}>Gemini key</Text>
              <Text style={styles.bugAppInfoPreview}>
                {Platform.OS === 'web'
                  ? 'Available for this browser session only'
                  : 'Protected in this device\'s secure storage'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setKeyInputOpen(o => !o)}
              style={styles.settingToggle}
              accessibilityRole="button"
              accessibilityLabel={keyInputOpen ? 'Hide the key field' : 'Change the saved key'}
            >
              <Text style={styles.settingToggleText}>{keyInputOpen ? 'HIDE' : 'CHANGE'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.sectionSub}>
            Create or view one at{' '}
            <Text style={styles.linkText} onPress={() => setConfirmOpenLink(true)}>
              aistudio.google.com
            </Text>
            {Platform.OS === 'web'
              ? '. The key stays only for this browser session.'
              : '. The key is protected in this device\'s secure storage.'}
          </Text>
        )}
        {!hasKey || keyInputOpen ? (
          <TextInput
            style={[styles.fieldInput, hasKey && { marginTop: 10 }]}
            accessibilityLabel="Gemini API key"
            placeholder="paste your key here"
            placeholderTextColor="#ffffff77"
            value={keyDraft}
            onChangeText={handleKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        ) : null}
        {hasKey ? (
          <TouchableOpacity
            onPress={removeKey}
            style={styles.rantLetGoBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Remove the saved Gemini key from this device"
          >
            <Text style={styles.rantLetGoText}>Remove key</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.notifHint}>
          Use a current auth key from Google AI Studio. If Google marks a key exposed or blocked,
          remove it here, revoke it there, and create a replacement.
        </Text>

        <Text style={styles.sectionLabel}>SHARE WITH AI</Text>
        <Text style={styles.sectionSub}>
          Pick which journal data is sent to Google Gemini for the journal themes analysis.
          Off by default for sensitive sources like rants.
        </Text>
        <View style={styles.aiSourceRow}>
          {([
            { id: 'mood',          label: 'Mood',          color: '#8FB8DE' },
            { id: 'gratitude',     label: 'Gratitude',     color: '#E0A470' },
            { id: 'manifestation', label: 'Manifestation', color: '#B39BE0' },
            { id: 'rant',          label: 'Rant',          color: '#D68097' },
          ] as Array<{ id: AISourceKey; label: string; color: string }>).map(s => {
            const on = sources[s.id];
            const count = counts[s.id];
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.85}
                onPress={() => toggleSource(s.id)}
                accessibilityRole="switch"
                accessibilityLabel={`${s.label}, ${count} ${count === 1 ? 'entry' : 'entries'}`}
                accessibilityState={{ checked: on }}
                style={[
                  styles.aiSourceChip,
                  on
                    ? { borderColor: s.color, backgroundColor: s.color + '22' }
                    : { borderColor: 'rgba(255,255,255,0.15)' },
                  count === 0 && { opacity: 0.4 },
                ]}
              >
                <Text style={[
                  styles.aiSourceText,
                  on ? { color: s.color } : { color: '#ffffff77' },
                ]}>
                  {on ? '✓ ' : ''}{s.label} · {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>WHAT TO ANALYSE</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => runAnalysis('journal')}
          style={[
            styles.aiBtn,
            { backgroundColor: '#8FB8DE' },
            (loading || !canRunJournal) && { opacity: 0.4 },
          ]}
          disabled={loading || !canRunJournal}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || !canRunJournal }}
        >
          <Text style={styles.aiBtnText}>JOURNAL THEMES</Text>
        </TouchableOpacity>
        {!canRunJournal ? (
          <Text style={styles.notifHint}>
            Turn on at least one source with entries to run this.
          </Text>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => runAnalysis('tarot')}
          style={[styles.aiBtn, styles.aiBtnGhost, (loading || !hasTarot) && { opacity: 0.4 }]}
          disabled={loading || !hasTarot}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || !hasTarot }}
        >
          <Text style={[styles.aiBtnText, styles.aiBtnGhostText]}>INTERPRET TODAY'S TAROT</Text>
        </TouchableOpacity>
        {!hasTarot ? (
          <Text style={styles.notifHint}>Draw a card in Stars first.</Text>
        ) : null}
        </GlowCard>

        {errorMsg ? <Text style={styles.notifWarn}>{errorMsg}</Text> : null}

        {(loading || reflection) ? (
          <View style={styles.dreamPage}>
            <LinearGradient
              colors={['#d9b35c14', 'transparent']}
              style={styles.dreamGlow}
              pointerEvents="none"
            />
            <Text style={styles.dreamDate}>
              {loading || !reflection
                ? today
                : new Date(reflection.ts).toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
            </Text>
            <View style={styles.dreamRule} />
            {loading ? (
              <ActivityIndicator color="#B39BE0" style={{ marginTop: 16 }} />
            ) : reflection ? (
              <Text style={styles.dreamBody}>{reflection.text}</Text>
            ) : null}
            {!loading && reflection ? (
              <Text style={styles.dreamSig}>
                · {reflection.kind === 'tarot' ? 'tarot' : 'reflection'}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.aiFootnote}>
          Powered by Google Gemini with your own key. Journal analysis sends only the sources
          shown as enabled. Tarot interpretation sends the drawn card name, orientation,
          matching meaning, and description. Nothing is sent until you tap a button. {Platform.OS === 'web'
            ? 'Your key is kept only for this browser session.'
            : 'Your key is protected by this device\'s secure storage.'}
        </Text>
      </StickySubpageScroll>

      <Modal
        visible={confirmOpenLink}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpenLink(false)}
      >
        <View style={styles.linkConfirmBackdrop}>
          <View style={styles.linkConfirmCard}>
            <Text style={styles.linkConfirmTitle}>Open in browser?</Text>
            <Text style={styles.linkConfirmUrl}>{GEMINI_KEY_URL}</Text>
            <Text style={styles.linkConfirmHint}>
              You'll leave the app to create or view a Gemini API key from Google.
            </Text>
            <View style={styles.linkConfirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setConfirmOpenLink(false)}
                style={styles.linkConfirmCancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.linkConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setConfirmOpenLink(false);
                  Linking.openURL(GEMINI_KEY_URL).catch(() => {});
                }}
                style={styles.linkConfirmOpenBtn}
                accessibilityRole="link"
                accessibilityLabel="Open Google AI Studio in browser"
              >
                <Text style={styles.linkConfirmOpenText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Styles
// ===========================================================================

const styles = StyleSheet.create({
  headerWrap: {
    position: 'relative', overflow: 'hidden', zIndex: 30, elevation: 18,
    paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16,
    backgroundColor: 'rgba(8,9,25,0.07)',
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerWrapAndroid: {
    overflow: 'visible',
    zIndex: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  hubBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ambience: {
    color: '#F8F5FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, letterSpacing: 1.2,
    lineHeight: 26,
  },
  title: {
    color: '#B9B7CA', fontSize: 8.5, fontWeight: '700',
    letterSpacing: 2.3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  hubHeadline: {
    color: '#FFFFFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 39, lineHeight: 38, letterSpacing: -0.4,
    marginTop: 20,
  },
  hubIntro: {
    color: '#A6A6B9', fontSize: 12.5, lineHeight: 18,
    marginTop: 8, maxWidth: 300,
  },

  // Hub
  hubScrollContent: { paddingBottom: 130 },
  hubScrollBody: { paddingHorizontal: 20 },
  hubHeroCard: { padding: 18, minHeight: 250 },
  hubHeroTopline: { flexDirection: 'row', alignItems: 'center' },
  hubLiveDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 8,
    backgroundColor: '#9DC7AC',
    shadowColor: '#9DC7AC', shadowOpacity: 0.8, shadowRadius: 6,
  },
  hubHeroGreeting: { color: '#C3C1D0', fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  hubHeroMain: { flexDirection: 'row', alignItems: 'center', marginTop: 17 },
  hubHeroTitle: {
    color: '#FBF9FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 29, lineHeight: 32, letterSpacing: 0.2,
  },
  hubHeroCopy: { color: '#ADACBE', fontSize: 11.5, lineHeight: 17, marginTop: 5, paddingRight: 10 },
  hubMoodOrb: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(143,184,222,0.35)',
    backgroundColor: 'rgba(143,184,222,0.10)',
  },
  hubHeroAction: {
    minHeight: 46, borderRadius: 16, backgroundColor: '#AEB5F0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 15, marginTop: 18,
    shadowColor: '#8F97DE', shadowOpacity: 0.25, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  hubHeroActionText: { color: '#0B0B1F', fontSize: 12.5, fontWeight: '700' },
  hubPrivacyStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  hubPrivacyText: { color: '#7F8095', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4 },
  hubPrivacyDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: '#77798F', marginHorizontal: 9 },
  tileGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
  },
  tile: {
    position: 'relative', overflow: 'hidden',
    backgroundColor: '#17182E',
    borderWidth: 1, borderRadius: 22,
    padding: 14, marginBottom: 10,
    shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  tileDisabled: { borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  tileHalf: { width: '48.5%', minHeight: 150, alignItems: 'flex-start' },
  tileWide: {
    width: '100%', minHeight: 92,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 15,
  },
  tileFeature: {
    width: '100%', minHeight: 138,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 18, paddingHorizontal: 17,
  },
  tileWallpaper: {
    position: 'absolute', opacity: 0.14,
    alignItems: 'center', justifyContent: 'center',
  },
  tileWallpaperHalf: {
    width: 108, height: 108, right: -13, top: 8,
    transform: [{ rotate: '-10deg' }],
  },
  tileWallpaperWide: {
    width: 118, height: 118, right: 35, top: -13,
    transform: [{ rotate: '8deg' }],
  },
  tileWallpaperFeature: {
    width: 148, height: 148, right: 30, top: -5,
    transform: [{ rotate: '-7deg' }],
  },
  tileWallpaperGlyph: {
    fontSize: 84, lineHeight: 94, fontFamily: 'CormorantGaramond_500Medium',
  },
  tileWallpaperGlyphFeature: { fontSize: 112, lineHeight: 122 },
  tileCopy: { position: 'relative', zIndex: 1 },
  tileCopyHalf: { marginTop: 'auto', paddingTop: 54, paddingRight: 2 },
  tileCopyHorizontal: { marginTop: 0, paddingRight: 82 },
  tileKicker: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  tileLabel: { color: '#FAF8FF', fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  tileLabelFeature: {
    fontFamily: 'CormorantGaramond_500Medium', fontSize: 24, lineHeight: 27, fontWeight: '500',
  },
  tileSub: {
    color: '#9797AA', fontSize: 10.5, lineHeight: 15,
    marginTop: 4,
  },
  tileSubLeft: { fontSize: 11.5, lineHeight: 17, maxWidth: 250 },
  tileBadgeWrap: {
    position: 'absolute', top: 10, right: 10, zIndex: 3,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: 'rgba(11,11,31,0.78)',
  },
  tileBadge: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  tileArrow: {
    width: 31, height: 31, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginLeft: 5,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  pulseRow: {
    flexDirection: 'row', gap: 8,
    marginTop: 14, paddingTop: 13,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  pulseChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 12, paddingVertical: 7,
  },
  pulseNum: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pulseCap: { color: '#85869A', fontSize: 7, letterSpacing: 1.1, fontWeight: '700', marginTop: 2 },


  // Sub-page
  subHeaderCompact: {
    position: 'relative', overflow: 'hidden', zIndex: 30, elevation: 18,
    minHeight: 44, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: 'rgba(8,9,25,0.07)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  subBackBtnCompact: {
    width: 34, height: 34, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  subCompactCopy: { flex: 1, paddingHorizontal: 10 },
  subCompactMode: { fontSize: 7, fontWeight: '800', letterSpacing: 1.4 },
  subCompactTitle: {
    color: '#F8F6FC', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, lineHeight: 20, marginTop: -1,
  },
  subHeader: {
    position: 'relative', overflow: 'hidden', zIndex: 30, elevation: 18,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10,
    backgroundColor: 'rgba(8,9,25,0.07)',
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  subNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subBrand: { color: '#77788D', fontSize: 8.5, fontWeight: '800', letterSpacing: 2.2 },
  subNavDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.9 },
  subPinBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  subHeroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 17, minHeight: 108 },
  subHeroCopy: { flex: 1, paddingRight: 12 },
  subModeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  subModeLine: { width: 18, height: 2, borderRadius: 1, marginRight: 8 },
  subMode: { fontSize: 9, fontWeight: '800', letterSpacing: 2.1 },
  subHeaderSubtitle: { color: '#9B9CAF', fontSize: 11.5, lineHeight: 17, marginTop: 5, maxWidth: 255 },
  subGlyphOrbit: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 1, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  subGlyphInner: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  subGlyphBreathingRing: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 1,
  },
  subGlyph: { fontSize: 26, transform: [{ rotate: '8deg' }] },
  subBackBtn: {
    width: 38, height: 38, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  subTitle: {
    color: '#FCFAFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 34, lineHeight: 35,
    letterSpacing: 0.1,
  },
  subShell: { flex: 1 },
  subScrollContent: { flexGrow: 1 },
  subBody: { paddingHorizontal: 20, paddingTop: 6, flexGrow: 1 },
  pageClosing: {
    marginTop: 'auto', paddingTop: 30, paddingBottom: 4,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
  },
  pageClosingLine: { width: 28, height: 1 },
  pageClosingGlyph: { fontSize: 15, marginHorizontal: 10 },
  pageClosingLabel: {
    width: '100%', color: '#6F7083', fontSize: 7.5, fontWeight: '800',
    letterSpacing: 1.5, textAlign: 'center', marginTop: 7,
  },

  // Section rhythm: every section starts with this label; the baked-in
  // margins keep spacing consistent without inline overrides.
  sectionLabel: {
    color: '#9293A8', fontSize: 9, letterSpacing: 2.3, fontWeight: '800',
    marginTop: 28, marginBottom: 9,
  },
  sectionSub: {
    color: '#B8B7C5', fontSize: 12.5,
    marginBottom: 12, lineHeight: 19,
  },
  emptyText: { color: '#ffffff77', fontSize: 12, lineHeight: 18, marginTop: 4 },

  safetyBody: {
    color: '#C5C4D1',
    fontSize: 12.5,
    lineHeight: 19,
    marginBottom: 4,
  },
  safetyHero: {
    padding: 18, marginTop: 8,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  safetyShieldWrap: {
    width: 54, height: 54, borderRadius: 18, marginRight: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#9DC7AC55', backgroundColor: '#9DC7AC12',
  },
  safetyHeroKicker: { color: '#9DC7AC', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  safetyHeroTitle: {
    color: '#F7F5FC', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, lineHeight: 23, marginTop: 5,
  },
  safetyHeroCopy: { color: '#9697AA', fontSize: 10.5, lineHeight: 15, marginTop: 5 },
  safetyPanelStack: { marginTop: 16, gap: 11 },
  safetyPanel: { padding: 17 },
  safetyPanelHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  safetyPanelNumber: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginRight: 10 },
  safetyPanelTitle: {
    color: '#F7F5FC', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, lineHeight: 23,
  },
  safetyMiniHeading: { color: '#E0A470', fontSize: 8, fontWeight: '800', letterSpacing: 1.4, marginTop: 14, marginBottom: 5 },
  safetyClosing: {
    color: '#A3A4B5', fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 17, textAlign: 'center', lineHeight: 23, marginVertical: 10,
  },
  wipeBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E07A66',
    backgroundColor: 'rgba(255,91,91,0.10)',
    alignItems: 'center',
  },
  wipeBtnText: {
    color: '#E07A66',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  // Affirmations
  affirmTalisman: {
    minHeight: 310, paddingHorizontal: 24, paddingVertical: 22,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  affirmSunOuter: {
    position: 'absolute', top: 36,
    width: 190, height: 190, borderRadius: 95,
    borderWidth: 1, borderColor: 'rgba(157,199,172,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  affirmSunInner: {
    width: 126, height: 126, borderRadius: 63,
    borderWidth: 1, borderColor: 'rgba(157,199,172,0.25)',
    backgroundColor: 'rgba(157,199,172,0.045)',
  },
  affirmDate: { color: '#9DC7AC', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.8 },
  affirmRule: { width: 28, height: 1, backgroundColor: '#9DC7AC66', marginVertical: 17 },
  affirmCarry: { color: '#838598', fontSize: 10.5, marginTop: 13, fontStyle: 'italic' },
  bigAffirmCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', minHeight: 160,
    justifyContent: 'center',
  },
  bigAffirmText: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 25, lineHeight: 34,
    textAlign: 'center',
  },
  bigRefreshBtn: {
    marginTop: 18,
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#9DC7AC',
  },
  bigRefreshText: { color: '#0B0B1F', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  notifPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notifPill: {
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  notifPillText: { color: '#ffffff99', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  notifHint: { color: '#ffffff77', fontSize: 12, marginTop: 8, lineHeight: 18 },
  notifWarn: { color: '#E0A470', fontSize: 12, marginTop: 8, lineHeight: 18 },
  customReminderCard: {
    marginTop: 12, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 15,
  },
  customReminderHeading: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  customReminderKicker: { color: '#E0A470', fontSize: 8, fontWeight: '800', letterSpacing: 1.7 },
  customReminderTitle: {
    color: '#F8F5FC', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, lineHeight: 23, marginTop: 2,
  },
  customReminderClose: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8,
  },
  customReminderTimeRow: {
    flexDirection: 'row', alignItems: 'flex-end', marginTop: 14,
  },
  customReminderFieldWrap: { width: 64 },
  customReminderFieldLabel: {
    color: '#858597', fontSize: 7, fontWeight: '800', letterSpacing: 1.3,
    textAlign: 'center', marginBottom: 4,
  },
  customReminderField: {
    height: 52, borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(224,164,112,0.34)', backgroundColor: 'rgba(8,9,25,0.36)',
    color: '#FFF9F3', fontSize: 22, fontWeight: '600', textAlign: 'center',
    paddingHorizontal: 8, paddingVertical: 8,
    position: 'relative', zIndex: 4, elevation: 2, opacity: 1,
  },
  customReminderColon: {
    color: '#E0A470', fontSize: 24, lineHeight: 50, marginHorizontal: 5,
  },
  customReminderMeridiem: {
    flex: 1, minWidth: 100, height: 52, marginLeft: 10,
    flexDirection: 'row', borderWidth: 1, borderRadius: 16,
    borderColor: 'rgba(255,255,255,0.13)', overflow: 'hidden',
  },
  customReminderMeridiemBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  customReminderMeridiemBtnActive: { backgroundColor: 'rgba(224,164,112,0.20)' },
  customReminderMeridiemText: { color: '#858597', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  customReminderMeridiemTextActive: { color: '#E0A470' },
  customReminderSave: {
    minHeight: 48, marginTop: 14, borderRadius: 999,
    backgroundColor: '#E0A470', alignItems: 'center', justifyContent: 'center',
  },
  customReminderSaveText: { color: '#111225', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },

  // Mood
  moodHeroHeading: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  moodHeroCopy: { flex: 1, paddingRight: 8 },
  moodHeroAside: { alignItems: 'center', marginLeft: 6 },
  moodHeroFaceOrb: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  moodHeroKicker: { color: '#8FB8DE', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.8 },
  moodHeroPrompt: {
    color: '#F8F6FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 22, lineHeight: 25, marginTop: 4,
  },
  moodHeroStatus: {
    color: '#85869A', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, marginTop: 5,
  },
  moodRow: { flexDirection: 'row', gap: 7, position: 'relative', paddingTop: 4 },
  moodBtn: {
    flex: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 24, borderWidth: 1,
    position: 'relative', overflow: 'visible',
  },
  moodActiveHalo: {
    position: 'absolute', left: -4, right: -4, top: -4, bottom: -4,
    borderRadius: 28, borderWidth: 1,
  },
  moodValue: { fontSize: 19, fontWeight: '700' },
  moodLabel: { fontSize: 7.5, letterSpacing: 0.2, fontWeight: '700', marginTop: 3 },

  graphCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
  },
  settingLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  settingRowChevron: { color: '#ffffff66', fontSize: 20, fontWeight: '300', marginTop: -2 },
  settingToggle: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingToggleText: { color: '#ffffff99', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  swatchRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  swatch: {
    width: 44, height: 44, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  swatchCheck: { color: '#d9b35c', fontSize: 14, fontWeight: '700' },
  customColorPicker: {
    marginTop: 15, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11,
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  customColorHeading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  customColorKicker: { color: '#D9BE7A', fontSize: 8, fontWeight: '800', letterSpacing: 1.6 },
  customColorName: { color: '#F5F2FA', fontSize: 14, fontWeight: '600', marginTop: 3 },
  customColorSample: { width: 34, height: 34, borderRadius: 12, borderWidth: 1.5 },
  customHueControl: { height: 46, marginTop: 9, justifyContent: 'center' },
  customHueGradient: {
    position: 'absolute', left: 7, right: 7, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  customHueSlider: { width: '100%', height: 46 },
  customColorHint: { color: '#7F8092', fontSize: 10, lineHeight: 14, marginTop: -2 },
  settingsPreview: { minHeight: 190, marginTop: 8, padding: 18, justifyContent: 'flex-end' },
  settingsPreviewCopy: { maxWidth: 220 },
  settingsPreviewKicker: { color: '#E9D9A6', fontSize: 8, fontWeight: '800', letterSpacing: 1.8 },
  settingsPreviewTitle: {
    color: '#FFF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 28, lineHeight: 30, marginTop: 4,
  },
  settingsPreviewHint: { color: '#D4D2DE', fontSize: 10.5, marginTop: 4 },
  settingsPreviewStatus: {
    position: 'absolute', right: 15, bottom: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(8,9,25,0.28)',
  },
  settingsPreviewStatusText: { color: '#FFF', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },

  calCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18, paddingVertical: 12, paddingHorizontal: 10,
    marginTop: 2,
  },
  calHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 6, marginBottom: 8,
  },
  calNavBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  calTitle: { color: '#ffffffdd', fontSize: 13, fontWeight: '600', letterSpacing: 0.6 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calWeekday: {
    width: '14.28%', textAlign: 'center',
    color: '#ffffff55', fontSize: 9, fontWeight: '700', letterSpacing: 1,
    marginBottom: 4,
  },
  calCell: {
    width: '14.28%', height: 38,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  calCellSelected: { backgroundColor: '#8FB8DE22', borderWidth: 1, borderColor: '#8FB8DE' },
  calDay: { color: '#ffffffcc', fontSize: 12, fontVariant: ['tabular-nums'] },
  calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  graphLabelRow: {
    position: 'absolute', bottom: 6, left: 18, right: 18,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  graphLabelText: { color: '#ffffff66', fontSize: 9, letterSpacing: 1 },

  backfillCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  backfillHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  backfillTitle: { color: '#8FB8DE', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },

  moodHistoryRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  moodHistoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  moodHistoryDate: { flex: 1, color: '#ffffffaa', fontSize: 12 },
  moodHistoryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Gratitude
  journalSheet: { marginTop: 10, paddingTop: 16 },
  journalSheetHeading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, position: 'relative', zIndex: 3,
  },
  journalSheetKicker: { color: '#E0A470', fontSize: 8, fontWeight: '800', letterSpacing: 1.7 },
  journalSheetDate: {
    color: '#F2E9DB', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, marginTop: 2,
  },
  journalFlower: { color: '#E0A470', fontSize: 28, opacity: 0.7 },
  journalRule: {
    height: 1, marginHorizontal: 18, marginTop: 12,
    backgroundColor: '#E0A47038', position: 'relative', zIndex: 3,
  },
  // The card itself has a directional accent gradient. The writing plane is
  // deliberately uniform and stacked above every decorative layer so typed
  // text never inherits a left-to-right contrast shift.
  journalEditor: {
    position: 'relative', zIndex: 4, elevation: 1,
    marginHorizontal: 12, marginTop: 12, marginBottom: 14,
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(224,164,112,0.20)',
    backgroundColor: '#111225', overflow: 'hidden',
  },
  journalInput: {
    width: '100%', minHeight: 150,
    color: '#FFFDF8', backgroundColor: '#111225', opacity: 1,
    fontFamily: 'CormorantGaramond_500Medium', fontSize: 18, lineHeight: 27,
    position: 'relative', zIndex: 5,
  },
  gratitudeSlip: {
    borderColor: 'rgba(224,164,112,0.24)',
    backgroundColor: 'rgba(224,164,112,0.065)',
    paddingVertical: 15, paddingHorizontal: 14,
  },
  gratitudeQuote: {
    color: '#E0A47088', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25, lineHeight: 24, marginRight: 7,
  },
  gratInput: {
    color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    minHeight: 90, textAlignVertical: 'top',
  },
  gratSaveBtn: {
    alignSelf: 'flex-end', marginTop: 10,
    paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 999, backgroundColor: '#E0A470',
  },
  gratSaveText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  gratDateHeader: {
    color: '#ffffff88', fontSize: 11, letterSpacing: 1.5, fontWeight: '700',
    marginBottom: 8,
  },
  gratItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  gratItemText: { color: '#ffffffdd', fontSize: 14, lineHeight: 20, flex: 1 },
  gratDelBtn: { paddingHorizontal: 6, paddingVertical: 2 },

  rantDate: { color: '#ffffff77', fontSize: 10, letterSpacing: 1.5, fontWeight: '700', marginBottom: 4 },
  rantLetGoBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 },
  rantInput: {
    color: '#fff', fontSize: 14.5, lineHeight: 22,
    minHeight: 150, textAlignVertical: 'top',
    paddingHorizontal: 16, paddingVertical: 14,
    // GlowCard's gradients and auras are decorative. Keep every live editor
    // in a shared foreground plane so text never fades beneath them.
    position: 'relative', zIndex: 4, elevation: 2, opacity: 1,
  },
  releaseSheet: { marginTop: 8, minHeight: 260, paddingTop: 16 },
  releaseSheetTop: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
  },
  releaseCloudMark: { flexDirection: 'row', alignItems: 'center', marginRight: 9 },
  releaseCloudDot: { height: 5, borderRadius: 3, backgroundColor: '#D68097' },
  releaseSheetMeta: { color: '#D68097', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  releaseCount: { marginLeft: 'auto', color: '#77788E', fontSize: 7.5, fontWeight: '700', letterSpacing: 1 },
  releaseRule: { height: 1, marginHorizontal: 16, marginTop: 13, backgroundColor: '#D6809733' },
  releaseInput: {
    minHeight: 200, fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, lineHeight: 28, paddingTop: 18,
    // GlowCard's atmospheric layers are absolutely positioned. Lift the live
    // editor above them so typed text, selection, and the caret never inherit
    // the decorative left-to-right fade.
    position: 'relative', zIndex: 4,
    color: '#F4EDF2', backgroundColor: 'transparent', opacity: 1,
  },
  releasePromptLabel: { color: '#8B8C9F', fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginTop: 15 },
  releasePrivacyBar: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(214,128,151,0.18)',
    backgroundColor: 'rgba(214,128,151,0.055)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
  },
  releasePrivacyText: { flex: 1, color: '#9293A6', fontSize: 10.5, lineHeight: 15, marginLeft: 8 },
  releaseNote: {
    position: 'relative', overflow: 'hidden',
    borderColor: 'rgba(214,128,151,0.22)',
    backgroundColor: 'rgba(214,128,151,0.055)',
    paddingVertical: 14, paddingHorizontal: 14,
  },
  releaseNoteFold: {
    position: 'absolute', right: -12, top: -12, width: 30, height: 30,
    backgroundColor: 'rgba(214,128,151,0.18)', transform: [{ rotate: '45deg' }],
  },
  rantChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  rantActionsRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: 10, marginTop: 16,
  },
  rantLetGoText: { color: '#ffffff88', fontSize: 12, letterSpacing: 1 },

  manifestCheck: { paddingRight: 12, paddingTop: 1 },
  manifestComposerTop: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16,
  },
  manifestSeed: {
    width: 44, height: 44, borderRadius: 22, marginRight: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#B39BE066', backgroundColor: '#B39BE014',
  },
  manifestSeedGlyph: { color: '#B39BE0', fontSize: 22 },
  manifestComposerKicker: { color: '#B39BE0', fontSize: 8, fontWeight: '800', letterSpacing: 1.6 },
  manifestComposerHint: { color: '#8F90A4', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  manifestOrbitItem: {
    position: 'relative', overflow: 'hidden',
    borderColor: 'rgba(179,155,224,0.24)', paddingLeft: 16,
  },
  manifestArrived: { borderColor: 'rgba(217,190,122,0.34)', backgroundColor: 'rgba(217,190,122,0.07)' },
  manifestOrbitLine: {
    position: 'absolute', left: 0, top: 8, bottom: 8, width: 2,
    borderRadius: 1, backgroundColor: '#B39BE055',
  },
  manifestCheckBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#B39BE099',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  manifestCheckMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 14 },

  // Grounding (one step at a time inside a GlowCard)
  groundBigNum: { fontSize: 36, fontWeight: '300', width: 60, textAlign: 'center' },
  groundEm: { color: '#fff', fontWeight: '700' },
  groundOutro: {
    color: '#ffffff88', fontSize: 12, lineHeight: 18,
    textAlign: 'center', marginTop: 14,
  },
  groundStepCard: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20 },
  groundCompass: {
    position: 'absolute', top: 16, alignSelf: 'center',
    width: 230, height: 230, alignItems: 'center', justifyContent: 'center', opacity: 0.9,
  },
  groundRing: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
  groundRingOuter: { width: 220, height: 220 },
  groundRingMiddle: { width: 164, height: 164 },
  groundRingInner: { width: 108, height: 108 },
  groundStepLabel: {
    color: '#ffffff66', fontSize: 10, letterSpacing: 2, fontWeight: '700',
    marginBottom: 8,
  },
  groundStepNum: { fontSize: 52, width: undefined },
  groundStepText: { color: '#ffffffcc', fontSize: 16, marginTop: 2 },
  groundGuide: {
    color: '#ffffffB0', fontSize: 13.5, lineHeight: 20,
    textAlign: 'center', marginTop: 10,
  },
  groundDotsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16,
  },
  groundDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  // Support (the hero surface itself is a GlowCard now)
  supportEmoji: { fontSize: 44, marginBottom: 8 },
  supportSeal: {
    width: 58, height: 58, borderRadius: 29, marginBottom: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#D9BE7A66', backgroundColor: '#D9BE7A12',
  },
  supportKicker: { color: '#D9BE7A', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.8, marginBottom: 7 },
  supportHeadline: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 26, letterSpacing: 0.5,
    marginBottom: 10,
  },
  supportText: {
    color: '#ffffffcc', fontSize: 13, lineHeight: 19,
    textAlign: 'center', marginBottom: 18,
  },
  supportBtn: {
    paddingVertical: 14, paddingHorizontal: 30,
    borderRadius: 999, backgroundColor: '#d9b35c',
  },
  supportBtnText: { color: '#0B0B1F', fontWeight: '800', letterSpacing: 0.3, fontSize: 13 },
  supportFootnote: {
    color: '#ffffff77', fontSize: 12,
    textAlign: 'center', marginTop: 16, lineHeight: 18,
  },
  roadmapItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  roadmapDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#d9b35c',
    marginTop: 7, marginRight: 12,
  },
  roadmapTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  roadmapBlurb: { color: '#ffffffaa', fontSize: 12, marginTop: 2, lineHeight: 17 },
  roadmapGroup: {
    marginTop: 14, paddingHorizontal: 15, paddingBottom: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(217,179,92,0.15)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  roadmapGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roadmapGroupCount: {
    color: '#D9BE7A', fontSize: 9, fontWeight: '800',
    borderWidth: 1, borderColor: '#D9BE7A44', borderRadius: 999,
    minWidth: 24, textAlign: 'center', paddingVertical: 3,
  },

  // Routines
  routinePressableDisabled: { opacity: 0.58 },
  routineCard: {
    padding: 17, marginBottom: 12, minHeight: 190,
  },
  routineBackdropSigil: {
    position: 'absolute', right: -18, top: -26,
    opacity: 0.3, transform: [{ rotate: '6deg' }],
  },
  routineEyebrow: { fontSize: 8, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 },
  routineTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  routineName: {
    fontFamily: 'CormorantGaramond_500Medium', fontSize: 24, lineHeight: 27,
    fontWeight: '500', letterSpacing: 0.1,
  },
  // Small caps microlabel, same pill idiom as soundscapeSoon.
  routineTotal: {
    color: '#ffffff66', fontSize: 9, letterSpacing: 1.5, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 999,
  },
  routineDesc: { color: '#ffffffaa', fontSize: 12, marginTop: 4, lineHeight: 17, marginBottom: 10 },
  routinePath: { position: 'relative', marginTop: 3 },
  routinePathLine: { position: 'absolute', left: 15, top: 23, bottom: 23, width: 1 },
  routineStep: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  routineStepNode: {
    width: 31, height: 31, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 11,
  },
  routineStepNum: {
    fontSize: 11, fontWeight: '800', textAlign: 'center',
  },
  routineStepLabel: { flex: 1, color: '#ffffffdd', fontSize: 13 },
  routineStepTime: { color: '#ffffff88', fontSize: 12 },
  routineActionRow: {
    borderTopWidth: 1, marginTop: 9, paddingTop: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  routineStatusWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  routineStatusDot: { width: 6, height: 6, borderRadius: 3 },
  routineStatusText: {
    flexShrink: 1, color: '#ffffff77', fontSize: 8, fontWeight: '800', letterSpacing: 1.35,
  },
  routineAction: {
    minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  routineActionText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  // Soundscapes
  soundscapeControlCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    marginBottom: 12,
  },
  soundscapeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  soundscapeHeroActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  soundscapeHeroTransport: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  soundscapeHero: { padding: 16, paddingTop: 104, marginBottom: 12, minHeight: 210 },
  soundscapeScene: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    overflow: 'hidden',
  },
  soundscapePattern: { ...StyleSheet.absoluteFillObject, opacity: 0.48 },
  soundscapeSceneIcon: {
    position: 'absolute', width: 50, height: 50, borderRadius: 25,
    right: 22, top: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  soundscapeActiveLabel: {
    color: '#ffffff80',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  soundscapeActiveName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  soundscapeActiveMeta: { color: '#ffffff88', fontSize: 12, marginTop: 2 },
  soundscapeVolLabel: {
    color: '#ffffff80',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  soundscapeCard: {
    width: '48.5%', minHeight: 146,
    backgroundColor: '#17182E', overflow: 'hidden',
    borderRadius: 20, padding: 13, marginBottom: 10,
    borderWidth: 1,
  },
  soundscapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  soundscapeTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  soundscapeTileCopy: { marginTop: 14 },
  soundscapeGlyphBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  soundscapeName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  soundscapeBlurb: { color: '#9293A6', fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  soundscapeSoon: {
    color: '#ffffff66', fontSize: 9, letterSpacing: 1.5, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 999,
  },

  // Bug: borderless inputs that live inside one GlowCard. The subject is a
  // single-line variant of the rantInput idiom; a hairline keeps them apart.
  feedbackStampRow: { flexDirection: 'row', gap: 9 },
  feedbackStamp: {
    flex: 1, minHeight: 70, borderRadius: 16, borderWidth: 1,
    borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center',
  },
  feedbackStampMark: {
    color: '#7F8092', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 22, lineHeight: 23,
  },
  feedbackStampText: { color: '#9B9CAF', fontSize: 9.5, fontWeight: '700', marginTop: 3 },
  feedbackPostcard: { marginTop: 10, paddingTop: 13 },
  feedbackPostcardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  feedbackPostcardFrom: { color: '#D68097', fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  feedbackPostmark: {
    width: 32, height: 38, borderWidth: 1, borderColor: '#D6809766',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '4deg' }], backgroundColor: '#D6809712',
  },
  feedbackPostmarkText: { color: '#D68097', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  bugSubjectInput: {
    color: '#fff', fontSize: 14.5,
    paddingHorizontal: 16, paddingVertical: 14,
    position: 'relative', zIndex: 4, elevation: 2, opacity: 1,
  },
  bugInputDivider: {
    height: 1, marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bugSendBtn: {
    paddingVertical: 15, borderRadius: 17, marginTop: 16,
    backgroundColor: '#D68097', alignItems: 'center',
    shadowColor: '#D68097', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  bugSendText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 0.2, fontSize: 14 },
  bugAppInfoPreview: { color: '#ffffff77', fontSize: 11, marginTop: 3 },
  bugAppInfoHint: { color: '#ffffff66', fontSize: 11, lineHeight: 16, marginTop: 8 },

  privacyCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  privacyCheck: { color: '#9DC7AC', fontSize: 12, fontWeight: '700', marginRight: 10, marginTop: 1 },
  privacyText: { color: '#ffffffB0', fontSize: 12, lineHeight: 17, flex: 1 },

  fieldLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 1, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  fieldInput: {
    color: '#fff', fontSize: 14,
    backgroundColor: 'rgba(7,8,23,0.34)',
    borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
    position: 'relative', zIndex: 4, elevation: 2, opacity: 1,
  },
  identityAtlas: {
    minHeight: 150, marginTop: 8, padding: 18,
    flexDirection: 'row', alignItems: 'center',
  },
  identityCrest: {
    width: 88, height: 88, borderRadius: 44, overflow: 'hidden',
    borderWidth: 1, borderColor: '#B39BE055',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  identityInitial: {
    color: '#F7F3FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 42, lineHeight: 48,
  },
  identityCopy: { flex: 1 },
  identityKicker: { color: '#B39BE0', fontSize: 8, fontWeight: '800', letterSpacing: 1.6 },
  identityName: {
    color: '#FAF8FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 23, lineHeight: 26, marginTop: 4,
  },
  identityTokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  identityToken: {
    color: '#999AAD', fontSize: 7.5, fontWeight: '800', letterSpacing: 1,
    borderWidth: 1, borderColor: 'rgba(179,155,224,0.28)',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
  },
  profileCoordinates: { padding: 16 },
  profileFieldRow: { flexDirection: 'row', gap: 10 },
  profilePrivacyLine: {
    color: '#77788D', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.3,
    textAlign: 'center', marginTop: 14,
  },

  // MBTI
  mbtiCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  mbtiQuestion: { color: '#fff', fontSize: 14, marginBottom: 10, fontWeight: '500' },
  mbtiOption: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  mbtiOptionText: { color: '#ffffffcc', fontSize: 13 },
  // Kept quiet on purpose: the temperament group carries the emphasis.
  mbtiResultType: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24, letterSpacing: 3, fontWeight: '600',
  },
  mbtiResultGroup: { color: '#B39BE0', fontSize: 14, marginTop: 4, fontWeight: '700', letterSpacing: 1 },
  mbtiResultBlurb: { color: '#ffffffcc', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Compatibility
  compatOrbitCard: { padding: 18, alignItems: 'center', marginTop: 8 },
  compatOrbitKicker: { color: '#D8A0B0', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.7 },
  compatOrbitRow: { width: 250, height: 150, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  compatOrbit: {
    position: 'absolute', width: 112, height: 112, borderRadius: 56,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20,21,42,0.78)',
  },
  compatOrbitSelf: { left: 26 },
  compatOrbitPartner: { right: 26 },
  compatOrbitGlyph: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 30, lineHeight: 33 },
  compatOrbitName: { color: '#DAD8E4', fontSize: 10.5, fontWeight: '600', marginTop: 3, maxWidth: 80 },
  compatOrbitJoin: {
    width: 42, height: 42, borderRadius: 21, zIndex: 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#D8A0B066', backgroundColor: '#191A31',
  },
  compatOrbitJoinText: { color: '#D8A0B0', fontSize: 18 },
  compatOrbitHint: { color: '#999AAD', fontSize: 10.5, lineHeight: 15, textAlign: 'center', maxWidth: 270 },
  compatCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  compatName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  compatMeta: { color: '#ffffffaa', fontSize: 12, marginTop: 2 },
  compatMbti: {
    color: '#B39BE0', fontSize: 13, fontWeight: '700', letterSpacing: 2,
    marginTop: 6,
  },

  // Sun-sign payoff card (Profile, Natal Chart) and the element pairing
  // result (Compatibility).
  sunSignCard: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  sunSignGlyph: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 42, marginRight: 16 },
  sunSignIntention: {
    color: '#ffffffcc', fontSize: 12, fontStyle: 'italic',
    marginTop: 6, lineHeight: 17,
  },
  sunSignCaption: { color: '#ffffff66', fontSize: 11, marginTop: 8, lineHeight: 15 },
  natalWheelCard: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 16, marginTop: 8 },
  natalWheelKicker: { color: '#B39BE0', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.8 },
  natalWheelWrap: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  natalWheelCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  natalWheelGlyph: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 42, lineHeight: 46 },
  natalWheelSign: {
    color: '#FAF8FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18, lineHeight: 20,
  },
  natalWheelMeta: { color: '#8B8C9F', fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  natalWheelCaption: { color: '#9293A6', fontSize: 10.5, lineHeight: 15, textAlign: 'center', maxWidth: 280 },
  compatSignsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    marginBottom: 12,
  },
  compatSignCol: { alignItems: 'center', flex: 1 },
  compatPairGlyph: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 36 },
  compatPairJoin: { color: '#ffffff55', fontSize: 18, paddingHorizontal: 6 },
  compatReflection: { color: '#ffffffcc', fontSize: 13, lineHeight: 20 },
  compatComingSoon: {
    marginTop: 24, padding: 16,
    borderRadius: 18, borderStyle: 'dashed',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  compatComingTitle: { color: '#D8A0B0', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  compatComingText: { color: '#ffffffaa', fontSize: 12, lineHeight: 17 },

  // AI Insights
  aiIngredientsTray: { padding: 16, marginTop: 18 },
  aiIngredientsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiIngredientsKicker: { color: '#8FB8DE', fontSize: 8, fontWeight: '800', letterSpacing: 1.6 },
  aiIngredientsTitle: {
    color: '#F5F3FB', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, lineHeight: 22, marginTop: 3,
  },
  aiIngredientsGlyph: { color: '#8FB8DE', fontSize: 30, opacity: 0.75 },
  aiBtn: {
    paddingVertical: 13, borderRadius: 999, marginTop: 10, alignItems: 'center',
  },
  aiBtnText: { color: '#0B0B1F', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  aiBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  aiBtnGhostText: { color: '#ffffffCC' },

  aiSourceRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4,
  },
  aiSourceChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  aiSourceText: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.6,
  },
  aiFootnote: {
    color: '#ffffff77', fontSize: 12,
    marginTop: 18, lineHeight: 18, textAlign: 'center',
  },

  linkText: {
    color: '#8FB8DE',
    textDecorationLine: 'underline',
  },

  // Dream-journal output card for AI Insights
  dreamPage: {
    marginTop: 18, padding: 22,
    backgroundColor: 'rgba(245, 230, 200, 0.06)',
    borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(217,179,92,0.28)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  // Faint candle glow inside the dream page, top-lit like a reading lamp.
  dreamGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  dreamDate: {
    color: '#d9b35c',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 16,
    letterSpacing: 1,
    textAlign: 'center',
  },
  dreamRule: {
    height: 1,
    backgroundColor: 'rgba(217,179,92,0.30)',
    marginVertical: 12,
  },
  dreamBody: {
    color: '#f3ead4',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 17,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  dreamSig: {
    color: '#d9b35c99',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 14,
    textAlign: 'right',
  },

  // Link-confirm modal (used for opening Google API key page)
  linkConfirmBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  linkConfirmCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#0F1024',
    borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  linkConfirmTitle: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  linkConfirmUrl: {
    color: '#8FB8DE', fontSize: 12, marginTop: 10,
    backgroundColor: 'rgba(91,208,255,0.10)',
    padding: 8, borderRadius: 8,
  },
  linkConfirmHint: { color: '#ffffff88', fontSize: 12, marginTop: 12, lineHeight: 17 },
  linkConfirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  linkConfirmCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  linkConfirmCancelText: { color: '#ffffffaa', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  linkConfirmOpenBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#8FB8DE',
  },
  linkConfirmOpenText: { color: '#0B0B1F', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
