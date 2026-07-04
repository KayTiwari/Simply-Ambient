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
  Bug,
  type IconProps,
} from 'phosphor-react-native';

import { recordActivity, getStreak, notify, scheduleGratitudeReminder } from './App';

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
type ManifestEntry = { ts: number; text: string; manifested: boolean };

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

type Profile = {
  name?: string;
  birthDate?: string; // YYYY-MM-DD
  birthTime?: string; // HH:MM
  birthLocation?: string;
  mbti?: string;      // e.g. 'INFJ'
};

const MOOD_COLORS = ['#FF5B5B', '#FF8A38', '#FFD000', '#9affc8', '#5BD0FF'];
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
}: Props) {
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [gratitude, setGratitude] = useState<GratEntry[]>([]);
  const [rants, setRants] = useState<RantEntry[]>([]);
  const [manifestations, setManifestations] = useState<ManifestEntry[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
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

  function saveMood(value: number) {
    const next = [{ ts: Date.now(), value }, ...moodLog].slice(0, 365);
    setMoodLog(next);
    AsyncStorage.setItem(STORAGE_MOOD, JSON.stringify(next)).catch(() => {});
  }

  // Retroactive mood logging from the 14-day graph. Keeps the log sorted
  // newest-first so the History list and day buckets stay consistent.
  function saveMoodAt(ts: number, value: number) {
    if (ts > Date.now()) return; // Never log a future date.
    const next = [{ ts, value }, ...moodLog]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 365);
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
    const next = manifestations.map(m => m.ts === ts ? { ...m, manifested: !m.manifested } : m);
    setManifestations(next);
    AsyncStorage.setItem(STORAGE_MANIFEST, JSON.stringify(next)).catch(() => {});
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
            <InsightsPage onBack={close} />
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
              onBack={close}
            />
          )}
          {page === 'gratitude' && (
            <GratitudePage
              entries={gratitude}
              onSave={saveGratitude}
              onDelete={deleteGratitude}
              onBack={close}
            />
          )}
          {page === 'rant' && (
            <RantPage
              entries={rants}
              onSave={saveRant}
              onDelete={deleteRant}
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
  onOpen: (p: Exclude<SubPage, null>) => void;
};

function Hub({
  notifPref,
  affirmationPreview,
  moodToday,
  moodLog,
  gratitude,
  streak,
  onOpen,
}: HubProps) {
  // Weekly insights, derived from the parent's live state. The Hub stays
  // mounted underneath the slide-over sub-pages, so a one-shot storage read
  // here would go stale as soon as the user logs an entry.
  // Mood averages over the past 5 days, trend against the 5 days before.
  const weekly = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const recent = moodLog.filter(m => now - m.ts < 5 * dayMs);
    const prev = moodLog.filter(m => now - m.ts >= 5 * dayMs && now - m.ts < 10 * dayMs);
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
      gratCount: gratitude.filter(g => now - g.ts < 7 * dayMs).length,
      moodTrend: trend,
    };
  }, [moodLog, gratitude]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>More</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>Tools for the practice</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      {/* Compact pulse row: streak plus recent numbers at a glance. */}
      {streak > 0 || weekly.moodAvg !== null || weekly.gratCount > 0 ? (
        <View style={styles.pulseRow}>
          <View style={styles.pulseChip}>
            <Text style={[styles.pulseNum, { color: '#9affc8' }]}>{streak}</Text>
            <Text style={styles.pulseCap}>DAY STREAK</Text>
          </View>
          <View style={styles.pulseChip}>
            <Text style={[styles.pulseNum, { color: '#5BD0FF' }]}>
              {weekly.moodAvg !== null ? weekly.moodAvg.toFixed(1) : '–'}
              {weekly.moodTrend === 'up' ? ' ↑' : weekly.moodTrend === 'down' ? ' ↓' : ''}
            </Text>
            <Text style={styles.pulseCap}>AVG MOOD · 5D</Text>
          </View>
          <View style={styles.pulseChip}>
            <Text style={[styles.pulseNum, { color: '#FFB05B' }]}>{weekly.gratCount}</Text>
            <Text style={styles.pulseCap}>GRATITUDES · 7D</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Grouped by how often each tool is reached for: daily journaling
            first, one-time setup and app meta last. Tiles carry one accent
            per section instead of a color per item. */}
        <Text style={styles.hubSection}>JOURNAL</Text>
        <View style={styles.tileGrid}>
          <HubTile
            Icon={Smiley}
            accent="#5BD0FF"
            label="Mood Check-in"
            sub={
              moodToday
                ? `Today: ${moodLabel(moodToday.value)} · keep the streak`
                : 'See patterns in what lifts and drains you'
            }
            badge={moodToday ? String(moodToday.value) : null}
            onPress={() => onOpen('mood')}
          />
          <HubTile
            glyph="❀"
            accent="#5BD0FF"
            label="Gratitude"
            sub={
              gratitude.length === 0
                ? 'Rewire attention toward what works'
                : `${gratitude.length} ${gratitude.length === 1 ? 'entry' : 'entries'} · positive psychology`
            }
            onPress={() => onOpen('gratitude')}
          />
          <HubTile
            Icon={CloudLightning}
            accent="#5BD0FF"
            label="Rant"
            sub="Vent it out. Raw, private, unfiltered"
            onPress={() => onOpen('rant')}
          />
          <HubTile
            glyph="✷"
            accent="#5BD0FF"
            label="Manifestation"
            sub="Name what you're calling in"
            onPress={() => onOpen('manifestation')}
          />
          <HubTile
            glyph="⌬"
            accent="#5BD0FF"
            label="AI Insights"
            sub="Reflections on your journal & tarot"
            onPress={() => onOpen('insights')}
          />
        </View>

        <Text style={styles.hubSection}>PRACTICE</Text>
        <View style={styles.tileGrid}>
          <HubTile
            glyph="☉"
            accent="#9affc8"
            label="Daily Affirmation"
            sub={affirmationPreview ? `“${affirmationPreview}”` : 'Anchor a single thought for the day'}
            badge={notifPref === 'off' ? null : notifPref === 'daily' ? '1×/day' : '3×/day'}
            onPress={() => onOpen('affirmations')}
          />
          <HubTile
            glyph="⟁"
            accent="#9affc8"
            label="Routines"
            sub="Chain presets into sessions"
            onPress={() => onOpen('routines')}
          />
          <HubTile
            Icon={Waveform}
            accent="#9affc8"
            label="Soundscapes"
            sub="Rain · ocean · forest · white noise"
            onPress={() => onOpen('soundscapes')}
          />
          <HubTile
            glyph="⌖"
            accent="#9affc8"
            label="Grounding"
            sub="5-4-3-2-1 anxiety reset through the senses"
            onPress={() => onOpen('grounding')}
          />
        </View>

        <Text style={styles.hubSection}>COSMOS</Text>
        <View style={styles.tileGrid}>
          <HubTile
            glyph="◯"
            accent="#A45BFF"
            label="Profile"
            sub="Birth details · MBTI · personality"
            onPress={() => onOpen('profile')}
          />
          <HubTile
            glyph="☌"
            accent="#A45BFF"
            label="Natal Chart"
            sub="Western planetary positions"
            onPress={() => onOpen('natal')}
          />
          <HubTile
            glyph="⚭"
            accent="#A45BFF"
            label="Compatibility"
            sub="Match your sign with another"
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
            Icon={Bug}
            accent="#d9b35c"
            label="Report a Bug"
            sub="Something off? Let me know"
            onPress={() => onOpen('bug')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function HubTile({
  glyph, Icon, accent, label, sub, badge, onPress,
}: {
  // Either a unicode glyph (kept for spiritual symbols: ensō, flower, sparkle)
  // or a Phosphor icon component (used for utility items: Soundscapes, Bug, etc.)
  glyph?: string;
  Icon?: React.ComponentType<IconProps>;
  accent: string;
  label: string;
  sub: string;
  badge?: string | null;
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
        <Text style={[styles.tileBadge, { color: accent }]}>{badge}</Text>
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
    <View style={{ flex: 1 }}>
      <SubHeader title="Daily Affirmation" accent="#9affc8" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>TODAY</Text>
        <Text style={styles.sectionSub}>
          One intention, repeated, becomes a frame for the day. Read it once, then carry on.
        </Text>

        <View style={styles.bigAffirmCard}>
          {loading ? (
            <ActivityIndicator color="#9affc8" />
          ) : (
            <Text style={styles.bigAffirmText}>“{affirmation ?? 'You are exactly where you need to be.'}”</Text>
          )}
          <TouchableOpacity
            onPress={onRefresh}
            style={styles.bigRefreshBtn}
            activeOpacity={0.85}
            accessibilityLabel="Get another affirmation"
            accessibilityRole="button"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ArrowsClockwise size={14} color="#0B0B1F" weight="regular" />
              <Text style={[styles.bigRefreshText, { marginLeft: 8 }]}>ANOTHER</Text>
            </View>
          </TouchableOpacity>
        </View>

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
                  active && { borderColor: '#9affc8', backgroundColor: '#9affc822' },
                ]}
              >
                <Text style={[styles.notifPillText, active && { color: '#9affc8' }]}>{label}</Text>
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
            Notifications are blocked in system settings, so these will not fire.
          </Text>
        ) : null}
        {isExpoGo ? (
          <Text style={styles.notifWarn}>
            Notifications require a standalone build (EAS / TestFlight / Play Store). They are inactive in Expo Go.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   Mood sub-page (with graph)
// ===========================================================================

function MoodPage({
  moodLog, onSaveMood, onSaveMoodAt, onBack,
}: {
  moodLog: MoodEntry[];
  onSaveMood: (v: number) => void;
  onSaveMoodAt: (ts: number, v: number) => void;
  onBack: () => void;
}) {
  const today = new Date();
  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === today.toDateString(),
  );

  // Day selected on the calendar for retroactive logging.
  const [backfillDate, setBackfillDate] = useState<Date | null>(null);

  function selectBackfillDay(date: Date) {
    if (date.getTime() > Date.now()) return;
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

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Mood" accent="#5BD0FF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>RIGHT NOW</Text>
        <Text style={styles.sectionSub}>
          A 5-second check-in. Patterns in what lifts and drains you surface over weeks.
        </Text>
        <View style={styles.moodRow}>
          {[1, 2, 3, 4, 5].map(v => {
            const active = moodToday?.value === v;
            return (
              <TouchableOpacity
                key={v}
                activeOpacity={0.85}
                onPress={() => onSaveMood(v)}
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

        <Text style={styles.sectionLabel}>LAST 14 DAYS</Text>
        <MoodGraph buckets={dayBuckets} />

        <Text style={styles.sectionLabel}>LOG A PAST DAY</Text>
        <Text style={styles.sectionSub}>Pick a day, then choose the mood it deserved.</Text>
        <BackfillCalendar
          moodLog={moodLog}
          selected={backfillDate}
          onSelectDay={selectBackfillDay}
        />

        {backfillDate ? (
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
        {moodLog.length === 0 ? (
          <Text style={styles.emptyText}>No entries yet. Your first check-in starts the chart.</Text>
        ) : (
          moodLog.slice(0, 30).map(m => (
            <View key={m.ts} style={styles.moodHistoryRow}>
              <Text style={[styles.moodHistoryDot, { backgroundColor: moodColor(m.value) }]} />
              <Text style={styles.moodHistoryDate}>
                {new Date(m.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' · '}
                {new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Text style={[styles.moodHistoryLabel, { color: moodColor(m.value) }]}>
                {moodLabel(m.value)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MoodGraph({
  buckets,
}: {
  buckets: Array<{ date: Date; avg: number | null }>;
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
            stroke="#5BD0FF"
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
              <Text style={[styles.calDay, future && { color: '#ffffff28' }, isSelected && { color: '#5BD0FF' }]}>
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

function GratitudePage({
  entries, onSave, onDelete, onBack,
}: {
  entries: GratEntry[];
  onSave: (text: string) => void;
  onDelete: (ts: number) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState('');
  const [reminder, setReminder] = useState<GratReminderHour>('off');

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
    <View style={{ flex: 1 }}>
      <SubHeader title="Gratitude" accent="#FFB05B" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>TODAY</Text>
        <Text style={styles.sectionSub}>
          One thing you appreciate, named daily, shifts attention toward what's working. Saved only on this device.
        </Text>
        <TextInput
          style={styles.gratInput}
          placeholder="A small or large thing…"
          placeholderTextColor="#ffffff77"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity onPress={commit} style={styles.gratSaveBtn} activeOpacity={0.85}>
          <Text style={styles.gratSaveText}>SAVE</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>EVENING REMINDER</Text>
        <Text style={styles.sectionSub}>
          Gentle nudge if you haven't journaled by the chosen hour. Activates with a standalone build.
        </Text>
        <View style={styles.notifPills}>
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
                onPress={() => setReminderPref(o.id)}
                accessibilityRole="button"
                accessibilityLabel={`Evening reminder: ${o.label}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.notifPill,
                  active && { borderColor: '#FFB05B', backgroundColor: '#FFB05B22' },
                ]}
              >
                <Text style={[styles.notifPillText, active && { color: '#FFB05B' }]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {notifBlocked ? (
          <Text style={styles.notifWarn}>
            Notifications are blocked in system settings, so these will not fire.
          </Text>
        ) : null}

        <Text style={styles.sectionLabel}>JOURNAL</Text>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>Your first gratitude will appear here.</Text>
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
    </View>
  );
}

// ===========================================================================
//   Rant
// ===========================================================================

function RantPage({
  entries, onSave, onDelete, onBack,
}: {
  entries: RantEntry[];
  onSave: (text: string) => void;
  onDelete: (ts: number) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState('');

  function commit() {
    if (!text.trim()) return;
    onSave(text);
    setText('');
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Rant" accent="#FF5B9C" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>WHAT'S ON YOUR MIND</Text>
        <Text style={styles.sectionSub}>
          Name the noise to quiet it. Stored only on this device; shared with AI Insights only if you opt in there.
        </Text>
        <TextInput
          style={[styles.gratInput, { minHeight: 140 }]}
          placeholder="Let it out…"
          placeholderTextColor="#ffffff77"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity onPress={commit} style={[styles.gratSaveBtn, { backgroundColor: '#FF5B9C' }]} activeOpacity={0.85}>
          <Text style={styles.gratSaveText}>SAVE</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>HISTORY</Text>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>Your first rant will live here.</Text>
        ) : (
          entries.map(r => (
            <View key={r.ts} style={styles.gratItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rantDate}>
                  {new Date(r.ts).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.gratItemText}>{r.text}</Text>
              </View>
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
    </View>
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
  const [text, setText] = useState('');

  function commit() {
    if (!text.trim()) return;
    onSave(text);
    setText('');
  }

  const pending = entries.filter(e => !e.manifested);
  const manifested = entries.filter(e => e.manifested);

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Manifestation" accent="#A45BFF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>NEW INTENTION</Text>
        <Text style={styles.sectionSub}>
          Writing what you're calling in clarifies it. Mark it manifested when it lands.
        </Text>
        <TextInput
          style={styles.gratInput}
          placeholder="I am calling in…"
          placeholderTextColor="#ffffff77"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity onPress={commit} style={[styles.gratSaveBtn, { backgroundColor: '#A45BFF' }]} activeOpacity={0.85}>
          <Text style={styles.gratSaveText}>ADD</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>CALLING IN</Text>
        {pending.length === 0 ? (
          <Text style={styles.emptyText}>Nothing yet. Name what you're inviting.</Text>
        ) : (
          pending.map(m => (
            <ManifestRow key={m.ts} item={m} onToggle={onToggle} onDelete={onDelete} />
          ))
        )}

        {manifested.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>MANIFESTED</Text>
            {manifested.map(m => (
              <ManifestRow key={m.ts} item={m} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ManifestRow({
  item, onToggle, onDelete,
}: {
  item: ManifestEntry;
  onToggle: (ts: number) => void;
  onDelete: (ts: number) => void;
}) {
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
          item.manifested && { backgroundColor: '#A45BFF', borderColor: '#A45BFF' },
        ]}>
          {item.manifested ? <Text style={styles.manifestCheckMark}>✓</Text> : null}
        </View>
      </TouchableOpacity>
      <Text style={[
        styles.gratItemText,
        item.manifested && { color: '#ffffff66', textDecorationLine: 'line-through' },
        { flex: 1 },
      ]}>
        {item.text}
      </Text>
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
  const items = [
    { num: 5, color: '#FF5B5B', sense: 'see' },
    { num: 4, color: '#FFB05B', sense: 'touch' },
    { num: 3, color: '#FFD000', sense: 'hear' },
    { num: 2, color: '#9affc8', sense: 'smell' },
    { num: 1, color: '#5BD0FF', sense: 'taste' },
  ];
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="5-4-3-2-1 Grounding" accent="#5B6CFF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <Text style={styles.sectionLabel}>THE PRACTICE</Text>
        <Text style={styles.sectionSub}>
          Five senses pull a looping mind back into the room, in about 60 to 90 seconds.
          Move slowly and breathe between each.
        </Text>
        {items.map(it => (
          <View key={it.num} style={styles.groundCard}>
            <Text style={[styles.groundBigNum, { color: it.color }]}>{it.num}</Text>
            <Text style={styles.groundCardText}>
              things you can <Text style={styles.groundEm}>{it.sense}</Text>
            </Text>
          </View>
        ))}
        <Text style={styles.groundOutro}>
          Notice them slowly. Name them aloud or silently. Let each one anchor you a little more
          firmly to the present.
        </Text>
      </ScrollView>
    </View>
  );
}

const ROADMAP: Array<{ phase: string; items: Array<{ title: string; blurb: string }> }> = [
  {
    phase: 'NEXT UP',
    items: [
      { title: 'Custom routines & auto-sequencer', blurb: 'Build your own preset chains with smooth fades between steps.' },
      { title: 'Built-in soundscapes',              blurb: 'Rain, ocean, forest, fireplace, brown noise. Bundled and offline.' },
      { title: 'In-app natal chart',                blurb: 'Planet positions, houses, and aspects without leaving the app.' },
      { title: 'Bija mantra audio',                 blurb: 'Short loops of LAM / VAM / RAM / OM for chakra meditation.' },
    ],
  },
  {
    phase: 'AFTER THAT',
    items: [
      { title: 'Apple Health & Google Fit',         blurb: 'Log breath sessions as mindfulness minutes; mood as wellbeing data.' },
      { title: 'Synastry compatibility',            blurb: 'Full natal-chart matching between two people once the chart pipeline ships.' },
      { title: 'Widget + lock-screen',              blurb: 'Daily affirmation widget; quick-play preset from the home screen.' },
      { title: 'iCloud / Drive backup',             blurb: 'Sync presets, gratitude, and mood log between devices.' },
    ],
  },
  {
    phase: 'CONSIDERING',
    items: [
      { title: 'Light theme',           blurb: 'Alternate palette for daytime use.' },
      { title: 'Sleep mode',            blurb: 'Dimmed screen, gentle fade-out, optional white/brown-noise overlay for falling asleep.' },
      { title: 'Sacred geometry visualizer', blurb: 'Frequency-reactive cymatic patterns behind the play screen.' },
      { title: 'Shareable preset cards',   blurb: 'Render a beautiful image of a saved preset to share.' },
      { title: 'Yoga Nidra',              blurb: 'Guided body-scan audio or text.' },
    ],
  },
];

function SupportPage({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Support" accent="#d9b35c" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <View style={styles.supportHero}>
          <Text style={styles.supportEmoji}>☕</Text>
          <Text style={styles.supportHeadline}>Support the developer</Text>
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
                <View style={styles.roadmapDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.roadmapTitle}>{item.title}</Text>
                  <Text style={styles.roadmapBlurb}>{item.blurb}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}

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
        Do not use this app while driving, operating machinery, or in any context where
        focused attention is required. Consult a qualified physician before using
        binaural beats or breathwork if you are pregnant, have a pacemaker, history
        of seizures or epilepsy, a heart condition, are prone to dissociation, or are
        taking medication that affects the nervous system. Discontinue immediately and
        seek care if you experience dizziness, nausea, headache, ringing in the ears,
        chest pain, panic, or any unusual symptom.
      </Text>

      <Text style={styles.sectionLabel}>YOUR DATA</Text>
      <Text style={styles.safetyBody}>
        All journal data (mood, gratitude, rants, manifestations, profile) is stored
        only on this device. Nothing is uploaded automatically. Data leaves the device
        only when you explicitly tap an analyse button on the AI Insights page, in which
        case the sources you have toggled on are sent to Google Gemini using your own
        API key. You control which sources are shared.
      </Text>

      <Text style={styles.sectionLabel}>NO WARRANTY</Text>
      <Text style={styles.safetyBody}>
        This app is provided "as is" without warranty of any kind. Use is at your own
        risk. By using Simply Ambient you acknowledge these terms and accept that the
        developer is not liable for any direct or indirect harm, including hearing
        damage, that may arise from use of the app. If you do not agree, do not use
        the app.
      </Text>
    </>
  );
}

const PRIVACY_POLICY_URL = 'https://kaytiwari.github.io/Simply-Ambient/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://kaytiwari.github.io/Simply-Ambient/terms-of-service.html';

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
  onBack, singleColor, onChangeSingleColor,
}: {
  onBack: () => void;
  singleColor: string | null;
  onChangeSingleColor: (c: string | null) => void;
}) {
  const on = singleColor != null;
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Settings" accent="#d9b35c" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>BACKGROUND</Text>
        <Text style={styles.sectionSub}>
          The backdrop normally shifts color with the active frequency band.
          Pin it to a single color if you prefer stillness.
        </Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Single app color</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onChangeSingleColor(on ? null : SINGLE_COLOR_CHOICES[0].hex)}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel="Single app color"
            style={[styles.settingToggle, on && { borderColor: '#d9b35c', backgroundColor: '#d9b35c22' }]}
          >
            <Text style={[styles.settingToggleText, on && { color: '#d9b35c' }]}>
              {on ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>
        {on ? (
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
        ) : null}
      </ScrollView>
    </View>
  );
}

function SafetyPage({ onBack, onWipe }: { onBack: () => void; onWipe: () => Promise<void> }) {
  // Holds the URL to confirm-open, or null. Used by both the Privacy Policy
  // and Terms of Service links so we have one confirm modal, two triggers.
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function wipeAllData() {
    await onWipe();
    setConfirmWipe(false);
    notify(
      'Data wiped',
      'All journal data, profile, presets, and settings have been deleted from this device. Restart the app to see a fresh state.',
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Safety & Disclaimer" accent="#9aa0b4" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <SafetyContent />

        <Text style={styles.sectionLabel}>PRIVACY POLICY</Text>
        <Text style={styles.safetyBody}>
          The full privacy policy is published at{' '}
          <Text style={styles.linkText} onPress={() => setPendingOpenUrl(PRIVACY_POLICY_URL)}>
            kaytiwari.github.io/Simply-Ambient
          </Text>
          . It explains exactly what data the app handles and what it does not.
        </Text>

        <Text style={styles.sectionLabel}>TERMS OF SERVICE</Text>
        <Text style={styles.safetyBody}>
          The full Terms of Service are published{' '}
          <Text style={styles.linkText} onPress={() => setPendingOpenUrl(TERMS_OF_SERVICE_URL)}>
            here
          </Text>
          . By using Simply Ambient you accept them. They include hearing-safety,
          medical-disclaimer, liability, and dispute-resolution terms.
        </Text>

        <Text style={styles.sectionLabel}>RESET</Text>
        <Text style={styles.safetyBody}>
          Permanently delete every entry stored on this device: profile, mood log,
          gratitude, rants, manifestations, presets, settings, AI key. Cannot be undone.
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

      <Modal
        visible={pendingOpenUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingOpenUrl(null)}
      >
        <View style={styles.linkConfirmBackdrop}>
          <View style={styles.linkConfirmCard}>
            <Text style={styles.linkConfirmTitle}>Open in browser?</Text>
            <Text style={styles.linkConfirmUrl}>{pendingOpenUrl ?? ''}</Text>
            <Text style={styles.linkConfirmHint}>You'll leave the app to view this document.</Text>
            <View style={styles.linkConfirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPendingOpenUrl(null)}
                style={styles.linkConfirmCancelBtn}
                accessibilityLabel="Cancel"
              >
                <Text style={styles.linkConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const url = pendingOpenUrl;
                  setPendingOpenUrl(null);
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
              This permanently deletes every journal entry, your profile, all presets,
              and settings stored on this device. There is no undo.
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
                style={[styles.linkConfirmOpenBtn, { backgroundColor: '#FF5B5B' }]}
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

function BugReportPage({ onBack }: { onBack: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!subject.trim() && !body.trim()) {
      notify('Empty report', 'Add a subject or describe the issue first.');
      return;
    }
    setSending(true);

    const email = decodeReportEmail();
    const fullSubject = `[Simply Ambient] ${subject || 'Bug report'}`;

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
            message: body,
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
      setSending(false);
      return;
    }

    // 2) Fallback: open the user's mail app pre-filled. Reliable on every
    // device and doesn't depend on a third-party service activating an email.
    const mailto =
      `mailto:${email}` +
      `?subject=${encodeURIComponent(fullSubject)}` +
      `&body=${encodeURIComponent(body || '')}`;
    try {
      await Linking.openURL(mailto);
      notify(
        'One more tap',
        'Your mail app is opening with the report pre-filled. Tap Send there to complete.',
      );
      setSubject('');
      setBody('');
    } catch {
      notify('Could not send', 'No mail app available on this device.');
    }
    setSending(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Report a Bug" accent="#FF5B9C" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>WHAT WENT WRONG?</Text>
        <Text style={styles.sectionSub}>This goes straight to the developer's inbox.</Text>
        <TextInput
          style={styles.bugInput}
          placeholder="Subject"
          placeholderTextColor="#ffffff77"
          value={subject}
          onChangeText={setSubject}
          maxLength={120}
        />
        <TextInput
          style={[styles.bugInput, { minHeight: 140, textAlignVertical: 'top' }]}
          placeholder="Describe what happened, what you expected, and what device you're on…"
          placeholderTextColor="#ffffff77"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={sending}
          style={[styles.bugSendBtn, sending && { opacity: 0.5 }]}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color="#0B0B1F" />
          ) : (
            <Text style={styles.bugSendText}>SEND REPORT</Text>
          )}
        </TouchableOpacity>
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

function ProfilePage({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState<Profile>({});
  const [answers, setAnswers] = useState<Array<0 | 1 | null>>([null, null, null, null]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') setProfile(parsed);
    }).catch(() => {});
  }, []);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(next)).catch(() => {});
  }

  function setAnswer(qIdx: number, choice: 0 | 1) {
    const next = answers.slice() as Array<0 | 1 | null>;
    next[qIdx] = choice;
    setAnswers(next);
    if (next.every(a => a !== null)) {
      const type = next.map((a, i) => MBTI_QUESTIONS[i].letters[a as 0 | 1]).join('');
      update('mbti', type);
    }
  }

  const mbtiGroup = profile.mbti ? mbtiGroupFor(profile.mbti) : null;

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Profile" accent="#A45BFF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>YOU</Text>
        <Text style={styles.sectionSub}>Stored only on this device.</Text>

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

        <Text style={styles.sectionLabel}>MBTI · 16 PERSONALITIES</Text>
        <Text style={styles.sectionSub}>
          Four quick questions for a rough type indicator.
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
                    active && { borderColor: '#A45BFF', backgroundColor: '#A45BFF22' },
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
          <View style={styles.mbtiResult}>
            <Text style={styles.mbtiResultType}>{profile.mbti}</Text>
            {mbtiGroup ? (
              <>
                <Text style={styles.mbtiResultGroup}>{mbtiGroup.name}</Text>
                <Text style={styles.mbtiResultBlurb}>{mbtiGroup.blurb}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   Natal Chart sub-page (uses Profile data + external chart link)
// ===========================================================================

function NatalChartPage({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState<Profile>({});
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => {
      const parsed = safeParse<Profile>(v, {});
      if (parsed && typeof parsed === 'object') setProfile(parsed);
    }).catch(() => {});
  }, []);

  function openExternal() {
    // astro-seek's free natal chart calculator opens with a clean form to fill
    const url = 'https://horoscopes.astro-seek.com/birth-chart-horoscope-online';
    Linking.openURL(url).catch(() => {});
  }

  const ready = !!(profile.birthDate && profile.birthTime && profile.birthLocation);

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Natal Chart" accent="#5B6CFF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <Text style={styles.sectionLabel}>YOUR BIRTH DETAILS</Text>
        {profile.name || profile.birthDate ? (
          <View style={styles.compatCard}>
            <Text style={styles.compatName}>{profile.name ?? '·'}</Text>
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
          <Text style={[styles.compatComingTitle, { color: '#5B6CFF' }]}>
            In-app chart. Coming soon
          </Text>
          <Text style={styles.compatComingText}>
            A built-in chart with planet positions, houses, and aspects is in the works.
            For now, the button below opens a free public calculator in your browser. Have
            your birth details handy; the form starts blank.
          </Text>
          <TouchableOpacity
            onPress={openExternal}
            disabled={!ready}
            style={[
              styles.aiBtn,
              { backgroundColor: '#5B6CFF', marginTop: 14, opacity: ready ? 1 : 0.4 },
            ]}
          >
            <Text style={styles.aiBtnText}>OPEN ASTRO-SEEK CALCULATOR</Text>
          </TouchableOpacity>
          {!ready ? (
            <Text style={[styles.compatComingText, { marginTop: 10 }]}>
              (Fill in birth date, time, and location on Profile first.)
            </Text>
          ) : null}
        </View>
      </ScrollView>
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
    description: '5 min Beta to wake the mind, 10 min Alpha to settle attention.',
    color: '#FFB05B',
    steps: [
      { label: 'Beta · 18 Hz',  minutes: 5  },
      { label: 'Alpha · 10 Hz', minutes: 10 },
    ],
  },
  {
    id: 'evening-windown',
    name: 'Evening Wind-down',
    description: '10 min Alpha to release the day, 15 min Theta to soften.',
    color: '#8A5BFF',
    steps: [
      { label: 'Alpha · 10 Hz', minutes: 10 },
      { label: 'Theta · 6 Hz',  minutes: 15 },
    ],
  },
  {
    id: 'deep-sleep',
    name: 'Deep Sleep',
    description: '10 min Theta to drop in, 30 min Delta to rest.',
    color: '#5B6CFF',
    steps: [
      { label: 'Theta · 6 Hz', minutes: 10 },
      { label: 'Delta · 2 Hz', minutes: 30 },
    ],
  },
];

function RoutinesPage({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Routines" accent="#9affc8" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <Text style={styles.sectionLabel}>SAMPLE ROUTINES</Text>
        <Text style={styles.sectionSub}>
          A routine chains preset frequencies into a longer session. Follow the steps from the
          Frequencies tab while the auto-sequencer is in development.
        </Text>
        {SAMPLE_ROUTINES.map(r => (
          <View
            key={r.id}
            style={styles.routineCard}
          >
            <Text style={[styles.routineName, { color: r.color }]}>{r.name}</Text>
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
        <View style={styles.compatComingSoon}>
          <Text style={[styles.compatComingTitle, { color: '#9affc8' }]}>
            Custom routines & auto-sequencer. Coming soon
          </Text>
          <Text style={styles.compatComingText}>
            You'll be able to build your own routines, save them, and have the app auto-transition
            between steps with smooth fades.
          </Text>
        </View>
      </ScrollView>
    </View>
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
  const activeName = activeSoundscapeId
    ? soundscapes.find(s => s.id === activeSoundscapeId)?.name ?? 'Ambient layer'
    : 'No layer selected';

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Soundscapes" accent="#5BD0FF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <Text style={styles.sectionLabel}>NATURAL AMBIENCE</Text>
        <Text style={styles.sectionSub}>
          Subtle generated ambience layered under your binaural tones. It stays local
          and follows you through the app in the mini player.
        </Text>

        <View style={styles.soundscapeControlCard}>
          <View style={styles.soundscapeTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.soundscapeActiveLabel}>CURRENT</Text>
              <Text style={styles.soundscapeActiveName}>{activeName}</Text>
              <Text style={styles.soundscapeActiveMeta}>
                {isSoundscapePlaying ? 'Playing now' : 'Paused'}
              </Text>
            </View>
          </View>
          {activeSoundscapeId ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.soundscapeVolLabel}>VOLUME · {Math.round(soundscapeVolume * 100)}%</Text>
              <Slider
                style={{ width: '100%', height: 34 }}
                minimumValue={0}
                maximumValue={1}
                value={soundscapeVolume}
                minimumTrackTintColor="#5BD0FF"
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor="#5BD0FF"
                onValueChange={onChangeSoundscapeVolume}
              />
            </View>
          ) : null}
        </View>

        {soundscapes.map(s => {
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
        })}
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//   Compatibility scaffold
// ===========================================================================

function CompatibilityPage({ onBack }: { onBack: () => void }) {
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

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Compatibility" accent="#FF8FB1" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
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
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Their name"
          placeholderTextColor="#ffffff77"
          value={partner.name ?? ''}
          onChangeText={t => updatePartner('name', t)}
          maxLength={60}
        />
        <Text style={styles.fieldLabel}>Birth date</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#ffffff77"
          value={partner.birthDate ?? ''}
          onChangeText={t => updatePartner('birthDate', t)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>Birth time</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="HH:MM"
          placeholderTextColor="#ffffff77"
          value={partner.birthTime ?? ''}
          onChangeText={t => updatePartner('birthTime', t)}
          maxLength={5}
        />
        <Text style={styles.fieldLabel}>Birth location</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City, country"
          placeholderTextColor="#ffffff77"
          value={partner.birthLocation ?? ''}
          onChangeText={t => updatePartner('birthLocation', t)}
          maxLength={120}
        />

        <View style={styles.compatComingSoon}>
          <Text style={styles.compatComingTitle}>Synastry chart. Coming soon</Text>
          <Text style={styles.compatComingText}>
            Full synastry (planet-by-planet alignment between two natal charts) will be added once
            the natal-chart pipeline is wired in. Your details are saved locally so the moment that
            ships, the analysis is one tap away.
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

function InsightsPage({ onBack }: { onBack: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [confirmOpenLink, setConfirmOpenLink] = useState(false);
  const [sources, setSources] = useState<AISources>(DEFAULT_AI_SOURCES);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_GEMINI_KEY).then(v => v && setApiKey(v)).catch(() => {});
    AsyncStorage.getItem(STORAGE_AI_SOURCES).then(v => {
      if (!v) return;
      try {
        const parsed = JSON.parse(v) as Partial<AISources>;
        setSources({ ...DEFAULT_AI_SOURCES, ...parsed });
      } catch {}
    }).catch(() => {});
  }, []);

  function saveKey(value: string) {
    setApiKey(value);
    AsyncStorage.setItem(STORAGE_GEMINI_KEY, value).catch(() => {});
  }

  function toggleSource(k: AISourceKey) {
    const next = { ...sources, [k]: !sources[k] };
    setSources(next);
    AsyncStorage.setItem(STORAGE_AI_SOURCES, JSON.stringify(next)).catch(() => {});
  }

  const enabledSourceCount = (Object.keys(sources) as AISourceKey[]).filter(k => sources[k]).length;

  async function runAnalysis(kind: 'journal' | 'tarot') {
    if (!apiKey.trim()) {
      notify('Add your Gemini API key', 'Get a free key from aistudio.google.com and paste it above.');
      return;
    }
    setLoading(true);
    setOutput(null);
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
        const tarotRaw = await AsyncStorage.getItem('@simply_ambient_tarot_v1');
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

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`;
      // Time-boxed: a stalled connection would otherwise spin forever with
      // both analyse buttons disabled.
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 20000);
      let json: any;
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });
        json = await res.json();
      } finally {
        clearTimeout(timeout);
      }
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ??
        json?.error?.message ??
        'No response.';
      setOutput(text);
    } catch (e) {
      setOutput('Could not reach the AI service. Check your network and API key.');
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="AI Insights" accent="#5BD0FF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>GEMINI API KEY</Text>
        <Text style={styles.sectionSub}>
          Free at{' '}
          <Text style={styles.linkText} onPress={() => setConfirmOpenLink(true)}>
            aistudio.google.com
          </Text>
          . Saved on this device only.
        </Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="paste your key here"
          placeholderTextColor="#ffffff77"
          value={apiKey}
          onChangeText={saveKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Text style={styles.sectionLabel}>SHARE WITH AI</Text>
        <Text style={styles.sectionSub}>
          Pick which journal data is sent to Google Gemini for the journal themes analysis.
          Off by default for sensitive sources like rants.
        </Text>
        <View style={styles.aiSourceRow}>
          {([
            { id: 'mood',          label: 'Mood',          color: '#5BD0FF' },
            { id: 'gratitude',     label: 'Gratitude',     color: '#FFB05B' },
            { id: 'manifestation', label: 'Manifestation', color: '#A45BFF' },
            { id: 'rant',          label: 'Rant',          color: '#FF5B9C' },
          ] as Array<{ id: AISourceKey; label: string; color: string }>).map(s => {
            const on = sources[s.id];
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.85}
                onPress={() => toggleSource(s.id)}
                style={[
                  styles.aiSourceChip,
                  on
                    ? { borderColor: s.color, backgroundColor: s.color + '22' }
                    : { borderColor: 'rgba(255,255,255,0.15)' },
                ]}
              >
                <Text style={[
                  styles.aiSourceText,
                  on ? { color: s.color } : { color: '#ffffff77' },
                ]}>
                  {on ? '✓ ' : ''}{s.label}
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
            { backgroundColor: '#5BD0FF' },
            (loading || enabledSourceCount === 0) && { opacity: 0.4 },
          ]}
          disabled={loading || enabledSourceCount === 0}
        >
          <Text style={styles.aiBtnText}>
            {enabledSourceCount === 0
              ? 'JOURNAL THEMES (no sources enabled)'
              : `JOURNAL THEMES (${enabledSourceCount} ${enabledSourceCount === 1 ? 'source' : 'sources'})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => runAnalysis('tarot')}
          style={[styles.aiBtn, styles.aiBtnGhost]}
          disabled={loading}
        >
          <Text style={[styles.aiBtnText, styles.aiBtnGhostText]}>INTERPRET TODAY'S TAROT</Text>
        </TouchableOpacity>

        {(loading || output) ? (
          <View style={styles.dreamPage}>
            <Text style={styles.dreamDate}>{today}</Text>
            <View style={styles.dreamRule} />
            {loading ? (
              <ActivityIndicator color="#A45BFF" style={{ marginTop: 16 }} />
            ) : (
              <Text style={styles.dreamBody}>{output}</Text>
            )}
            <Text style={styles.dreamSig}>· reflection</Text>
          </View>
        ) : null}

        <Text style={styles.aiFootnote}>
          Powered by Google Gemini. Only the data sources you've enabled above are sent, and only
          when you tap an analyse button. Nothing leaves the app otherwise.
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
  subBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },

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
    borderColor: '#FF5B5B',
    backgroundColor: 'rgba(255,91,91,0.10)',
    alignItems: 'center',
  },
  wipeBtnText: {
    color: '#FF5B5B',
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
    backgroundColor: '#9affc8',
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
  notifWarn: { color: '#FFB05B', fontSize: 12, marginTop: 8, lineHeight: 18 },

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
  calCellSelected: { backgroundColor: '#5BD0FF22', borderWidth: 1, borderColor: '#5BD0FF' },
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
  backfillTitle: { color: '#5BD0FF', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },

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
    borderRadius: 999, backgroundColor: '#FFB05B',
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

  manifestCheck: { paddingRight: 12, paddingTop: 1 },
  manifestCheckBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#A45BFF99',
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
  routineName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
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
    backgroundColor: '#FF5B9C', alignItems: 'center',
  },
  bugSendText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

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
    backgroundColor: '#A45BFF22',
    borderWidth: 1, borderColor: '#A45BFF',
    borderRadius: 14, padding: 18, alignItems: 'center',
  },
  mbtiResultType: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 36, letterSpacing: 4, fontWeight: '600',
  },
  mbtiResultGroup: { color: '#A45BFF', fontSize: 14, marginTop: 4, fontWeight: '700', letterSpacing: 1 },
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
    color: '#A45BFF', fontSize: 13, fontWeight: '700', letterSpacing: 2,
    marginTop: 6,
  },
  compatComingSoon: {
    marginTop: 24, padding: 16,
    borderRadius: 18, borderStyle: 'dashed',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  compatComingTitle: { color: '#FF8FB1', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
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
    color: '#5BD0FF',
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
    color: '#5BD0FF', fontSize: 12, marginTop: 10,
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
    backgroundColor: '#5BD0FF',
  },
  linkConfirmOpenText: { color: '#0B0B1F', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
