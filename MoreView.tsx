import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
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
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  CaretLeft,
  CaretRight,
  GearSix,
  ArrowsClockwise,
  X,
  Plus,
  Waveform,
  Smiley,
  CloudLightning,
  Coffee,
  ShieldCheck,
  ChatCircleText,
  type IconProps,
} from 'phosphor-react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { AmbientPageShell, GlowCard, EmptyStateCard, ActionPill, PromptChip } from './MoreUI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recordActivity, getStreak, notify, scheduleGratitudeReminder } from './App';
import { openStoreListing } from './lib/rateApp';
import { ZODIAC, type Zodiac } from './lib/content';

// The store the current platform rates on. The app ships on Google Play
// today; a future iOS build gets truthful copy for free.
const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

// Every AsyncStorage key this app writes starts with one of these, so the
// wipe below stays correct as new keys are added.
const STORAGE_PREFIXES = ['@simply_ambient_', '@binaural_'];

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
  // Deep link from elsewhere in the app (e.g. the mini player opening the
  // Soundscapes page). Set to a sub-page id, consumed via the handler.
  requestedPage?: Exclude<SubPage, null> | null;
  onRequestedPageHandled?: () => void;
  // "Single app color" setting: null = animated band transitions.
  singleColor: string | null;
  onChangeSingleColor: (c: string | null) => void;
  // Re-show the first-run walkthrough (replay mode skips legal + profile).
  onReplayOnboarding: () => void;
};

type SoundscapeOption = {
  id: string;
  name: string;
  blurb: string;
  Icon: React.ComponentType<IconProps>;
  color: string;
};

type SubPage =
  | null
  | 'profile'
  | 'compatibility'
  | 'natal'
  | 'insights'
  | 'affirmations'
  | 'mood'
  | 'gratitude'
  | 'rant'
  | 'manifestation'
  | 'routines'
  | 'soundscapes'
  | 'grounding'
  | 'support'
  | 'safety'
  | 'settings'
  | 'bug';

const STORAGE_PROFILE = '@simply_ambient_profile_v1';
const STORAGE_PARTNER = '@simply_ambient_partner_v1';
const STORAGE_GEMINI_KEY = '@simply_ambient_gemini_key_v1';
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
  return { paddingBottom: insets.bottom + 96 };
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
  requestedPage,
  onRequestedPageHandled,
  singleColor,
  onChangeSingleColor,
  onReplayOnboarding,
}: Props) {
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [gratitude, setGratitude] = useState<GratEntry[]>([]);
  const [rants, setRants] = useState<RantEntry[]>([]);
  const [manifestations, setManifestations] = useState<ManifestEntry[]>([]);
  const [streak, setStreak] = useState(0);
  // Personalizes the hub greeting. The intent is loaded alongside the name so
  // the hub can lean on it as personalization grows.
  const [profileName, setProfileName] = useState<string | null>(null);
  const [, setIntent] = useState<Intent | null>(null);

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

  // Full wipe, used by the Safety page. Removes every app key by prefix (so
  // new keys are covered automatically) AND resets the in-memory arrays: the
  // save paths above write those arrays back wholesale, so stale state here
  // would silently resurrect wiped entries on the user's next save.
  async function wipeAllData() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const mine = keys.filter(k => STORAGE_PREFIXES.some(p => k.startsWith(p)));
      if (mine.length) await AsyncStorage.multiRemove([...mine]);
    } catch {}
    setMoodLog([]);
    setGratitude([]);
    setRants([]);
    setManifestations([]);
    setStreak(0);
    // Notification prefs were part of the wipe, so stop their schedules too.
    if (Platform.OS !== 'web') {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
    }
  }

  // Slide-over navigation
  const [page, setPage] = useState<SubPage>(null);
  const slide = useRef(new Animated.Value(0)).current;

  function open(p: Exclude<SubPage, null>) {
    setPage(p);
    Animated.timing(slide, {
      toValue: 1, duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function close() {
    Animated.timing(slide, {
      toValue: 0, duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPage(null));
  }

  // Honor deep links into a specific sub-page (mini player -> Soundscapes).
  useEffect(() => {
    if (requestedPage) {
      open(requestedPage);
      onRequestedPageHandled?.();
    }
  }, [requestedPage]);

  // Live dimensions, so browser resizes and rotations keep the slide-over
  // offset correct (a module-level Dimensions.get snapshot would go stale).
  const { width: screenW } = useWindowDimensions();
  const subTranslateX = slide.interpolate({ inputRange: [0, 1], outputRange: [screenW, 0] });
  const hubScale = slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const hubOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });

  const today = new Date();
  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === today.toDateString(),
  );

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: hubScale }], opacity: hubOpacity }}>
        <Hub
          notifPref={notifPref}
          affirmationPreview={affirmation}
          moodToday={moodToday}
          moodLog={moodLog}
          gratitude={gratitude}
          streak={streak}
          profileName={profileName}
          onOpen={open}
        />
      </Animated.View>

      {page !== null && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: subTranslateX }], backgroundColor: '#0B0B1F' },
          ]}
        >
          {/* Moonlit base so sub-pages sit on layered depth instead of one
              flat navy field; each page adds its own accent wash on top. */}
          <LinearGradient
            colors={['#141530', '#0B0B1F', '#0d0e26']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {page === 'profile' && (
            <ProfilePage onBack={close} />
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
            <RoutinesPage onBack={close} />
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
  onOpen,
}: HubProps) {
  // Weekly insights, derived from the parent's live state. The Hub stays
  // mounted underneath the slide-over sub-pages, so a one-shot storage read
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

  return (
    <AmbientPageShell accent="#8F97DE">
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>More</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>{greeting}</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      {/* Compact pulse row: streak plus recent numbers at a glance. */}
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
              <Text style={styles.pulseCap}>GRATITUDE · 7D</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Grouped by how often each tool is reached for: daily journaling
            first, one-time setup and app meta last. Tiles carry one accent
            per section instead of a color per item. */}
        <Text style={styles.hubSection}>REFLECT</Text>
        <View style={styles.tileGrid}>
          <HubTile
            Icon={Smiley}
            accent="#8FB8DE"
            label="Mood Check-in"
            sub={
              moodToday
                ? `Logged today: ${moodLabel(moodToday.value)}`
                : 'How are you feeling right now?'
            }
            badge={moodToday ? moodLabel(moodToday.value) : null}
            badgeColor={moodToday ? moodColor(moodToday.value) : undefined}
            onPress={() => onOpen('mood')}
          />
          <HubTile
            glyph="❀"
            accent="#8FB8DE"
            label="Gratitude"
            sub={
              gratitude.length === 0
                ? 'Notice one good thing from today'
                : `${gratitude.length} ${gratitude.length === 1 ? 'entry' : 'entries'} and counting`
            }
            onPress={() => onOpen('gratitude')}
          />
          <HubTile
            Icon={CloudLightning}
            accent="#8FB8DE"
            label="Rant"
            sub="Pour it out. Keep it or release it"
            onPress={() => onOpen('rant')}
          />
          <HubTile
            glyph="⌖"
            accent="#8FB8DE"
            label="Grounding"
            sub="Come back to your senses in five steps"
            onPress={() => onOpen('grounding')}
          />
          <HubTile
            glyph="✷"
            accent="#8FB8DE"
            label="Manifestation"
            sub="Name what you're calling in"
            onPress={() => onOpen('manifestation')}
          />
          <HubTile
            glyph="⌬"
            accent="#8FB8DE"
            label="AI Insights"
            sub="Gentle reflections drawn from your entries"
            onPress={() => onOpen('insights')}
          />
        </View>

        <Text style={styles.hubSection}>PRACTICE</Text>
        <View style={styles.tileGrid}>
          <HubTile
            glyph="☉"
            accent="#9DC7AC"
            label="Daily Affirmation"
            sub={affirmationPreview ? `“${affirmationPreview}”` : 'Anchor a single thought for the day'}
            badge={notifPref === 'off' ? null : notifPref === 'daily' ? '1×/day' : '3×/day'}
            onPress={() => onOpen('affirmations')}
          />
          <HubTile
            glyph="⟁"
            accent="#9DC7AC"
            label="Routines"
            sub="Guided recipes for longer sessions"
            onPress={() => onOpen('routines')}
          />
          <HubTile
            Icon={Waveform}
            accent="#9DC7AC"
            label="Soundscapes"
            sub="Rain · ocean · forest · white noise"
            onPress={() => onOpen('soundscapes')}
          />
        </View>

        <Text style={styles.hubSection}>COSMOS</Text>
        <View style={styles.tileGrid}>
          <HubTile
            glyph="◯"
            accent="#B39BE0"
            label="Profile"
            sub="Birth details · MBTI · personality"
            onPress={() => onOpen('profile')}
          />
          <HubTile
            glyph="☌"
            accent="#B39BE0"
            label="Natal Chart"
            sub="Your birth details and chart"
            onPress={() => onOpen('natal')}
          />
          <HubTile
            glyph="⚭"
            accent="#B39BE0"
            label="Compatibility"
            sub="How two signs sit together"
            onPress={() => onOpen('compatibility')}
          />
        </View>

        <Text style={styles.hubSection}>APP</Text>
        <View style={styles.tileGrid}>
          <HubTile
            Icon={GearSix}
            accent="#d9b35c"
            label="Settings"
            sub="Background color and behavior"
            onPress={() => onOpen('settings')}
          />
          <HubTile
            Icon={Coffee}
            accent="#d9b35c"
            label="Support"
            sub="If the app brings you peace"
            onPress={() => onOpen('support')}
          />
          <HubTile
            Icon={ShieldCheck}
            accent="#d9b35c"
            label="Safety"
            sub="Hearing safety, medical notice, terms"
            onPress={() => onOpen('safety')}
          />
          <HubTile
            Icon={ChatCircleText}
            accent="#d9b35c"
            label="Feedback"
            sub="Ideas, kind words, bug reports"
            onPress={() => onOpen('bug')}
          />
        </View>
      </ScrollView>
    </AmbientPageShell>
  );
}

function HubTile({
  glyph, Icon, accent, label, sub, badge, badgeColor, onPress,
}: {
  // Either a unicode glyph (kept for spiritual symbols: ensō, flower, sparkle)
  // or a Phosphor icon component (used for utility items: Soundscapes, Bug, etc.)
  glyph?: string;
  Icon?: React.ComponentType<IconProps>;
  accent: string;
  label: string;
  sub: string;
  badge?: string | null;
  // Optional tint for the badge text; falls back to the section accent.
  badgeColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${sub}`}
    >
      {badge ? (
        <Text style={[styles.tileBadge, { color: badgeColor ?? accent }]}>{badge}</Text>
      ) : null}
      <View style={styles.tileGlyphWrap}>
        {Icon ? (
          <Icon size={22} weight="duotone" color={accent} />
        ) : (
          <Text style={[styles.tileGlyph, { color: accent }]}>{glyph}</Text>
        )}
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.tileSub} numberOfLines={2}>{sub}</Text>
    </TouchableOpacity>
  );
}

// ===========================================================================
//   Sub-page header
// ===========================================================================

function SubHeader({ title, accent, onBack }: { title: string; accent: string; onBack: () => void }) {
  return (
    <View style={styles.subHeader}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.subBackBtn}
        activeOpacity={0.7}
        accessibilityLabel="Back"
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <CaretLeft size={26} color={accent} weight="thin" />
      </TouchableOpacity>
      <Text style={styles.subTitle}>{title}</Text>
      <View style={{ width: 36 }} />
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
      <SubHeader title="Daily Affirmation" accent="#9DC7AC" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>TODAY</Text>
        <Text style={styles.sectionSub}>
          One intention, repeated, becomes a frame for the day. Read it once, then carry on.
        </Text>

        <GlowCard
          accent="#9DC7AC"
          style={{ padding: 22, alignItems: 'center', minHeight: 160, justifyContent: 'center' }}
        >
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
              <Text style={[styles.bigRefreshText, { marginLeft: 8 }]}>CHOOSE ANOTHER</Text>
            </View>
          </TouchableOpacity>
        </GlowCard>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <Text style={styles.sectionSub}>How often should we send a gentle nudge?</Text>
        <View style={styles.notifPills}>
          {(['off', 'daily', 'thrice'] as NotifPref[]).map(p => {
            const active = p === notifPref;
            const label = p === 'off' ? 'Off' : p === 'daily' ? '1×/day' : '3×/day';
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.85}
                onPress={() => onChangeNotifPref(p)}
                accessibilityRole="button"
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
      </ScrollView>
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
      <SubHeader title="Mood" accent="#8FB8DE" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <GlowCard accent="#8FB8DE" style={{ padding: 16, marginTop: 12 }}>
          <Text style={[styles.sectionLabel, { marginTop: 0 }]}>TODAY</Text>
          <Text style={styles.sectionSub}>
            A 5-second check-in. Tap again anytime today to change it.
          </Text>
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
                  accessibilityLabel={`Mood ${v}, ${MOOD_LABELS[v - 1]}`}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.moodBtn,
                    {
                      borderColor: active ? MOOD_COLORS[v - 1] : 'rgba(255,255,255,0.09)',
                      backgroundColor: active ? MOOD_COLORS[v - 1] + '22' : 'rgba(255,255,255,0.045)',
                    },
                  ]}
                >
                  <Text style={[styles.moodValue, { color: MOOD_COLORS[v - 1] }]}>{v}</Text>
                  <Text style={[styles.moodLabel, { color: active ? MOOD_COLORS[v - 1] : '#ffffff88' }]}>
                    {MOOD_LABELS[v - 1]}
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
              Pick a day, then choose the mood it deserved.
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
      </ScrollView>
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
type GratReminderHour = 'off' | '21' | '22' | '23'; // 9pm / 10pm / 11pm

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
  const [reminder, setReminder] = useState<GratReminderHour>('off');

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
      if (v === 'off' || v === '21' || v === '22' || v === '23') setReminder(v);
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

  function setReminderPref(p: GratReminderHour) {
    setReminder(p);
    AsyncStorage.setItem(STORAGE_GRAT_REMINDER, p).catch(() => {});
    // Schedule (or cancel) the actual notification; the pref alone does nothing.
    scheduleGratitudeReminder(p);
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
      <SubHeader title="Gratitude" accent="#E0A470" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>TODAY</Text>
        <Text style={styles.sectionSub}>
          {savedToday
            ? 'Saved for today. Add another if more comes to mind.'
            : "One thing you appreciate, named daily, shifts attention toward what's working. Saved only on this device."}
        </Text>
        <GlowCard accent="#E0A470" style={{ marginTop: 10 }}>
          <TextInput
            style={styles.rantInput}
            placeholder={placeholder}
            placeholderTextColor="#ffffff77"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
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
          {([
            { id: 'off', label: 'Off' },
            { id: '21',  label: '9 pm' },
            { id: '22',  label: '10 pm' },
            { id: '23',  label: '11 pm' },
          ] as Array<{ id: GratReminderHour; label: string }>).map(o => {
            const active = reminder === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.85}
                disabled={isExpoGo}
                onPress={() => setReminderPref(o.id)}
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
        </View>
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
                <View key={g.ts} style={styles.gratItem}>
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
      </ScrollView>
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
      <SubHeader title="Release the Noise" accent="#D68097" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>A PRIVATE PLACE</Text>
        <Text style={styles.sectionSub}>
          Pour out what is heavy. Keep it only if it helps.
        </Text>
        <GlowCard accent="#D68097" style={{ marginTop: 10 }}>
          <TextInput
            style={styles.rantInput}
            placeholder="Let it out…"
            placeholderTextColor="#ffffff66"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={4000}
          />
        </GlowCard>
        {!text.trim() ? (
          <View style={styles.rantChipsRow}>
            {RANT_PROMPTS.map(p => (
              <PromptChip key={p} label={p} accent="#D68097" onPress={() => setText(p + ' ')} />
            ))}
          </View>
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
        <Text style={styles.bugAppInfoHint}>
          Stays on this device. Shared with AI Insights only if you opt in there.
        </Text>
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
            <View key={r.ts} style={styles.gratItem}>
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
      </ScrollView>
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
      <SubHeader title="Manifestation" accent="#B39BE0" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>NEW INTENTION</Text>
        <Text style={styles.sectionSub}>
          Writing what you're calling in clarifies it. Mark it manifested when it lands.
        </Text>
        <GlowCard accent="#B39BE0" style={{ marginTop: 10 }}>
          <TextInput
            style={[styles.rantInput, { minHeight: 90 }]}
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
      </ScrollView>
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
    <View style={styles.gratItem}>
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

function GroundingPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  const items = [
    { num: 5, color: '#E07A66', sense: 'see' },
    { num: 4, color: '#E0A470', sense: 'touch' },
    { num: 3, color: '#D9BE7A', sense: 'hear' },
    { num: 2, color: '#9DC7AC', sense: 'smell' },
    { num: 1, color: '#8FB8DE', sense: 'taste' },
  ];
  // Steps marked done this visit. Ephemeral by design: the state lives in
  // this component, so leaving the page resets the walk.
  const [done, setDone] = useState<Set<number>>(new Set());
  function toggleDone(num: number) {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }
  const allDone = done.size === items.length;

  return (
    <AmbientPageShell accent="#8F97DE">
      <SubHeader title="5-4-3-2-1 Grounding" accent="#8F97DE" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
        <Text style={styles.sectionLabel}>THE PRACTICE</Text>
        <Text style={styles.sectionSub}>
          Five senses pull a looping mind back into the room, in a minute or two.
          Move slowly and breathe between each.
        </Text>
        <Text style={[styles.notifHint, { marginTop: 0, marginBottom: 12 }]}>
          A soundscape underneath can help. Soft Rain suits this well.
        </Text>
        {items.map(it => {
          const isDone = done.has(it.num);
          const noun = it.num === 1 ? 'thing' : 'things';
          return (
            <TouchableOpacity
              key={it.num}
              activeOpacity={0.85}
              onPress={() => toggleDone(it.num)}
              accessibilityRole="button"
              accessibilityLabel={`${it.num} ${noun} you can ${it.sense}`}
              accessibilityState={{ checked: isDone }}
              style={[
                styles.groundCard,
                { borderColor: it.color + '30', backgroundColor: it.color + '0D' },
                isDone && { borderColor: it.color, backgroundColor: it.color + '22' },
              ]}
            >
              <Text style={[styles.groundBigNum, { color: it.color }, isDone && { opacity: 0.35 }]}>
                {it.num}
              </Text>
              <Text style={styles.groundCardText}>
                {noun} you can <Text style={styles.groundEm}>{it.sense}</Text>
              </Text>
              {isDone ? (
                <Text style={[styles.groundCheck, { color: it.color }]}>✓</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        <Text style={styles.groundOutro}>
          {allDone
            ? 'You are here. Take one more slow breath before you go.'
            : 'Notice them slowly. Name them aloud or silently. Let each one anchor you a little more firmly to the present.'}
        </Text>
      </ScrollView>
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
      { title: 'Custom routines & auto-sequencer', blurb: 'Build your own preset chains with smooth fades between steps.' },
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
      { title: 'Built-in soundscapes', blurb: 'Rain, ocean, forest, fireplace, brown noise. Bundled and offline.' },
      { title: 'Settings page with a still background option', blurb: 'Pin the backdrop to one calm color any time.' },
    ],
  },
];

function SupportPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Support" accent="#d9b35c" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
        <View style={styles.supportHero}>
          <Text style={styles.supportEmoji}>☕</Text>
          <Text style={styles.supportHeadline}>Built by one person</Text>
          <Text style={styles.supportText}>
            Simply Ambient is built and maintained by one person. If it's brought you peace and
            you'd like to see more, a small donation directly funds the features below.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(SUPPORT_URL).catch(() => {})}
            style={styles.supportBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.supportBtnText}>BUY A COFFEE</Text>
          </TouchableOpacity>
        </View>

        {ROADMAP.map(group => (
          <View key={group.phase}>
            <Text style={styles.sectionLabel}>{group.phase}</Text>
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
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   Safety & Disclaimer
// ===========================================================================

export function SafetyContent() {
  return (
    <>
      <Text style={styles.sectionLabel}>HEARING SAFETY</Text>
      <Text style={styles.safetyBody}>
        Always begin at a low volume and raise gradually only if needed. Sustained
        listening through headphones can damage hearing at high volumes regardless
        of frequency. If anything feels piercing, sharp, or uncomfortable, stop
        immediately and lower the volume.
      </Text>

      <Text style={styles.sectionLabel}>NOT MEDICAL ADVICE</Text>
      <Text style={styles.safetyBody}>
        Simply Ambient is a wellness and mindfulness tool. It is not a medical device
        and is not intended to diagnose, treat, cure, or prevent any disease, mental
        health condition, or physiological state. Frequencies, breathwork, chakras,
        horoscopes, mantras, mudras, and AI reflections in this app are presented for
        contemplative and educational use only. They are not a substitute for
        professional medical, psychological, or psychiatric care.
      </Text>

      <Text style={styles.sectionLabel}>WHEN NOT TO USE</Text>
      <Text style={styles.safetyBody}>
        Talk with a physician first if any of these apply:
      </Text>
      {[
        'Pregnancy',
        'A pacemaker',
        'A history of seizures or epilepsy',
        'A heart condition',
        'Proneness to dissociation',
        'Medication that affects the nervous system',
      ].map(item => (
        <View key={item} style={styles.privacyRow}>
          <Text style={[styles.privacyCheck, { color: '#9aa0b4' }]}>•</Text>
          <Text style={styles.privacyText}>{item}</Text>
        </View>
      ))}
      <Text style={[styles.safetyBody, { marginTop: 10 }]}>
        Stop and seek care if you notice:
      </Text>
      {[
        'Dizziness',
        'Nausea',
        'Headache',
        'Ringing in the ears',
        'Chest pain',
        'Panic',
        'Any other unusual symptom',
      ].map(item => (
        <View key={item} style={styles.privacyRow}>
          <Text style={[styles.privacyCheck, { color: '#9aa0b4' }]}>•</Text>
          <Text style={styles.privacyText}>{item}</Text>
        </View>
      ))}
      <Text style={[styles.safetyBody, { marginTop: 10 }]}>
        Do not use this app while driving, operating machinery, or in any context
        where focused attention is required.
      </Text>

      <Text style={styles.sectionLabel}>YOUR DATA</Text>
      <Text style={styles.safetyBody}>
        All journal data (mood, gratitude, rants, manifestations, profile) is stored
        only on this device. Fetching a horoscope sends only your sign and the period.
        If the app crashes, an anonymous diagnostic (device model, OS and app version,
        stack trace) is sent so the bug can be fixed; your journals stay out of it.
        Beyond that, data leaves the device only when you explicitly tap an analyse
        button on the AI Insights page, in which case the sources you have toggled on
        are sent to Google Gemini using your own API key. You control which sources
        are shared. Messages you send from the Feedback page travel through a mail
        relay (formsubmit.co) to reach the developer.
      </Text>

      <Text style={styles.sectionLabel}>NO WARRANTY</Text>
      <Text style={styles.safetyBody}>
        This app is provided "as is" without warranty of any kind. Use is at your own
        risk. By using Simply Ambient you acknowledge these terms and accept that the
        developer is not liable for any direct or indirect harm, including hearing
        damage, that may arise from use of the app. If you do not agree, do not use
        the app.
      </Text>

      <Text style={[styles.sectionSub, { marginTop: 18 }]}>
        This app should always feel gentle. If it ever does not, pause and rest.
      </Text>
    </>
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
  'Crash reports hold device model, app version, and the stack trace. Your journals stay out of them.',
  'AI Insights shares only sources you toggle on, only when you tap analyse.',
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
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Settings" accent="#d9b35c" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
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
              {SINGLE_COLOR_CHOICES.find(c => c.hex === singleColor)?.name ?? 'Custom color'}
            </Text>
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
      </ScrollView>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />
    </View>
  );
}

function SafetyPage({ onBack, onWipe }: { onBack: () => void; onWipe: () => Promise<void> }) {
  const subBodyPad = useSubBodyPad();
  // Holds the URL to confirm-open, or null. Used by both the Privacy Policy
  // and Terms of Service links so we have one confirm modal, two triggers.
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function wipeAllData() {
    await onWipe();
    setConfirmWipe(false);
    notify(
      'Data wiped',
      'Everything the app stored on this device has been deleted, including journals, profile, presets, settings, and your saved AI key. Restarting the app gives you a clean start.',
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Safety & Disclaimer" accent="#9aa0b4" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
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
          and your saved AI key. Cannot be undone.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setConfirmWipe(true)}
          style={styles.wipeBtn}
          accessibilityLabel="Wipe all data on this device"
        >
          <Text style={styles.wipeBtnText}>WIPE ALL DATA</Text>
        </TouchableOpacity>
      </ScrollView>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />

      <Modal
        visible={confirmWipe}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmWipe(false)}
      >
        <View style={styles.linkConfirmBackdrop}>
          <View style={styles.linkConfirmCard}>
            <Text style={styles.linkConfirmTitle}>Wipe all data?</Text>
            <Text style={styles.linkConfirmHint}>
              This permanently deletes your journals (mood, gratitude, rants,
              manifestations), profile, presets, settings, and your saved AI key
              from this device. There is no undo.
            </Text>
            <View style={styles.linkConfirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setConfirmWipe(false)}
                style={styles.linkConfirmCancelBtn}
                accessibilityLabel="Cancel wipe"
              >
                <Text style={styles.linkConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={wipeAllData}
                style={[styles.linkConfirmOpenBtn, { backgroundColor: '#E07A66' }]}
                accessibilityLabel="Confirm wipe all data"
              >
                <Text style={styles.linkConfirmOpenText}>WIPE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    <View style={{ flex: 1 }}>
      <SubHeader title="Feedback" accent="#D68097" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>MESSAGE TYPE</Text>
        <View style={styles.notifPills}>
          {MESSAGE_KINDS.map(k => (
            <TouchableOpacity
              key={k.id}
              onPress={() => setKind(k.id)}
              style={[
                styles.notifPill,
                kind === k.id && { borderColor: '#D68097', backgroundColor: '#D6809722' },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k.id }}
            >
              <Text style={[styles.notifPillText, kind === k.id && { color: '#fff' }]}>
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
        <TextInput
          style={styles.bugInput}
          placeholder="Subject"
          placeholderTextColor="#ffffff77"
          value={subject}
          onChangeText={t => { setSubject(t); setSentInline(false); }}
          maxLength={120}
        />
        <TextInput
          style={[styles.bugInput, { minHeight: 140, textAlignVertical: 'top' }]}
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
        >
          {sending ? (
            <ActivityIndicator color="#0B0B1F" />
          ) : (
            <Text style={styles.bugSendText}>SEND</Text>
          )}
        </TouchableOpacity>
        {sentInline ? (
          <Text style={styles.notifHint}>
            Sent. Thank you, the developer will see it soon.
          </Text>
        ) : null}
      </ScrollView>
    </View>
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
    <View style={[styles.compatCard, styles.sunSignCard]}>
      <Text style={[styles.sunSignGlyph, { color: sign.color }]}>{sign.glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.compatName}>{sign.name}</Text>
        <Text style={styles.compatMeta}>{sign.element} · {sign.qualities}</Text>
        {showIntention ? (
          <Text style={styles.sunSignIntention}>{sign.intention}</Text>
        ) : null}
        <Text style={styles.sunSignCaption}>{caption}</Text>
      </View>
    </View>
  );
}

function ProfilePage({ onBack }: { onBack: () => void }) {
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
    <View style={{ flex: 1 }}>
      <SubHeader title="Profile" accent="#B39BE0" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>YOU</Text>
        <Text style={styles.sectionSub}>
          Used for your natal chart and compatibility. Stored only on this device.
        </Text>

        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Your name"
          placeholderTextColor="#ffffff77"
          value={profile.name ?? ''}
          onChangeText={t => update('name', t)}
          maxLength={60}
        />
        <Text style={styles.fieldLabel}>Birth date</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#ffffff77"
          value={profile.birthDate ?? ''}
          onChangeText={t => update('birthDate', t)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>Birth time (optional, for natal chart)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="HH:MM"
          placeholderTextColor="#ffffff77"
          value={profile.birthTime ?? ''}
          onChangeText={t => update('birthTime', t)}
          maxLength={5}
        />
        <Text style={styles.fieldLabel}>Birth location</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City, country"
          placeholderTextColor="#ffffff77"
          value={profile.birthLocation ?? ''}
          onChangeText={t => update('birthLocation', t)}
          maxLength={120}
        />

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
            <View style={styles.mbtiResult}>
              <Text style={styles.mbtiResultType}>{profile.mbti}</Text>
              {mbtiGroup ? (
                <>
                  <Text style={styles.mbtiResultGroup}>{mbtiGroup.name}</Text>
                  <Text style={styles.mbtiResultBlurb}>{mbtiGroup.blurb}</Text>
                </>
              ) : null}
            </View>
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
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   Natal Chart sub-page (uses Profile data + external chart link)
// ===========================================================================

// astro-seek's free natal chart calculator.
const NATAL_CALCULATOR_URL = 'https://horoscopes.astro-seek.com/birth-chart-horoscope-online';

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
    <View style={{ flex: 1 }}>
      <SubHeader title="Natal Chart" accent="#B39BE0" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
        {sunSign ? (
          <>
            <Text style={styles.sectionLabel}>YOUR SUN SIGN</Text>
            <SunSignCard
              sign={sunSign}
              showIntention
              caption="Your Sun sign, computed from your birth date on this device."
            />
          </>
        ) : null}

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
      </ScrollView>

      <LinkConfirmModal url={pendingOpenUrl} onClose={() => setPendingOpenUrl(null)} />
    </View>
  );
}

// ===========================================================================
//   Routines (basic. Sample routines, simple sequencer scaffolded)
// ===========================================================================

type RoutineStep = { label: string; minutes: number };
type Routine = { id: string; name: string; description: string; color: string; steps: RoutineStep[] };

const SAMPLE_ROUTINES: Routine[] = [
  {
    id: 'morning-focus',
    name: 'Morning Focus',
    description: 'Wake the mind, then settle it into focus.',
    color: '#E0A470',
    steps: [
      { label: 'Beta · 18 Hz',  minutes: 5  },
      { label: 'Alpha · 10 Hz', minutes: 10 },
    ],
  },
  {
    id: 'evening-windown',
    name: 'Evening Wind-down',
    description: 'Release the day, then soften toward rest.',
    color: '#A498E8',
    steps: [
      { label: 'Alpha · 10 Hz', minutes: 10 },
      { label: 'Theta · 6 Hz',  minutes: 15 },
    ],
  },
  {
    id: 'deep-sleep',
    name: 'Deep Sleep',
    description: 'Drop in gently, then rest deeply.',
    color: '#8F97DE',
    steps: [
      { label: 'Theta · 6 Hz', minutes: 10 },
      { label: 'Delta · 2 Hz', minutes: 30 },
    ],
  },
];

function RoutinesPage({ onBack }: { onBack: () => void }) {
  const subBodyPad = useSubBodyPad();
  return (
    <AmbientPageShell accent="#9DC7AC">
      <SubHeader title="Routines" accent="#9DC7AC" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
        <Text style={styles.sectionLabel}>SESSION GUIDES</Text>
        <Text style={styles.sectionSub}>
          Three ways to chain presets into a longer session. Run each step yourself from the
          Frequencies tab. The sleep timer there can end a step for you.
        </Text>
        {SAMPLE_ROUTINES.map(r => (
          <View
            key={r.id}
            style={[styles.routineCard, { borderColor: '#9DC7AC26' }]}
          >
            <View style={styles.routineTitleRow}>
              <Text style={[styles.routineName, { color: r.color }]}>{r.name}</Text>
              <Text style={styles.routineTotal}>
                {r.steps.reduce((sum, s) => sum + s.minutes, 0)} MIN TOTAL
              </Text>
            </View>
            <Text style={styles.routineDesc}>{r.description}</Text>
            {r.steps.map((s, i) => (
              <View key={i} style={styles.routineStep}>
                <Text style={[styles.routineStepNum, { color: r.color }]}>{i + 1}</Text>
                <Text style={styles.routineStepLabel}>{s.label}</Text>
                <Text style={styles.routineStepTime}>{s.minutes} min</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.notifHint}>
          Saved custom routines and automatic step changes are on the roadmap. See Support for
          what is coming.
        </Text>
      </ScrollView>
    </AmbientPageShell>
  );
}

// ===========================================================================
//   Soundscapes
// ===========================================================================

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
  const activeName = activeSoundscapeId
    ? soundscapes.find(s => s.id === activeSoundscapeId)?.name ?? 'Ambient layer'
    : 'No layer selected';

  // Two families, rendered under their own section labels.
  const NATURE_IDS = ['rain', 'ocean', 'forest', 'stream', 'fire'];
  const natureScapes = soundscapes.filter(s => NATURE_IDS.includes(s.id));
  const noiseScapes = soundscapes.filter(s => !NATURE_IDS.includes(s.id));

  const renderCard = (s: SoundscapeOption) => {
    const active = activeSoundscapeId === s.id && isSoundscapePlaying;
    return (
      <TouchableOpacity
        key={s.id}
        activeOpacity={0.85}
        onPress={() => onToggleSoundscape(s.id)}
        style={[
          styles.soundscapeCard,
          active && {
            borderColor: s.color,
            backgroundColor: s.color + '18',
          },
        ]}
      >
        <View style={[styles.soundscapeGlyphBox, { backgroundColor: s.color + '22', borderColor: s.color }]}>
          <s.Icon size={22} color={s.color} weight="duotone" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.soundscapeName}>{s.name}</Text>
          <Text style={styles.soundscapeBlurb}>{s.blurb}</Text>
        </View>
        <Text style={[styles.soundscapeSoon, active && { color: s.color }]}>
          {active ? 'STOP' : 'PLAY'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <AmbientPageShell accent="#8FB8DE">
      <SubHeader title="Soundscapes" accent="#8FB8DE" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
        <Text style={styles.sectionLabel}>NATURAL AMBIENCE</Text>
        <Text style={styles.sectionSub}>
          A soft ambient layer under your binaural tones, generated on your device.
          It follows you through the app in the mini player.
        </Text>

        <GlowCard accent="#8FB8DE" style={{ padding: 14, marginBottom: 12 }}>
          <View style={styles.soundscapeTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.soundscapeActiveLabel}>CURRENT</Text>
              <Text style={styles.soundscapeActiveName}>{activeName}</Text>
              <Text style={styles.soundscapeActiveMeta}>
                {activeSoundscapeId
                  ? isSoundscapePlaying ? 'Playing now' : 'Paused'
                  : 'Pick a layer below to begin.'}
              </Text>
            </View>
            {activeSoundscapeId ? (
              <TouchableOpacity
                onPress={() => onToggleSoundscape(activeSoundscapeId)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isSoundscapePlaying ? 'Pause the soundscape' : 'Play the soundscape'}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.soundscapeSoon}>
                  {isSoundscapePlaying ? 'PAUSE' : 'PLAY'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {activeSoundscapeId ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.soundscapeVolLabel}>VOLUME · {Math.round(soundscapeVolume * 100)}%</Text>
              <Slider
                style={{ width: '100%', height: 34 }}
                minimumValue={0}
                maximumValue={1}
                value={soundscapeVolume}
                minimumTrackTintColor="#8FB8DE"
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor="#8FB8DE"
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
        {natureScapes.map(renderCard)}

        <Text style={styles.sectionLabel}>STEADY NOISE</Text>
        {noiseScapes.map(renderCard)}
      </ScrollView>
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
    <View style={{ flex: 1 }}>
      <SubHeader title="Compatibility" accent="#D8A0B0" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]}>
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
        <Text style={styles.fieldLabel}>Birth date (needed for the match)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#ffffff77"
          value={partner.birthDate ?? ''}
          onChangeText={t => updatePartner('birthDate', t)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Their name"
          placeholderTextColor="#ffffff77"
          value={partner.name ?? ''}
          onChangeText={t => updatePartner('name', t)}
          maxLength={60}
        />
        <Text style={styles.fieldLabel}>Birth time (optional, saved for the full chart later)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="HH:MM"
          placeholderTextColor="#ffffff77"
          value={partner.birthTime ?? ''}
          onChangeText={t => updatePartner('birthTime', t)}
          maxLength={5}
        />
        <Text style={styles.fieldLabel}>Birth location (optional, saved for the full chart later)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City, country"
          placeholderTextColor="#ffffff77"
          value={partner.birthLocation ?? ''}
          onChangeText={t => updatePartner('birthLocation', t)}
          maxLength={120}
        />
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
            <View style={styles.compatCard}>
              <View style={styles.compatSignsRow}>
                <View style={styles.compatSignCol}>
                  <Text style={[styles.compatPairGlyph, { color: selfSign.color }]}>
                    {selfSign.glyph}
                  </Text>
                  <Text style={styles.compatName}>{selfSign.name}</Text>
                  <Text style={styles.compatMeta}>{selfSign.element}</Text>
                </View>
                <Text style={styles.compatPairJoin}>+</Text>
                <View style={styles.compatSignCol}>
                  <Text style={[styles.compatPairGlyph, { color: partnerSign.color }]}>
                    {partnerSign.glyph}
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
            </View>
          </>
        ) : null}

        <View style={styles.compatComingSoon}>
          <Text style={styles.compatComingTitle}>Full chart comparison</Text>
          <Text style={styles.compatComingText}>
            A planet-by-planet reading is on the roadmap. Your saved details will be ready for it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   AI Insights (Gemini)
// ===========================================================================

const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';
const STORAGE_TAROT = '@simply_ambient_tarot_v1';
const STORAGE_LAST_REFLECTION = '@simply_ambient_last_reflection_v1';
const GEMINI_ERROR_TEXT = 'Gemini could not process this request. Check the key and try again.';

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
    AsyncStorage.getItem(STORAGE_GEMINI_KEY).then(v => {
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
    AsyncStorage.setItem(STORAGE_GEMINI_KEY, trimmed).catch(() => {});
  }

  function removeKey() {
    setSavedKey('');
    setKeyDraft('');
    setKeyInputOpen(false);
    AsyncStorage.removeItem(STORAGE_GEMINI_KEY).catch(() => {});
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
      notify('Add your Gemini API key', 'Get a free key from aistudio.google.com and paste it above.');
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
        type TarotCardLite = { name?: string; meaning_up?: string; desc?: string };
        const tarotParsed = safeParse<{ card?: TarotCardLite }>(tarotRaw, {});
        const card: TarotCardLite | null =
          (tarotParsed && typeof tarotParsed === 'object' && tarotParsed.card && typeof tarotParsed.card === 'object')
            ? tarotParsed.card
            : null;
        if (!card) {
          notify('No card drawn', 'Open the Horoscopes tab and draw a card first.');
          setLoading(false);
          return;
        }
        prompt =
          'You are a thoughtful tarot interpreter. The user drew the following card. ' +
          'Give a calm, grounded interpretation in plain language. What it might invite ' +
          'them to notice today. Avoid clichés or fortune-telling claims. Under 180 words.\n\n' +
          `Card: ${card.name}\n` +
          `Upright meaning: ${card.meaning_up ?? ''}\n` +
          `Description: ${(card.desc ?? '').slice(0, 600)}`;
      }

      // The key travels in a header instead of the URL so it can never leak
      // through URL-based logging anywhere along the way.
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
      // Time-boxed: a stalled connection would otherwise spin forever with
      // both analyse buttons disabled.
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 20000);
      let json: any;
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': savedKey.trim() },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });
        json = await res.json();
      } finally {
        clearTimeout(timeout);
      }
      // Only a genuine reflection reaches the dream card. API errors and
      // empty responses surface as a warning line instead.
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text === 'string' && text.trim()) {
        const entry: SavedReflection = {
          ts: Date.now(),
          kind: kind === 'journal' ? 'themes' : 'tarot',
          text: text.trim(),
        };
        setReflection(entry);
        AsyncStorage.setItem(STORAGE_LAST_REFLECTION, JSON.stringify(entry)).catch(() => {});
      } else {
        setErrorMsg(GEMINI_ERROR_TEXT);
      }
    } catch (e) {
      setErrorMsg(GEMINI_ERROR_TEXT);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="AI Insights" accent="#8FB8DE" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.subBody, subBodyPad]} showsVerticalScrollIndicator={false}>
        {!hasKey ? (
          <>
            <View style={[styles.supportHero, { marginTop: 16 }]}>
              <Text style={styles.supportHeadline}>A quiet reader for your journal</Text>
              <Text style={[styles.supportText, { marginBottom: 0 }]}>
                Your mood, gratitude, and manifestations already hold patterns. With a free
                Gemini key, this page writes you a short reflection in the style of a dream
                journal. Everything stays on this device until you choose to share it.
              </Text>
            </View>
            <View style={styles.dreamPage}>
              <Text style={styles.dreamDate}>A week, read gently</Text>
              <View style={styles.dreamRule} />
              <Text style={styles.dreamBody}>{EXAMPLE_REFLECTION}</Text>
              <Text style={styles.dreamSig}>· example</Text>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>GEMINI API KEY</Text>
        {hasKey ? (
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.settingLabel}>Gemini key</Text>
              <Text style={styles.bugAppInfoPreview}>Saved on this device</Text>
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
            Free at{' '}
            <Text style={styles.linkText} onPress={() => setConfirmOpenLink(true)}>
              aistudio.google.com
            </Text>
            . Saved on this device only.
          </Text>
        )}
        {!hasKey || keyInputOpen ? (
          <TextInput
            style={[styles.fieldInput, hasKey && { marginTop: 10 }]}
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
          <Text style={styles.notifHint}>Draw a card in Horoscopes first.</Text>
        ) : null}

        {errorMsg ? <Text style={styles.notifWarn}>{errorMsg}</Text> : null}

        {(loading || reflection) ? (
          <View style={styles.dreamPage}>
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
          you toggle on. Tarot interpretation sends the drawn card. Nothing is sent until you
          tap a button.
        </Text>
      </ScrollView>

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
              You'll leave the app to get a free Gemini API key from Google.
            </Text>
            <View style={styles.linkConfirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setConfirmOpenLink(false)}
                style={styles.linkConfirmCancelBtn}
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
              >
                <Text style={styles.linkConfirmOpenText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ===========================================================================
//   Styles
// ===========================================================================

const styles = StyleSheet.create({
  headerWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 14 },
  ambience: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 38, letterSpacing: 2.5,
    textAlign: 'center', lineHeight: 44,
  },
  title: {
    color: '#ffffff99', fontSize: 10, fontWeight: '400',
    letterSpacing: 4, textTransform: 'uppercase', marginTop: 2,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic',
  },

  // Hub
  hubSection: {
    color: '#ffffff77', fontSize: 10, letterSpacing: 3, fontWeight: '700',
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },
  tileGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
  },
  tile: {
    width: '48.6%',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  tileGlyphWrap: { height: 28, justifyContent: 'center' },
  tileGlyph: { fontSize: 21, fontWeight: '600' },
  tileLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 6, letterSpacing: 0.2 },
  tileSub: {
    color: '#ffffff70', fontSize: 10, lineHeight: 14,
    textAlign: 'center', marginTop: 3, minHeight: 28,
  },
  tileBadge: {
    position: 'absolute', top: 8, right: 10,
    fontSize: 9, fontWeight: '800', letterSpacing: 0.8,
  },
  pulseRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, marginBottom: 6,
  },
  pulseChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, paddingVertical: 8,
  },
  pulseNum: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pulseCap: { color: '#9aa0b4', fontSize: 8, letterSpacing: 1.4, fontWeight: '700', marginTop: 2 },


  // Sub-page
  subHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2,
  },
  subBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  subTitle: {
    flex: 1,
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24,
    letterSpacing: 1,
    textAlign: 'center',
  },
  subBody: { paddingHorizontal: 20, paddingTop: 4 },

  // Section rhythm: every section starts with this label; the baked-in
  // margins keep spacing consistent without inline overrides.
  sectionLabel: {
    color: '#ffffff77', fontSize: 10, letterSpacing: 2, fontWeight: '700',
    marginTop: 24, marginBottom: 8,
  },
  sectionSub: {
    color: '#ffffffB0', fontSize: 12,
    marginBottom: 10, lineHeight: 18,
  },
  emptyText: { color: '#ffffff77', fontSize: 12, lineHeight: 18, marginTop: 4 },

  safetyBody: {
    color: '#ffffffcc',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
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
    fontSize: 22, lineHeight: 32,
    textAlign: 'center',
  },
  bigRefreshBtn: {
    marginTop: 18,
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#9DC7AC',
  },
  bigRefreshText: { color: '#0B0B1F', fontSize: 11, fontWeight: '700', letterSpacing: 2 },

  notifPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notifPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  notifPillText: { color: '#ffffff99', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  notifHint: { color: '#ffffff77', fontSize: 12, marginTop: 8, lineHeight: 18 },
  notifWarn: { color: '#E0A470', fontSize: 12, marginTop: 8, lineHeight: 18 },

  // Mood
  moodRow: { flexDirection: 'row', gap: 6 },
  moodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 14, borderWidth: 1,
  },
  moodValue: { fontSize: 20, fontWeight: '700' },
  moodLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '600', marginTop: 2 },

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
  },
  rantChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  rantActionsRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: 10, marginTop: 16,
  },
  rantLetGoText: { color: '#ffffff88', fontSize: 12, letterSpacing: 1 },

  manifestCheck: { paddingRight: 12, paddingTop: 1 },
  manifestCheckBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#B39BE099',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  manifestCheckMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 14 },

  // Grounding
  groundCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  groundBigNum: { fontSize: 36, fontWeight: '300', width: 60, textAlign: 'center' },
  groundCardText: { color: '#ffffffcc', fontSize: 16, flex: 1 },
  groundEm: { color: '#fff', fontWeight: '700' },
  groundCheck: { fontSize: 16, fontWeight: '700', marginLeft: 10 },
  groundOutro: {
    color: '#ffffff88', fontSize: 12, lineHeight: 18,
    textAlign: 'center', marginTop: 14,
  },

  // Support
  supportHero: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 22, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
  },
  supportEmoji: { fontSize: 44, marginBottom: 8 },
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
  supportBtnText: { color: '#0B0B1F', fontWeight: '800', letterSpacing: 3, fontSize: 13 },
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

  // Routines
  routineCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  routineTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  routineName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  // Small caps microlabel, same pill idiom as soundscapeSoon.
  routineTotal: {
    color: '#ffffff66', fontSize: 9, letterSpacing: 1.5, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 999,
  },
  routineDesc: { color: '#ffffffaa', fontSize: 12, marginTop: 4, lineHeight: 17, marginBottom: 10 },
  routineStep: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  routineStepNum: {
    width: 24, fontSize: 14, fontWeight: '700',
    textAlign: 'center', marginRight: 10,
  },
  routineStepLabel: { flex: 1, color: '#ffffffdd', fontSize: 13 },
  routineStepTime: { color: '#ffffff88', fontSize: 12 },

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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  soundscapeGlyphBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, borderWidth: 1,
  },
  soundscapeName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  soundscapeBlurb: { color: '#ffffff88', fontSize: 12, marginTop: 2 },
  soundscapeSoon: {
    color: '#ffffff66', fontSize: 9, letterSpacing: 1.5, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 999,
  },

  // Bug
  bugInput: {
    color: '#fff', fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  bugSendBtn: {
    paddingVertical: 13, borderRadius: 999, marginTop: 16,
    backgroundColor: '#D68097', alignItems: 'center',
  },
  bugSendText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 14 },
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
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
  mbtiResult: {
    marginTop: 18,
    backgroundColor: '#B39BE022',
    borderWidth: 1, borderColor: '#B39BE0',
    borderRadius: 14, padding: 18, alignItems: 'center',
  },
  // Kept quiet on purpose: the temperament group carries the emphasis.
  mbtiResultType: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24, letterSpacing: 3, fontWeight: '600',
  },
  mbtiResultGroup: { color: '#B39BE0', fontSize: 14, marginTop: 4, fontWeight: '700', letterSpacing: 1 },
  mbtiResultBlurb: { color: '#ffffffcc', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Compatibility
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
  sunSignGlyph: { fontSize: 42, marginRight: 16 },
  sunSignIntention: {
    color: '#ffffffcc', fontSize: 12, fontStyle: 'italic',
    marginTop: 6, lineHeight: 17,
  },
  sunSignCaption: { color: '#ffffff66', fontSize: 11, marginTop: 8, lineHeight: 15 },
  compatSignsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    marginBottom: 12,
  },
  compatSignCol: { alignItems: 'center', flex: 1 },
  compatPairGlyph: { fontSize: 36 },
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
  },
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
