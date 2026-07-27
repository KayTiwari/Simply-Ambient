import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioSource,
  type AudioPlayer,
} from 'expo-audio';
import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {
  Waveform,
  MusicNotes,
  CloudRain,
  Waves,
  TreeEvergreen,
  Campfire,
  Drop,
  WaveSquare,
  WaveSine,
  WaveTriangle,
  Wind,
  MoonStars,
  CloudLightning,
  AirplaneTilt,
  Train,
  Play,
  Pause,
  type IconProps,
} from 'phosphor-react-native';

// expo-notifications was removed from Expo Go in SDK 53. We can still call its
// APIs in a development / standalone build, but in Expo Go we soft no-op so
// the user can still toggle the preference without errors.
const IS_EXPO_GO = Constants.appOwnership === 'expo';
import {
  useFonts,
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import { Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import * as Sentry from '@sentry/react-native';

// Sentry crash reporting. The DSN is a write-only public identifier, safe to
// commit per Sentry's docs, it is not a secret. (The SENTRY_AUTH_TOKEN used for
// source-map upload IS secret and lives only in EAS env vars / .env.local.)
Sentry.init({
  dsn: 'https://b666bcf55a78f568c3ed434cb8e55cef@o4511389012852736.ingest.us.sentry.io/4511389016195072',
  // Dev-session noise (Metro red screens, hot-reload parse errors) stays out
  // of the production crash bucket.
  enabled: !__DEV__,
  sendDefaultPii: false,
  maxBreadcrumbs: 0,
  enableAutoSessionTracking: false,
  // Keep reports deliberately narrow. Stack frames plus basic app/device/OS
  // context are enough to diagnose a crash; free-form fields could contain a
  // journal value, selected sign, imported filename, or service response.
  beforeSend(event) {
    delete event.message;
    delete event.logentry;
    delete event.user;
    delete event.request;
    delete event.extra;
    delete event.tags;
    delete event.breadcrumbs;
    delete event.transaction;
    delete event.transaction_info;
    delete event.fingerprint;
    if (event.contexts) {
      Object.keys(event.contexts).forEach(key => {
        if (!['app', 'device', 'os'].includes(key)) delete event.contexts?.[key];
      });
    }
    const stripFrameContext = (frame: Record<string, unknown>) => {
      delete frame.vars;
      delete frame.pre_context;
      delete frame.context_line;
      delete frame.post_context;
    };
    event.exception?.values?.forEach(value => {
      delete value.value;
      value.stacktrace?.frames?.forEach(frame => stripFrameContext(frame as unknown as Record<string, unknown>));
    });
    event.threads?.values?.forEach(thread => {
      thread.stacktrace?.frames?.forEach(frame => stripFrameContext(frame as unknown as Record<string, unknown>));
    });
    return event;
  },
  // Default breadcrumbs would add console lines and network URLs, and the
  // horoscope URL embeds the user's sign, so drop breadcrumbs entirely.
  beforeBreadcrumb() {
    return null;
  },
  // Crash reports only. The store listing promises no analytics, so keep
  // performance tracing off.
  tracesSampleRate: 0,
  enableNativeCrashHandling: true,
});

import BreathworkView from './BreathworkView';
import ChakrasView from './ChakrasView';
import HoroscopesView from './HoroscopesView';
import MoreView, {
  type NotifPref,
  type RoutinePathPayload,
  type RoutinePathStep,
} from './MoreView';
import OnboardingView from './OnboardingView';
import {
  DEFAULT_PINNED_MORE_PAGES,
  MORE_PAGE_META,
  isPinnableMorePage,
  resolvePinnedMorePages,
  type MorePageId,
  type PinnableMorePageId,
} from './moreNavigation';
import {
  AmbientSurface,
  AmbientVeil,
  EdgeFadeCarousel,
  EditorialHeader,
  EditorialSection,
  HeaderGlass,
} from './AmbientUI';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Themed in-app dialogs. react-native-web ships Alert.alert as an empty stub,
// and even on native a system alert clashes with the app's look, so notify()
// and confirmAction() route to the DialogHost mounted in App (a toast and a
// styled confirm modal). If the host is not mounted yet, they fall back to
// the platform dialogs so a message is never dropped.
type ToastRequest = { title: string; message?: string };
type ConfirmRequest = {
  title: string;
  message: string;
  confirmText: string;
  destructive: boolean;
  onConfirm: () => void;
};
let toastSink: ((t: ToastRequest) => void) | null = null;
let confirmSink: ((c: ConfirmRequest) => void) | null = null;

export function notify(title: string, message?: string) {
  if (toastSink) {
    toastSink({ title, message });
    return;
  }
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  destructive: boolean = true,
) {
  if (confirmSink) {
    confirmSink({ title, message, confirmText, destructive, onConfirm });
    return;
  }
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}

function DialogHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastRequest | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    toastSink = (t) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(t);
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      toastTimerRef.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 260, useNativeDriver: true })
          .start(({ finished }) => { if (finished) setToast(null); });
      }, 2600);
    };
    confirmSink = (c) => setConfirm(c);
    return () => {
      toastSink = null;
      confirmSink = null;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <>
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toastWrap, { top: insets.top + 52, opacity: toastOpacity }]}
        >
          <View style={styles.toastCard}>
            <Text style={styles.toastTitle}>{toast.title}</Text>
            {toast.message ? <Text style={styles.toastMessage}>{toast.message}</Text> : null}
          </View>
        </Animated.View>
      ) : null}
      <Modal
        visible={confirm != null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.confirmCard]}>
            <Text style={styles.modalTitle}>{confirm?.title}</Text>
            <Text style={[styles.modalSub, styles.confirmBody]}>{confirm?.message}</Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setConfirm(null)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, confirm?.destructive ? styles.modalBtnDanger : styles.modalBtnPrimary]}
                onPress={() => {
                  const c = confirm;
                  setConfirm(null);
                  c?.onConfirm();
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={confirm?.confirmText}
              >
                <Text style={confirm?.destructive ? styles.modalBtnDangerText : styles.modalBtnPrimaryText}>
                  {confirm?.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// MIN_HZ / MAX_HZ / clampHz / comfortableCarrier / btoaFallback live in
// lib/binauralMath so they can be unit-tested in plain Node without React
// Native deps. See __tests__/binauralMath.test.ts.
import {
  MIN_HZ,
  MAX_HZ,
  clampHz,
  comfortableCarrier,
  splitBeatCarrier,
  btoaFallback,
} from './lib/binauralMath';
import { NOTIF_AFFIRMATIONS } from './lib/affirmations';
import {
  appOwnedDocumentPickerCacheUri,
  removeAndVerifyAppStorage,
} from './lib/appDataWipe';
import { removeGeminiApiKey } from './lib/geminiKeyStorage';
import { recordAppOpen, recordSessionCompleted } from './lib/rateApp';
import { CHAKRAS, DOSHAS, ZODIAC, type BandKey, type Chakra, type Dosha, type Zodiac } from './lib/content';
const STORAGE_KEY = '@binaural_user_presets_v1';
const STORAGE_KEY_ZODIAC = '@simply_ambient_zodiac_v1';
const STORAGE_KEY_STREAK = '@simply_ambient_streak_v1';
export const STORAGE_KEY_PROFILE = '@simply_ambient_profile_v1';
export const STORAGE_KEY_PARTNER = '@simply_ambient_partner_v1';
export const STORAGE_KEY_GEMINI = '@simply_ambient_gemini_key_v1';
export const STORAGE_KEY_ONBOARDED = '@simply_ambient_onboarded_v1';

function todayKey(d: Date = new Date()): string {
  // Local date parts, not toISOString(): users experience local days, and UTC
  // keys reset streaks for anyone west of UTC practicing in the evening.
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Record any kind of practice / engagement so the streak counter updates.
// No-op if already recorded today.
export async function recordActivity() {
  try {
    const today = todayKey();
    const raw = await AsyncStorage.getItem(STORAGE_KEY_STREAK);
    let lastDate = '';
    let count = 0;
    if (raw) {
      try { ({ lastDate, count } = JSON.parse(raw)); } catch {}
    }
    if (lastDate === today) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = todayKey(y);
    const next = { lastDate: today, count: lastDate === yKey ? count + 1 : 1 };
    await AsyncStorage.setItem(STORAGE_KEY_STREAK, JSON.stringify(next));
  } catch {}
}

// Returns the current streak (0 if last activity was before yesterday).
export async function getStreak(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_STREAK);
    if (!raw) return 0;
    const { lastDate, count } = JSON.parse(raw) as { lastDate: string; count: number };
    const today = todayKey();
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = todayKey(y);
    return lastDate === today || lastDate === yKey ? count : 0;
  } catch {
    return 0;
  }
}
const DEFAULT_LEFT = 200;
const DEFAULT_RIGHT = 210;
// Upper bound for the direct beat slider. Gamma work tops out around 40 Hz;
// larger separations are still reachable via the per-ear sliders.
const MAX_BEAT = 40;
const TONE_FILE_PATH = `${FileSystem.cacheDirectory}binaural-tone.wav`;
const SOUNDSCAPE_FILE_PREFIX = `${FileSystem.cacheDirectory}simply-ambient-soundscape-v4-`;
const SLIDE_THROTTLE_MS = 220;
const PALETTE_CROSSFADE_MS = 2600;

const QUOTES = [
  'Thoughts become things',
  'Tune in. Receive.',
  'What you seek is seeking you',
  'Energy flows where attention goes',
  'You attract what you vibrate',
  'Be still, and know',
  'As within, so without',
  'Breathe in possibility',
  'The universe hums in you',
  'Stillness speaks',
  'You are the frequency',
  'Let it come to you',
  'Trust the unfolding',
  'The wave returns to the sea',
  'Quiet mind, open door',
  'Everything is vibration',
  'Begin where you are',
  'What you water grows',
  'The moon keeps her own time',
  'Softness is strength',
  'You already carry the answer',
  'Slow is sacred',
  'Listen beneath the noise',
  'Intention is a seed',
  'Rest is a practice',
  'The breath knows the way',
  'Presence is the gift',
  'Let the tone carry you',
  'Gratitude tunes the heart',
  'You are allowed to begin again',
  'The current knows the shore',
  'Release what is heavy',
  'Attention is devotion',
  'Calm is contagious',
  'Your pace is the right pace',
  'Roots first, then branches',
  'The night sky is patient',
  'Ask, then listen',
  'Small rituals, deep change',
  'You become what you practice',
  'Silence is full',
  'Drift toward what feels true',
  'The body keeps the rhythm',
  'Each exhale is a release',
  'Wonder is a compass',
  'Hold the vision lightly',
  'What resonates, stays',
  'Peace begins in the ear',
  'Tend your inner fire',
  'The path reveals itself walking',
  'Abundance notices attention',
  'You are already whole',
  'Let today be enough',
  'Clarity loves stillness',
  'Even stars rest in the day',
  'Sound becomes sanctuary',
  'Your energy introduces you',
  'Receive without grasping',
  'The quiet hours belong to you',
  'All tides turn',
  'Anchor in this breath',
  'Imagination is rehearsal',
  'Kindness echoes',
  'Your attention writes the story',
  'Bloom where the light lands',
  'The heart hears first',
  'Steady drops carve stone',
  'Invite what you long for',
  'The cosmos is listening',
  'Move like water',
  'What is meant will remain',
  'Practice makes presence',
  'The signal is beneath the static',
  'Warmth travels outward',
  'Your calm is a lighthouse',
  'Turn toward the light you have',
  'Rhythm is remembering',
  'The seed trusts the dark',
  'Let the mind settle like snow',
  'Every frequency finds its ear',
  'Carry the stillness with you',
  'Hope is a discipline',
  'The horizon moves with you',
  'Being here is the arriving',
  'Old stories can be set down',
  'Attune before you act',
  'The gentle way is still a way',
  'Notice what notices you',
  'Breathe out what is finished',
  'Morning always finds the mountain',
  'You tune the instrument you are',
  'Grace favors the unhurried',
  'The inner weather can clear',
  'Whisper your intentions daily',
  'Let resonance choose the room',
  'Every cycle completes itself',
  'Draw the future near, softly',
  'The present is the portal',
  'Currents run deeper than waves',
  'Honor the pause',
  'What you bless, blesses back',
  'Night tunes the day',
  'Your becoming is already underway',
  'Stay close to what enlivens you',
  'The echo answers the call',
  'Rivers never argue with stones',
  'Center first, then move',
  'Light arrives without effort',
  'The soft gaze sees more',
];

type BuiltInPreset = {
  id: string;
  band: BandKey;
  name: string;
  range: string;
  beatHz: number;
  carrier: number;
  color: string;
  blurb: string;
};

type UserPreset = {
  id: string;
  name: string;
  leftHz: number;
  rightHz: number;
  createdAt: number;
};

type TuningPreset = {
  id: string;
  hz: number;
  name: string;
  intent: string;
  blurb: string;
  origin: 'solfeggio' | 'natural' | 'cosmic' | 'archaeo' | 'scientific';
};

type SoundscapeKey =
  | 'rain'
  | 'ocean'
  | 'forest'
  | 'stream'
  | 'fire'
  | 'white'
  | 'pink'
  | 'brown'
  | 'breeze'
  | 'night'
  | 'thunder'
  | 'cabin'
  | 'train';

type Soundscape = {
  id: SoundscapeKey;
  name: string;
  blurb: string;
  Icon: React.ComponentType<IconProps>;
  color: string;
};

const SOUNDSCAPES: Soundscape[] = [
  { id: 'rain',   name: 'Soft Rain',      blurb: 'A long, gentle rain bed without the umbrella-plastic loop.', color: '#8FB8DE',   Icon: CloudRain },
  { id: 'ocean',  name: 'Ocean Tide',     blurb: 'Long swells for downshifting into sleep or recovery.',      color: '#8F97DE',   Icon: Waves },
  { id: 'forest', name: 'Forest Air',     blurb: 'Birdsong canopy for light, living background texture.', color: '#9DC7AC', Icon: TreeEvergreen },
  { id: 'stream', name: 'Trickling Stream', blurb: 'Small moving water with birds tucked into the distance.',  color: '#7FC6C9',   Icon: Drop },
  { id: 'fire',   name: 'Hearth',         blurb: 'A campfire bed with natural ember crackle.',            color: '#E0A470',   Icon: Campfire },
  { id: 'white',  name: 'White Noise',    blurb: 'Even masking for busy rooms and brittle silence.',          color: '#FFFFFF', Icon: WaveSquare },
  { id: 'pink',   name: 'Pink Noise',     blurb: 'Softer masking with less edge than white noise.',           color: '#E0BFCB',   Icon: WaveSine },
  { id: 'brown',  name: 'Brown Noise',    blurb: 'Low, dense, and grounding for a heavy nervous system.',     color: '#8A6B4A',   Icon: WaveTriangle },
  { id: 'breeze', name: 'Night Breeze',   blurb: 'A soft, low-passed current that rises and settles slowly.',  color: '#A7C7C1',   Icon: Wind },
  { id: 'night',  name: 'Summer Night',   blurb: 'Quiet night air with crickets softened into the distance.', color: '#AFA6DA',   Icon: MoonStars },
  { id: 'thunder', name: 'Distant Thunder', blurb: 'A misty rain bed with low rumbles far beyond the room.',   color: '#8897B8',   Icon: CloudLightning },
  { id: 'cabin',  name: 'Airplane Cabin', blurb: 'Steady low cabin air for private focus while everything moves.', color: '#9FB4C7', Icon: AirplaneTilt },
  { id: 'train',  name: 'Night Train',    blurb: 'Muted rail sway and low motion for a slow journey inward.',  color: '#B3A2C2',   Icon: Train },
];

const BUNDLED_SOUNDSCAPES: Partial<Record<SoundscapeKey, number>> = {
  rain: require('./assets/soundscapes/soft-rain.mp3'),
  ocean: require('./assets/soundscapes/ocean-waves.mp3'),
  forest: require('./assets/soundscapes/forest-birdsong.mp3'),
  stream: require('./assets/soundscapes/trickling-stream.mp3'),
  fire: require('./assets/soundscapes/hearth.mp3'),
  white: require('./assets/soundscapes/white-noise.mp3'),
  thunder: require('./assets/soundscapes/distant-thunder.mp3'),
};

const SOUNDSCAPE_GAIN: Record<SoundscapeKey, number> = {
  // Bundled recordings are level-matched near -34 LUFS at a 100% slider.
  // Broadband noise receives the lowest gain so switching layers never jolts.
  rain: 0.48,
  ocean: 0.51,
  forest: 0.09,
  stream: 0.65,
  fire: 1,
  white: 0.025,
  pink: 0.40,
  brown: 0.50,
  breeze: 1,
  night: 0.65,
  thunder: 0.42,
  cabin: 0.90,
  train: 1,
};

function effectiveSoundscapeVolume(kind: SoundscapeKey, volume: number) {
  return Math.max(0, Math.min(1, volume)) * SOUNDSCAPE_GAIN[kind];
}

type CricketEvent = readonly [start: number, duration: number, pulseHz: number, amplitude: number];

const NIGHT_CRICKET_LOOP_SECONDS = 16;
const NIGHT_CRICKETS_LEFT: readonly CricketEvent[] = [
  [0.62, 0.24, 29, 0.76], [2.05, 0.18, 31, 0.58], [3.48, 0.30, 27, 0.92],
  [5.82, 0.21, 32, 0.65], [7.24, 0.27, 29, 0.83], [9.63, 0.19, 33, 0.55],
  [11.18, 0.25, 28, 1], [13.66, 0.22, 30, 0.71], [15.02, 0.20, 32, 0.60],
];
const NIGHT_CRICKETS_RIGHT: readonly CricketEvent[] = [
  [1.16, 0.20, 31, 0.62], [2.72, 0.28, 28, 0.88], [4.46, 0.18, 34, 0.54],
  [6.31, 0.25, 29, 0.78], [8.11, 0.21, 32, 0.68], [10.34, 0.29, 27, 0.96],
  [12.24, 0.19, 33, 0.57], [14.19, 0.26, 29, 0.81],
];

function cricketEnvelope(t: number, events: readonly CricketEvent[]) {
  const cycle = ((t % NIGHT_CRICKET_LOOP_SECONDS) + NIGHT_CRICKET_LOOP_SECONDS)
    % NIGHT_CRICKET_LOOP_SECONDS;
  for (const [start, duration, pulseHz, amplitude] of events) {
    if (cycle < start) break;
    const x = cycle - start;
    if (x >= duration) continue;
    const group = Math.sin(Math.PI * x / duration) ** 2;
    const pulse = (x * pulseHz) % 1;
    const duty = 0.46;
    const syllable = pulse < duty ? Math.sin(Math.PI * pulse / duty) ** 2 : 0;
    return amplitude * group * syllable;
  }
  return 0;
}

function summerNightSample(t: number, white: number, pink: number, brown: number): [number, number] {
  const twoPi = Math.PI * 2;
  const envLeft = cricketEnvelope(t, NIGHT_CRICKETS_LEFT);
  const envRight = cricketEnvelope(t, NIGHT_CRICKETS_RIGHT);
  const carrierLeft = envLeft > 0 ? (
    Math.sin(twoPi * 3260 * t + 0.14 * Math.sin(twoPi * 11.3 * t)) * 0.52
    + Math.sin(twoPi * 3291 * t + 1.1) * 0.29
    + Math.sin(twoPi * 3227 * t + 0.45) * 0.19
    + white * 0.12
  ) : 0;
  const carrierRight = envRight > 0 ? (
    Math.sin(twoPi * 3820 * t + 0.13 * Math.sin(twoPi * 9.7 * t)) * 0.50
    + Math.sin(twoPi * 3857 * t + 0.7) * 0.31
    + Math.sin(twoPi * 3786 * t + 1.65) * 0.19
    + white * 0.12
  ) : 0;
  const bed = pink * 0.032 + brown * 0.007;
  const colonyLeft = envLeft * carrierLeft * 0.28;
  const colonyRight = envRight * carrierRight * 0.26;
  return [
    bed + colonyLeft + colonyRight * 0.24,
    bed * 0.90 + colonyRight + colonyLeft * 0.22,
  ];
}

export function todaysSign(date: Date = new Date()): Zodiac {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  for (const z of ZODIAC) {
    if (z.startMonth === z.endMonth) {
      if (m === z.startMonth && d >= z.startDay && d <= z.endDay) return z;
    } else if (z.startMonth < z.endMonth) {
      if ((m === z.startMonth && d >= z.startDay) || (m === z.endMonth && d <= z.endDay)) return z;
    } else {
      // wraps year (Capricorn)
      if ((m === z.startMonth && d >= z.startDay) || (m === z.endMonth && d <= z.endDay)) return z;
    }
  }
  return ZODIAC[0];
}

const PRESETS: BuiltInPreset[] = [
  { id: 'delta',    band: 'delta', name: 'Delta',    range: '0.5–4 Hz',  beatHz: 2,  carrier: 200, color: '#8F97DE', blurb: 'Surrender · Restoration' },
  { id: 'theta',    band: 'theta', name: 'Theta',    range: '4–8 Hz',    beatHz: 6,  carrier: 200, color: '#A498E8', blurb: 'Visualize · Receive' },
  { id: 'schumann', band: 'alpha', name: 'Schumann', range: '7.83 Hz',   beatHz: 8,  carrier: 200, color: '#9DC7AC', blurb: 'Earth’s heartbeat' },
  { id: 'alpha',    band: 'alpha', name: 'Alpha',    range: '8–13 Hz',   beatHz: 10, carrier: 200, color: '#8FB8DE', blurb: 'Aligned focus · Allow' },
  { id: 'beta',     band: 'beta',  name: 'Beta',     range: '13–30 Hz',  beatHz: 18, carrier: 200, color: '#E0A470', blurb: 'Direct · Take action' },
  { id: 'gamma',    band: 'gamma', name: 'Gamma',    range: '30–100 Hz', beatHz: 40, carrier: 200, color: '#D68097', blurb: 'Insight · Knowing' },
  { id: 'gamma40',  band: 'gamma', name: 'Gamma-40', range: '40 Hz',     beatHz: 40, carrier: 250, color: '#D8A0B0', blurb: 'Memory · Clarity' },
];

type TuningOrigin = 'solfeggio' | 'natural' | 'cosmic' | 'archaeo' | 'scientific';

const TUNINGS: TuningPreset[] = [
  { id: 't111', hz: 111, name: '111 Hz', intent: 'Divine resonance',     blurb: 'Hypogeum cymatic tone',   origin: 'archaeo'    },
  { id: 't136', hz: 136, name: '136 Hz', intent: 'OM · Cosmic breath',   blurb: 'Earth orbital tone',      origin: 'cosmic'     },
  { id: 't174', hz: 174, name: '174 Hz', intent: 'Grounding',            blurb: 'Traditional association', origin: 'solfeggio'  },
  { id: 't256', hz: 256, name: '256 Hz', intent: 'Scientific C',         blurb: 'Verdi · ancient pitch',   origin: 'scientific' },
  { id: 't285', hz: 285, name: '285 Hz', intent: 'Renewal',              blurb: 'Traditional association', origin: 'solfeggio'  },
  { id: 't396', hz: 396, name: '396 Hz', intent: 'Release fear',         blurb: 'Liberation from guilt',   origin: 'solfeggio'  },
  { id: 't417', hz: 417, name: '417 Hz', intent: 'Facilitate change',    blurb: 'Undoing patterns',        origin: 'solfeggio'  },
  { id: 't432', hz: 432, name: '432 Hz', intent: 'Earth resonance',      blurb: 'Calm · Grounded tuning',  origin: 'natural'    },
  { id: 't444', hz: 444, name: '444 Hz', intent: 'Angelic tuning',       blurb: 'Companion to 528',        origin: 'natural'    },
  { id: 't528', hz: 528, name: '528 Hz', intent: 'Love · Heart',         blurb: 'Traditional association', origin: 'solfeggio'  },
  { id: 't639', hz: 639, name: '639 Hz', intent: 'Connection',           blurb: 'Relational reflection',   origin: 'solfeggio'  },
  { id: 't741', hz: 741, name: '741 Hz', intent: 'Expression',           blurb: 'Awakening · Solutions',   origin: 'solfeggio'  },
  { id: 't852', hz: 852, name: '852 Hz', intent: 'Intuition',            blurb: 'Spiritual order',         origin: 'solfeggio'  },
  { id: 't963', hz: 963, name: '963 Hz', intent: 'Divine consciousness', blurb: 'Unity · Oneness',         origin: 'solfeggio'  },
];

type Palette = {
  base: [string, string, string];
  waves: [string, string, string]; // back, middle, front colors
  accent: string;
};
const PALETTES: Record<BandKey, Palette> = {
  none:   { base: ['#1d1d2a', '#2a2a3a', '#1d1d2a'], waves: ['#2a2a3a', '#36364a', '#4a4a5e'], accent: '#9aa0b4' },
  delta:  { base: ['#0a1240', '#1a2a78', '#0a1240'], waves: ['#172056', '#243596', '#8F97DE'], accent: '#8F97DE' },
  theta:  { base: ['#1a0a3a', '#3a1276', '#1a0a3a'], waves: ['#28115a', '#4a2096', '#A498E8'], accent: '#A498E8' },
  alpha:  { base: ['#0a2a4a', '#125878', '#0a2a4a'], waves: ['#0e3458', '#206a96', '#8FB8DE'], accent: '#8FB8DE' },
  beta:   { base: ['#3a1a0a', '#76402a', '#3a1a0a'], waves: ['#502a14', '#965a3a', '#E0A470'], accent: '#E0A470' },
  gamma:  { base: ['#3a0a1a', '#76124a', '#3a0a1a'], waves: ['#5a0e2a', '#962060', '#D68097'], accent: '#D68097' },
  tuning: { base: ['#2a200a', '#5a4218', '#2a200a'], waves: ['#3a2c14', '#7a5e2a', '#d9b35c'], accent: '#d9b35c' },
  // Chakra palettes. Saturated, rainbow progression
  root:     { base: ['#1a0a0a', '#3a1a14', '#1a0a0a'], waves: ['#2a1018', '#5a2030', '#D97B72'], accent: '#D97B72' },
  sacral:   { base: ['#1a1208', '#3a2a14', '#1a1208'], waves: ['#2a1c10', '#5a3a20', '#DE9C6B'], accent: '#DE9C6B' },
  solar:    { base: ['#1a1808', '#3a3214', '#1a1808'], waves: ['#2a2410', '#5a4a20', '#D9BE7A'], accent: '#D9BE7A' },
  heart:    { base: ['#0a1a14', '#143a2a', '#0a1a14'], waves: ['#102a20', '#205a3a', '#8FC7A4'], accent: '#8FC7A4' },
  throat:   { base: ['#0a1418', '#143040', '#0a1418'], waves: ['#10202a', '#205070', '#85B8D9'], accent: '#85B8D9' },
  thirdEye: { base: ['#0a0a1a', '#141a3a', '#0a0a1a'], waves: ['#101020', '#202a5a', '#8F97DE'], accent: '#8F97DE' },
  crown:    { base: ['#10081a', '#1a103a', '#10081a'], waves: ['#181020', '#3a205a', '#B39BE0'], accent: '#B39BE0' },
  // Dosha palettes (Ayurveda)
  vata:     { base: ['#0c1024', '#181f48', '#0c1024'], waves: ['#15193a', '#2c3478', '#A6ABE0'], accent: '#A6ABE0' },
  pitta:    { base: ['#1a1208', '#3a2814', '#1a1208'], waves: ['#2a1c10', '#5a3e20', '#E0A470'], accent: '#E0A470' },
  kapha:    { base: ['#08180e', '#143824', '#08180e'], waves: ['#102a18', '#205a3a', '#9DC7AC'], accent: '#9DC7AC' },
};

function bandFor(beat: number): { name: string; color: string; key: BandKey } {
  if (beat < 4)  return { name: 'Delta', color: '#8F97DE', key: 'delta' };
  if (beat < 8)  return { name: 'Theta', color: '#A498E8', key: 'theta' };
  if (beat < 13) return { name: 'Alpha', color: '#8FB8DE', key: 'alpha' };
  if (beat < 30) return { name: 'Beta',  color: '#E0A470', key: 'beta' };
  return           { name: 'Gamma', color: '#D68097', key: 'gamma' };
}

// Configure foreground display only outside Expo Go, where this raises a
// removed-API warning under SDK 53+.
if (!IS_EXPO_GO && Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

// Identifier prefixes so the affirmation and gratitude schedulers can each
// cancel their own notifications without wiping the other's.
const AFFIRM_NOTIF_PREFIX = 'affirm-';
const GRAT_NOTIF_PREFIX = 'grat-reminder-';
let affirmationScheduleGeneration = 0;
let gratitudeScheduleGeneration = 0;
const pendingNotificationOperations = new Set<Promise<void>>();

function invalidateNotificationScheduling() {
  affirmationScheduleGeneration += 1;
  gratitudeScheduleGeneration += 1;
}

function trackNotificationOperation(operation: Promise<void>): Promise<void> {
  pendingNotificationOperations.add(operation);
  void operation.finally(() => pendingNotificationOperations.delete(operation)).catch(() => {});
  return operation;
}

async function cancelScheduledByPrefix(prefix: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier?.startsWith(prefix)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

async function scheduleAffirmationNotifsNow(pref: NotifPref) {
  if (Platform.OS === 'web') return; // Local scheduled notifs aren't supported in the browser
  if (IS_EXPO_GO) return; // No scheduling in Expo Go on SDK 53+
  const generation = ++affirmationScheduleGeneration;
  try {
    await cancelScheduledByPrefix(AFFIRM_NOTIF_PREFIX);
    if (generation !== affirmationScheduleGeneration) return;
    if (pref === 'off') return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (generation !== affirmationScheduleGeneration) return;
    if (status !== 'granted') return;
    const times = pref === 'daily'
      ? [{ hour: 9, minute: 0 }]
      : [{ hour: 9, minute: 0 }, { hour: 13, minute: 0 }, { hour: 18, minute: 0 }];
    // A repeating DAILY trigger bakes a single message in forever, so instead
    // schedule a rolling two-week batch of dated one-shots, each with its own
    // affirmation. The batch is rebuilt on every launch and pref change.
    const now = new Date();
    for (let day = 0; day < 14; day++) {
      for (const t of times) {
        if (generation !== affirmationScheduleGeneration) return;
        const fireAt = new Date(
          now.getFullYear(), now.getMonth(), now.getDate() + day,
          t.hour, t.minute, 0,
        );
        if (fireAt.getTime() <= now.getTime()) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${AFFIRM_NOTIF_PREFIX}${day}-${t.hour}`,
          content: { title: 'Simply Ambient', body: randomAffirmation() },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
          },
        });
      }
    }
  } catch (e) {
    console.warn('notification scheduling failed', e);
  }
}

function scheduleAffirmationNotifs(pref: NotifPref): Promise<void> {
  return trackNotificationOperation(scheduleAffirmationNotifsNow(pref));
}

// Evening gratitude nudge. Accepts legacy whole-hour values such as "21"
// and precise 24-hour clock values such as "21:35".
async function scheduleGratitudeReminderNow(pref: string) {
  if (Platform.OS === 'web') return;
  if (IS_EXPO_GO) return;
  const generation = ++gratitudeScheduleGeneration;
  try {
    await cancelScheduledByPrefix(GRAT_NOTIF_PREFIX);
    if (generation !== gratitudeScheduleGeneration) return;
    if (pref === 'off') return;
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(pref);
    if (!match) return;
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (generation !== gratitudeScheduleGeneration) return;
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      identifier: `${GRAT_NOTIF_PREFIX}${String(hour).padStart(2, '0')}-${String(minute).padStart(2, '0')}`,
      content: {
        title: 'Simply Ambient',
        body: 'A quiet moment before the day ends. What is one thing you appreciated today?',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (e) {
    console.warn('gratitude reminder scheduling failed', e);
  }
}

export function scheduleGratitudeReminder(pref: string): Promise<void> {
  return trackNotificationOperation(scheduleGratitudeReminderNow(pref));
}

function randomAffirmation() {
  return NOTIF_AFFIRMATIONS[Math.floor(Math.random() * NOTIF_AFFIRMATIONS.length)];
}

// ---------------------------------------------------------------------------
//   Lunar phase. Conway's algorithm, ~99% accurate
// ---------------------------------------------------------------------------

export type LunarInfo = { glyph: string; name: string; illum: number; phase: number };

function lunarPhase(date: Date = new Date()): LunarInfo {
  let y = date.getFullYear();
  let m = date.getMonth() + 1;
  const d = date.getDate();
  if (m < 3) { y -= 1; m += 12; }
  const j = Math.floor(365.25 * y) + Math.floor(30.6001 * (m + 1)) + d - 694039.09;
  const ip = (j / 29.5305882) % 1; // age fraction 0..1
  const age = ip < 0 ? ip + 1 : ip;
  const illum = (1 - Math.cos(age * 2 * Math.PI)) / 2; // 0..1
  const name =
    age < 0.0625 || age >= 0.9375 ? 'New' :
    age < 0.1875 ? 'Waxing crescent' :
    age < 0.3125 ? 'First quarter' :
    age < 0.4375 ? 'Waxing gibbous' :
    age < 0.5625 ? 'Full' :
    age < 0.6875 ? 'Waning gibbous' :
    age < 0.8125 ? 'Last quarter' :
    'Waning crescent';
  // glyph is kept for any text-only context; the UI renders MoonDisc.
  const glyph = illum < 0.06 ? '●' : illum > 0.94 ? '○' : age < 0.5 ? '◐' : '◑';
  return { glyph, name, illum, phase: age };
}

// A rendered moon: the lit region is the classic two-arc construction,
// an outer limb arc plus an elliptical terminator whose width follows the
// phase angle. Reads as an instrument, and is honest about the sky tonight.
export function MoonDisc({ phase, size = 16 }: { phase: number; size?: number }) {
  const c = size / 2;
  const r = c - 1;
  const cos = Math.cos(2 * Math.PI * phase);
  const rx = Math.max(0.4, Math.abs(cos) * r);
  const waxing = phase < 0.5;
  const top = `${c} ${c - r}`;
  const bottom = `${c} ${c + r}`;
  // Outer limb on the lit side (right while waxing, left while waning),
  // then back along the terminator, bowing toward or away from the limb
  // for crescent vs gibbous.
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = waxing ? (cos > 0 ? 0 : 1) : (cos > 0 ? 1 : 0);
  const lit = `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${rx.toFixed(2)} ${r} 0 0 ${innerSweep} ${top}`;
  return (
    <Svg width={size} height={size}>
      <SvgCircle cx={c} cy={c} r={r} stroke="rgba(255,255,255,0.30)" strokeWidth={1} fill="rgba(255,255,255,0.05)" />
      {phase * 100 % 100 < 3 || phase > 0.97 ? null : <SvgPath d={lit} fill="#ffffffE0" />}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
//   WAV synthesis
// ---------------------------------------------------------------------------

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  try {
    // @ts-ignore. btoa is on globalThis in all current RN runtimes
    if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  } catch {}
  return btoaFallback(binary);
}

function buildWav(leftHz: number, rightHz: number): string {
  const sampleRate = 44100;
  const numSamples = sampleRate;
  const numChannels = 2;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const amp = 0.28 * 32767;
  const twoPi = 2 * Math.PI;
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const l = Math.round(amp * Math.sin(twoPi * leftHz * t));
    const r = Math.round(amp * Math.sin(twoPi * rightHz * t));
    view.setInt16(off, l, true); off += 2;
    view.setInt16(off, r, true); off += 2;
  }
  return bytesToBase64(new Uint8Array(buffer));
}

function seededNoise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function buildStereoWav(
  seconds: number,
  sampleFn: (t: number, i: number) => [number, number],
): string {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * seconds);
  const numChannels = 2;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Stateful generators (filtered noise, random walks) end the buffer at an
  // arbitrary value while the loop restarts at another, which clicks at the
  // seam. Synthesize a little past the end and equal-power crossfade that
  // tail into the head so the loop point is continuous.
  const fadeSamples = Math.floor(sampleRate * 0.05);
  const total = numSamples + fadeSamples;
  const rawL = new Float32Array(total);
  const rawR = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const [left, right] = sampleFn(i / sampleRate, i);
    rawL[i] = Math.max(-1, Math.min(1, left));
    rawR[i] = Math.max(-1, Math.min(1, right));
  }

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    let l = rawL[i];
    let r = rawR[i];
    if (i < fadeSamples) {
      const a = ((i + 1) / (fadeSamples + 1)) * (Math.PI / 2);
      const inW = Math.sin(a);
      const outW = Math.cos(a);
      l = rawL[i] * inW + rawL[numSamples + i] * outW;
      r = rawR[i] * inW + rawR[numSamples + i] * outW;
    }
    view.setInt16(off, Math.round(Math.max(-1, Math.min(1, l)) * 32767), true); off += 2;
    view.setInt16(off, Math.round(Math.max(-1, Math.min(1, r)) * 32767), true); off += 2;
  }
  return bytesToBase64(new Uint8Array(buffer));
}

function buildSoundscapeWav(kind: SoundscapeKey): string {
  const rnd = seededNoise(
    kind.split('').reduce((acc, ch) => acc + ch.charCodeAt(0) * 37, 7919),
  );
  const twoPi = Math.PI * 2;
  let pink = 0;
  let brown = 0;
  let rain = 0;
  let leftDrift = 0;
  let rightDrift = 0;
  let rainDropLeft = 0;
  let rainDropRight = 0;
  let fireCrackle = 0;
  let firePop = 0;
  let breezeLow = 0;
  let thunderLow = 0;
  let cabinLow = 0;
  let trainLow = 0;

  const loopSeconds = kind === 'thunder'
    ? 12
    : kind === 'night'
      ? NIGHT_CRICKET_LOOP_SECONDS
      : kind === 'fire' || kind === 'breeze' || kind === 'train'
        ? 6
        : kind === 'cabin'
          ? 4
          : 2;

  return buildStereoWav(loopSeconds, (t, i) => {
    const white = rnd();
    pink = pink * 0.92 + white * 0.08;
    brown = Math.max(-1, Math.min(1, brown + white * 0.025));
    rain = rain * 0.72 + white * 0.28;
    leftDrift = leftDrift * 0.995 + rnd() * 0.005;
    rightDrift = rightDrift * 0.995 + rnd() * 0.005;

    const panLeft = 0.96 + leftDrift * 0.04;
    const panRight = 0.96 + rightDrift * 0.04;
    const chirp = Math.sin(twoPi * (1600 + 900 * Math.sin(t * twoPi * 0.17)) * t);
    if (rnd() > 0.99945) rainDropLeft += 0.45 + Math.abs(rnd()) * 0.35;
    if (rnd() > 0.99950) rainDropRight += 0.42 + Math.abs(rnd()) * 0.32;
    rainDropLeft *= 0.90;
    rainDropRight *= 0.90;
    const tide = Math.sin(twoPi * 0.34 * t) * 0.18 + Math.sin(twoPi * 0.71 * t) * 0.08;
    const flame = brown * 0.09 + pink * 0.08 + Math.sin(twoPi * 1.7 * t) * 0.015;
    if (rnd() > 0.935) fireCrackle += (0.35 + Math.abs(rnd()) * 0.65) * (rnd() > 0 ? 1 : -1);
    if (rnd() > 0.9975) firePop += (0.8 + Math.abs(rnd()) * 0.5) * (rnd() > 0 ? 1 : -1);
    fireCrackle *= 0.72;
    firePop *= 0.90;

    switch (kind) {
      case 'rain': {
        const mist = pink * 0.09 + rain * 0.08 + brown * 0.025;
        return [(mist + rainDropLeft * 0.08) * panLeft, (mist * 0.92 + rainDropRight * 0.075) * panRight];
      }
      case 'ocean': {
        const foam = pink * 0.13 + tide;
        return [foam * panLeft, (pink * 0.12 + tide * 0.9) * panRight];
      }
      case 'forest': {
        const leaves = pink * 0.10 + Math.sin(twoPi * 0.09 * t) * 0.04;
        const birds = i % 17111 < 140 ? chirp * 0.035 : 0;
        return [(leaves + birds) * panLeft, (leaves * 0.9 + birds * 0.6) * panRight];
      }
      case 'stream': {
        const ripple = pink * 0.11 + Math.sin(twoPi * 1.4 * t) * 0.035 + Math.sin(twoPi * 2.8 * t) * 0.018;
        const birds = i % 19789 < 120 ? chirp * 0.025 : 0;
        return [(ripple + birds) * panLeft, (ripple * 0.86 + birds * 0.55) * panRight];
      }
      case 'fire': {
        const sparkLeft = fireCrackle * 0.22 + firePop * 0.18;
        const sparkRight = fireCrackle * 0.15 + firePop * 0.24;
        return [(flame + sparkLeft) * panLeft, (flame * 0.88 + sparkRight) * panRight];
      }
      case 'breeze': {
        // Pink and brown noise pass through a very slow one-pole filter, then
        // an integral six-second swell keeps both the texture and loop seam soft.
        breezeLow = breezeLow * 0.9985 + (pink * 0.62 + brown * 0.38) * 0.0015;
        const swell = 0.78
          - Math.cos(twoPi * t / 6) * 0.14
          + Math.sin(twoPi * t / 3) * 0.06;
        const air = (pink * 0.052 + brown * 0.026 + breezeLow * 0.34) * swell;
        return [air * panLeft * 2.1, (air * 0.94 + breezeLow * 0.015) * panRight * 2.1];
      }
      case 'night':
        return summerNightSample(t, white, pink, brown);
      case 'thunder': {
        // One distant rumble per twelve-second loop, shaped with a raised
        // cosine so it arrives and leaves without a transient.
        thunderLow = thunderLow * 0.997 + (brown * 0.75 + pink * 0.25) * 0.003;
        const distance = Math.abs(t - 5.4);
        const rumbleEnvelope = distance < 2.35
          ? 0.5 + 0.5 * Math.cos(Math.PI * distance / 2.35)
          : 0;
        const rumble = rumbleEnvelope * (
          thunderLow * 0.16
          + Math.sin(twoPi * 31 * t) * 0.055
          + Math.sin(twoPi * 43 * t + 0.8) * 0.026
        );
        const mist = pink * 0.058 + rain * 0.042 + brown * 0.018;
        return [mist + rumble, mist * 0.91 + rumble * 0.86];
      }
      case 'cabin': {
        cabinLow = cabinLow * 0.9975 + (pink * 0.7 + brown * 0.3) * 0.0025;
        const drift = 0.88 + Math.sin(twoPi * 0.25 * t) * 0.07;
        const body = (
          Math.sin(twoPi * 56 * t) * 0.032
          + Math.sin(twoPi * 112 * t + 0.35) * 0.011
        ) * drift;
        const hum = pink * 0.045 + cabinLow * 0.18;
        return [hum + body, hum * 0.94 + body * 0.90];
      }
      case 'train': {
        trainLow = trainLow * 0.9965 + (brown * 0.78 + pink * 0.22) * 0.0035;
        const railSway = Math.sin(twoPi * 2 * t) * 0.025
          + Math.sin(twoPi * 4 * t + 0.45) * 0.007;
        const rumble = trainLow * 0.25 + brown * 0.038 + pink * 0.022;
        return [(rumble + railSway) * 1.5, (rumble * 0.93 - railSway * 0.72) * 1.5];
      }
      case 'pink':
        return [pink * 0.24 * panLeft, pink * 0.22 * panRight];
      case 'brown':
        return [brown * 0.25 * panLeft, brown * 0.23 * panRight];
      case 'white':
      default:
        return [white * 0.18 * panLeft, rnd() * 0.18 * panRight];
    }
  });
}

// ---------------------------------------------------------------------------
//   Web binaural engine
// ---------------------------------------------------------------------------
// On native we loop a 1-second WAV, which is fine because the audio system
// loops the file seamlessly. Browsers restart a looped buffer with an audible
// gap, so on web we generate the tones live with two oscillators panned hard
// left and right through a channel merger. That is gapless by construction and
// also lets us glide between frequencies without a restart. Matches the native
// WAV amplitude (0.28) so loudness is consistent across platforms.
const WEB_TONE_GAIN = 0.28;

class WebToneEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private left: OscillatorNode | null = null;
  private right: OscillatorNode | null = null;
  private volume = 1;

  setVolume(volume: number) {
    this.volume = clamp01(volume);
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    // A short ramp keeps live adjustments free of zipper noise while the
    // engine remains running. WEB_TONE_GAIN is the established safe output
    // level; the user-facing control scales it rather than replacing it.
    const now = ctx.currentTime;
    const target = WEB_TONE_GAIN * this.volume;
    try { master.gain.cancelScheduledValues(now); } catch {}
    try { master.gain.setValueAtTime(master.gain.value, now); } catch {}
    try { master.gain.linearRampToValueAtTime(target, now + 0.06); } catch {}
  }

  async play(l: number, r: number) {
    if (!this.ctx) {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
    }
    const ctx = this.ctx;
    // Browsers start the context suspended until a user gesture resumes it.
    if (ctx.state === 'suspended') await ctx.resume();

    if (this.left && this.right) {
      // Already running: glide to the new frequencies instead of restarting.
      // Anchor with setValueAtTime first; a ramp with no prior scheduled
      // event jumps instantly instead of gliding.
      const t = ctx.currentTime;
      this.left.frequency.setValueAtTime(this.left.frequency.value, t);
      this.right.frequency.setValueAtTime(this.right.frequency.value, t);
      this.left.frequency.linearRampToValueAtTime(l, t + 0.03);
      this.right.frequency.linearRampToValueAtTime(r, t + 0.03);
      return;
    }

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Hard channel separation: each oscillator feeds exactly one ear.
    const merger = ctx.createChannelMerger(2);
    merger.connect(master);

    const left = ctx.createOscillator();
    left.type = 'sine';
    left.frequency.value = l;
    left.connect(merger, 0, 0);
    left.start();

    const right = ctx.createOscillator();
    right.type = 'sine';
    right.frequency.value = r;
    right.connect(merger, 0, 1);
    right.start();

    this.master = master;
    this.left = left;
    this.right = right;

    // Short fade-in to avoid a click on start (anchored so the ramp takes effect).
    const t = ctx.currentTime;
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(WEB_TONE_GAIN * this.volume, t + 0.04);
  }

  stop() {
    const ctx = this.ctx;
    const master = this.master;
    const left = this.left;
    const right = this.right;
    this.master = null;
    this.left = null;
    this.right = null;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (master) {
      try { master.gain.cancelScheduledValues(t); } catch {}
      try { master.gain.setValueAtTime(master.gain.value, t); } catch {}
      try { master.gain.linearRampToValueAtTime(0, t + 0.05); } catch {}
    }
    // Stop the oscillators after the fade so we don't click on the way out.
    setTimeout(() => {
      try { left?.stop(); } catch {}
      try { right?.stop(); } catch {}
      try { left?.disconnect(); } catch {}
      try { right?.disconnect(); } catch {}
      try { master?.disconnect(); } catch {}
    }, 80);
  }
}

class WebSoundscapeEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private random = seededNoise(421337);
  private pink = 0;
  private brown = 0;
  private rain = 0;
  private phase = 0;
  private kind: SoundscapeKey = 'rain';
  private rainDropLeft = 0;
  private rainDropRight = 0;
  private fireCrackle = 0;
  private firePop = 0;
  private breezeLow = 0;
  private thunderLow = 0;
  private cabinLow = 0;
  private trainLow = 0;
  private media: any = null;
  private mediaSource: string | null = null;

  async play(kind: SoundscapeKey, volume: number) {
    this.kind = kind;
    const bundled = BUNDLED_SOUNDSCAPES[kind];
    const AudioCtor = (globalThis as any).Audio;
    if (bundled && typeof AudioCtor === 'function') {
      const asset = Asset.fromModule(bundled);
      const src = asset.localUri ?? asset.uri;
      this.stopSynthetic();
      if (!this.media || this.mediaSource !== src) {
        this.stopMedia();
        this.media = new AudioCtor(src);
        this.mediaSource = src;
        this.media.loop = true;
        this.media.preload = 'auto';
        this.media.load?.();
      }
      this.media.volume = effectiveSoundscapeVolume(kind, volume);
      await this.media.play();
      return;
    }

    this.stopMedia();
    if (!this.ctx) {
      const AC: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    if (!this.processor || !this.gain) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      const processor = ctx.createScriptProcessor(1024, 0, 2);
      processor.onaudioprocess = (event) => {
        const left = event.outputBuffer.getChannelData(0);
        const right = event.outputBuffer.getChannelData(1);
        for (let i = 0; i < left.length; i++) {
          const [l, r] = this.nextSample(ctx.sampleRate);
          // Last-line peak guard for generated scenes. Normal output stays
          // well below this ceiling; an unlucky random walk can never spike.
          left[i] = Math.max(-0.82, Math.min(0.82, l));
          right[i] = Math.max(-0.82, Math.min(0.82, r));
        }
      };
      processor.connect(gain);
      this.gain = gain;
      this.processor = processor;
    }

    this.setVolume(volume);
  }

  setVolume(volume: number) {
    if (this.media) {
      this.media.volume = effectiveSoundscapeVolume(this.kind, volume);
      return;
    }
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain) return;
    const t = ctx.currentTime;
    try { gain.gain.cancelScheduledValues(t); } catch {}
    try { gain.gain.setValueAtTime(gain.gain.value, t); } catch {}
    try { gain.gain.linearRampToValueAtTime(effectiveSoundscapeVolume(this.kind, volume), t + 0.05); } catch {}
  }

  stop() {
    this.stopMedia();
    this.stopSynthetic();
  }

  private stopMedia() {
    const media = this.media;
    this.media = null;
    this.mediaSource = null;
    if (!media) return;
    try { media.pause(); } catch {}
    try { media.currentTime = 0; } catch {}
  }

  private stopSynthetic() {
    const ctx = this.ctx;
    const gain = this.gain;
    const processor = this.processor;
    this.gain = null;
    this.processor = null;
    if (!ctx) return;
    const t = ctx.currentTime;
    try { gain?.gain.linearRampToValueAtTime(0, t + 0.06); } catch {}
    setTimeout(() => {
      try { processor?.disconnect(); } catch {}
      try { gain?.disconnect(); } catch {}
    }, 90);
  }

  private nextSample(sampleRate: number): [number, number] {
    const white = this.random();
    this.pink = this.pink * 0.92 + white * 0.08;
    this.brown = Math.max(-1, Math.min(1, this.brown + white * 0.025));
    this.rain = this.rain * 0.72 + white * 0.28;
    this.phase += 1 / sampleRate;
    const t = this.phase;
    const twoPi = Math.PI * 2;
    const tide = Math.sin(twoPi * 0.34 * t) * 0.18 + Math.sin(twoPi * 0.71 * t) * 0.08;
    if (this.random() > 0.99945) this.rainDropLeft += 0.45 + Math.abs(this.random()) * 0.35;
    if (this.random() > 0.99950) this.rainDropRight += 0.42 + Math.abs(this.random()) * 0.32;
    this.rainDropLeft *= 0.90;
    this.rainDropRight *= 0.90;
    const flame = this.brown * 0.09 + this.pink * 0.08 + Math.sin(twoPi * 1.7 * t) * 0.015;
    if (this.random() > 0.935) this.fireCrackle += (0.35 + Math.abs(this.random()) * 0.65) * (this.random() > 0 ? 1 : -1);
    if (this.random() > 0.9975) this.firePop += (0.8 + Math.abs(this.random()) * 0.5) * (this.random() > 0 ? 1 : -1);
    this.fireCrackle *= 0.72;
    this.firePop *= 0.90;
    const chirp = Math.sin(twoPi * (1600 + 900 * Math.sin(t * twoPi * 0.17)) * t);
    const birds = Math.floor(t * sampleRate) % 17111 < 140 ? chirp * 0.035 : 0;

    switch (this.kind) {
      case 'rain': {
        const mist = this.pink * 0.09 + this.rain * 0.08 + this.brown * 0.025;
        return [mist + this.rainDropLeft * 0.08, mist * 0.92 + this.rainDropRight * 0.075];
      }
      case 'ocean':
        return [this.pink * 0.13 + tide, this.pink * 0.12 + tide * 0.9];
      case 'forest': {
        const leaves = this.pink * 0.10 + Math.sin(twoPi * 0.09 * t) * 0.04;
        return [leaves + birds, leaves * 0.9 + birds * 0.6];
      }
      case 'stream': {
        const ripple = this.pink * 0.11 + Math.sin(twoPi * 1.4 * t) * 0.035 + Math.sin(twoPi * 2.8 * t) * 0.018;
        return [ripple + birds * 0.7, ripple * 0.86 + birds * 0.45];
      }
      case 'fire':
        return [flame + this.fireCrackle * 0.22 + this.firePop * 0.18, flame * 0.88 + this.fireCrackle * 0.15 + this.firePop * 0.24];
      case 'breeze': {
        this.breezeLow = this.breezeLow * 0.9985
          + (this.pink * 0.62 + this.brown * 0.38) * 0.0015;
        const swell = 0.78
          - Math.cos(twoPi * t / 6) * 0.14
          + Math.sin(twoPi * t / 3) * 0.06;
        const air = (this.pink * 0.052 + this.brown * 0.026 + this.breezeLow * 0.34) * swell;
        return [air * 2.1, (air * 0.94 + this.breezeLow * 0.015) * 2.1];
      }
      case 'night':
        return summerNightSample(t, white, this.pink, this.brown);
      case 'thunder': {
        this.thunderLow = this.thunderLow * 0.997
          + (this.brown * 0.75 + this.pink * 0.25) * 0.003;
        const cyclePosition = t % 13;
        const distance = Math.abs(cyclePosition - 5.7);
        const rumbleEnvelope = distance < 2.45
          ? 0.5 + 0.5 * Math.cos(Math.PI * distance / 2.45)
          : 0;
        const rumble = rumbleEnvelope * (
          this.thunderLow * 0.16
          + Math.sin(twoPi * 31 * t) * 0.055
          + Math.sin(twoPi * 43 * t + 0.8) * 0.026
        );
        const mist = this.pink * 0.058 + this.rain * 0.042 + this.brown * 0.018;
        return [mist + rumble, mist * 0.91 + rumble * 0.86];
      }
      case 'cabin': {
        this.cabinLow = this.cabinLow * 0.9975
          + (this.pink * 0.7 + this.brown * 0.3) * 0.0025;
        const drift = 0.88 + Math.sin(twoPi * 0.25 * t) * 0.07;
        const body = (
          Math.sin(twoPi * 56 * t) * 0.032
          + Math.sin(twoPi * 112 * t + 0.35) * 0.011
        ) * drift;
        const hum = this.pink * 0.045 + this.cabinLow * 0.18;
        return [hum + body, hum * 0.94 + body * 0.90];
      }
      case 'train': {
        this.trainLow = this.trainLow * 0.9965
          + (this.brown * 0.78 + this.pink * 0.22) * 0.0035;
        const railSway = Math.sin(twoPi * 2 * t) * 0.025
          + Math.sin(twoPi * 4 * t + 0.45) * 0.007;
        const rumble = this.trainLow * 0.25 + this.brown * 0.038 + this.pink * 0.022;
        return [(rumble + railSway) * 1.5, (rumble * 0.93 - railSway * 0.72) * 1.5];
      }
      case 'pink':
        return [this.pink * 0.24, this.pink * 0.22];
      case 'brown':
        return [this.brown * 0.25, this.brown * 0.23];
      case 'white':
      default:
        return [white * 0.18, this.random() * 0.18];
    }
  }
}

// ---------------------------------------------------------------------------
//   ManifestQuote
// ---------------------------------------------------------------------------

function ManifestQuote() {
  // Random starting point; a fixed start would mean the deep cuts in a
  // 100+ quote pool are almost never seen.
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      Animated.timing(fade, { toValue: 0, duration: 1200, useNativeDriver: true }).start(() => {
        if (cancelled) return;
        setIdx(i => (i + 1) % QUOTES.length);
        Animated.timing(fade, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
      });
    };
    const interval = setInterval(tick, 9000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fade]);
  return (
    <Animated.Text style={[styles.quote, { opacity: fade }]}>
      “{QUOTES[idx]}”
    </Animated.Text>
  );
}

// ---------------------------------------------------------------------------
//   WaveBackground. Ocean waves animated when playing
// ---------------------------------------------------------------------------

// Renders one palette as a full background. Used by WaveBackground to
// crossfade between palettes when the band changes.
function PaletteLayer({ band, playing }: { band: BandKey; playing: boolean }) {
  const palette = PALETTES[band];
  const { height: screenHeight } = useWindowDimensions();
  const xfade = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const wash = useRef(new Animated.Value(0)).current;
  // Keep Android's full-screen palette static. The active room still supplies
  // its focused playback animation, while avoiding three additional
  // translucent, display-rate redraws behind the entire app.
  const backgroundMotionEnabled = playing && Platform.OS !== 'android';

  useEffect(() => {
    if (!backgroundMotionEnabled) {
      xfade.stopAnimation();
      drift.stopAnimation();
      wash.stopAnimation();
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(xfade, { toValue: 1, duration: 11200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(xfade, { toValue: 0, duration: 11200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 43000, easing: Easing.linear, useNativeDriver: true }),
    );
    const c = Animated.loop(
      Animated.sequence([
        Animated.timing(wash, { toValue: 1, duration: 7800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wash, { toValue: 0, duration: 7800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    drift.setValue(0);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [backgroundMotionEnabled, xfade, drift, wash]);

  const op1 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.20] });
  const op2 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.95] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -screenHeight * 0.22] });
  const washOpacity = wash.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0.76] });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.base[0], overflow: 'hidden' }]} pointerEvents="none">
      {/* Static rich base. Always shows even when paused */}
      <LinearGradient
        colors={[palette.base[0], palette.waves[0], palette.base[1], palette.base[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer A. Diagonal TL → BR, secondary tones with a hot accent stop */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: op1 }]}>
        <LinearGradient
          colors={[palette.waves[1], palette.base[1], palette.accent + 'cc', palette.waves[0]]}
          locations={[0, 0.4, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Layer B. Counter-diagonal TR → BL, brighter tones */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: op2 }]}>
        <LinearGradient
          colors={[palette.accent + 'cc', palette.waves[2], palette.base[1], palette.waves[0]]}
          locations={[0, 0.3, 0.65, 1]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Slow vertical accent stripe drifting upward. Adds visible motion */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0, right: 0,
          top: 0, height: screenHeight * 1.6,
          opacity: washOpacity,
          transform: [{ translateY: driftY }],
        }}
      >
        <LinearGradient
          colors={[palette.accent + '00', palette.accent + '55', palette.accent + '00']}
          locations={[0, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>
    </View>
  );
}

// Wrapper that crossfades between palettes when the active band changes.
// Keep layers in one keyed stack so the incoming palette is not remounted when
// it becomes the only visible layer. Remounting resets the internal drift/fade
// animations and reads as a snap right after the crossfade completes.
function WaveBackground({
  band, playing, overrideColor,
}: {
  band: BandKey;
  playing: boolean;
  overrideColor?: string | null;
}) {
  // "Single app color" setting: pin the backdrop to one flat color and skip
  // the band palettes and their crossfades entirely.
  if (overrideColor) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: overrideColor }]} />;
  }
  return <WaveBackgroundAnimated band={band} playing={playing} />;
}

function WaveBackgroundAnimated({ band, playing }: { band: BandKey; playing: boolean }) {
  type LayerSpec = { band: BandKey; key: number; opacity: Animated.Value };
  const counter = useRef(0);
  const [layers, setLayers] = useState<LayerSpec[]>(() => [
    { band, key: 0, opacity: new Animated.Value(1) },
  ]);
  const layersRef = useRef<LayerSpec[]>(layers);
  // Tracks the currently running crossfade so a rapid band change can cancel it
  // before its completion callback fires and clobbers the new state. Generation
  // counter is the belt-and-suspenders fallback in case stop() races.
  const runningAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    const currentLayers = layersRef.current;
    const topLayer = currentLayers[currentLayers.length - 1];
    if (topLayer?.band === band) return;

    // Cancel any in-flight crossfade. Without this, the old start() callback
    // still fires later and overwrites the stack, leaving stale layers visible.
    if (runningAnimRef.current) {
      runningAnimRef.current.stop();
      runningAnimRef.current = null;
    }

    counter.current += 1;
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    const layer: LayerSpec = {
      band,
      key: counter.current,
      opacity: new Animated.Value(0),
    };
    const nextLayers = [...currentLayers, layer];
    layersRef.current = nextLayers;
    setLayers(nextLayers);
    const anim = Animated.parallel([
      Animated.timing(layer.opacity, {
        toValue: 1,
        duration: PALETTE_CROSSFADE_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      ...currentLayers.map((existingLayer) =>
        Animated.timing(existingLayer.opacity, {
          toValue: 0,
          duration: PALETTE_CROSSFADE_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ),
    ]);
    runningAnimRef.current = anim;
    anim.start(({ finished }) => {
      // Late callbacks from cancelled animations must NOT replace the current
      // stack with a stale layer. Two checks: finished flag
      // (stop() should make this false) AND generation match (in case stop()
      // races and the callback still reports finished=true).
      if (!finished) return;
      if (myGeneration !== generationRef.current) return;
      runningAnimRef.current = null;
      layersRef.current = [layer];
      setLayers([layer]);
    });
  }, [band]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.map((layer) => (
        <Animated.View key={layer.key} style={[StyleSheet.absoluteFill, { opacity: layer.opacity }]}>
          <PaletteLayer band={layer.band} playing={playing} />
        </Animated.View>
      ))}
    </View>
  );
}

// ===========================================================================
//   App
// ===========================================================================

type Tab = 'frequencies' | 'breath' | 'chakras' | 'horoscopes' | 'more';

type ActiveRoutineSession = {
  path: RoutinePathPayload;
  stepIndex: number;
  startedAt: number;
  stepEndsAt: number;
};

const STORAGE_KEY_NOTIF = '@simply_ambient_notif_pref_v1';
const STORAGE_KEY_SINGLE_COLOR = '@simply_ambient_single_color_v1';
const STORAGE_KEY_PINNED_MORE_PAGES = '@simply_ambient_pinned_more_pages_v1';
// Legacy soundscapes-in-navbar flag. Soundscapes is now pinned by default
// whenever no pinned list has been stored, which covers every state this flag
// could migrate to, so it is only cleaned up here.
const STORAGE_KEY_NAV_SOUNDSCAPES = '@simply_ambient_nav_soundscapes_v1';
// The day's affirmation, stored as JSON {date: 'YYYY-MM-DD' local, text} so
// one phrase holds for the whole day across launches and hub previews.
const STORAGE_KEY_AFFIRMATION = '@simply_ambient_affirmation_v1';
const SLEEP_TIMER_OPTIONS = [0, 5, 10, 15, 30, 60] as const; // minutes

// Local calendar date as YYYY-MM-DD, for day-keyed storage.
function localDateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('frequencies');
  const [tabBarHeight, setTabBarHeight] = useState(72 + insets.bottom);
  const [pinnedMorePages, setPinnedMorePages] = useState<PinnableMorePageId[]>([]);
  const pinnedMorePagesRef = useRef<PinnableMorePageId[]>([]);
  // Prevent an async launch read from overwriting a pin action made while
  // storage is still hydrating.
  const pinnedMorePagesTouched = useRef(false);
  const [newlyPinnedMorePage, setNewlyPinnedMorePage] = useState<PinnableMorePageId | null>(null);
  const [moreActivePage, setMoreActivePage] = useState<MorePageId | null>(null);
  // Deep links into any More room; `hub` returns from a room to More's index.
  const [morePageRequest, setMorePageRequest] = useState<MorePageId | 'hub' | null>(null);

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_ONBOARDED).then(v => {
      if (!v) setShowOnboarding(true);
      setOnboardingChecked(true);
    }).catch(() => setOnboardingChecked(true));
    AsyncStorage.getItem(STORAGE_KEY_SINGLE_COLOR).then(v => {
      if (v) setSingleColor(v);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY_PINNED_MORE_PAGES).then(storedPins => {
      if (pinnedMorePagesTouched.current) return;
      const next = resolvePinnedMorePages(storedPins);
      pinnedMorePagesRef.current = next;
      setPinnedMorePages(next);
    }).catch(() => {});
    // One of the rate-prompt gate counters (see lib/rateGate.ts).
    recordAppOpen().catch(() => {});
  }, []);

  // "Single app color": when set, the backdrop is pinned to this flat color
  // instead of the band-driven animated palettes.
  const [singleColor, setSingleColor] = useState<string | null>(null);

  function togglePinnedMorePage(id: PinnableMorePageId, next: boolean) {
    if (!isPinnableMorePage(id)) return;
    pinnedMorePagesTouched.current = true;
    const current = pinnedMorePagesRef.current;
    const alreadyPinned = current.includes(id);
    if (alreadyPinned === next) return;

    const updated = next
      ? [...current, id]
      : current.filter(pageId => pageId !== id);
    pinnedMorePagesRef.current = updated;
    setPinnedMorePages(updated);
    if (next) setNewlyPinnedMorePage(id);
    else setNewlyPinnedMorePage(previous => previous === id ? null : previous);
    AsyncStorage.setItem(STORAGE_KEY_PINNED_MORE_PAGES, JSON.stringify(updated)).catch(() => {});
  }

  function clearPinnedMorePages() {
    pinnedMorePagesTouched.current = true;
    pinnedMorePagesRef.current = [];
    setPinnedMorePages([]);
    setNewlyPinnedMorePage(null);
    // Store an explicit empty list. Removing the key would bring the default
    // pins back on the next launch.
    AsyncStorage.setItem(STORAGE_KEY_PINNED_MORE_PAGES, JSON.stringify([])).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY_NAV_SOUNDSCAPES).catch(() => {});
  }

  function openMoreHub() {
    if (tab === 'more' && moreActivePage !== null) setMorePageRequest('hub');
    else setMoreActivePage(null);
    setTab('more');
  }

  function openMorePageFromNav(page: PinnableMorePageId) {
    setMoreActivePage(page);
    setMorePageRequest(page);
    setTab('more');
  }
  function setSingleColorPref(c: string | null) {
    setSingleColor(c);
    if (c) AsyncStorage.setItem(STORAGE_KEY_SINGLE_COLOR, c).catch(() => {});
    else AsyncStorage.removeItem(STORAGE_KEY_SINGLE_COLOR).catch(() => {});
  }

  function dismissOnboarding() {
    AsyncStorage.setItem(STORAGE_KEY_ONBOARDED, '1').catch(() => {});
    setShowOnboarding(false);
  }

  // "Replay the intro" from More > Settings. Replay skips the legal and
  // profile steps (see OnboardingView) and never clears the onboarded flag.
  const [onboardingIsReplay, setOnboardingIsReplay] = useState(false);
  function replayOnboarding() {
    setOnboardingIsReplay(true);
    setShowOnboarding(true);
  }

  const [leftHz, setLeftHz] = useState(DEFAULT_LEFT);
  const [rightHz, setRightHz] = useState(DEFAULT_RIGHT);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<BandKey>('none');

  const [isTonePlaying, setIsTonePlaying] = useState(false);
  const [isToneLoading, setIsToneLoading] = useState(false);
  const [toneVolume, setToneVolume] = useState(1);

  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  const [bgFileName, setBgFileName] = useState<string | null>(null);
  const [bgUri, setBgUri] = useState<string | null>(null);
  const [isBgPlaying, setIsBgPlaying] = useState(false);
  const [bgVolume, setBgVolume] = useState(0.5);
  const [activeSoundscapeId, setActiveSoundscapeId] = useState<SoundscapeKey | null>(null);
  const [isSoundscapePlaying, setIsSoundscapePlaying] = useState(false);
  const [soundscapeVolume, setSoundscapeVolume] = useState(0.42);

  const [lunar, setLunar] = useState(() => lunarPhase());
  const [mySignId, setMySignId] = useState<string | null>(null);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshLunar = () => setLunar(lunarPhase());
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 2, 0);
      midnightTimer = setTimeout(() => {
        refreshLunar();
        scheduleMidnightRefresh();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshLunar();
    });
    scheduleMidnightRefresh();
    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      appStateSubscription.remove();
    };
  }, []);

  // More-tab state
  const [notifPref, setNotifPref] = useState<NotifPref>('off');
  const [affirmation, setAffirmation] = useState<string | null>(null);
  const [affLoading, setAffLoading] = useState(false);
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutineSession | null>(null);
  const activeRoutineRef = useRef<ActiveRoutineSession | null>(null);
  const routineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routineGenerationRef = useRef(0);
  const pendingRoutineRef = useRef<RoutinePathPayload | null>(null);

  useEffect(() => {
    activeRoutineRef.current = activeRoutine;
  }, [activeRoutine]);

  useEffect(() => () => {
    if (routineTimerRef.current) clearTimeout(routineTimerRef.current);
  }, []);

  // Sleep timer
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);

  // Per-session audio-safety acknowledgement. Resets on cold start so users
  // get the volume reminder once each new session before the first Play tap.
  const [audioSafetyAck, setAudioSafetyAck] = useState(false);
  const [showAudioSafetyModal, setShowAudioSafetyModal] = useState(false);

  const mySign = useMemo(
    () => (mySignId && ZODIAC.find(z => z.id === mySignId)) || todaysSign(),
    [mySignId],
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_ZODIAC).then(v => {
      if (v) setMySignId(v);
    }).catch(() => {});
  }, []);

  function selectMyZodiac(z: Zodiac) {
    setMySignId(z.id);
    AsyncStorage.setItem(STORAGE_KEY_ZODIAC, z.id).catch(() => {});
  }

  // Affirmations. The explicit reroll draws a fresh phrase and stores it as
  // today's pick, so the choice holds for the rest of the day and the hub
  // preview shows the same text.
  async function refreshAffirmation() {
    setAffLoading(true);
    try {
      const text = randomAffirmation();
      setAffirmation(text);
      AsyncStorage.setItem(
        STORAGE_KEY_AFFIRMATION,
        JSON.stringify({ date: localDateKey(), text }),
      ).catch(() => {});
    } finally {
      setAffLoading(false);
    }
  }

  // On launch, reuse a pick stored earlier today; on a new day, draw and
  // store a fresh one. This keeps the "daily" framing true.
  async function loadDailyAffirmation() {
    setAffLoading(true);
    try {
      const today = localDateKey();
      const raw = await AsyncStorage.getItem(STORAGE_KEY_AFFIRMATION).catch(() => null);
      if (raw) {
        try {
          const stored = JSON.parse(raw) as { date?: string; text?: string };
          if (stored?.date === today && typeof stored.text === 'string' && stored.text) {
            setAffirmation(stored.text);
            return;
          }
        } catch {}
      }
      const text = randomAffirmation();
      setAffirmation(text);
      AsyncStorage.setItem(
        STORAGE_KEY_AFFIRMATION,
        JSON.stringify({ date: today, text }),
      ).catch(() => {});
    } finally {
      setAffLoading(false);
    }
  }

  // Load notification preference + initial affirmation on mount. Re-running
  // the scheduler tops the rolling one-shot batch back up to two weeks.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_NOTIF).then(v => {
      if (v === 'daily' || v === 'thrice') {
        setNotifPref(v);
        scheduleAffirmationNotifs(v);
      }
    }).catch(() => {});
    loadDailyAffirmation();
  }, []);

  function changeNotifPref(pref: NotifPref) {
    setNotifPref(pref);
    AsyncStorage.setItem(STORAGE_KEY_NOTIF, pref).catch(() => {});
    scheduleAffirmationNotifs(pref);
  }

  // Sleep timer: when minutes > 0, schedule a stop. Resets if play state changes.
  function setSleepTimer(minutes: number) {
    if (sleepTimeoutRef.current) {
      clearTimeout(sleepTimeoutRef.current);
      sleepTimeoutRef.current = null;
    }
    setSleepMinutes(minutes);
    if (minutes > 0) {
      setSleepEndsAt(Date.now() + minutes * 60 * 1000);
      sleepTimeoutRef.current = setTimeout(() => {
        sleepTimeoutRef.current = null;
        setSleepMinutes(0);
        setSleepEndsAt(null);
        fadeOutSession();
      }, minutes * 60 * 1000);
    } else {
      setSleepEndsAt(null);
    }
  }

  // Cancel sleep timer when component unmounts.
  useEffect(() => () => {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
  }, []);

  // The sleep timeout above is a JS timer, and Android Doze can defer those
  // for hours once the screen is off. sleepEndsAt is the source of truth:
  // whenever the app returns to the foreground, reconcile against the wall
  // clock and stop playback if the deadline passed while we were dozing.
  const sleepEndsAtRef = useRef<number | null>(null);
  useEffect(() => { sleepEndsAtRef.current = sleepEndsAt; }, [sleepEndsAt]);
  const fadeOutSessionRef = useRef<() => void>(() => {});
  useEffect(() => { fadeOutSessionRef.current = fadeOutSession; });
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      const endsAt = sleepEndsAtRef.current;
      if (endsAt && Date.now() >= endsAt) {
        if (sleepTimeoutRef.current) {
          clearTimeout(sleepTimeoutRef.current);
          sleepTimeoutRef.current = null;
        }
        setSleepMinutes(0);
        setSleepEndsAt(null);
        fadeOutSessionRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  const tonePlayerRef = useRef<AudioPlayer | null>(null);
  const tonePlayGenRef = useRef(0);
  const pendingToneWritesRef = useRef(new Set<Promise<void>>());
  const bgPlayerRef = useRef<AudioPlayer | null>(null);
  const soundscapePlayerRef = useRef<AudioPlayer | null>(null);
  const soundscapePlayGenRef = useRef(0);
  const pendingSoundscapeSourcesRef = useRef(new Set<Promise<AudioSource>>());
  const soundscapeCacheRef = useRef<Partial<Record<SoundscapeKey, string>>>({});
  // Web-only: gapless oscillator engine, created lazily on first play.
  const webToneRef = useRef<WebToneEngine | null>(null);
  const webSoundscapeRef = useRef<WebSoundscapeEngine | null>(null);
  const toneVolumeRef = useRef(toneVolume);

  useEffect(() => {
    toneVolumeRef.current = toneVolume;
  }, [toneVolume]);

  // Refs that always reflect latest values, for use inside throttle callbacks.
  const stateRef = useRef({ leftHz, rightHz, isTonePlaying });
  useEffect(() => {
    stateRef.current = { leftHz, rightHz, isTonePlaying };
  }, [leftHz, rightHz, isTonePlaying]);

  const slideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideLastFireRef = useRef(0);
  const slidePendingRef = useRef<{ l: number; r: number } | null>(null);

  const beat = Math.abs(leftHz - rightHz);
  const band = useMemo(() => bandFor(beat), [beat]);
  const activeTuning = activeBand === 'tuning'
    ? TUNINGS.find(t => t.id === activePresetId) ?? null
    : null;
  const activeChakra = activePresetId && activePresetId.startsWith('cr-')
    ? CHAKRAS.find(c => c.id === activePresetId) ?? null
    : null;
  const activeSoundscape = activeSoundscapeId
    ? SOUNDSCAPES.find(s => s.id === activeSoundscapeId) ?? null
    : null;
  const activeRoutineSteps = activeRoutine ? orderedRoutineSteps(activeRoutine.path) : [];
  const activeRoutineStep = activeRoutine
    ? activeRoutineSteps[activeRoutine.stepIndex] ?? null
    : null;
  const activeRoutineFrequency = activeRoutine && activeRoutineStep
    ? `${activeRoutineStep.bandTarget.charAt(0).toUpperCase()}${activeRoutineStep.bandTarget.slice(1)} · ${activeRoutineStep.targetHz} Hz`
    : null;
  const beatColor =
    activeBand === 'none' ? '#9aa0b4' :
    activeChakra ? activeChakra.color :
    activeBand === 'tuning' ? PALETTES.tuning.accent :
    PALETTES[activeBand]?.accent ?? band.color;

  // Mount: audio mode + load saved presets.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setUserPresets(parsed);
        } catch {
          // Corrupted preset blob. Drop it silently.
        }
      })
      .catch(() => {})
      .finally(() => { presetsHydratedRef.current = true; });
    return () => {
      try { webToneRef.current?.stop(); } catch {}
      try { tonePlayerRef.current?.release(); } catch {}
      try { tonePlayerRef.current?.remove?.(); } catch {}
      try { bgPlayerRef.current?.release(); } catch {}
      try { bgPlayerRef.current?.remove?.(); } catch {}
      try { soundscapePlayerRef.current?.release(); } catch {}
      try { soundscapePlayerRef.current?.remove?.(); } catch {}
      try { webSoundscapeRef.current?.stop(); } catch {}
    };
  }, []);

  // Persist presets, but only after hydration has finished. This effect also
  // fires on the initial [] state, and writing that before the load resolves
  // would wipe saved presets if the app is killed in the window (or if the
  // load fails).
  const presetsHydratedRef = useRef(false);
  // A successful destructive wipe resets the in-memory preset array. Skip the
  // persistence effect for that one reset so it cannot recreate a just-removed
  // AsyncStorage key as an empty JSON array.
  const skipNextPresetPersistRef = useRef(false);
  useEffect(() => {
    if (!presetsHydratedRef.current) return;
    if (skipNextPresetPersistRef.current) {
      skipNextPresetPersistRef.current = false;
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets)).catch(() => {});
  }, [userPresets]);

  // --- Audio core ----------------------------------------------------------

  async function loadAndPlay(l: number, r: number) {
    const myGen = ++tonePlayGenRef.current;
    setIsToneLoading(true);
    try {
      // Web: drive the oscillator engine directly. No WAV, no looping, so no
      // seam. Repeated calls (e.g. dragging a slider) glide the frequencies.
      if (Platform.OS === 'web') {
        if (!webToneRef.current) webToneRef.current = new WebToneEngine();
        webToneRef.current.setVolume(toneVolumeRef.current);
        await webToneRef.current.play(clampHz(l), clampHz(r));
        if (myGen !== tonePlayGenRef.current) {
          // A newer call owns the shared engine now. Do not stop it here;
          // that would silence the tones the winning call just started.
          return;
        }
        setIsTonePlaying(true);
        return;
      }

      // Yield so the UI can update before we synthesize.
      await new Promise(resolve => setTimeout(resolve, 0));
      const base64 = buildWav(clampHz(l), clampHz(r));
      if (myGen !== tonePlayGenRef.current) return;

      // Native writes the synthesized WAV to a cache file and plays the file
      // URI (with a cache-busting query so the audio system re-reads it).
      const toneWrite = FileSystem.writeAsStringAsync(TONE_FILE_PATH, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      pendingToneWritesRef.current.add(toneWrite);
      try {
        await toneWrite;
      } finally {
        pendingToneWritesRef.current.delete(toneWrite);
      }
      if (myGen !== tonePlayGenRef.current) return;
      const source = { uri: `${TONE_FILE_PATH}?v=${Date.now()}` };

      const existing = tonePlayerRef.current;
      if (existing) {
        try { existing.pause(); } catch {}
        try {
          existing.replace(source);
        } catch {
          // If replace is unavailable, hard-reset.
          try { existing.release(); } catch {}
          try { existing.remove?.(); } catch {}
          tonePlayerRef.current = createAudioPlayer(source);
          tonePlayerRef.current.loop = true;
          tonePlayerRef.current.volume = toneVolumeRef.current;
        }
      } else {
        const p = createAudioPlayer(source);
        p.loop = true;
        p.volume = toneVolumeRef.current;
        tonePlayerRef.current = p;
      }

      // replace() retains the existing player instance, so explicitly apply
      // the latest level for both replacement and newly created paths.
      if (tonePlayerRef.current) tonePlayerRef.current.volume = toneVolumeRef.current;

      if (myGen !== tonePlayGenRef.current) {
        try { tonePlayerRef.current?.pause(); } catch {}
        return;
      }

      tonePlayerRef.current?.play();
      setIsTonePlaying(true);
    } catch (e) {
      console.warn('tone load failed', e);
    } finally {
      if (myGen === tonePlayGenRef.current) setIsToneLoading(false);
    }
  }

  function clearRoutineSchedule() {
    if (!activeRoutineRef.current && !pendingRoutineRef.current && !routineTimerRef.current) return;
    routineGenerationRef.current += 1;
    if (routineTimerRef.current) {
      clearTimeout(routineTimerRef.current);
      routineTimerRef.current = null;
    }
    activeRoutineRef.current = null;
    setActiveRoutine(null);
    pendingRoutineRef.current = null;
  }

  function stopTones() {
    clearRoutineSchedule();
    tonePlayGenRef.current++;
    if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
      slideTimeoutRef.current = null;
    }
    slidePendingRef.current = null;
    if (Platform.OS === 'web') {
      try { webToneRef.current?.stop(); } catch {}
      setIsTonePlaying(false);
      setIsToneLoading(false);
      return;
    }
    const player = tonePlayerRef.current;
    tonePlayerRef.current = null;
    if (player) {
      try { (player as any).loop = false; } catch {}
      try { player.volume = 0; } catch {}
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
      try { (player as any).remove?.(); } catch {}
    }
    setIsTonePlaying(false);
    setIsToneLoading(false);
  }

  function orderedRoutineSteps(path: RoutinePathPayload): RoutinePathStep[] {
    return [...path.steps].sort((a, b) => a.order - b.order);
  }

  function applyRoutineStep(step: RoutinePathStep) {
    const preset = PRESETS.find(item => item.id === step.presetId);
    const carrier = preset?.carrier ?? 200;
    const half = step.targetHz / 2;
    const l = clampHz(carrier - half);
    const r = clampHz(carrier + half);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(step.presetId);
    setActiveBand(step.bandTarget);
    loadAndPlay(l, r);
  }

  function syncRoutineToClock(
    path: RoutinePathPayload,
    startedAt: number,
    generation: number,
  ) {
    if (generation !== routineGenerationRef.current) return;
    const steps = orderedRoutineSteps(path);
    if (!steps.length) return;

    const now = Date.now();
    const elapsed = Math.max(0, now - startedAt);
    let cumulativeMs = 0;
    let nextStepIndex = -1;
    let stepEndsAt = startedAt;
    for (let index = 0; index < steps.length; index += 1) {
      cumulativeMs += steps[index].durationMinutes * 60 * 1000;
      if (elapsed < cumulativeMs) {
        nextStepIndex = index;
        stepEndsAt = startedAt + cumulativeMs;
        break;
      }
    }

    if (nextStepIndex < 0) {
      stopTones();
      return;
    }

    const previous = activeRoutineRef.current;
    const nextSession: ActiveRoutineSession = {
      path,
      stepIndex: nextStepIndex,
      startedAt,
      stepEndsAt,
    };
    activeRoutineRef.current = nextSession;
    setActiveRoutine(nextSession);

    if (
      previous?.path.id !== path.id
      || previous.stepIndex !== nextStepIndex
      || !stateRef.current.isTonePlaying
    ) {
      applyRoutineStep(steps[nextStepIndex]);
    }

    if (routineTimerRef.current) clearTimeout(routineTimerRef.current);
    routineTimerRef.current = setTimeout(() => {
      routineTimerRef.current = null;
      syncRoutineToClock(path, startedAt, generation);
    }, Math.max(50, stepEndsAt - Date.now()));
  }

  function beginRoutine(path: RoutinePathPayload) {
    if (!path.steps.length) return;
    if (routineTimerRef.current) clearTimeout(routineTimerRef.current);
    routineTimerRef.current = null;
    routineGenerationRef.current += 1;
    const generation = routineGenerationRef.current;
    pendingRoutineRef.current = null;
    setSleepTimer(0);
    syncRoutineToClock(path, Date.now(), generation);
  }

  function requestStartRoutine(path: RoutinePathPayload) {
    if (!audioSafetyAck) {
      pendingRoutineRef.current = path;
      setShowAudioSafetyModal(true);
      return;
    }
    beginRoutine(path);
  }

  function requestStopRoutine() {
    stopTones();
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      const session = activeRoutineRef.current;
      if (!session) return;
      syncRoutineToClock(session.path, session.startedAt, routineGenerationRef.current);
    });
    return () => subscription.remove();
  }, []);

  function fadeNativePlayer(player: AudioPlayer | null, target: number, durationMs = 2500) {
    if (!player) return Promise.resolve();
    const start = typeof player.volume === 'number' ? player.volume : 1;
    const steps = 18;
    let step = 0;
    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        step += 1;
        const p = step / steps;
        try { player.volume = start + (target - start) * p; } catch {}
        if (step >= steps) {
          clearInterval(interval);
          resolve();
        }
      }, Math.max(16, durationMs / steps));
    });
  }

  async function fadeOutSession() {
    const tone = tonePlayerRef.current;
    const bg = bgPlayerRef.current;
    const soundscape = soundscapePlayerRef.current;
    // Both callers are sleep-timer completions, so a playing tone here means
    // the user listened through a whole timed session. Never prompts for a
    // review here (they may be asleep); it only feeds the gate counters.
    if (stateRef.current.isTonePlaying) recordSessionCompleted().catch(() => {});
    if (Platform.OS === 'web') {
      stopTones();
      stopSoundscape();
    } else {
      await Promise.all([
        fadeNativePlayer(tone, 0),
        fadeNativePlayer(bg, 0),
        fadeNativePlayer(soundscape, 0),
      ]);
      if (tone) stopTones();
    }
    if (bg) {
      try { bg.pause(); } catch {}
      try { bg.volume = bgVolume; } catch {}
      setIsBgPlaying(false);
    }
    if (soundscape) {
      try { soundscape.pause(); } catch {}
      try { soundscape.volume = soundscapeVolume; } catch {}
      setIsSoundscapePlaying(false);
    }
  }

  function togglePlay() {
    if (isTonePlaying || isToneLoading) { stopTones(); return; }
    // Show the audio-safety modal once per app session before the first
    // Play. Confirmation starts playback. State resets on cold start
    // (useState in App), so users get the reminder each new session.
    if (!audioSafetyAck) {
      setShowAudioSafetyModal(true);
      return;
    }
    startSession();
  }

  function acknowledgeAudioSafetyAndPlay() {
    setAudioSafetyAck(true);
    setShowAudioSafetyModal(false);
    const pendingRoutine = pendingRoutineRef.current;
    if (pendingRoutine) {
      beginRoutine(pendingRoutine);
      return;
    }
    startSession();
  }

  function startSession() {
    if (activeRoutineRef.current) {
      clearRoutineSchedule();
    }
    // The background palette follows activeBand, which starts as 'none'
    // (gray) until something sets it. Detect the band from the current pair
    // at session start so the backdrop transitions out of gray on play.
    if (activeBand === 'none') applyDetection(leftHz, rightHz);
    loadAndPlay(leftHz, rightHz);
  }

  // Fire-rate-limited live update used while sliders are being dragged.
  function liveUpdate(l: number, r: number) {
    if (!stateRef.current.isTonePlaying) return;
    slidePendingRef.current = { l, r };
    const now = Date.now();
    const since = now - slideLastFireRef.current;
    if (since >= SLIDE_THROTTLE_MS) {
      slideLastFireRef.current = now;
      const p = slidePendingRef.current;
      slidePendingRef.current = null;
      loadAndPlay(p.l, p.r);
    } else if (!slideTimeoutRef.current) {
      slideTimeoutRef.current = setTimeout(() => {
        slideTimeoutRef.current = null;
        slideLastFireRef.current = Date.now();
        const p = slidePendingRef.current;
        slidePendingRef.current = null;
        if (p) loadAndPlay(p.l, p.r);
      }, SLIDE_THROTTLE_MS - since);
    }
  }

  // --- Frequency commits (slider release / numpad submit) ------------------

  // Set band/preset state from a candidate L/R pair. If the carrier matches a
  // tuning frequency (within 1 Hz), light up the gold tuning theme; otherwise
  // fall back to the brainwave band derived from the beat.
  function applyDetection(l: number, r: number) {
    clearRoutineSchedule();
    const carrier = (l + r) / 2;
    const tuning = TUNINGS.find(t => Math.abs(t.hz - carrier) <= 1);
    if (tuning) {
      setActivePresetId(tuning.id);
      setActiveBand('tuning');
    } else {
      setActivePresetId(null);
      setActiveBand(bandFor(Math.abs(l - r)).key);
    }
  }

  function onLeftSlide(v: number) {
    const c = clampHz(v);
    setLeftHz(c);
    applyDetection(c, stateRef.current.rightHz);
    liveUpdate(c, stateRef.current.rightHz);
  }
  function onRightSlide(v: number) {
    const c = clampHz(v);
    setRightHz(c);
    applyDetection(stateRef.current.leftHz, c);
    liveUpdate(stateRef.current.leftHz, c);
  }

  function commitLeft(v: number) {
    const c = clampHz(v);
    setLeftHz(c);
    applyDetection(c, stateRef.current.rightHz);
    if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
      slideTimeoutRef.current = null;
    }
    slidePendingRef.current = null;
    if (stateRef.current.isTonePlaying) loadAndPlay(c, stateRef.current.rightHz);
  }
  function commitRight(v: number) {
    const c = clampHz(v);
    setRightHz(c);
    applyDetection(stateRef.current.leftHz, c);
    if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
      slideTimeoutRef.current = null;
    }
    slidePendingRef.current = null;
    if (stateRef.current.isTonePlaying) loadAndPlay(stateRef.current.leftHz, c);
  }

  // Beat-first control: the hero card lets users set the beat and carrier
  // directly (the mental model of binaural). splitBeatCarrier round-trips
  // exactly, so the sliders never get fed a drifted value mid-drag.
  function slideBeatCarrier(beatV: number, carrierV: number) {
    const [l, r] = splitBeatCarrier(beatV, carrierV);
    // Idempotency guard: if this produces the pair we already hold, do not
    // re-enter setState. Breaks any slider value-prop feedback cycle.
    if (l === stateRef.current.leftHz && r === stateRef.current.rightHz) return;
    setLeftHz(l);
    setRightHz(r);
    applyDetection(l, r);
    liveUpdate(l, r);
  }
  function commitBeatCarrier(beatV: number, carrierV: number) {
    const [l, r] = splitBeatCarrier(beatV, carrierV);
    setLeftHz(l);
    setRightHz(r);
    applyDetection(l, r);
    if (slideTimeoutRef.current) {
      clearTimeout(slideTimeoutRef.current);
      slideTimeoutRef.current = null;
    }
    slidePendingRef.current = null;
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyBuiltIn(p: BuiltInPreset) {
    clearRoutineSchedule();
    const half = p.beatHz / 2;
    const l = clampHz(p.carrier - half);
    const r = clampHz(p.carrier + half);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(p.id);
    setActiveBand(p.band);
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyUser(p: UserPreset) {
    clearRoutineSchedule();
    setLeftHz(p.leftHz);
    setRightHz(p.rightHz);
    setActivePresetId(p.id);
    const beatHz = Math.abs(p.leftHz - p.rightHz);
    setActiveBand(beatHz === 0 ? 'tuning' : bandFor(beatHz).key);
    if (stateRef.current.isTonePlaying) loadAndPlay(p.leftHz, p.rightHz);
  }

  function applyTuning(t: TuningPreset) {
    clearRoutineSchedule();
    // Carrier dropped by octaves into a comfortable range, with a 6 Hz theta
    // beat (3 below, 3 above). Octave shifts preserve the musical note, so
    // the symbolic Solfeggio pitch is intact but no longer piercing.
    const carrier = comfortableCarrier(t.hz);
    const l = clampHz(carrier - 3);
    const r = clampHz(carrier + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(t.id);
    setActiveBand('tuning');
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyChakra(c: Chakra) {
    clearRoutineSchedule();
    const carrier = comfortableCarrier(c.hz);
    const l = clampHz(carrier - 3);
    const r = clampHz(carrier + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(c.id);
    setActiveBand(c.band);
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyDosha(d: Dosha) {
    clearRoutineSchedule();
    const carrier = comfortableCarrier(d.balanceHz);
    const l = clampHz(carrier - 3);
    const r = clampHz(carrier + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(`dosha-${d.id}`);
    setActiveBand(d.band);
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  // Computed display name for the band. Prefers chakra/dosha/tuning names
  // over the raw brainwave band when the user has tapped a specific preset.
  const displayBandName = useMemo(() => {
    const chakra = CHAKRAS.find(c => c.band === activeBand);
    if (chakra) return chakra.name;
    if (activePresetId && activePresetId.startsWith('dosha-')) {
      const d = DOSHAS.find(dd => `dosha-${dd.id}` === activePresetId);
      if (d) return d.name;
    }
    if (activeTuning) return activeTuning.name;
    return band.name;
  }, [activeBand, activePresetId, activeTuning, band.name]);

  function deleteUser(p: UserPreset) {
    confirmAction('Delete preset?', `"${p.name}" will be removed.`, 'Delete', () => {
      setUserPresets(curr => curr.filter(x => x.id !== p.id));
      if (activePresetId === p.id) {
        setActivePresetId(null);
        setActiveBand('none');
      }
    });
  }

  function openSaveModal() {
    setSaveName(`${beat} Hz mix`);
    setShowSaveModal(true);
  }

  function confirmSave() {
    const name = saveName.trim();
    if (!name) { setShowSaveModal(false); return; }
    const preset: UserPreset = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name, leftHz, rightHz, createdAt: Date.now(),
    };
    setUserPresets(curr => [preset, ...curr]);
    setActivePresetId(preset.id);
    setShowSaveModal(false);
  }

  // --- Background music ----------------------------------------------------

  async function pickBgFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      try { bgPlayerRef.current?.release(); } catch {}
      try { bgPlayerRef.current?.remove?.(); } catch {}
      bgPlayerRef.current = null;
      setIsBgPlaying(false);
      setBgUri(file.uri);
      setBgFileName(file.name);
    } catch (e) {
      notify('Could not pick file', String(e));
    }
  }

  function toggleBg() {
    if (!bgUri) return;
    if (isBgPlaying) {
      try { bgPlayerRef.current?.pause(); } catch {}
      setIsBgPlaying(false);
      return;
    }
    if (!bgPlayerRef.current) {
      const p = createAudioPlayer({ uri: bgUri });
      p.loop = true;
      p.volume = bgVolume;
      bgPlayerRef.current = p;
    } else {
      bgPlayerRef.current.volume = bgVolume;
    }
    bgPlayerRef.current.play();
    setIsBgPlaying(true);
  }

  function changeBgVolume(v: number) {
    setBgVolume(v);
    if (bgPlayerRef.current) bgPlayerRef.current.volume = v;
  }

  function clearBg() {
    try { bgPlayerRef.current?.release(); } catch {}
    try { bgPlayerRef.current?.remove?.(); } catch {}
    bgPlayerRef.current = null;
    setIsBgPlaying(false);
    setBgFileName(null);
    setBgUri(null);
  }

  async function ensureSoundscapeSource(id: SoundscapeKey): Promise<AudioSource> {
    const bundled = BUNDLED_SOUNDSCAPES[id];
    if (bundled) return bundled;

    const cached = soundscapeCacheRef.current[id];
    if (cached) return { uri: cached };

    const base64 = buildSoundscapeWav(id);
    const uri = `${SOUNDSCAPE_FILE_PREFIX}${id}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    soundscapeCacheRef.current[id] = uri;
    return { uri };
  }

  async function playSoundscape(id: SoundscapeKey) {
    const myGeneration = ++soundscapePlayGenRef.current;
    try {
      if (Platform.OS === 'web') {
        if (!webSoundscapeRef.current) webSoundscapeRef.current = new WebSoundscapeEngine();
        await webSoundscapeRef.current.play(id, soundscapeVolume);
        if (myGeneration !== soundscapePlayGenRef.current) return;
        setActiveSoundscapeId(id);
        setIsSoundscapePlaying(true);
        return;
      }
      const sourcePromise = ensureSoundscapeSource(id);
      pendingSoundscapeSourcesRef.current.add(sourcePromise);
      let source: AudioSource;
      try {
        source = await sourcePromise;
      } finally {
        pendingSoundscapeSourcesRef.current.delete(sourcePromise);
      }
      if (myGeneration !== soundscapePlayGenRef.current) return;
      if (!soundscapePlayerRef.current || activeSoundscapeId !== id) {
        try { soundscapePlayerRef.current?.release(); } catch {}
        try { soundscapePlayerRef.current?.remove?.(); } catch {}
        const p = createAudioPlayer(source);
        p.loop = true;
        p.volume = effectiveSoundscapeVolume(id, soundscapeVolume);
        soundscapePlayerRef.current = p;
      } else {
        soundscapePlayerRef.current.volume = effectiveSoundscapeVolume(id, soundscapeVolume);
      }
      soundscapePlayerRef.current.play();
      setActiveSoundscapeId(id);
      setIsSoundscapePlaying(true);
    } catch (e) {
      console.warn('soundscape failed', e);
    }
  }

  function stopSoundscape() {
    soundscapePlayGenRef.current += 1;
    if (Platform.OS === 'web') {
      try { webSoundscapeRef.current?.stop(); } catch {}
      setIsSoundscapePlaying(false);
      return;
    }
    try { soundscapePlayerRef.current?.pause(); } catch {}
    setIsSoundscapePlaying(false);
  }

  function toggleSoundscape(id: SoundscapeKey) {
    if (activeSoundscapeId === id && isSoundscapePlaying) {
      stopSoundscape();
      return;
    }
    playSoundscape(id);
  }

  function changeSoundscapeVolume(v: number) {
    setSoundscapeVolume(v);
    if (Platform.OS === 'web') webSoundscapeRef.current?.setVolume(v);
    if (soundscapePlayerRef.current && activeSoundscapeId) {
      soundscapePlayerRef.current.volume = effectiveSoundscapeVolume(activeSoundscapeId, v);
    }
  }

  function changeToneVolume(v: number) {
    const next = clamp01(v);
    toneVolumeRef.current = next;
    setToneVolume(next);
    if (Platform.OS === 'web') webToneRef.current?.setVolume(next);
    if (tonePlayerRef.current) tonePlayerRef.current.volume = next;
  }

  function stopEverything() {
    setSleepTimer(0);
    stopTones();
    stopSoundscape();
    if (isBgPlaying) {
      try { bgPlayerRef.current?.pause(); } catch {}
      setIsBgPlaying(false);
    }
  }

  async function deleteWipeAudioCaches() {
    if (Platform.OS === 'web') {
      if (bgUri?.startsWith('blob:') && typeof globalThis.URL?.revokeObjectURL === 'function') {
        globalThis.URL.revokeObjectURL(bgUri);
      }
      return;
    }

    // A procedural soundscape may still be finishing its cache write when the
    // user confirms the wipe. Let that write settle before deleting known
    // cache paths so it cannot recreate a file after successful verification.
    await Promise.allSettled([
      ...pendingToneWritesRef.current,
      ...pendingSoundscapeSourcesRef.current,
    ]);

    const documentPickerCache = appOwnedDocumentPickerCacheUri(FileSystem.cacheDirectory);
    const generatedSoundscapes = SOUNDSCAPES
      .filter(item => !BUNDLED_SOUNDSCAPES[item.id])
      .map(item => `${SOUNDSCAPE_FILE_PREFIX}${item.id}.wav`);
    const paths = [documentPickerCache, TONE_FILE_PATH, ...generatedSoundscapes]
      .filter((path): path is string => Boolean(path));

    const results = await Promise.allSettled(
      paths.map(path => FileSystem.deleteAsync(path, { idempotent: true })),
    );
    // Never retain paths that this wipe attempted to delete, even when one
    // unrelated cache deletion failed and the overall wipe must reject.
    soundscapeCacheRef.current = {};
    if (results.some(result => result.status === 'rejected')) {
      throw new Error('An app audio cache could not be deleted.');
    }
  }

  function stopAndReleaseAudioForWipe() {
    setSleepTimer(0);
    stopTones();
    stopSoundscape();

    try { webToneRef.current?.stop(); } catch {}
    try { webSoundscapeRef.current?.stop(); } catch {}
    webToneRef.current = null;
    webSoundscapeRef.current = null;

    const bgPlayer = bgPlayerRef.current;
    bgPlayerRef.current = null;
    if (bgPlayer) {
      try { bgPlayer.pause(); } catch {}
      try { bgPlayer.release(); } catch {
        try { bgPlayer.remove?.(); } catch {}
      }
    }

    const soundscapePlayer = soundscapePlayerRef.current;
    soundscapePlayerRef.current = null;
    if (soundscapePlayer) {
      try { soundscapePlayer.pause(); } catch {}
      try { soundscapePlayer.release(); } catch {
        try { soundscapePlayer.remove?.(); } catch {}
      }
    }

    setIsBgPlaying(false);
    setIsSoundscapePlaying(false);
  }

  async function wipeAllAppData() {
    // Stop every timer/player before deleting cache files they may still hold.
    stopAndReleaseAudioForWipe();
    invalidateNotificationScheduling();

    const failures: unknown[] = [];
    const attempt = async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    };

    // Keep all cleanup attempts independent so one unavailable subsystem does
    // not prevent deletion from the others. Any failure still rejects the
    // overall action and Safety will not claim that the wipe succeeded.
    await attempt(removeGeminiApiKey);
    await attempt(() => removeAndVerifyAppStorage(AsyncStorage));
    await attempt(deleteWipeAudioCaches);
    if (Platform.OS !== 'web' && !IS_EXPO_GO) {
      await attempt(async () => {
        await Promise.allSettled([...pendingNotificationOperations]);
        await Notifications.cancelAllScheduledNotificationsAsync();
      });
    }

    // Reset App-owned state directly. Calling the normal preference handlers
    // here would immediately write their defaults back into AsyncStorage. Do
    // this even after a partial subsystem failure so stale in-memory App state
    // cannot resurrect data that another cleanup step did remove. Safety still
    // receives a rejection and never reports a complete wipe in that case.
    pinnedMorePagesTouched.current = true;
    // Match the post-wipe relaunch, where an empty store resolves to the
    // default pins.
    pinnedMorePagesRef.current = [...DEFAULT_PINNED_MORE_PAGES];
    setPinnedMorePages([...DEFAULT_PINNED_MORE_PAGES]);
    setNewlyPinnedMorePage(null);
    setMorePageRequest(null);
    setSingleColor(null);
    setNotifPref('off');
    setAffirmation(null);
    setAffLoading(false);
    setMySignId(null);

    // setUserPresets receives a fresh empty array even when it was already
    // empty, so always suppress the resulting persistence effect.
    skipNextPresetPersistRef.current = true;
    setUserPresets([]);
    setLeftHz(DEFAULT_LEFT);
    setRightHz(DEFAULT_RIGHT);
    setActivePresetId(null);
    setActiveBand('none');
    toneVolumeRef.current = 1;
    setToneVolume(1);
    setShowSaveModal(false);
    setSaveName('');

    setBgUri(null);
    setBgFileName(null);
    setBgVolume(0.5);
    setActiveSoundscapeId(null);
    setSoundscapeVolume(0.42);
    setAudioSafetyAck(false);
    setShowAudioSafetyModal(false);
    pendingRoutineRef.current = null;
    setOnboardingIsReplay(false);

    if (failures.length > 0) {
      throw new Error('Simply Ambient could not verify a complete data wipe.');
    }
  }

  // --- Render --------------------------------------------------------------

  // Web always gets the centered phone-width column. Tablets get the same
  // treatment once the window is wide enough that single-column cards would
  // stretch uncomfortably; the gradient stays full-bleed behind the column.
  const { width: windowW } = useWindowDimensions();
  const columnClamp = Platform.OS === 'web' || windowW >= 700 ? styles.contentColumn : null;

  return (
    <View style={styles.root}>
      <WaveBackground
        band={activeBand}
        playing={isTonePlaying || isSoundscapePlaying || isBgPlaying}
        overrideColor={singleColor}
      />
      <StatusBar style="light" />
      <SafeAreaView style={[styles.safe, columnClamp]} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1 }}>
            {tab === 'frequencies' && (
              <FrequenciesView
                leftHz={leftHz} rightHz={rightHz}
                beat={beat}
                band={band}
                activeBand={activeBand}
                activeTuning={activeTuning}
                activeChakra={activeChakra}
                activePresetId={activePresetId}
                sleepMinutes={sleepMinutes}
                onSetSleepTimer={setSleepTimer}
                isTonePlaying={isTonePlaying}
                isToneLoading={isToneLoading}
                toneVolume={toneVolume}
                userPresets={userPresets}
                bgFileName={bgFileName}
                isBgPlaying={isBgPlaying}
                bgVolume={bgVolume}
                beatColor={beatColor}
                onCommitLeft={commitLeft}
                onCommitRight={commitRight}
                onSlideLeft={onLeftSlide}
                onSlideRight={onRightSlide}
                onSlideBeatCarrier={slideBeatCarrier}
                onCommitBeatCarrier={commitBeatCarrier}
                onApplyBuiltIn={applyBuiltIn}
                onApplyUser={applyUser}
                onApplyTuning={applyTuning}
                onDeleteUser={deleteUser}
                onSave={openSaveModal}
                onTogglePlay={togglePlay}
                onChangeToneVolume={changeToneVolume}
                onPickBg={pickBgFile}
                onToggleBg={toggleBg}
                onChangeBgVolume={changeBgVolume}
                onClearBg={clearBg}
              />
            )}
            {tab === 'breath' && (
              <BreathworkView
                toneIsPlaying={isTonePlaying}
                beatHz={beat}
                bandName={displayBandName}
                bandColor={beatColor}
              />
            )}
            {tab === 'chakras' && (
              <ChakrasView
                chakras={CHAKRAS}
                doshas={DOSHAS}
                activePresetId={activePresetId}
                onApplyChakra={applyChakra}
                onApplyDosha={applyDosha}
                toneIsPlaying={isTonePlaying}
                toneIsLoading={isToneLoading}
                onTogglePlay={togglePlay}
                beatHz={beat}
                bandName={displayBandName}
                bandColor={beatColor}
              />
            )}
            {tab === 'horoscopes' && (
              <HoroscopesView
                zodiac={ZODIAC}
                mySign={mySign}
                lunar={lunar}
                onSelectMyZodiac={selectMyZodiac}
                toneIsPlaying={isTonePlaying}
                beatHz={beat}
              />
            )}
            {tab === 'more' && (
              <MoreView
                notifPref={notifPref}
                onChangeNotifPref={changeNotifPref}
                affirmation={affirmation}
                affirmationLoading={affLoading}
                onRefreshAffirmation={refreshAffirmation}
                isExpoGo={IS_EXPO_GO}
                soundscapes={SOUNDSCAPES}
                activeSoundscapeId={activeSoundscapeId}
                isSoundscapePlaying={isSoundscapePlaying}
                soundscapeVolume={soundscapeVolume}
                onToggleSoundscape={(id) => toggleSoundscape(id as SoundscapeKey)}
                onChangeSoundscapeVolume={changeSoundscapeVolume}
                activeRoutineId={activeRoutine?.path.id ?? null}
                onStartRoutine={requestStartRoutine}
                onStopRoutine={requestStopRoutine}
                pinnedMorePages={pinnedMorePages}
                onTogglePinnedMorePage={togglePinnedMorePage}
                onClearPinnedMorePages={clearPinnedMorePages}
                requestedPage={morePageRequest}
                onRequestedPageHandled={() => setMorePageRequest(null)}
                onPageChange={setMoreActivePage}
                singleColor={singleColor}
                ambientAccent={beatColor}
                onChangeSingleColor={setSingleColorPref}
                onReplayOnboarding={replayOnboarding}
                onWipeAllData={wipeAllAppData}
              />
            )}
          </View>
        </KeyboardAvoidingView>

        <View
          pointerEvents="box-none"
          style={[
            styles.miniPlayerOverlay,
            activeRoutine && styles.miniPlayerOverlayRoutine,
            { bottom: tabBarHeight },
          ]}
        >
          <MiniPlayer
            visible={activeRoutine != null || isTonePlaying || isToneLoading || isSoundscapePlaying || isBgPlaying || sleepEndsAt != null}
            title={displayBandName}
            beat={beat}
            accent={beatColor}
            isTonePlaying={isTonePlaying}
            isToneLoading={isToneLoading}
            sleepEndsAt={sleepEndsAt}
            soundscapeName={activeSoundscape?.name ?? null}
            soundscapePlaying={isSoundscapePlaying}
            routineName={activeRoutine?.path.name ?? null}
            routineFrequency={activeRoutineFrequency}
            routineSteps={activeRoutineSteps}
            routineStepIndex={activeRoutine?.stepIndex ?? null}
            routineStepEndsAt={activeRoutine?.stepEndsAt ?? null}
            hasSoundscape={activeSoundscapeId != null}
            onSoundscapePress={() => {
              if (activeSoundscapeId) {
                toggleSoundscape(activeSoundscapeId);
              } else {
                setMorePageRequest('soundscapes');
                setTab('more');
              }
            }}
            hasBg={bgUri != null}
            bgPlaying={isBgPlaying}
            onBgPress={toggleBg}
            onTogglePlay={activeRoutine ? requestStopRoutine : togglePlay}
            onOpen={() => {
              if (activeRoutine) {
                setMorePageRequest('routines');
                setTab('more');
              } else {
                setTab('frequencies');
              }
            }}
            onStopAll={stopEverything}
          />
        </View>
        <View
          collapsable={false}
          onLayout={event => {
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight > 0) {
              setTabBarHeight(current => Math.abs(current - nextHeight) > 0.5 ? nextHeight : current);
            }
          }}
        >
          <TabBar
            tab={tab}
            onChange={nextTab => {
              if (nextTab === 'more') openMoreHub();
              else setTab(nextTab);
            }}
            accent={beatColor}
            pinnedMorePages={pinnedMorePages}
            moreActivePage={moreActivePage}
            newlyPinnedMorePage={newlyPinnedMorePage}
            onOpenMorePage={openMorePageFromNav}
          />
        </View>
      </SafeAreaView>

      {onboardingChecked && showOnboarding ? (
        <View style={[StyleSheet.absoluteFill, styles.onboardingLayer]}>
          <View style={[{ flex: 1, width: '100%' }, columnClamp]}>
            <OnboardingView onDone={dismissOnboarding} isReplay={onboardingIsReplay} />
          </View>
        </View>
      ) : null}

      <DialogHost />

      <Modal visible={showSaveModal} transparent animationType="fade" onRequestClose={() => setShowSaveModal(false)}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowSaveModal(false); }}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Save preset</Text>
                <Text style={styles.modalSub}>L {leftHz} Hz · R {rightHz} Hz · beat {beat} Hz</Text>
                <TextInput
                  style={styles.modalInput}
                  value={saveName}
                  onChangeText={setSaveName}
                  placeholder="Preset name"
                  placeholderTextColor="#ffffff55"
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmSave}
                />
                <View style={styles.modalRow}>
                  <TouchableOpacity onPress={() => setShowSaveModal(false)} style={[styles.modalBtn, styles.modalBtnGhost]}>
                    <Text style={styles.modalBtnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmSave} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                    <Text style={styles.modalBtnPrimaryText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* One-time-per-session audio safety reminder shown before the very
          first Play tap. State resets on cold start so the user sees this
          again next session. */}
      <Modal
        visible={showAudioSafetyModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          pendingRoutineRef.current = null;
          setShowAudioSafetyModal(false);
        }}
      >
        <View style={styles.audioSafetyBackdrop}>
          <View style={styles.audioSafetyCard}>
            <Text style={styles.audioSafetyTitle}>Volume check</Text>
            <Text style={styles.audioSafetyBody}>
              Set your device volume to a low, comfortable level before tapping
              Play. Binaural tones should feel gentle in stereo headphones or
              earbuds. If anything feels piercing, sharp, or uncomfortable, stop
              immediately and lower the volume.
            </Text>
            <Text style={styles.audioSafetyBody}>
              Sustained loud headphone listening can damage hearing at any
              frequency. You control the volume; use it carefully.
            </Text>
            <View style={styles.audioSafetyActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  pendingRoutineRef.current = null;
                  setShowAudioSafetyModal(false);
                }}
                style={styles.audioSafetyCancelBtn}
                accessibilityLabel="Cancel"
              >
                <Text style={styles.audioSafetyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={acknowledgeAudioSafetyAndPlay}
                style={[styles.audioSafetySetBtn, { backgroundColor: beatColor }]}
                accessibilityLabel="Acknowledge audio safety and start playback"
              >
                <Text style={styles.audioSafetySetText}>I UNDERSTAND, PLAY</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default Sentry.wrap(function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    Cinzel_700Bold,
  });

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#0B0B1F' }} />;
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <AppContent />
      </View>
    </SafeAreaProvider>
  );
});

// ===========================================================================
//   TabBar
// ===========================================================================

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function routineStepFrequencyLabel(step: RoutinePathStep) {
  const bandName = step.bandTarget.charAt(0).toUpperCase() + step.bandTarget.slice(1);
  return `${bandName} · ${step.targetHz} Hz`;
}

function MiniPlayer({
  visible,
  title,
  beat,
  accent,
  isTonePlaying,
  isToneLoading,
  sleepEndsAt,
  soundscapeName,
  soundscapePlaying,
  routineName,
  routineFrequency,
  routineSteps,
  routineStepIndex,
  routineStepEndsAt,
  hasSoundscape,
  onSoundscapePress,
  hasBg,
  bgPlaying,
  onBgPress,
  onTogglePlay,
  onOpen,
  onStopAll,
}: {
  visible: boolean;
  title: string;
  beat: number;
  accent: string;
  isTonePlaying: boolean;
  isToneLoading: boolean;
  sleepEndsAt: number | null;
  soundscapeName: string | null;
  soundscapePlaying: boolean;
  routineName: string | null;
  routineFrequency: string | null;
  routineSteps: RoutinePathStep[];
  routineStepIndex: number | null;
  routineStepEndsAt: number | null;
  hasSoundscape: boolean;
  onSoundscapePress: () => void;
  hasBg: boolean;
  bgPlaying: boolean;
  onBgPress: () => void;
  onTogglePlay: () => void;
  onOpen: () => void;
  onStopAll: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [rendered, setRendered] = useState(visible);
  const { width: playerWidth } = useWindowDimensions();
  const compactPlayer = playerWidth < 360;
  const barOffset = useRef(new Animated.Value(visible ? 0 : 96)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || (!sleepEndsAt && !routineStepEndsAt)) return;
    // Refresh immediately: `now` may be minutes old if the bar has been
    // mounted a while, which would inflate the countdown until the first tick.
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [visible, sleepEndsAt, routineStepEndsAt]);

  useEffect(() => {
    barOffset.stopAnimation();

    if (visible && !rendered) {
      // Mount first so BlurView/backdrop-filter has a frame to capture the live
      // page underneath before any part of the player becomes visible.
      barOffset.setValue(96);
      setRendered(true);
      return;
    }
    if (!rendered) return;

    const run = () => {
      // Keep opacity off the glass hierarchy. CSS and native backdrop blur can
      // lose their live backdrop when an ancestor becomes an opacity layer.
      Animated.timing(barOffset, {
        toValue: visible ? 0 : 96,
        duration: visible ? 360 : 320,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !visible) setRendered(false);
      });
    };

    if (!visible) {
      run();
      return;
    }

    // Two display frames is long enough for both native BlurView and CSS
    // backdrop-filter to initialize, while keeping first-play response quick.
    const warmup = setTimeout(run, 34);
    return () => clearTimeout(warmup);
  }, [barOffset, rendered, visible]);

  useEffect(() => {
    if (!soundscapePlaying && !bgPlaying) {
      ringPulse.stopAnimation();
      ringPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ringPulse, soundscapePlaying, bgPlaying]);

  if (!rendered) return null;
  const timerText = sleepEndsAt ? formatRemaining(sleepEndsAt - now) : null;
  const routineRemainingText = routineStepEndsAt
    ? formatRemaining(routineStepEndsAt - now)
    : null;
  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const ringGlowOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.95] });
  const audioIsPlaying = isTonePlaying || soundscapePlaying || bgPlaying;
  const ambientLayers = [
    soundscapePlaying ? soundscapeName : null,
    bgPlaying ? 'Imported audio' : null,
  ].filter((name): name is string => Boolean(name));
  const toneTitle = `${title} · ${beat.toFixed(0)} Hz`;
  const sessionTitle = routineName ?? (
    isTonePlaying || isToneLoading
      ? ambientLayers.length ? `${title} + ${ambientLayers.join(' + ')}` : toneTitle
      : ambientLayers.length ? ambientLayers.join(' + ') : 'Session timer'
  );
  const sessionMeta = routineName && routineFrequency
    ? routineFrequency
    : isToneLoading
    ? 'Preparing your tone'
    : timerText && audioIsPlaying
      ? `${isTonePlaying ? `${beat.toFixed(0)} Hz tone` : 'Ambient layer'} · ends in ${timerText}`
      : timerText
        ? `Timer armed for ${timerText} · no audio playing`
        : isTonePlaying
          ? ambientLayers.length ? `${beat.toFixed(0)} Hz tone with ambience` : 'Pure binaural tone'
          : 'Ambient layer playing';
  const statusLabel = routineName && routineStepIndex != null
    ? `${compactPlayer ? 'PATH' : 'SESSION PATH'} · ${routineStepIndex + 1}/${routineSteps.length}`
    : isToneLoading ? 'PREPARING' : audioIsPlaying ? 'NOW PLAYING' : 'TIMER READY';
  const currentRoutineStep = routineStepIndex != null ? routineSteps[routineStepIndex] ?? null : null;
  const currentRoutinePosition = routineStepIndex != null ? routineStepIndex + 1 : null;
  const miniBodyAccessibilityLabel = routineName && currentRoutineStep && currentRoutinePosition != null
    ? `Open ${routineName}. Step ${currentRoutinePosition} of ${routineSteps.length}, ${routineStepFrequencyLabel(currentRoutineStep)}, ${routineRemainingText ?? 'starting'} remaining.`
    : 'Open current sound session';
  const showBgControl = hasBg && (!compactPlayer || (bgPlaying && !soundscapePlaying));
  const showSoundscapeControl = !compactPlayer || soundscapePlaying || !bgPlaying;

  return (
    <Animated.View
      {...(Platform.OS === 'web' ? ({ inert: !visible } as any) : {})}
      pointerEvents={visible ? 'auto' : 'none'}
      aria-hidden={!visible}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        { transform: [{ translateY: barOffset }] },
        Platform.OS === 'web' ? ({ willChange: 'transform' } as any) : null,
      ]}
    >
      <View
        style={[
          styles.miniPlayer,
          routineName && styles.miniPlayerRoutine,
        ]}
      >
        <HeaderGlass accent={accent} variant="soft" />
        <View style={styles.miniPlayerMainRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!visible}
            onPress={onTogglePlay}
            style={[styles.miniPlayBtn, { backgroundColor: isTonePlaying ? '#fff' : accent }]}
            accessibilityRole="button"
            accessibilityLabel={routineName
              ? `Stop ${routineName}`
              : isTonePlaying ? 'Pause tones' : 'Play tones'}
          >
            {isToneLoading ? (
              <ActivityIndicator color="#0B0B1F" size="small" />
            ) : (
              <Text style={styles.miniPlayText}>{routineName ? '■' : isTonePlaying ? 'Ⅱ' : '▶'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.miniBody}
            disabled={!visible}
            onPress={onOpen}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={miniBodyAccessibilityLabel}
          >
            <View style={styles.miniStatusRow}>
              <View
                style={[
                  styles.miniStatusDot,
                  { backgroundColor: accent, opacity: audioIsPlaying || isToneLoading ? 1 : 0.4 },
                ]}
              />
              <Text numberOfLines={1} style={[styles.miniStatus, { color: accent }]}>{statusLabel}</Text>
            </View>
            <Text style={styles.miniTitle} numberOfLines={1}>{sessionTitle}</Text>
            <Text style={styles.miniMeta} numberOfLines={1}>
              {sessionMeta}
            </Text>
          </TouchableOpacity>
        {showBgControl && (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!visible}
            onPress={onBgPress}
            style={[
              styles.miniSoundscapeBtn,
              bgPlaying && { backgroundColor: accent + '33', borderColor: accent },
            ]}
            accessibilityLabel={bgPlaying ? 'Pause imported audio' : 'Play imported audio'}
            accessibilityRole="button"
          >
            {bgPlaying && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.miniSoundscapeRing,
                  {
                    borderColor: accent,
                    shadowColor: accent,
                    opacity: ringGlowOpacity,
                    transform: [{ scale: ringScale }],
                  },
                ]}
              />
            )}
            <MusicNotes size={18} weight="duotone" color={bgPlaying ? accent : '#ffffffcc'} />
          </TouchableOpacity>
        )}
        {showSoundscapeControl ? <TouchableOpacity
          activeOpacity={0.85}
          disabled={!visible}
          onPress={onSoundscapePress}
          style={[
            styles.miniSoundscapeBtn,
            soundscapePlaying && { backgroundColor: accent + '33', borderColor: accent },
          ]}
          accessibilityLabel={hasSoundscape ? (soundscapePlaying ? 'Stop soundscape' : 'Play soundscape') : 'Choose a soundscape'}
          accessibilityRole="button"
        >
          {soundscapePlaying && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.miniSoundscapeRing,
                {
                  borderColor: accent,
                  shadowColor: accent,
                  opacity: ringGlowOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
          )}
          <Waveform size={18} weight="duotone" color={soundscapePlaying ? accent : '#ffffffcc'} />
        </TouchableOpacity> : null}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!visible}
          onPress={onStopAll}
          style={styles.miniStopBtn}
          accessibilityLabel="Stop all audio"
          accessibilityRole="button"
        >
          <Text style={styles.miniStopText}>×</Text>
        </TouchableOpacity>
        </View>
        {routineName && routineSteps.length > 0 ? (
          <View style={styles.miniRoutineTrack}>
            {routineSteps.map((step, index) => {
              const current = index === routineStepIndex;
              const complete = routineStepIndex != null && index < routineStepIndex;
              return (
                <View
                  key={step.id}
                  accessible
                  style={[
                    styles.miniRoutineStep,
                    current
                      ? { borderColor: accent + '8A', backgroundColor: accent + '1C' }
                      : styles.miniRoutineStepInactive,
                  ]}
                  accessibilityLabel={current
                    ? `Current step ${index + 1}, ${routineStepFrequencyLabel(step)}, ${routineRemainingText ?? 'starting'} remaining`
                    : complete
                      ? `Step ${index + 1}, ${routineStepFrequencyLabel(step)}, complete`
                      : `Step ${index + 1}, ${routineStepFrequencyLabel(step)}, ${step.durationMinutes} minutes, upcoming`}
                >
                  <View style={styles.miniRoutineStepTopline}>
                    <Text style={[styles.miniRoutineStepNumber, current && { color: accent }]}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.miniRoutineStepLabel, current && { color: accent }]}
                    >
                      {routineStepFrequencyLabel(step).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.miniRoutineStepTime, current && { color: accent }]}>
                    {current
                      ? `${routineRemainingText ?? 'STARTING'} LEFT`
                      : complete ? 'COMPLETE' : `${step.durationMinutes} MIN`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const MIN_DISTRIBUTED_TAB_WIDTH = 58;
const SCROLL_TAB_WIDTH = 72;
const TAB_BAR_HORIZONTAL_PADDING = 8;

function TabBar({
  tab,
  onChange,
  accent,
  pinnedMorePages,
  moreActivePage,
  newlyPinnedMorePage,
  onOpenMorePage,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  accent: string;
  pinnedMorePages: PinnableMorePageId[];
  moreActivePage: MorePageId | null;
  newlyPinnedMorePage: PinnableMorePageId | null;
  onOpenMorePage: (page: PinnableMorePageId) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(Math.min(windowWidth, 480));
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const contentWidthRef = useRef(0);
  const viewportWidthRef = useRef(viewportWidth);

  const totalItems = 5 + pinnedMorePages.length;
  const distributedItemWidth = Math.max(
    0,
    (viewportWidth - TAB_BAR_HORIZONTAL_PADDING * 2) / totalItems,
  );
  const scrollable = distributedItemWidth < MIN_DISTRIBUTED_TAB_WIDTH;
  const compact = !scrollable && distributedItemWidth < 72;
  const pinnedPageIsActive = tab === 'more'
    && moreActivePage != null
    && isPinnableMorePage(moreActivePage)
    && pinnedMorePages.includes(moreActivePage);
  const moreIsActive = tab === 'more' && !pinnedPageIsActive;

  const updateScrollEdges = (offset: number) => {
    const maxOffset = Math.max(0, contentWidthRef.current - viewportWidthRef.current);
    const nextLeft = maxOffset > 1 && offset > 3;
    const nextRight = maxOffset > 1 && offset < maxOffset - 3;
    setCanScrollLeft(previous => previous === nextLeft ? previous : nextLeft);
    setCanScrollRight(previous => previous === nextRight ? previous : nextRight);
  };

  useEffect(() => {
    viewportWidthRef.current = viewportWidth;
    if (!scrollable) {
      scrollXRef.current = 0;
      contentWidthRef.current = viewportWidth;
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    // Seed the affordance before the native/web content-size callback lands,
    // so the right chevron is visible on the first scrollable frame.
    contentWidthRef.current = totalItems * SCROLL_TAB_WIDTH
      + TAB_BAR_HORIZONTAL_PADDING * 2;
    updateScrollEdges(scrollXRef.current);
  }, [scrollable, totalItems, viewportWidth]);

  useEffect(() => {
    if (!newlyPinnedMorePage || !scrollable) return;
    const pinnedIndex = pinnedMorePages.indexOf(newlyPinnedMorePage);
    if (pinnedIndex < 0) return;

    const frame = requestAnimationFrame(() => {
      const itemIndex = 4 + pinnedIndex;
      const itemCenter = TAB_BAR_HORIZONTAL_PADDING
        + itemIndex * SCROLL_TAB_WIDTH
        + SCROLL_TAB_WIDTH / 2;
      const contentWidth = totalItems * SCROLL_TAB_WIDTH
        + TAB_BAR_HORIZONTAL_PADDING * 2;
      const maxOffset = Math.max(0, contentWidth - viewportWidthRef.current);
      const target = Math.max(
        0,
        Math.min(maxOffset, itemCenter - viewportWidthRef.current / 2),
      );
      scrollRef.current?.scrollTo({ x: target, y: 0, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [newlyPinnedMorePage, pinnedMorePages, scrollable, totalItems]);

  const buttons = (
    <>
      <TabButton fixed={scrollable} label="Tones" accessibilityLabel="Frequencies" glyph="∿" compact={compact} active={tab === 'frequencies'} accent={accent} onPress={() => onChange('frequencies')} />
      <TabButton fixed={scrollable} label="Breathe" accessibilityLabel="Breath" glyph="○" compact={compact} active={tab === 'breath'} accent={accent} onPress={() => onChange('breath')} />
      <TabButton fixed={scrollable} label="Chakras" glyph="✦" compact={compact} active={tab === 'chakras'} accent={accent} onPress={() => onChange('chakras')} />
      <TabButton fixed={scrollable} label="Stars" accessibilityLabel="Horoscopes" glyph="☽" compact={compact} active={tab === 'horoscopes'} accent={accent} onPress={() => onChange('horoscopes')} />
      {pinnedMorePages.map(pageId => {
        const meta = MORE_PAGE_META[pageId];
        return (
          <TabButton
            key={pageId}
            fixed={scrollable}
            label={meta.shortLabel}
            accessibilityLabel={meta.label}
            glyph={meta.glyph}
            compact={compact}
            active={tab === 'more' && moreActivePage === pageId}
            accent={meta.accent}
            onPress={() => onOpenMorePage(pageId)}
          />
        );
      })}
      <TabButton fixed={scrollable} label="More" glyph="⋯" compact={compact} active={moreIsActive} accent={accent} onPress={() => onChange('more')} />
    </>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarSafe}>
      <View
        style={styles.tabBarViewport}
        onLayout={event => {
          const nextWidth = event.nativeEvent.layout.width;
          viewportWidthRef.current = nextWidth;
          setViewportWidth(nextWidth);
          updateScrollEdges(scrollXRef.current);
        }}
      >
        {scrollable ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            accessibilityRole="tablist"
            accessibilityLabel="App navigation"
            bounces={false}
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            scrollEventThrottle={16}
            contentContainerStyle={styles.tabBarScrollContent}
            onContentSizeChange={width => {
              contentWidthRef.current = width;
              updateScrollEdges(scrollXRef.current);
            }}
            onScroll={event => {
              const offset = Math.max(0, event.nativeEvent.contentOffset.x);
              scrollXRef.current = offset;
              updateScrollEdges(offset);
            }}
          >
            {buttons}
          </ScrollView>
        ) : (
          <View accessibilityRole="tablist" accessibilityLabel="App navigation" style={styles.tabBar}>
            {buttons}
          </View>
        )}

        {scrollable && canScrollLeft ? (
          <LinearGradient
            colors={['rgba(6,7,20,0.98)', 'rgba(6,7,20,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={[styles.tabScrollEdge, styles.tabScrollEdgeLeft]}
          >
            <Text style={styles.tabScrollChevron}>‹</Text>
          </LinearGradient>
        ) : null}
        {scrollable && canScrollRight ? (
          <LinearGradient
            colors={['rgba(6,7,20,0)', 'rgba(6,7,20,0.98)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={[styles.tabScrollEdge, styles.tabScrollEdgeRight]}
          >
            <Text style={styles.tabScrollChevron}>›</Text>
          </LinearGradient>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label, glyph, Icon, compact, fixed = false, active, accent, onPress, accessibilityLabel,
}: {
  label: string;
  accessibilityLabel?: string;
  glyph?: string;
  Icon?: React.ComponentType<IconProps>;
  compact: boolean;
  fixed?: boolean;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const color = active ? accent : '#ffffff66';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tabBtn, fixed && styles.tabBtnFixed]}
      accessibilityRole="tab"
      accessibilityLabel={`${accessibilityLabel ?? label} tab`}
      accessibilityState={{ selected: active }}
    >
      {Icon ? (
        <View style={[styles.tabIconWrap, active && { backgroundColor: accent + '18', borderColor: accent + '38' }]}>
          <Icon size={22} weight="duotone" color={color} />
        </View>
      ) : (
        <View style={[styles.tabIconWrap, active && { backgroundColor: accent + '18', borderColor: accent + '38' }]}>
          <Text style={[styles.tabGlyph, { color }]}>{glyph}</Text>
        </View>
      )}
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, compact && styles.tabLabelCompact, { color: active ? accent : '#ffffff77' }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ===========================================================================
//   FrequenciesView
// ===========================================================================

type FreqViewProps = {
  leftHz: number;
  rightHz: number;
  beat: number;
  band: { name: string; color: string; key: BandKey };
  activeBand: BandKey;
  activeTuning: TuningPreset | null;
  activeChakra: Chakra | null;
  activePresetId: string | null;
  sleepMinutes: number;
  onSetSleepTimer: (m: number) => void;
  isTonePlaying: boolean;
  isToneLoading: boolean;
  toneVolume: number;
  userPresets: UserPreset[];
  bgFileName: string | null;
  isBgPlaying: boolean;
  bgVolume: number;
  beatColor: string;
  onCommitLeft: (v: number) => void;
  onCommitRight: (v: number) => void;
  onSlideLeft: (v: number) => void;
  onSlideRight: (v: number) => void;
  onSlideBeatCarrier: (beat: number, carrier: number) => void;
  onCommitBeatCarrier: (beat: number, carrier: number) => void;
  onApplyBuiltIn: (p: BuiltInPreset) => void;
  onApplyUser: (p: UserPreset) => void;
  onApplyTuning: (t: TuningPreset) => void;
  onDeleteUser: (p: UserPreset) => void;
  onSave: () => void;
  onTogglePlay: () => void;
  onChangeToneVolume: (v: number) => void;
  onPickBg: () => void;
  onToggleBg: () => void;
  onChangeBgVolume: (v: number) => void;
  onClearBg: () => void;
};

function FrequenciesView(props: FreqViewProps) {
  const {
    leftHz, rightHz, beat, band, activeBand, activeTuning, activeChakra, activePresetId,
    sleepMinutes, onSetSleepTimer,
    isTonePlaying, isToneLoading, toneVolume, userPresets,
    bgFileName, isBgPlaying, bgVolume,
    beatColor,
  } = props;

  const [customSleepOpen, setCustomSleepOpen] = useState(false);
  const [customSleepInput, setCustomSleepInput] = useState('');
  const isCustomSleep = sleepMinutes > 0 && !(SLEEP_TIMER_OPTIONS as readonly number[]).includes(sleepMinutes);

  // Beat-first controls. The carrier is the midpoint of the two ears; the
  // per-ear sliders live behind an advanced reveal for users who want them.
  const [showEarTuning, setShowEarTuning] = useState(false);
  const carrier = Math.round((leftHz + rightHz) / 2);
  const beatForControl = Math.min(beat, MAX_BEAT);
  const carrierMin = MIN_HZ + MAX_BEAT / 2;
  const carrierMax = MAX_HZ - MAX_BEAT / 2;
  const carrierForControl = Math.max(carrierMin, Math.min(carrierMax, carrier));

  function commitCustomSleep() {
    const m = parseInt(customSleepInput, 10);
    if (Number.isFinite(m) && m > 0) {
      onSetSleepTimer(Math.min(m, 24 * 60));
    }
    setCustomSleepOpen(false);
    setCustomSleepInput('');
  }

  return (
    <AmbientVeil
      accent={beatColor}
      strength="light"
      active={isTonePlaying}
      motionHz={beat}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.freqEnsoWrap} pointerEvents="none">
        <View style={styles.enso} />
      </View>
      <View style={styles.freqEditorialHeader}>
        <Text accessibilityRole="header" style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Binaural frequency generator</Text>
      </View>

      <AmbientSurface accent={beatColor} quiet showOrb={false} style={styles.freqAffirmationCard}>
        <View style={styles.freqAffirmationTopline}>
          <View style={[styles.freqAffirmationRule, { backgroundColor: beatColor }]} />
          <Text style={[styles.freqAffirmationLabel, { color: beatColor }]}>A THOUGHT TO CARRY</Text>
          <Text style={[styles.freqAffirmationGlyph, { color: beatColor }]}>✦</Text>
        </View>
        <ManifestQuote />
      </AmbientSurface>

      <AmbientSurface accent={beatColor} showOrb={false} style={styles.beatCard}>
        <View style={styles.beatHeaderRow}>
          <View>
            <Text style={[styles.beatLabel, { color: beatColor }]}>SESSION CHAMBER</Text>
            {isTonePlaying ? <Text style={styles.beatKicker}>Your mix is in motion</Text> : null}
          </View>
          <TouchableOpacity
            onPress={props.onSave}
            style={styles.saveBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save this tone mix"
          >
            <Text style={styles.saveBtnText}>＋ Save</Text>
          </TouchableOpacity>
        </View>
        <HzSignalOrbit
          leftHz={leftHz}
          rightHz={rightHz}
          beatHz={beat}
          accent={beatColor}
          playing={isTonePlaying}
        />
        <View style={[styles.bandPill, { backgroundColor: beatColor + '22', borderColor: beatColor }]}>
          <View style={[styles.bandDot, { backgroundColor: beatColor }]} />
          <Text numberOfLines={2} style={[styles.bandText, { color: beatColor }]}>
            {activeChakra
              ? `${activeChakra.name} · ${activeChakra.bija} · ${activeChakra.element}`
              : activeTuning
                ? `${activeTuning.name} · ${activeTuning.intent}`
                : band.name}
          </Text>
        </View>

        <View style={styles.signalReadoutRow}>
          <View style={styles.signalReadout}>
            <Text style={styles.signalReadoutLabel}>LEFT</Text>
            <Text style={styles.signalReadoutValue}>{leftHz} Hz</Text>
          </View>
          <View style={[styles.signalReadout, styles.signalReadoutCenter]}>
            <Text style={styles.signalReadoutLabel}>DIFFERENCE</Text>
            <Text style={[styles.signalReadoutValue, { color: beatColor }]}>{beat.toFixed(0)} Hz</Text>
          </View>
          <View style={styles.signalReadout}>
            <Text style={styles.signalReadoutLabel}>RIGHT</Text>
            <Text style={styles.signalReadoutValue}>{rightHz} Hz</Text>
          </View>
        </View>

        <View style={styles.beatSliderBlock}>
          <View style={styles.beatSliderLabelRow}>
            <Text style={styles.beatSliderLabel}>BEAT</Text>
            <Text style={styles.beatSliderHint}>0-{MAX_BEAT} Hz · difference between ears</Text>
          </View>
          <Slider
            style={styles.beatSlider}
            minimumValue={0}
            maximumValue={MAX_BEAT}
            step={1}
            value={beatForControl}
            minimumTrackTintColor={beatColor}
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor={beatColor}
            onValueChange={v => props.onSlideBeatCarrier(Math.round(v), carrierForControl)}
            onSlidingComplete={v => props.onCommitBeatCarrier(Math.round(v), carrierForControl)}
            accessibilityLabel="Beat frequency"
            accessibilityValue={{ min: 0, max: MAX_BEAT, now: beatForControl, text: `${beatForControl} hertz` }}
          />
          <View style={styles.beatSliderLabelRow}>
            <Text style={styles.beatSliderLabel}>CARRIER · {carrier} Hz</Text>
            <Text style={styles.beatSliderHint}>the pitch you hear</Text>
          </View>
          <Slider
            style={styles.beatSlider}
            minimumValue={carrierMin}
            maximumValue={carrierMax}
            step={1}
            value={carrierForControl}
            minimumTrackTintColor="rgba(255,255,255,0.45)"
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor="#ffffffcc"
            onValueChange={v => props.onSlideBeatCarrier(beatForControl, Math.round(v))}
            onSlidingComplete={v => props.onCommitBeatCarrier(beatForControl, Math.round(v))}
            accessibilityLabel="Carrier pitch"
            accessibilityValue={{ min: carrierMin, max: carrierMax, now: carrierForControl, text: `${carrierForControl} hertz` }}
          />
          <View style={styles.beatSliderLabelRow}>
            <Text style={[styles.beatSliderLabel, { color: beatColor }]}>VOLUME · {Math.round(toneVolume * 100)}%</Text>
          </View>
          <Slider
            style={styles.beatSlider}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={toneVolume}
            minimumTrackTintColor={beatColor}
            maximumTrackTintColor="rgba(255,255,255,0.12)"
            thumbTintColor={beatColor}
            onValueChange={props.onChangeToneVolume}
            accessibilityLabel="Binaural tone volume"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(toneVolume * 100),
              text: `${Math.round(toneVolume * 100)}%`,
            }}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={props.onTogglePlay}
          disabled={isToneLoading}
          style={[styles.primarySessionBtn, { backgroundColor: isTonePlaying ? '#fff' : beatColor }]}
          accessibilityRole="button"
          accessibilityLabel={isTonePlaying ? 'Stop binaural session' : 'Start binaural session'}
          accessibilityState={{ disabled: isToneLoading, busy: isToneLoading }}
        >
          {isToneLoading ? (
            <ActivityIndicator color="#0B0B1F" />
          ) : (
            <>
              <Text style={styles.primarySessionMark}>{isTonePlaying ? 'Ⅱ' : '▶'}</Text>
              <Text style={styles.primarySessionText}>{isTonePlaying ? 'STOP SESSION' : 'START SESSION'}</Text>
            </>
          )}
        </TouchableOpacity>
      </AmbientSurface>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setShowEarTuning(s => !s)}
        style={styles.advancedToggle}
        accessibilityRole="button"
        accessibilityLabel={showEarTuning ? 'Hide per-ear tuning' : 'Show per-ear tuning'}
        accessibilityState={{ expanded: showEarTuning }}
      >
        <Text style={styles.advancedToggleText}>
          {showEarTuning ? '▾' : '▸'}  PER-EAR TUNING
        </Text>
        <Text style={styles.advancedToggleMeta}>L {leftHz} · R {rightHz} Hz</Text>
      </TouchableOpacity>
      {showEarTuning ? (
        <>
          <FrequencyControl
            ear="L" label="LEFT"
            hz={leftHz}
            color="#8FB8DE"
            onCommit={props.onCommitLeft}
            onSlide={props.onSlideLeft}
          />
          <FrequencyControl
            ear="R" label="RIGHT"
            hz={rightHz}
            color="#D68097"
            onCommit={props.onCommitRight}
            onSlide={props.onSlideRight}
          />
        </>
      ) : null}

      <EditorialSection
        index="01"
        eyebrow="QUICK STARTS"
        title="Begin with an intention"
        subtitle="Choose a starting point, then fine-tune anything."
        accent={beatColor}
      />
      <EdgeFadeCarousel contentContainerStyle={styles.presetRow}>
        {PRESETS.map(p => {
          const active = activePresetId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => props.onApplyBuiltIn(p)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name} preset, ${p.range}. ${p.blurb}`}
              accessibilityState={{ selected: active }}
              style={[styles.presetChip, {
                backgroundColor: active ? p.color : 'rgba(255,255,255,0.05)',
                borderColor: active ? p.color : 'rgba(255,255,255,0.12)',
              }]}
            >
              <Text style={[styles.presetName, { color: active ? '#0B0B1F' : '#fff' }]}>{p.name}</Text>
              <Text style={[styles.presetRange, { color: active ? '#0B0B1F99' : '#ffffff88' }]}>{p.range}</Text>
              <Text style={[styles.presetBlurb, { color: active ? '#0B0B1F99' : '#ffffff66' }]}>{p.blurb}</Text>
            </TouchableOpacity>
          );
        })}
        {userPresets.map(p => {
          const active = activePresetId === p.id;
          const userColor = '#9DC7AC';
          return (
            <View
              key={p.id}
              style={[styles.presetChip, styles.userPresetCard, {
                backgroundColor: active ? userColor : 'rgba(255,255,255,0.05)',
                borderColor: active ? userColor : 'rgba(154,255,200,0.4)',
                borderStyle: 'dashed',
              }]}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => props.onApplyUser(p)}
                onLongPress={() => props.onDeleteUser(p)}
                style={styles.userPresetApply}
                accessibilityRole="button"
                accessibilityLabel={`Apply preset ${p.name}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.presetName, { color: active ? '#0B0B1F' : '#fff' }]}>{p.name}</Text>
                <Text style={[styles.presetRange, { color: active ? '#0B0B1F99' : '#ffffff88' }]}>L {p.leftHz} · R {p.rightHz}</Text>
                <Text style={[styles.presetBlurb, { color: active ? '#0B0B1F99' : '#ffffff66' }]}>beat {Math.abs(p.rightHz - p.leftHz)} Hz</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => props.onDeleteUser(p)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.presetDeleteBtn}
                accessibilityRole="button"
                accessibilityLabel={`Delete preset ${p.name}`}
              >
                <Text style={[styles.presetDeleteText, { color: active ? '#0B0B1F88' : '#ffffff77' }]}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </EdgeFadeCarousel>

      <EditorialSection
        index="02"
        eyebrow="TRADITIONAL TONES"
        title="Explore resonant associations"
        accent="#d9b35c"
      />
      <EdgeFadeCarousel contentContainerStyle={styles.presetRow}>
        {TUNINGS.map(t => {
          const active = activePresetId === t.id;
          const tuneColor = '#d9b35c';
          return (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.85}
              onPress={() => props.onApplyTuning(t)}
              accessibilityRole="button"
              accessibilityLabel={`${t.name}, ${t.intent}. ${t.blurb}`}
              accessibilityState={{ selected: active }}
              style={[styles.presetChip, {
                backgroundColor: active ? tuneColor : 'rgba(255,255,255,0.05)',
                borderColor: active ? tuneColor : 'rgba(217,179,92,0.35)',
              }]}
            >
              <Text style={[styles.presetName, { color: active ? '#0B0B1F' : '#fff' }]}>{t.name}</Text>
              <Text style={[styles.presetRange, { color: active ? '#0B0B1F99' : '#ffffff88' }]}>{t.intent}</Text>
              <Text style={[styles.presetBlurb, { color: active ? '#0B0B1F99' : '#ffffff66' }]}>{t.blurb}</Text>
            </TouchableOpacity>
          );
        })}
      </EdgeFadeCarousel>

      <EditorialSection
        index="03"
        eyebrow="SESSION LAYERS"
        title="Build your listening room"
        subtitle="Set an ending and add your own background audio beneath the tones."
        accent="#9DC7AC"
      />

      <AmbientSurface accent="#9DC7AC" quiet showOrb={false} style={styles.mixerCard}>
      <View style={styles.sleepRow}>
        <Text style={styles.sleepLabel}>STILLNESS · auto-end</Text>
        <View style={styles.sleepPills}>
          {SLEEP_TIMER_OPTIONS.map(m => {
            const active = m === sleepMinutes;
            const label = m === 0 ? 'Off' : `${m}m`;
            return (
              <TouchableOpacity
                key={m}
                activeOpacity={0.85}
                onPress={() => onSetSleepTimer(m)}
                accessibilityRole="button"
                accessibilityLabel={m === 0 ? 'Turn off sleep timer' : `End playback after ${m} minutes`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.sleepPill,
                  active && { borderColor: beatColor, backgroundColor: beatColor + '22' },
                ]}
              >
                <Text style={[styles.sleepPillText, active && { color: beatColor }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setCustomSleepInput(isCustomSleep ? String(sleepMinutes) : '');
              setCustomSleepOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={isCustomSleep ? `Custom timer, ${sleepMinutes} minutes` : 'Set a custom sleep timer'}
            accessibilityState={{ selected: isCustomSleep }}
            style={[
              styles.sleepPill,
              isCustomSleep && { borderColor: beatColor, backgroundColor: beatColor + '22' },
            ]}
          >
            <Text style={[styles.sleepPillText, isCustomSleep && { color: beatColor }]}>
              {isCustomSleep ? `${sleepMinutes}m` : 'Custom…'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mixerDivider} />

      <View style={styles.bgCard}>
        <Text style={styles.mixerLabel}>IMPORTED AUDIO</Text>
        {bgFileName ? (
          <>
            <View style={styles.bgFileRow}>
              <Text style={styles.bgFileName} numberOfLines={1}>{bgFileName}</Text>
              <TouchableOpacity
                onPress={props.onClearBg}
                style={styles.bgClearBtn}
                accessibilityRole="button"
                accessibilityLabel="Remove imported audio"
              >
                <Text style={styles.bgClearText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bgControlsRow}>
              <TouchableOpacity
                onPress={props.onToggleBg}
                style={styles.bgPlayBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={isBgPlaying ? 'Pause imported audio' : 'Play imported audio'}
              >
                <Text style={styles.bgPlayText}>{isBgPlaying ? '❚❚' : '▶'}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bgVolLabel}>VOLUME · {Math.round(bgVolume * 100)}%</Text>
                <Slider
                  style={{ width: '100%', height: 32 }}
                  minimumValue={0}
                  maximumValue={1}
                  value={bgVolume}
                  minimumTrackTintColor="#9DC7AC"
                  maximumTrackTintColor="rgba(255,255,255,0.12)"
                  thumbTintColor="#9DC7AC"
                  onValueChange={props.onChangeBgVolume}
                  accessibilityLabel="Imported audio volume"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(bgVolume * 100), text: `${Math.round(bgVolume * 100)} percent` }}
                />
              </View>
            </View>
          </>
        ) : (
          <TouchableOpacity
            onPress={props.onPickBg}
            style={styles.bgPickBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add an audio file from this device"
          >
            <Text style={styles.bgPickText}>＋ Add an audio layer</Text>
            <Text style={styles.bgPickHint}>Your file stays on this device and plays beneath the tones.</Text>
          </TouchableOpacity>
        )}
      </View>
      </AmbientSurface>

      <Modal
        visible={customSleepOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomSleepOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCustomSleepOpen(false)}>
          <View style={styles.customSleepBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.customSleepCard}
              >
                <Text style={styles.customSleepTitle}>Custom stillness</Text>
                <Text style={styles.customSleepHint}>Stop playback after how many minutes?</Text>
                <TextInput
                  value={customSleepInput}
                  onChangeText={t => setCustomSleepInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="e.g. 25"
                  placeholderTextColor="#ffffff55"
                  style={[styles.customSleepInput, { borderColor: beatColor + '88' }]}
                  autoFocus
                  onSubmitEditing={commitCustomSleep}
                  returnKeyType="done"
                />
                <View style={styles.customSleepActions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setCustomSleepOpen(false)}
                    style={styles.customSleepCancelBtn}
                  >
                    <Text style={styles.customSleepCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={commitCustomSleep}
                    style={[styles.customSleepSetBtn, { backgroundColor: beatColor }]}
                  >
                    <Text style={styles.customSleepSetText}>Set</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Text style={styles.footnote}>
        Use stereo headphones at a comfortable volume. Each ear receives a slightly different tone; the displayed beat is the difference between them.
      </Text>
      </ScrollView>
    </AmbientVeil>
  );
}

function HzSignalOrbit({
  leftHz,
  rightHz,
  beatHz,
  accent,
  playing,
}: {
  leftHz: number;
  rightHz: number;
  beatHz: number;
  accent: string;
  playing: boolean;
}) {
  const leftSpin = useRef(new Animated.Value(0)).current;
  const rightSpin = useRef(new Animated.Value(0)).current;
  const beatSpin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const spinValues = [leftSpin, rightSpin, beatSpin];
    const values = [...spinValues, pulse];

    if (reduceMotion) {
      values.forEach(value => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }

    if (!playing) {
      let alive = true;
      const settlers: Animated.CompositeAnimation[] = [];

      // Complete whichever half of the revolution is shortest, then normalize
      // back to zero. Values 0 and 1 render at the same angle, so the final
      // normalization is invisible and the next session starts from rest.
      spinValues.forEach(value => {
        value.stopAnimation(current => {
          if (!alive) return;
          const phase = Math.max(0, Math.min(1, current));
          const target = phase >= 0.5 ? 1 : 0;
          const distance = Math.abs(target - phase);
          if (distance < 0.001) {
            value.setValue(0);
            return;
          }
          const settle = Animated.timing(value, {
            toValue: target,
            duration: Math.round(620 + distance * 680),
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          });
          settlers.push(settle);
          settle.start(({ finished }) => {
            if (finished && alive) value.setValue(0);
          });
        });
      });

      pulse.stopAnimation(current => {
        if (!alive) return;
        if (current <= 0.001) {
          pulse.setValue(0);
          return;
        }
        const settle = Animated.timing(pulse, {
          toValue: 0,
          duration: 720,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        });
        settlers.push(settle);
        settle.start();
      });

      return () => {
        alive = false;
        settlers.forEach(settle => settle.stop());
        values.forEach(value => value.stopAnimation());
      };
    }

    // Audible carriers are compressed into a calm visual range: higher Hz
    // rotates faster, while the visible beat controls the innermost orbit.
    const carrierDuration = (hz: number) => {
      const normalized = Math.max(0, Math.min(1, (hz - MIN_HZ) / (MAX_HZ - MIN_HZ)));
      return Math.round(14500 - normalized * 9000);
    };
    const beatDuration = Math.round(16000 - Math.max(0, Math.min(MAX_BEAT, beatHz)) / MAX_BEAT * 12000);
    const pulseDuration = Math.round(2600 - Math.max(0, Math.min(MAX_BEAT, beatHz)) / MAX_BEAT * 1200);

    leftSpin.setValue(0);
    rightSpin.setValue(0);
    beatSpin.setValue(0);
    pulse.setValue(0);

    let alive = true;

    // Animated.loop around a single timing animation can stop after one pass
    // on some native drivers. Relaunch each completed revolution explicitly;
    // the 1 -> 0 reset is visually seamless because those phases are 360° apart.
    const repeatSpin = (value: Animated.Value, duration: number) => {
      let current: Animated.CompositeAnimation | null = null;
      const run = () => {
        if (!alive) return;
        value.setValue(0);
        current = Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        });
        current.start(({ finished }) => {
          current = null;
          if (finished && alive) run();
        });
      };
      run();
      return () => current?.stop();
    };

    let pulseAnimation: Animated.CompositeAnimation | null = null;
    const runPulse = () => {
      if (!alive) return;
      pulse.setValue(0);
      pulseAnimation = Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: pulseDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0, duration: pulseDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true,
        }),
      ]);
      pulseAnimation.start(({ finished }) => {
        pulseAnimation = null;
        if (finished && alive) runPulse();
      });
    };

    const stopSpins = [
      repeatSpin(leftSpin, carrierDuration(leftHz)),
      repeatSpin(rightSpin, carrierDuration(rightHz)),
      repeatSpin(beatSpin, beatDuration),
    ];
    runPulse();

    return () => {
      alive = false;
      stopSpins.forEach(stop => stop());
      pulseAnimation?.stop();
    };
  }, [beatHz, beatSpin, leftHz, leftSpin, playing, pulse, reduceMotion, rightHz, rightSpin]);

  const leftRotation = leftSpin.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '352deg'] });
  const rightRotation = rightSpin.interpolate({ inputRange: [0, 1], outputRange: ['13deg', '-347deg'] });
  const beatRotation = beatSpin.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '340deg'] });
  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  const coreOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={styles.signalStage} pointerEvents="none">
      <Animated.View
        style={[
          styles.signalOrbit,
          styles.signalOrbitOuter,
          { borderColor: accent + '32', transform: [{ rotate: leftRotation }] },
        ]}
      />
      <Animated.View
        style={[
          styles.signalOrbit,
          styles.signalOrbitMiddle,
          { borderColor: accent + '4D', transform: [{ rotate: rightRotation }] },
        ]}
      />
      <Animated.View
        style={[
          styles.signalOrbit,
          styles.signalOrbitInner,
          { borderColor: accent + '73', transform: [{ rotate: beatRotation }] },
        ]}
      />
      <Animated.View
        style={[
          styles.signalCore,
          {
            backgroundColor: accent + '1D',
            shadowColor: accent,
            opacity: reduceMotion ? 0.82 : coreOpacity,
            transform: [{ scale: reduceMotion ? 1 : coreScale }],
          },
        ]}
      />
      <Text style={styles.beatHz}>
        {beatHz.toFixed(0)}<Text style={styles.beatHzUnit}> Hz</Text>
      </Text>
    </View>
  );
}

// ===========================================================================
//   FrequencyControl
// ===========================================================================

type ControlProps = {
  ear: 'L' | 'R';
  label: string;
  hz: number;
  color: string;
  onCommit: (v: number) => void;
  onSlide: (v: number) => void;
};

function FrequencyControl({ ear, label, hz, color, onCommit, onSlide }: ControlProps) {
  const [text, setText] = useState(String(hz));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(hz));
  }, [hz, focused]);

  function commitText() {
    const cleaned = text.replace(/[^0-9]/g, '');
    const n = parseInt(cleaned, 10);
    if (isNaN(n)) { setText(String(hz)); return; }
    const c = clampHz(n);
    setText(String(c));
    if (c !== hz) onCommit(c);
  }

  return (
    <View style={styles.freqCard}>
      <View style={styles.freqHeader}>
        <View style={[styles.earBadge, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[styles.earLetter, { color }]}>{ear}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.freqLabel}>{label}</Text>
          <View style={styles.freqRow}>
            <TextInput
              style={[styles.freqHz, focused && { color }]}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); commitText(); }}
              onSubmitEditing={commitText}
              keyboardType="number-pad"
              maxLength={4}
              selectTextOnFocus
              returnKeyType="done"
              accessibilityLabel={`${label.toLowerCase()} ear frequency`}
              accessibilityValue={{ text: `${hz} hertz` }}
            />
            <Text style={styles.freqHzUnit}> Hz</Text>
          </View>
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={MIN_HZ}
        maximumValue={MAX_HZ}
        value={hz}
        step={1}
        minimumTrackTintColor={color}
        maximumTrackTintColor="rgba(255,255,255,0.12)"
        thumbTintColor={color}
        onValueChange={v => {
          const n = Math.round(v);
          setText(String(n));
          onSlide(n);
        }}
        onSlidingComplete={v => onCommit(Math.round(v))}
        accessibilityLabel={`${label.toLowerCase()} ear frequency`}
        accessibilityValue={{ min: MIN_HZ, max: MAX_HZ, now: hz, text: `${hz} hertz` }}
      />
      <View style={styles.minMaxRow}>
        <Text style={styles.minMaxText}>{MIN_HZ} Hz</Text>
        <Text style={styles.minMaxText}>{MAX_HZ} Hz</Text>
      </View>
      <View style={styles.rangeRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onCommit(hz - 1)}
          style={[styles.adjBtn, { borderColor: color + '99' }]}
          accessibilityRole="button"
          accessibilityLabel={`Lower ${label.toLowerCase()} ear by one hertz`}
        >
          <Text style={[styles.adjBtnText, { color }]}>−1</Text>
        </TouchableOpacity>
        <Text style={styles.rangeHint}>tap number to type</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onCommit(hz + 1)}
          style={[styles.adjBtn, { borderColor: color + '99' }]}
          accessibilityRole="button"
          accessibilityLabel={`Raise ${label.toLowerCase()} ear by one hertz`}
        >
          <Text style={[styles.adjBtnText, { color }]}>+1</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ===========================================================================
//   Styles
// ===========================================================================

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B1F' },
  safe: { flex: 1 },
  // Centered phone-width column used on web and on wide (tablet) windows;
  // the gradient background stays full-bleed behind it.
  contentColumn: { width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const },
  // Onboarding is presented above the already-mounted app. Keep this layer
  // opaque enough to prevent the controls underneath from bleeding through;
  // OnboardingView adds its own fluid accent atmosphere on top.
  onboardingLayer: { backgroundColor: '#0B0B1F' },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 112,
  },
  freqEditorialHeader: {
    alignItems: 'center', marginHorizontal: -20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18,
  },
  freqEnsoWrap: { alignItems: 'center', paddingTop: 12, marginBottom: -2 },
  freqAffirmationCard: {
    marginBottom: 14, paddingHorizontal: 17, paddingVertical: 14, minHeight: 92,
  },
  freqAffirmationTopline: { flexDirection: 'row', alignItems: 'center' },
  freqAffirmationRule: { width: 18, height: 2, borderRadius: 1, marginRight: 8 },
  freqAffirmationLabel: { flex: 1, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.8 },
  freqAffirmationGlyph: { fontSize: 13 },

  header: { alignItems: 'center', marginBottom: 22, paddingTop: 6 },
  enso: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
    marginBottom: 14,
    transform: [{ rotate: '-18deg' }],
  },
  ambience: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 38,
    letterSpacing: 2.5,
    textAlign: 'center',
    lineHeight: 44,
  },
  title: {
    color: '#ffffff99', fontSize: 10, fontWeight: '400',
    letterSpacing: 4, textAlign: 'center', lineHeight: 16,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic', textTransform: 'lowercase',
  },
  quote: {
    color: '#F2EFF8',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 18, lineHeight: 23,
    marginTop: 9, letterSpacing: 0.2, textAlign: 'left',
    paddingHorizontal: 0, fontWeight: '400',
  },
  beatCard: {
    padding: 18, paddingTop: 16, alignItems: 'center', marginBottom: 16,
  },
  beatHeaderRow: {
    flexDirection: 'row', width: '100%',
    justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  beatLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  beatKicker: { color: '#AAA9B9', fontSize: 11, marginTop: 4 },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  beatHz: {
    color: '#fff', fontSize: 58, fontWeight: '300', letterSpacing: -1,
  },
  beatHzUnit: { fontSize: 22, color: '#ffffff80', fontWeight: '300' },
  signalStage: {
    width: '100%', height: 154, alignItems: 'center', justifyContent: 'center',
    marginTop: 3, overflow: 'hidden',
  },
  signalOrbit: { position: 'absolute', borderWidth: 1, borderRadius: 999 },
  signalOrbitOuter: { width: 224, height: 112 },
  signalOrbitMiddle: { width: 176, height: 98 },
  signalOrbitInner: { width: 124, height: 84 },
  signalCore: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38,
    shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
  },
  bandPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, marginTop: 6,
    maxWidth: '100%',
  },
  bandDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  bandText: {
    flexShrink: 1, fontWeight: '600', fontSize: 12, lineHeight: 16,
    letterSpacing: 1.2, textAlign: 'center',
  },
  signalReadoutRow: {
    width: '100%', flexDirection: 'row', marginTop: 16, marginBottom: 3,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  signalReadout: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  signalReadoutCenter: {
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  signalReadoutLabel: { color: '#7F7F93', fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  signalReadoutValue: { color: '#F6F3FA', fontSize: 12, fontWeight: '700', marginTop: 4 },
  primarySessionBtn: {
    minHeight: 58,
    borderRadius: 18,
    marginTop: 16,
    paddingHorizontal: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  primarySessionMark: {
    color: '#0B0B1F',
    fontSize: 17,
    fontWeight: '800',
    marginRight: 10,
  },
  primarySessionText: {
    color: '#0B0B1F',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.2,
  },

  freqCard: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 20, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  freqHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  earBadge: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, borderWidth: 1,
  },
  earLetter: { fontSize: 18, fontWeight: '700' },
  freqLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  freqRow: { flexDirection: 'row', alignItems: 'baseline' },
  freqHz: {
    color: '#fff', fontSize: 28, fontWeight: '500',
    letterSpacing: -0.5, padding: 0, minWidth: 60,
  },
  freqHzUnit: { fontSize: 14, color: '#ffffff80', fontWeight: '300' },
  slider: { width: '100%', height: 36, marginTop: 6 },
  rangeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 4, marginTop: 6,
  },
  rangeText: { color: '#ffffff55', fontSize: 11 },
  rangeHint: { color: '#ffffff55', fontSize: 10, fontStyle: 'italic' },
  minMaxRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4, marginTop: -2,
  },
  minMaxText: { color: '#ffffff44', fontSize: 9, letterSpacing: 0.5 },
  adjBtn: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    minWidth: 48, alignItems: 'center',
  },
  adjBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  sectionLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
    marginTop: 10, marginBottom: 10, paddingHorizontal: 4,
  },
  sectionSub: {
    color: '#ffffff66', fontSize: 11, marginTop: -6, marginBottom: 10,
    paddingHorizontal: 4, fontStyle: 'italic',
  },
  presetRow: { paddingRight: 12, paddingVertical: 5 },
  presetChip: {
    minWidth: 146, minHeight: 106, paddingVertical: 15, paddingHorizontal: 16,
    borderRadius: 21, marginRight: 10, borderWidth: 1,
    justifyContent: 'center',
  },
  userPresetCard: { padding: 0, position: 'relative' },
  userPresetApply: {
    flex: 1, justifyContent: 'center', paddingVertical: 15, paddingHorizontal: 16,
    paddingRight: 34, borderRadius: 20,
  },
  presetName: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  presetRange: { fontSize: 11, marginTop: 2, fontWeight: '500' },
  presetBlurb: { fontSize: 11, marginTop: 6 },

  playBtn: {
    height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 22, marginHorizontal: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  playText: { fontSize: 18, fontWeight: '700', letterSpacing: 4, color: '#0B0B1F' },

  mixerCard: { padding: 18, marginBottom: 2 },
  sleepRow: { marginHorizontal: 0 },
  sleepLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  sleepPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sleepPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sleepPillText: { color: '#ffffff99', fontSize: 11, fontWeight: '600', letterSpacing: 1 },

  customSleepBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  customSleepCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#0F1024',
    borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  customSleepTitle: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  customSleepHint: { color: '#ffffff88', fontSize: 12, marginTop: 6, marginBottom: 16 },
  customSleepInput: {
    color: '#fff', fontSize: 22, fontWeight: '600', letterSpacing: 1,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    textAlign: 'center',
  },
  customSleepActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  customSleepCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  customSleepCancelText: { color: '#ffffffaa', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  customSleepSetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  customSleepSetText: { color: '#0B0B1F', fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  // Audio safety modal (once-per-session before first Play)
  audioSafetyBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  audioSafetyCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: '#0F1024',
    borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  audioSafetyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 1, marginBottom: 14 },
  audioSafetyBody: { color: '#ffffffcc', fontSize: 13, lineHeight: 20, marginBottom: 10 },
  audioSafetyActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  audioSafetyCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  audioSafetyCancelText: { color: '#ffffffaa', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  audioSafetySetBtn: { flex: 1.4, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  audioSafetySetText: { color: '#0B0B1F', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },

  mixerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.09)', marginVertical: 20 },
  mixerLabel: { color: '#9DC7AC', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 10 },
  bgCard: { marginTop: 0 },
  bgPickBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  bgPickText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  bgPickHint: { color: '#ffffff66', fontSize: 11, marginTop: 4 },
  bgFileRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  bgFileName: { color: '#fff', fontSize: 14, flex: 1 },
  bgClearBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  bgClearText: { color: '#fff', fontSize: 14 },
  bgControlsRow: { flexDirection: 'row', alignItems: 'center' },
  bgPlayBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#9DC7AC',
  },
  bgPlayText: { color: '#0B0B1F', fontSize: 18, fontWeight: '700' },
  bgVolLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 1.5, fontWeight: '600', marginBottom: 2 },

  footnote: {
    color: '#ffffff66', fontSize: 12, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 20, lineHeight: 18,
  },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1c1c2c',
    borderRadius: 20, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalSub: { color: '#ffffff80', fontSize: 12, marginTop: 4 },
  modalInput: {
    color: '#fff', fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, marginLeft: 8 },
  modalBtnGhost: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modalBtnGhostText: { color: '#fff', fontWeight: '600' },
  modalBtnPrimary: { backgroundColor: '#9DC7AC' },
  modalBtnPrimaryText: { color: '#0B0B1F', fontWeight: '700' },
  modalBtnDanger: { backgroundColor: '#E07A66' },
  modalBtnDangerText: { color: '#0B0B1F', fontWeight: '700' },
  confirmCard: { maxWidth: 400 },
  confirmBody: { marginTop: 8, lineHeight: 18 },
  toastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 300,
    elevation: 300,
  },
  toastCard: {
    maxWidth: 420,
    backgroundColor: 'rgba(18,18,34,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  toastTitle: { color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  toastMessage: {
    color: '#ffffffaa', fontSize: 12, marginTop: 3,
    textAlign: 'center', lineHeight: 17,
  },


  miniPlayerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 105,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    zIndex: 180,
    elevation: 180,
  },
  miniPlayerOverlayRoutine: { height: 139 },
  miniPlayer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginHorizontal: 12,
    marginBottom: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 76,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(8,9,25,0.07)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  miniPlayerRoutine: { minHeight: 108 },
  miniPlayerMainRow: { flexDirection: 'row', alignItems: 'center' },
  miniPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayText: { color: '#0B0B1F', fontSize: 16, fontWeight: '900' },
  miniBody: { flex: 1, marginHorizontal: 12, justifyContent: 'center', minHeight: 52 },
  miniStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  miniStatusDot: { width: 5, height: 5, borderRadius: 3, marginRight: 6 },
  miniStatus: { fontSize: 7.5, fontWeight: '900', letterSpacing: 1.5 },
  miniTitle: { color: '#fff', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.25 },
  miniMeta: { color: '#A5A3B2', fontSize: 10.5, marginTop: 2 },
  miniRoutineTrack: {
    flexDirection: 'row', gap: 6, marginTop: 6,
  },
  miniRoutineStep: {
    flex: 1, minWidth: 0, borderRadius: 9, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 5,
  },
  miniRoutineStepInactive: {
    borderColor: 'rgba(153,153,170,0.20)',
    backgroundColor: 'rgba(118,118,137,0.07)',
    opacity: 0.62,
  },
  miniRoutineStepTopline: { flexDirection: 'row', alignItems: 'center' },
  miniRoutineStepNumber: {
    color: '#777789', fontSize: 7, fontWeight: '900', letterSpacing: 0.8,
    marginRight: 5,
  },
  miniRoutineStepLabel: {
    flex: 1, color: '#8B8A99', fontSize: 7.5, fontWeight: '800', letterSpacing: 0.65,
  },
  miniRoutineStepTime: {
    color: '#777685', fontSize: 8, fontWeight: '800', letterSpacing: 0.7,
    marginTop: 2,
  },
  miniStopBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  miniStopText: { color: '#ffffffcc', fontSize: 20, lineHeight: 22, fontWeight: '500' },
  miniSoundscapeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  miniSoundscapeRing: {
    position: 'absolute',
    width: 49,
    height: 49,
    borderRadius: 25,
    borderWidth: 1.5,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  tabBarSafe: {
    backgroundColor: 'rgba(6,7,20,0.82)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.11)',
  },
  tabBarViewport: { position: 'relative', overflow: 'hidden' },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
  },
  tabBarScrollContent: {
    flexDirection: 'row',
    paddingTop: 7,
    paddingBottom: 6,
    paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
  },
  tabBtn: {
    flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center',
    minHeight: 58, paddingVertical: 3, paddingHorizontal: 2,
  },
  tabBtnFixed: {
    width: SCROLL_TAB_WIDTH,
    minWidth: SCROLL_TAB_WIDTH,
    flexBasis: SCROLL_TAB_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabGlyph: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabIconWrap: {
    width: 38, height: 30, borderRadius: 15, marginBottom: 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  tabLabel: { fontSize: 10.5, letterSpacing: 0.4, fontWeight: '700' },
  tabLabelCompact: { fontSize: 9.5, letterSpacing: 0 },
  tabScrollEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 34,
    zIndex: 4,
    justifyContent: 'center',
  },
  tabScrollEdgeLeft: { left: 0, alignItems: 'flex-start', paddingLeft: 4 },
  tabScrollEdgeRight: { right: 0, alignItems: 'flex-end', paddingRight: 4 },
  tabScrollChevron: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  beatSliderBlock: { width: '100%', marginTop: 10, marginBottom: 4 },
  beatSlider: { width: '100%', height: 30 },
  beatSliderLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 4,
  },
  beatSliderLabel: { color: '#ffffff90', fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  beatSliderHint: { color: '#ffffff55', fontSize: 10, fontStyle: 'italic' },
  advancedToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)', marginBottom: 18,
  },
  advancedToggleText: { color: '#ffffff90', fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  advancedToggleMeta: { color: '#ffffff66', fontSize: 11, letterSpacing: 0.5 },
  presetDeleteBtn: {
    position: 'absolute', top: 6, right: 8,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  presetDeleteText: { fontSize: 12, fontWeight: '700' },
});
