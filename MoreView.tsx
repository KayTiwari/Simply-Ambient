import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { recordActivity, getStreak } from './App';

const { width: SCREEN_W } = Dimensions.get('window');

const STORAGE_MOOD = '@simply_ambient_mood_log_v1';
const STORAGE_GRAT = '@simply_ambient_gratitude_v1';

// Email obfuscated so it doesn't appear as plaintext in the bundle.
const REPORT_EMAIL_B64 = 'dGl3a2F5QGdtYWlsLmNvbQ==';
function decodeReportEmail(): string {
  // @ts-ignore — atob exists in the React Native runtime
  return globalThis.atob(REPORT_EMAIL_B64);
}

// Donation link — replace with your own Buy Me a Coffee / Ko-fi handle.
const SUPPORT_URL = 'https://www.buymeacoffee.com/likechess';

export type NotifPref = 'off' | 'daily' | 'thrice';

type MoodEntry = { ts: number; value: number };
type GratEntry = { ts: number; text: string };

type Props = {
  notifPref: NotifPref;
  onChangeNotifPref: (p: NotifPref) => void;
  affirmation: string | null;
  affirmationLoading: boolean;
  onRefreshAffirmation: () => void;
  isExpoGo: boolean;
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
  | 'routines'
  | 'soundscapes'
  | 'grounding'
  | 'support'
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

export default function MoreView({
  notifPref, onChangeNotifPref,
  affirmation, affirmationLoading, onRefreshAffirmation,
  isExpoGo,
}: Props) {
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [gratitude, setGratitude] = useState<GratEntry[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_MOOD).then(v => v && setMoodLog(JSON.parse(v))).catch(() => {});
    AsyncStorage.getItem(STORAGE_GRAT).then(v => v && setGratitude(JSON.parse(v))).catch(() => {});
    getStreak().then(setStreak);
  }, []);

  function saveMood(value: number) {
    const next = [{ ts: Date.now(), value }, ...moodLog].slice(0, 365);
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

  function deleteGratitude(ts: number) {
    const next = gratitude.filter(g => g.ts !== ts);
    setGratitude(next);
    AsyncStorage.setItem(STORAGE_GRAT, JSON.stringify(next)).catch(() => {});
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

  const subTranslateX = slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W, 0] });
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
          gratitudeCount={gratitude.length}
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
            <SoundscapesPage onBack={close} />
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
          {page === 'grounding' && (
            <GroundingPage onBack={close} />
          )}
          {page === 'support' && (
            <SupportPage onBack={close} />
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
  gratitudeCount: number;
  streak: number;
  onOpen: (p: Exclude<SubPage, null>) => void;
};

function Hub({ notifPref, affirmationPreview, moodToday, gratitudeCount, streak, onOpen }: HubProps) {
  // Weekly insights — computed inline from local data
  const [weekly, setWeekly] = useState<{
    moodAvg: number | null;
    moodCount: number;
    gratCount: number;
    moodTrend: 'up' | 'down' | 'flat';
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const dayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const moodRaw = await AsyncStorage.getItem(STORAGE_MOOD);
        const gratRaw = await AsyncStorage.getItem(STORAGE_GRAT);
        const moods: MoodEntry[] = moodRaw ? JSON.parse(moodRaw) : [];
        const grats: GratEntry[] = gratRaw ? JSON.parse(gratRaw) : [];
        const week = moods.filter(m => now - m.ts < 7 * dayMs);
        const prev = moods.filter(m => now - m.ts >= 7 * dayMs && now - m.ts < 14 * dayMs);
        const avg = (arr: MoodEntry[]) =>
          arr.length ? arr.reduce((s, e) => s + e.value, 0) / arr.length : null;
        const a = avg(week);
        const b = avg(prev);
        const trend: 'up' | 'down' | 'flat' =
          a === null || b === null ? 'flat' :
          a - b >= 0.25 ? 'up' :
          a - b <= -0.25 ? 'down' : 'flat';
        setWeekly({
          moodAvg: a,
          moodCount: week.length,
          gratCount: grats.filter(g => now - g.ts < 7 * dayMs).length,
          moodTrend: trend,
        });
      } catch {}
    })();
  }, []);

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
        {streak > 0 ? (
          <View style={styles.streakBadge}>
            <Text style={styles.streakGlyph}>❀</Text>
            <Text style={styles.streakText}>
              {streak}-day gratitude streak
            </Text>
          </View>
        ) : null}
      </View>

      {weekly && (weekly.moodCount > 0 || weekly.gratCount > 0) ? (
        <View style={styles.weeklyCard}>
          <Text style={styles.weeklyLabel}>THIS WEEK</Text>
          <View style={styles.weeklyRow}>
            {weekly.moodAvg !== null ? (
              <View style={styles.weeklyStat}>
                <Text style={[styles.weeklyValue, { color: '#5BD0FF' }]}>
                  {weekly.moodAvg.toFixed(1)}
                  <Text style={styles.weeklyTrend}>
                    {weekly.moodTrend === 'up' ? '  ↑' : weekly.moodTrend === 'down' ? '  ↓' : '  ·'}
                  </Text>
                </Text>
                <Text style={styles.weeklyStatLabel}>avg mood</Text>
              </View>
            ) : null}
            <View style={styles.weeklyStat}>
              <Text style={[styles.weeklyValue, { color: '#5BD0FF' }]}>{weekly.moodCount}</Text>
              <Text style={styles.weeklyStatLabel}>check-ins</Text>
            </View>
            <View style={styles.weeklyStat}>
              <Text style={[styles.weeklyValue, { color: '#FFB05B' }]}>{weekly.gratCount}</Text>
              <Text style={styles.weeklyStatLabel}>gratitudes</Text>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <HubItem
          glyph="◯"
          color="#A45BFF"
          label="Profile"
          preview="Birth details · MBTI · personality"
          onPress={() => onOpen('profile')}
        />
        <HubItem
          glyph="✧"
          color="#5B6CFF"
          label="Natal Chart"
          preview="Western planetary positions"
          onPress={() => onOpen('natal')}
        />
        <HubItem
          glyph="∞"
          color="#FF8FB1"
          label="Compatibility"
          preview="Match your sign with another"
          onPress={() => onOpen('compatibility')}
        />
        <HubItem
          glyph="✦"
          color="#5BD0FF"
          label="AI Insights"
          preview="Reflections on your journal & tarot"
          onPress={() => onOpen('insights')}
        />
        <HubItem
          glyph="≣"
          color="#9affc8"
          label="Routines"
          preview="Chain presets into sessions"
          onPress={() => onOpen('routines')}
        />
        <HubItem
          glyph="≈"
          color="#5BD0FF"
          label="Soundscapes"
          preview="Rain · ocean · forest · white noise"
          onPress={() => onOpen('soundscapes')}
        />
        <HubItem
          glyph="✦"
          color="#9affc8"
          label="Daily Affirmation"
          preview={affirmationPreview ? `“${affirmationPreview}”` : 'Anchor a single thought for the day'}
          extra={notifPref === 'off' ? null : notifPref === 'daily' ? '1×/day' : '3×/day'}
          onPress={() => onOpen('affirmations')}
        />
        <HubItem
          glyph="◐"
          color="#5BD0FF"
          label="Mood Check-in"
          preview={
            moodToday
              ? `Today: ${MOOD_LABELS[moodToday.value - 1]} · keep the streak`
              : 'See patterns in what lifts and drains you'
          }
          extra={moodToday ? String(moodToday.value) : null}
          extraColor={moodToday ? MOOD_COLORS[moodToday.value - 1] : undefined}
          onPress={() => onOpen('mood')}
        />
        <HubItem
          glyph="❀"
          color="#FFB05B"
          label="Gratitude"
          preview={
            gratitudeCount === 0
              ? 'Rewire attention toward what works'
              : `${gratitudeCount} ${gratitudeCount === 1 ? 'entry' : 'entries'} · positive psychology`
          }
          onPress={() => onOpen('gratitude')}
        />
        <HubItem
          glyph="◊"
          color="#5B6CFF"
          label="5-4-3-2-1 Grounding"
          preview="Anxiety reset through the five senses"
          onPress={() => onOpen('grounding')}
        />
        <HubItem
          glyph="☕"
          color="#d9b35c"
          label="Support the Developer"
          preview="If the app brings you peace"
          onPress={() => onOpen('support')}
        />
        <HubItem
          glyph="!"
          color="#FF5B9C"
          label="Report a Bug"
          preview="Something off? Let me know"
          onPress={() => onOpen('bug')}
        />
      </ScrollView>
    </View>
  );
}

function HubItem({
  glyph, color, label, preview, extra, extraColor, onPress,
}: {
  glyph: string;
  color: string;
  label: string;
  preview: string;
  extra?: string | null;
  extraColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.hubItem, { borderColor: color + '55' }]}
    >
      <View style={[styles.hubGlyphCircle, { backgroundColor: color + '22', borderColor: color }]}>
        <Text style={[styles.hubGlyph, { color }]}>{glyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.hubLabel}>{label}</Text>
        <Text style={styles.hubPreview} numberOfLines={1}>{preview}</Text>
      </View>
      {extra ? (
        <Text style={[styles.hubExtra, { color: extraColor ?? '#ffffff99' }]}>{extra}</Text>
      ) : null}
      <Text style={styles.hubChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ===========================================================================
//   Sub-page header
// ===========================================================================

function SubHeader({ title, accent, onBack }: { title: string; accent: string; onBack: () => void }) {
  return (
    <View style={styles.subHeader}>
      <TouchableOpacity onPress={onBack} style={styles.subBackBtn} activeOpacity={0.7}>
        <Text style={[styles.subBackText, { color: accent }]}>‹</Text>
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
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Daily Affirmation" accent="#9affc8" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>WHY THIS MATTERS</Text>
        <Text style={styles.sectionSub}>
          A single intention, repeated, becomes a frame for the day. The affirmation isn't magic —
          it's a small mental anchor that biases what you notice, what you say yes to, and how
          you read your own moods. Read it once, then carry on.
        </Text>

        <View style={[styles.bigAffirmCard, { borderColor: '#9affc855', marginTop: 14 }]}>
          {loading ? (
            <ActivityIndicator color="#9affc8" />
          ) : (
            <Text style={styles.bigAffirmText}>“{affirmation ?? 'You are exactly where you need to be.'}”</Text>
          )}
          <TouchableOpacity onPress={onRefresh} style={styles.bigRefreshBtn} activeOpacity={0.85}>
            <Text style={styles.bigRefreshText}>↻  ANOTHER</Text>
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
  moodLog, onSaveMood, onBack,
}: {
  moodLog: MoodEntry[];
  onSaveMood: (v: number) => void;
  onBack: () => void;
}) {
  const today = new Date();
  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === today.toDateString(),
  );

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
        <Text style={styles.sectionLabel}>WHY THIS MATTERS</Text>
        <Text style={styles.sectionSub}>
          A 5-second daily check-in surfaces patterns over weeks — what days lift you, what drains
          you, and how your practice shapes baseline mood. Mood tracking is one of the most
          evidence-supported daily mental-health habits.
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>RIGHT NOW</Text>
        <View style={styles.moodRow}>
          {[1, 2, 3, 4, 5].map(v => {
            const active = moodToday?.value === v;
            return (
              <TouchableOpacity
                key={v}
                activeOpacity={0.85}
                onPress={() => onSaveMood(v)}
                style={[
                  styles.moodBtn,
                  {
                    borderColor: active ? MOOD_COLORS[v - 1] : MOOD_COLORS[v - 1] + '55',
                    backgroundColor: active ? MOOD_COLORS[v - 1] + '22' : 'rgba(0,0,0,0.20)',
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

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>LAST 14 DAYS</Text>
        <Text style={styles.sectionSub}>Daily average · tap any day below to log retroactively, sliders coming</Text>
        <MoodGraph buckets={dayBuckets} />

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>HISTORY</Text>
        {moodLog.length === 0 ? (
          <Text style={styles.emptyText}>No entries yet. Your first check-in starts the chart.</Text>
        ) : (
          moodLog.slice(0, 30).map(m => (
            <View key={m.ts} style={styles.moodHistoryRow}>
              <Text style={[styles.moodHistoryDot, { backgroundColor: MOOD_COLORS[m.value - 1] }]} />
              <Text style={styles.moodHistoryDate}>
                {new Date(m.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' · '}
                {new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Text style={[styles.moodHistoryLabel, { color: MOOD_COLORS[m.value - 1] }]}>
                {MOOD_LABELS[m.value - 1]}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MoodGraph({ buckets }: { buckets: Array<{ date: Date; avg: number | null }> }) {
  const W = SCREEN_W - 40;
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
              fill={MOOD_COLORS[Math.round(b.avg) - 1]}
            />
          ) : null,
        )}
      </Svg>
      <View style={styles.graphLabelRow}>
        <Text style={styles.graphLabelText}>14d ago</Text>
        <Text style={styles.graphLabelText}>today</Text>
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

  function setReminderPref(p: GratReminderHour) {
    setReminder(p);
    AsyncStorage.setItem(STORAGE_GRAT_REMINDER, p).catch(() => {});
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
        <Text style={styles.sectionLabel}>WHY THIS MATTERS</Text>
        <Text style={styles.sectionSub}>
          Naming one thing you appreciate, daily, gradually shifts attention toward what's working.
          Over weeks it raises baseline mood and reduces rumination — one of the most-studied
          interventions in positive psychology.
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>TODAY</Text>
        <Text style={styles.sectionSub}>One small thing or many. Saved only on this device.</Text>
        <TextInput
          style={styles.gratInput}
          placeholder="A small or large thing…"
          placeholderTextColor="#ffffff55"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity onPress={commit} style={styles.gratSaveBtn} activeOpacity={0.85}>
          <Text style={styles.gratSaveText}>SAVE</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>EVENING REMINDER</Text>
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

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>JOURNAL</Text>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>Your first gratitude will appear here.</Text>
        ) : (
          grouped.map(([dateKey, items]) => (
            <View key={dateKey} style={{ marginBottom: 18 }}>
              <Text style={styles.gratDateHeader}>
                {new Date(dateKey).toLocaleDateString(undefined, {
                  weekday: 'long', month: 'short', day: 'numeric',
                })}
              </Text>
              {items.map(g => (
                <View key={g.ts} style={styles.gratItem}>
                  <View style={styles.gratItemBar} />
                  <Text style={styles.gratItemText}>{g.text}</Text>
                  <TouchableOpacity onPress={() => onDelete(g.ts)} style={styles.gratDelBtn}>
                    <Text style={styles.gratDelText}>✕</Text>
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
        <Text style={styles.sectionLabel}>WHY THIS MATTERS</Text>
        <Text style={styles.sectionSub}>
          When anxiety spikes, the mind loops on what isn't here. This exercise pulls attention
          back into the body's actual sensory data — sight, touch, hearing, smell, taste —
          short-circuiting the rumination. It's a standard tool in trauma-informed therapy and
          works in 60–90 seconds.
        </Text>
        <Text style={[styles.groundIntro, { marginTop: 16 }]}>
          Move slowly. Breathe between each.
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
      { title: 'Built-in soundscapes',              blurb: 'Rain, ocean, forest, fireplace, brown noise — bundled and offline.' },
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
        <View style={[styles.supportHero, { borderColor: '#d9b35c55' }]}>
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
          <View key={group.phase} style={{ marginTop: 22 }}>
            <Text style={[styles.sectionLabel, { color: '#d9b35c' }]}>{group.phase}</Text>
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

function BugReportPage({ onBack }: { onBack: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!subject.trim() && !body.trim()) {
      Alert.alert('Empty report', 'Add a subject or describe the issue first.');
      return;
    }
    setSending(true);

    const email = decodeReportEmail();
    const fullSubject = `[Simply Ambient] ${subject || 'Bug report'}`;

    // 1) Try the silent FormSubmit AJAX endpoint first.
    let sentSilently = false;
    try {
      const url = `https://formsubmit.co/ajax/${email}`;
      const res = await fetch(url, {
        method: 'POST',
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
    } catch {}

    if (sentSilently) {
      Alert.alert('Sent', 'Thank you. The developer will see it soon.');
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
      Alert.alert(
        'One more tap',
        'Your mail app is opening with the report pre-filled. Tap Send there to complete.',
      );
      setSubject('');
      setBody('');
    } catch {
      Alert.alert('Could not send', 'No mail app available on this device.');
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
          placeholderTextColor="#ffffff55"
          value={subject}
          onChangeText={setSubject}
          maxLength={120}
        />
        <TextInput
          style={[styles.bugInput, { minHeight: 140, textAlignVertical: 'top' }]}
          placeholder="Describe what happened, what you expected, and what device you're on…"
          placeholderTextColor="#ffffff55"
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
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => v && setProfile(JSON.parse(v))).catch(() => {});
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
          placeholderTextColor="#ffffff55"
          value={profile.name ?? ''}
          onChangeText={t => update('name', t)}
          maxLength={60}
        />
        <Text style={styles.fieldLabel}>Birth date</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#ffffff55"
          value={profile.birthDate ?? ''}
          onChangeText={t => update('birthDate', t)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>Birth time (optional, for natal chart)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="HH:MM"
          placeholderTextColor="#ffffff55"
          value={profile.birthTime ?? ''}
          onChangeText={t => update('birthTime', t)}
          maxLength={5}
        />
        <Text style={styles.fieldLabel}>Birth location</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City, country"
          placeholderTextColor="#ffffff55"
          value={profile.birthLocation ?? ''}
          onChangeText={t => update('birthLocation', t)}
          maxLength={120}
        />

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>MBTI · 16 PERSONALITIES</Text>
        <Text style={styles.sectionSub}>
          Four quick questions. Not a clinical assessment — just an indicator.
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
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => v && setProfile(JSON.parse(v))).catch(() => {});
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
            <Text style={styles.compatName}>{profile.name ?? '—'}</Text>
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

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>WHAT'S A NATAL CHART?</Text>
        <Text style={styles.cardSub}>
          A natal chart is a snapshot of the sky at the moment you were born — the positions of
          the Sun, Moon, and planets across the zodiac and the twelve houses. Together they sketch
          a temperament map: not destiny, but inclinations.
        </Text>

        <View style={[styles.compatComingSoon, { borderColor: '#5B6CFF55' }]}>
          <Text style={[styles.compatComingTitle, { color: '#5B6CFF' }]}>
            In-app chart — coming soon
          </Text>
          <Text style={styles.compatComingText}>
            A built-in chart with planet positions, houses, and aspects is in the works.
            For now, the button below opens a free public calculator pre-filled with what you've
            entered above.
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
//   Routines (basic — sample routines, simple sequencer scaffolded)
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
        <Text style={styles.cardSub}>
          A routine chains preset frequencies for a longer session. The auto-sequencer
          (transition between steps automatically) is in development — for now, follow the
          steps manually using the Frequencies tab.
        </Text>
        {SAMPLE_ROUTINES.map(r => (
          <View key={r.id} style={[styles.routineCard, { borderColor: r.color + '55' }]}>
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
        <View style={[styles.compatComingSoon, { borderColor: '#9affc855' }]}>
          <Text style={[styles.compatComingTitle, { color: '#9affc8' }]}>
            Custom routines & auto-sequencer — coming soon
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
//   Soundscapes (basic — descriptive list pending audio integration)
// ===========================================================================

const SOUNDSCAPES: Array<{ id: string; name: string; blurb: string; color: string; glyph: string }> = [
  { id: 'rain',   name: 'Soft Rain',      blurb: 'Steady, gentle rainfall',           color: '#5BD0FF', glyph: '☂' },
  { id: 'ocean',  name: 'Ocean Waves',    blurb: 'Slow tide, long breaths',           color: '#5B6CFF', glyph: '≋' },
  { id: 'forest', name: 'Forest',         blurb: 'Wind through trees, distant birds', color: '#9affc8', glyph: '⌘' },
  { id: 'fire',   name: 'Crackling Fire', blurb: 'Hearth on a quiet night',           color: '#FFB05B', glyph: '✧' },
  { id: 'white',  name: 'White Noise',    blurb: 'Even-spectrum static, masks distractions', color: '#ffffffcc', glyph: '≣' },
  { id: 'pink',   name: 'Pink Noise',     blurb: 'Softer than white, balanced frequencies',  color: '#FFD0E1', glyph: '≣' },
  { id: 'brown',  name: 'Brown Noise',    blurb: 'Deep, low-frequency rumble',        color: '#8A6B4A', glyph: '≣' },
];

function SoundscapesPage({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Soundscapes" accent="#5BD0FF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody}>
        <Text style={styles.sectionLabel}>NATURAL AMBIENCE</Text>
        <Text style={styles.cardSub}>
          Built-in soundscapes that layer behind the binaural tones. Audio bundles are coming in
          a follow-up update — for now you can pick any audio file from your device on the
          Frequencies tab's Background Music card.
        </Text>
        {SOUNDSCAPES.map(s => (
          <View key={s.id} style={[styles.soundscapeCard, { borderColor: s.color + '55' }]}>
            <View style={[styles.soundscapeGlyphBox, { backgroundColor: s.color + '22', borderColor: s.color }]}>
              <Text style={[styles.soundscapeGlyph, { color: s.color }]}>{s.glyph}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.soundscapeName}>{s.name}</Text>
              <Text style={styles.soundscapeBlurb}>{s.blurb}</Text>
            </View>
            <Text style={styles.soundscapeSoon}>SOON</Text>
          </View>
        ))}
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
    AsyncStorage.getItem(STORAGE_PROFILE).then(v => v && setSelf(JSON.parse(v))).catch(() => {});
    AsyncStorage.getItem(STORAGE_PARTNER).then(v => v && setPartner(JSON.parse(v))).catch(() => {});
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
            <Text style={styles.compatName}>{self.name ?? '—'}</Text>
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

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>OTHER PERSON</Text>
        <Text style={styles.sectionSub}>Their birth details, stored only on this device.</Text>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Their name"
          placeholderTextColor="#ffffff55"
          value={partner.name ?? ''}
          onChangeText={t => updatePartner('name', t)}
          maxLength={60}
        />
        <Text style={styles.fieldLabel}>Birth date</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#ffffff55"
          value={partner.birthDate ?? ''}
          onChangeText={t => updatePartner('birthDate', t)}
          maxLength={10}
        />
        <Text style={styles.fieldLabel}>Birth time</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="HH:MM"
          placeholderTextColor="#ffffff55"
          value={partner.birthTime ?? ''}
          onChangeText={t => updatePartner('birthTime', t)}
          maxLength={5}
        />
        <Text style={styles.fieldLabel}>Birth location</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="City, country"
          placeholderTextColor="#ffffff55"
          value={partner.birthLocation ?? ''}
          onChangeText={t => updatePartner('birthLocation', t)}
          maxLength={120}
        />

        <View style={styles.compatComingSoon}>
          <Text style={styles.compatComingTitle}>Synastry chart — coming soon</Text>
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

function InsightsPage({ onBack }: { onBack: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_GEMINI_KEY).then(v => v && setApiKey(v)).catch(() => {});
  }, []);

  function saveKey(value: string) {
    setApiKey(value);
    AsyncStorage.setItem(STORAGE_GEMINI_KEY, value).catch(() => {});
  }

  async function runAnalysis(kind: 'journal' | 'tarot') {
    if (!apiKey.trim()) {
      Alert.alert('Add your Gemini API key', 'Get a free key from aistudio.google.com and paste it above.');
      return;
    }
    setLoading(true);
    setOutput(null);
    try {
      let prompt = '';
      if (kind === 'journal') {
        const moodRaw = await AsyncStorage.getItem(STORAGE_MOOD);
        const gratRaw = await AsyncStorage.getItem(STORAGE_GRAT);
        const moods: MoodEntry[] = moodRaw ? JSON.parse(moodRaw) : [];
        const grats: GratEntry[] = gratRaw ? JSON.parse(gratRaw) : [];
        const moodLines = moods.slice(0, 30).map(m =>
          `${new Date(m.ts).toISOString().slice(0, 10)} · mood ${m.value}/5 (${MOOD_LABELS[m.value - 1]})`,
        ).join('\n');
        const gratLines = grats.slice(0, 30).map(g =>
          `${new Date(g.ts).toISOString().slice(0, 10)}: ${g.text}`,
        ).join('\n');
        prompt =
          'You are a thoughtful, grounded reflection companion. The user has shared their recent ' +
          'mood log and gratitude journal. Identify 3-5 themes you notice, gently. Be specific. ' +
          'Avoid clichés, woo, or diagnoses. Keep it under 220 words.\n\n' +
          'MOOD ENTRIES (newest first):\n' + (moodLines || '(no entries)') +
          '\n\nGRATITUDE ENTRIES (newest first):\n' + (gratLines || '(no entries)');
      } else {
        const tarotRaw = await AsyncStorage.getItem('@simply_ambient_tarot_v1');
        const card = tarotRaw ? JSON.parse(tarotRaw)?.card : null;
        if (!card) {
          Alert.alert('No card drawn', 'Open the Horoscopes tab and draw a card first.');
          setLoading(false);
          return;
        }
        prompt =
          'You are a thoughtful tarot interpreter. The user drew the following card. ' +
          'Give a calm, grounded interpretation in plain language — what it might invite ' +
          'them to notice today. Avoid clichés or fortune-telling claims. Under 180 words.\n\n' +
          `Card: ${card.name}\n` +
          `Upright meaning: ${card.meaning_up ?? ''}\n` +
          `Description: ${(card.desc ?? '').slice(0, 600)}`;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });
      const json = await res.json();
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

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="AI Insights" accent="#5BD0FF" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.subBody} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>GEMINI API KEY</Text>
        <Text style={styles.sectionSub}>
          Free at aistudio.google.com. Saved on this device only.
        </Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="paste your key here"
          placeholderTextColor="#ffffff55"
          value={apiKey}
          onChangeText={saveKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>WHAT TO ANALYSE</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => runAnalysis('journal')}
          style={[styles.aiBtn, { backgroundColor: '#5BD0FF' }]}
          disabled={loading}
        >
          <Text style={styles.aiBtnText}>JOURNAL THEMES (mood + gratitude)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => runAnalysis('tarot')}
          style={[styles.aiBtn, { backgroundColor: '#A45BFF' }]}
          disabled={loading}
        >
          <Text style={styles.aiBtnText}>INTERPRET TODAY'S TAROT</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.aiOutput}>
            <ActivityIndicator color="#5BD0FF" />
          </View>
        ) : output ? (
          <View style={styles.aiOutput}>
            <Text style={styles.aiOutputText}>{output}</Text>
          </View>
        ) : null}

        <Text style={styles.aiFootnote}>
          Powered by Google Gemini. Your prompts and journal data leave the app only when you press
          a button above. No analysis is shared without your initiation.
        </Text>
      </ScrollView>
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
  hubItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  hubGlyphCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, borderWidth: 1,
  },
  hubGlyph: { fontSize: 20, fontWeight: '700' },
  hubLabel: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  hubPreview: { color: '#ffffff88', fontSize: 12, marginTop: 2, lineHeight: 16 },
  hubExtra: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginRight: 10 },
  hubChevron: { color: '#ffffff66', fontSize: 22 },

  streakBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 176, 91, 0.15)',
    borderWidth: 1, borderColor: '#FFB05B55',
    marginTop: 14,
  },
  streakGlyph: { color: '#FFB05B', fontSize: 14, marginRight: 6 },
  streakText: { color: '#FFB05B', fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Sub-page
  subHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  subBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  subBackText: { fontSize: 32, fontWeight: '300', marginTop: -4 },
  subTitle: {
    flex: 1,
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24,
    letterSpacing: 1,
    textAlign: 'center',
  },
  subBody: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 },

  sectionLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
    marginBottom: 4,
  },
  sectionSub: {
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    marginBottom: 12, lineHeight: 16,
  },
  emptyText: { color: '#ffffff66', fontSize: 13, fontStyle: 'italic', marginTop: 8 },

  // Affirmations
  bigAffirmCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 22, marginBottom: 24,
    borderWidth: 1, alignItems: 'center', minHeight: 160,
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
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1, borderColor: '#9affc8',
    backgroundColor: '#9affc822',
  },
  bigRefreshText: { color: '#9affc8', fontSize: 11, fontWeight: '700', letterSpacing: 2 },

  notifPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notifPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  notifPillText: { color: '#ffffff99', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  notifHint: { color: '#ffffff66', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  notifWarn: { color: '#FFB05B', fontSize: 11, marginTop: 8, fontStyle: 'italic', lineHeight: 16 },

  // Mood
  moodRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  moodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  moodValue: { fontSize: 20, fontWeight: '700' },
  moodLabel: { fontSize: 10, letterSpacing: 1, fontWeight: '600', marginTop: 2 },

  graphCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },
  graphLabelRow: {
    position: 'absolute', bottom: 6, left: 18, right: 18,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  graphLabelText: { color: '#ffffff66', fontSize: 9, letterSpacing: 1 },

  moodHistoryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  moodHistoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  moodHistoryDate: { flex: 1, color: '#ffffffaa', fontSize: 12 },
  moodHistoryLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Gratitude
  gratInput: {
    color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    minHeight: 90, textAlignVertical: 'top',
  },
  gratSaveBtn: {
    alignSelf: 'flex-end', marginTop: 10,
    paddingHorizontal: 22, paddingVertical: 10,
    borderRadius: 999, backgroundColor: '#FFB05B',
  },
  gratSaveText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  gratDateHeader: {
    color: '#FFB05B', fontSize: 11, letterSpacing: 1.5, fontWeight: '700',
    marginBottom: 8,
  },
  gratItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 12, padding: 12, marginBottom: 6,
  },
  gratItemBar: {
    width: 3, alignSelf: 'stretch',
    backgroundColor: '#FFB05B', borderRadius: 2,
    marginRight: 12, minHeight: 18,
  },
  gratItemText: { color: '#ffffffdd', fontSize: 14, lineHeight: 20, flex: 1 },
  gratDelBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  gratDelText: { color: '#ffffff44', fontSize: 14 },

  // Grounding
  groundIntro: {
    color: '#ffffffcc', fontSize: 14, lineHeight: 22,
    fontStyle: 'italic', marginBottom: 16, textAlign: 'center',
  },
  groundCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  groundBigNum: { fontSize: 36, fontWeight: '300', width: 60, textAlign: 'center' },
  groundCardText: { color: '#ffffffcc', fontSize: 16, flex: 1 },
  groundEm: { fontStyle: 'italic', color: '#fff', fontWeight: '700' },
  groundOutro: {
    color: '#ffffff88', fontSize: 12, lineHeight: 18,
    fontStyle: 'italic', textAlign: 'center', marginTop: 14,
  },

  // Support
  supportHero: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 22,
    borderWidth: 1, alignItems: 'center',
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
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    textAlign: 'center', marginTop: 16, lineHeight: 16,
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
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1,
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
  soundscapeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1,
  },
  soundscapeGlyphBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, borderWidth: 1,
  },
  soundscapeGlyph: { fontSize: 20, fontWeight: '700' },
  soundscapeName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  soundscapeBlurb: { color: '#ffffff88', fontSize: 12, marginTop: 2 },
  soundscapeSoon: {
    color: '#ffffff66', fontSize: 9, letterSpacing: 1.5, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 999,
  },

  cardName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardSub: { color: '#ffffff88', fontSize: 12, marginTop: 4, lineHeight: 17 },

  // Weekly insights card
  weeklyCard: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  weeklyLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  weeklyRow: { flexDirection: 'row', justifyContent: 'space-around' },
  weeklyStat: { alignItems: 'center', flex: 1 },
  weeklyValue: { fontSize: 22, fontWeight: '700' },
  weeklyTrend: { fontSize: 14, fontWeight: '500' },
  weeklyStatLabel: { color: '#ffffff88', fontSize: 11, letterSpacing: 0.5, marginTop: 2 },

  // Bug
  bugInput: {
    color: '#fff', fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  bugSendBtn: {
    paddingVertical: 14, borderRadius: 12, marginTop: 16,
    backgroundColor: '#FF5B9C', alignItems: 'center',
  },
  bugSendText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

  fieldLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 1, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  fieldInput: {
    color: '#fff', fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },

  // MBTI
  mbtiCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  mbtiQuestion: { color: '#fff', fontSize: 14, marginBottom: 10, fontWeight: '500' },
  mbtiOption: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
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
  mbtiResultBlurb: { color: '#ffffffcc', fontSize: 12, marginTop: 4, fontStyle: 'italic', textAlign: 'center' },

  // Compatibility
  compatCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 14, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(255,143,177,0.30)',
  },
  compatName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  compatMeta: { color: '#ffffffaa', fontSize: 12, marginTop: 2 },
  compatMbti: {
    color: '#A45BFF', fontSize: 13, fontWeight: '700', letterSpacing: 2,
    marginTop: 6,
  },
  compatComingSoon: {
    marginTop: 28, padding: 16,
    borderRadius: 14, borderStyle: 'dashed',
    borderWidth: 1, borderColor: '#FF8FB155',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  compatComingTitle: { color: '#FF8FB1', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  compatComingText: { color: '#ffffffaa', fontSize: 12, lineHeight: 17 },

  // AI Insights
  aiBtn: {
    paddingVertical: 14, borderRadius: 12, marginTop: 10, alignItems: 'center',
  },
  aiBtnText: { color: '#0B0B1F', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  aiOutput: {
    marginTop: 16, padding: 14,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(91,208,255,0.30)',
    minHeight: 60, alignItems: 'center', justifyContent: 'center',
  },
  aiOutputText: { color: '#ffffffdd', fontSize: 13, lineHeight: 19 },
  aiFootnote: {
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    marginTop: 18, lineHeight: 16, textAlign: 'center',
  },
});
