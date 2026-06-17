import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  CloudRain,
  Waves,
  TreeEvergreen,
  Campfire,
  WaveSquare,
  WaveSine,
  WaveTriangle,
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

// Sentry crash reporting. The DSN is a write-only public identifier — safe to
// commit per Sentry's docs, it is not a secret. (The SENTRY_AUTH_TOKEN used for
// source-map upload IS secret and lives only in EAS env vars / .env.local.)
Sentry.init({
  dsn: 'https://b666bcf55a78f568c3ed434cb8e55cef@o4511389012852736.ingest.us.sentry.io/4511389016195072',
  // Don't ship sensitive data. Journal entries / rants must never be auto-attached.
  beforeSend(event) {
    if (event.contexts) delete event.contexts.state;
    return event;
  },
  tracesSampleRate: 0.1,
  enableNativeCrashHandling: true,
});

import BreathworkView from './BreathworkView';
import ChakrasView from './ChakrasView';
import HoroscopesView from './HoroscopesView';
import MoreView, { type NotifPref } from './MoreView';
import OnboardingView from './OnboardingView';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// MIN_HZ / MAX_HZ / clampHz / comfortableCarrier / btoaFallback live in
// lib/binauralMath so they can be unit-tested in plain Node without React
// Native deps. See __tests__/binauralMath.test.ts.
import {
  MIN_HZ,
  MAX_HZ,
  clampHz,
  comfortableCarrier,
  btoaFallback,
} from './lib/binauralMath';
import { NOTIF_AFFIRMATIONS } from './lib/affirmations';
const STORAGE_KEY = '@binaural_user_presets_v1';
const STORAGE_KEY_ZODIAC = '@simply_ambient_zodiac_v1';
const STORAGE_KEY_STREAK = '@simply_ambient_streak_v1';
export const STORAGE_KEY_PROFILE = '@simply_ambient_profile_v1';
export const STORAGE_KEY_PARTNER = '@simply_ambient_partner_v1';
export const STORAGE_KEY_GEMINI = '@simply_ambient_gemini_key_v1';
export const STORAGE_KEY_ONBOARDED = '@simply_ambient_onboarded_v1';

function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
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
const TONE_FILE_PATH = `${FileSystem.cacheDirectory}binaural-tone.wav`;
const SOUNDSCAPE_FILE_PREFIX = `${FileSystem.cacheDirectory}simply-ambient-soundscape-v4-`;
const SLIDE_THROTTLE_MS = 220;
const PALETTE_CROSSFADE_MS = 2600;

type BandKey =
  | 'none' | 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'tuning'
  | 'root' | 'sacral' | 'solar' | 'heart' | 'throat' | 'thirdEye' | 'crown'
  | 'vata' | 'pitta' | 'kapha';

const QUOTES = [
  'Thoughts become things',
  'Tune in. Receive.',
  'What you seek is seeking you',
  'Energy flows where attention goes',
  'You attract what you vibrate',
  'Be still, and know',
  'As within, so without',
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

type SoundscapeKey = 'rain' | 'ocean' | 'forest' | 'fire' | 'white' | 'pink' | 'brown';

type Soundscape = {
  id: SoundscapeKey;
  name: string;
  blurb: string;
  Icon: React.ComponentType<IconProps>;
  color: string;
};

const SOUNDSCAPES: Soundscape[] = [
  { id: 'rain',   name: 'Soft Rain',      blurb: 'A steady veil with tiny drops near the edge of attention.', color: '#5BD0FF',   Icon: CloudRain },
  { id: 'ocean',  name: 'Ocean Tide',     blurb: 'Long swells for downshifting into sleep or recovery.',      color: '#5B6CFF',   Icon: Waves },
  { id: 'forest', name: 'Forest Air',     blurb: 'Leaf wash with a few distant, breathy chirps.',             color: '#9affc8',   Icon: TreeEvergreen },
  { id: 'fire',   name: 'Hearth',         blurb: 'A real campfire bed with natural ember crackle.',            color: '#FFB05B',   Icon: Campfire },
  { id: 'white',  name: 'White Noise',    blurb: 'Even masking for busy rooms and brittle silence.',          color: '#ffffffcc', Icon: WaveSquare },
  { id: 'pink',   name: 'Pink Noise',     blurb: 'Softer masking with less edge than white noise.',           color: '#FFD0E1',   Icon: WaveSine },
  { id: 'brown',  name: 'Brown Noise',    blurb: 'Low, dense, and grounding for a heavy nervous system.',     color: '#8A6B4A',   Icon: WaveTriangle },
];

const BUNDLED_SOUNDSCAPES: Partial<Record<SoundscapeKey, number>> = {
  rain: require('./assets/soundscapes/soft-rain.mp3'),
  fire: require('./assets/soundscapes/hearth.mp3'),
  white: require('./assets/soundscapes/white-noise.mp3'),
};

const SOUNDSCAPE_GAIN: Record<SoundscapeKey, number> = {
  rain: 0.72,
  ocean: 0.72,
  forest: 0.72,
  fire: 0.72,
  white: 0.24,
  pink: 0.62,
  brown: 0.62,
};

function effectiveSoundscapeVolume(kind: SoundscapeKey, volume: number) {
  return Math.max(0, Math.min(1, volume)) * SOUNDSCAPE_GAIN[kind];
}

export type Chakra = {
  id: string;
  band: BandKey;
  number: number;
  name: string;
  sanskrit: string;
  sanskritMeaning: string;   // Translation of the Sanskrit name (e.g. "Root Support")
  bija: string;
  bijaPronunciation: string; // English-phonetic pronunciation guide
  symbol: string;            // Devanagari bija glyph
  hz: number;
  element: string;
  location: string;
  color: string;
  affirmation: string;       // Short mantra, e.g. "I am"
  planets: string;           // Astrological associations
  gland: string;             // Endocrine correspondences
  governs: string;
  blocked: string;
};

export const CHAKRAS: Chakra[] = [
  { id: 'cr-root',     band: 'root',     number: 1, name: 'Root',         sanskrit: 'Muladhara',    sanskritMeaning: 'Root Support', bija: 'LAM', bijaPronunciation: 'lām', symbol: 'लं', hz: 396, element: 'Earth',         location: 'Base of spine',     color: '#FF3838', affirmation: 'I am',         planets: 'Earth · Saturn',     gland: 'Adrenals',           governs: 'Safety · Stability · Survival',         blocked: 'Fear · Anxiety · Ungroundedness' },
  { id: 'cr-sacral',   band: 'sacral',   number: 2, name: 'Sacral',       sanskrit: 'Svadhisthana', sanskritMeaning: 'Sweetness',    bija: 'VAM', bijaPronunciation: 'vām', symbol: 'वं', hz: 417, element: 'Water',         location: 'Lower abdomen',     color: '#FF8A38', affirmation: 'I feel',       planets: 'Moon',               gland: 'Gonads',             governs: 'Creativity · Sensuality · Pleasure',     blocked: 'Emotional repression · Stagnant flow' },
  { id: 'cr-solar',    band: 'solar',    number: 3, name: 'Solar Plexus', sanskrit: 'Manipura',     sanskritMeaning: 'Lustrous Gem', bija: 'RAM', bijaPronunciation: 'rām', symbol: 'रं', hz: 528, element: 'Fire',          location: 'Upper abdomen',     color: '#FFD000', affirmation: 'I do',         planets: 'Mars · Sun',         gland: 'Pancreas · Adrenals', governs: 'Will · Confidence · Personal power',     blocked: 'Low self-esteem · Control patterns' },
  { id: 'cr-heart',    band: 'heart',    number: 4, name: 'Heart',        sanskrit: 'Anahata',      sanskritMeaning: 'Unstruck',     bija: 'YAM', bijaPronunciation: 'yām', symbol: 'यं', hz: 639, element: 'Air',           location: 'Center of chest',   color: '#3FE07F', affirmation: 'I love',       planets: 'Venus',              gland: 'Thymus',             governs: 'Love · Compassion · Connection',         blocked: 'Grief · Resentment · Isolation' },
  { id: 'cr-throat',   band: 'throat',   number: 5, name: 'Throat',       sanskrit: 'Vishuddha',    sanskritMeaning: 'Purification', bija: 'HAM', bijaPronunciation: 'hām', symbol: 'हं', hz: 741, element: 'Ether',         location: 'Throat',            color: '#3FB6FF', affirmation: 'I speak',      planets: 'Mercury',            gland: 'Thyroid',            governs: 'Truth · Expression · Voice',             blocked: 'Suppressed truth · Fear of judgment' },
  { id: 'cr-thirdEye', band: 'thirdEye', number: 6, name: 'Third Eye',    sanskrit: 'Ajna',         sanskritMeaning: 'Command',      bija: 'OM',  bijaPronunciation: 'oṃ',  symbol: 'ॐ',  hz: 852, element: 'Light',         location: 'Between brows',     color: '#5B6CFF', affirmation: 'I see',        planets: 'Jupiter · Neptune',  gland: 'Pineal',             governs: 'Intuition · Insight · Inner vision',     blocked: 'Disconnect from inner knowing' },
  { id: 'cr-crown',    band: 'crown',    number: 7, name: 'Crown',        sanskrit: 'Sahasrara',    sanskritMeaning: 'Thousand Fold',bija: 'AUM', bijaPronunciation: 'auṃ', symbol: 'ॐ',  hz: 963, element: 'Consciousness', location: 'Top of head',       color: '#A45BFF', affirmation: 'I understand', planets: 'Uranus',             gland: 'Pituitary',          governs: 'Unity · Spirituality · Divine connection', blocked: 'Spiritual disconnect · Materialism' },
];

export type Dosha = {
  id: 'vata' | 'pitta' | 'kapha';
  band: BandKey;
  name: string;
  element: string;
  qualities: string;
  balanceHz: number;
  balanceTechnique: string;
  color: string;
  description: string;
};

export type Zodiac = {
  id: string;
  glyph: string;
  name: string;
  startMonth: number; startDay: number;
  endMonth: number;   endDay: number;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
  qualities: string;
  intention: string;
  yearAhead: string;
  // Maps each zodiac to the chakra whose element matches.
  chakraId: 'cr-root' | 'cr-sacral' | 'cr-solar' | 'cr-heart' | 'cr-throat';
  color: string;
};

export const ZODIAC: Zodiac[] = [
  { id: 'aries',       glyph: '♈', name: 'Aries',       startMonth: 3,  startDay: 21, endMonth: 4,  endDay: 19, element: 'Fire',  qualities: 'Initiator · Bold',          intention: 'Lead with the courage that already lives in you.',
    yearAhead: 'This year your fire is meant to lead. But lead with patience. Begin only what you can finish, and finish what truly matters.',
    chakraId: 'cr-solar',  color: '#FF5B5B' },
  { id: 'taurus',      glyph: '♉', name: 'Taurus',      startMonth: 4,  startDay: 20, endMonth: 5,  endDay: 20, element: 'Earth', qualities: 'Steady · Sensual',          intention: 'Ground in what nourishes. Slow down to taste it.',
    yearAhead: 'A year for slow, deliberate building. The pleasure is in the process, not the prize. Trust your senses.',
    chakraId: 'cr-root',   color: '#7FB45B' },
  { id: 'gemini',      glyph: '♊', name: 'Gemini',      startMonth: 5,  startDay: 21, endMonth: 6,  endDay: 20, element: 'Air',   qualities: 'Curious · Versatile',       intention: 'Speak only what is true. Let the rest pass.',
    yearAhead: 'Your many threads come together this year. Choose what to weave and what to release. Less, but deeper.',
    chakraId: 'cr-throat', color: '#FFE078' },
  { id: 'cancer',      glyph: '♋', name: 'Cancer',      startMonth: 6,  startDay: 21, endMonth: 7,  endDay: 22, element: 'Water', qualities: 'Nurturing · Intuitive',     intention: 'Tend to your inner home before the outer world.',
    yearAhead: 'Tend the inner home this year. Strong roots make lasting branches. Receive as readily as you give.',
    chakraId: 'cr-sacral', color: '#A0D8FF' },
  { id: 'leo',         glyph: '♌', name: 'Leo',         startMonth: 7,  startDay: 23, endMonth: 8,  endDay: 22, element: 'Fire',  qualities: 'Radiant · Generous',        intention: 'Shine without dimming for anyone.',
    yearAhead: 'Step into your light without dimming for anyone. Your warmth is generous, not obligatory.',
    chakraId: 'cr-solar',  color: '#FFB05B' },
  { id: 'virgo',       glyph: '♍', name: 'Virgo',       startMonth: 8,  startDay: 23, endMonth: 9,  endDay: 22, element: 'Earth', qualities: 'Discerning · Refined',      intention: 'Refine without becoming rigid.',
    yearAhead: 'Refine, don\'t perfect. Done with care beats endless polishing. Trust the simpler path.',
    chakraId: 'cr-root',   color: '#9affc8' },
  { id: 'libra',       glyph: '♎', name: 'Libra',       startMonth: 9,  startDay: 23, endMonth: 10, endDay: 22, element: 'Air',   qualities: 'Harmonious · Fair',         intention: 'Balance is a verb, not a state.',
    yearAhead: 'The balance you seek is internal. Stop outsourcing your steadiness to other people\'s moods.',
    chakraId: 'cr-throat', color: '#FFD0E1' },
  { id: 'scorpio',     glyph: '♏', name: 'Scorpio',     startMonth: 10, startDay: 23, endMonth: 11, endDay: 21, element: 'Water', qualities: 'Deep · Transformative',     intention: 'Let what is dying complete its dying.',
    yearAhead: 'A year of release. What completes its dying makes room for what is coming. Trust the dark.',
    chakraId: 'cr-sacral', color: '#A45BFF' },
  { id: 'sagittarius', glyph: '♐', name: 'Sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21, element: 'Fire',  qualities: 'Seeker · Free',             intention: 'The far horizon begins under your feet.',
    yearAhead: 'The horizon you chase is wide enough to include rest. Travel slowly. Notice where you are.',
    chakraId: 'cr-solar',  color: '#FF8A38' },
  { id: 'capricorn',   glyph: '♑', name: 'Capricorn',   startMonth: 12, startDay: 22, endMonth: 1,  endDay: 19, element: 'Earth', qualities: 'Disciplined · Grounded',    intention: 'Build patiently. Stone by stone.',
    yearAhead: 'Build patiently. The structures you raise this year will hold for decades. Don\'t skip foundations.',
    chakraId: 'cr-root',   color: '#8A6B4A' },
  { id: 'aquarius',    glyph: '♒', name: 'Aquarius',    startMonth: 1,  startDay: 20, endMonth: 2,  endDay: 18, element: 'Air',   qualities: 'Visionary · Independent',   intention: 'Imagine the world you wish to inhabit.',
    yearAhead: 'Imagine larger than you\'ve allowed. The vision you withhold serves no one. Speak it.',
    chakraId: 'cr-throat', color: '#5BD0FF' },
  { id: 'pisces',      glyph: '♓', name: 'Pisces',      startMonth: 2,  startDay: 19, endMonth: 3,  endDay: 20, element: 'Water', qualities: 'Dreamy · Compassionate',    intention: 'Dissolve into the larger flow.',
    yearAhead: 'Trust the current. Surrender is not weakness. It is mastery of flow. Soften the grip.',
    chakraId: 'cr-sacral', color: '#5B6CFF' },
];

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

export const DOSHAS: Dosha[] = [
  {
    id: 'vata',
    band: 'vata',
    name: 'Vata',
    element: 'Air + Ether',
    qualities: 'Light · Cold · Mobile · Dry',
    balanceHz: 432,
    balanceTechnique: 'Nadi Shodhana',
    color: '#9aa0e0',
    description: 'Governs movement, breath, nervous system. Imbalanced: scattered, restless, light sleep. Soothe with grounding warmth and slow, steady breath.',
  },
  {
    id: 'pitta',
    band: 'pitta',
    name: 'Pitta',
    element: 'Fire + Water',
    qualities: 'Hot · Sharp · Intense',
    balanceHz: 528,
    balanceTechnique: 'Sitali (Cooling)',
    color: '#FFB05B',
    description: 'Governs digestion, transformation, intellect. Imbalanced: irritability, inflammation, burnout. Cool with the breath, soften the gaze.',
  },
  {
    id: 'kapha',
    band: 'kapha',
    name: 'Kapha',
    element: 'Earth + Water',
    qualities: 'Heavy · Slow · Stable · Cool',
    balanceHz: 741,
    balanceTechnique: 'Bhastrika (Bellows)',
    color: '#9affc8',
    description: 'Governs structure, immunity, lubrication. Imbalanced: lethargy, attachment, stagnation. Energize with heat, motion, and clear expression.',
  },
];

const PRESETS: BuiltInPreset[] = [
  { id: 'delta',    band: 'delta', name: 'Delta',    range: '0.5–4 Hz',  beatHz: 2,  carrier: 200, color: '#5B6CFF', blurb: 'Surrender · Restoration' },
  { id: 'theta',    band: 'theta', name: 'Theta',    range: '4–8 Hz',    beatHz: 6,  carrier: 200, color: '#8A5BFF', blurb: 'Visualize · Receive' },
  { id: 'schumann', band: 'alpha', name: 'Schumann', range: '7.83 Hz',   beatHz: 8,  carrier: 200, color: '#9affc8', blurb: 'Earth’s heartbeat' },
  { id: 'alpha',    band: 'alpha', name: 'Alpha',    range: '8–13 Hz',   beatHz: 10, carrier: 200, color: '#5BD0FF', blurb: 'Aligned focus · Allow' },
  { id: 'beta',     band: 'beta',  name: 'Beta',     range: '13–30 Hz',  beatHz: 18, carrier: 200, color: '#FFB05B', blurb: 'Direct · Take action' },
  { id: 'gamma',    band: 'gamma', name: 'Gamma',    range: '30–100 Hz', beatHz: 40, carrier: 200, color: '#FF5B9C', blurb: 'Insight · Knowing' },
  { id: 'gamma40',  band: 'gamma', name: 'Gamma-40', range: '40 Hz',     beatHz: 40, carrier: 250, color: '#FF8FB1', blurb: 'Memory · Clarity' },
];

type TuningOrigin = 'solfeggio' | 'natural' | 'cosmic' | 'archaeo' | 'scientific';

const TUNINGS: TuningPreset[] = [
  { id: 't111', hz: 111, name: '111 Hz', intent: 'Divine resonance',     blurb: 'Hypogeum cymatic tone',   origin: 'archaeo'    },
  { id: 't136', hz: 136, name: '136 Hz', intent: 'OM · Cosmic breath',   blurb: 'Earth orbital tone',      origin: 'cosmic'     },
  { id: 't174', hz: 174, name: '174 Hz', intent: 'Pain · Grounding',     blurb: 'Eases discomfort',        origin: 'solfeggio'  },
  { id: 't256', hz: 256, name: '256 Hz', intent: 'Scientific C',         blurb: 'Verdi · ancient pitch',   origin: 'scientific' },
  { id: 't285', hz: 285, name: '285 Hz', intent: 'Tissue · Renewal',     blurb: 'Cellular repair',         origin: 'solfeggio'  },
  { id: 't396', hz: 396, name: '396 Hz', intent: 'Release fear',         blurb: 'Liberation from guilt',   origin: 'solfeggio'  },
  { id: 't417', hz: 417, name: '417 Hz', intent: 'Facilitate change',    blurb: 'Undoing patterns',        origin: 'solfeggio'  },
  { id: 't432', hz: 432, name: '432 Hz', intent: 'Earth resonance',      blurb: 'Calm · Grounded tuning',  origin: 'natural'    },
  { id: 't444', hz: 444, name: '444 Hz', intent: 'Angelic tuning',       blurb: 'Companion to 528',        origin: 'natural'    },
  { id: 't528', hz: 528, name: '528 Hz', intent: 'Love · Miracle tone',  blurb: 'DNA repair · Heart',      origin: 'solfeggio'  },
  { id: 't639', hz: 639, name: '639 Hz', intent: 'Connection',           blurb: 'Harmonize relationships', origin: 'solfeggio'  },
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
  delta:  { base: ['#0a1240', '#1a2a78', '#0a1240'], waves: ['#172056', '#243596', '#5B6CFF'], accent: '#5B6CFF' },
  theta:  { base: ['#1a0a3a', '#3a1276', '#1a0a3a'], waves: ['#28115a', '#4a2096', '#8A5BFF'], accent: '#8A5BFF' },
  alpha:  { base: ['#0a2a4a', '#125878', '#0a2a4a'], waves: ['#0e3458', '#206a96', '#5BD0FF'], accent: '#5BD0FF' },
  beta:   { base: ['#3a1a0a', '#76402a', '#3a1a0a'], waves: ['#502a14', '#965a3a', '#FFB05B'], accent: '#FFB05B' },
  gamma:  { base: ['#3a0a1a', '#76124a', '#3a0a1a'], waves: ['#5a0e2a', '#962060', '#FF5B9C'], accent: '#FF5B9C' },
  tuning: { base: ['#2a200a', '#5a4218', '#2a200a'], waves: ['#3a2c14', '#7a5e2a', '#d9b35c'], accent: '#d9b35c' },
  // Chakra palettes. Saturated, rainbow progression
  root:     { base: ['#1a0a0a', '#3a1a14', '#1a0a0a'], waves: ['#2a1018', '#5a2030', '#FF3838'], accent: '#FF3838' },
  sacral:   { base: ['#1a1208', '#3a2a14', '#1a1208'], waves: ['#2a1c10', '#5a3a20', '#FF8A38'], accent: '#FF8A38' },
  solar:    { base: ['#1a1808', '#3a3214', '#1a1808'], waves: ['#2a2410', '#5a4a20', '#FFD000'], accent: '#FFD000' },
  heart:    { base: ['#0a1a14', '#143a2a', '#0a1a14'], waves: ['#102a20', '#205a3a', '#3FE07F'], accent: '#3FE07F' },
  throat:   { base: ['#0a1418', '#143040', '#0a1418'], waves: ['#10202a', '#205070', '#3FB6FF'], accent: '#3FB6FF' },
  thirdEye: { base: ['#0a0a1a', '#141a3a', '#0a0a1a'], waves: ['#101020', '#202a5a', '#5B6CFF'], accent: '#5B6CFF' },
  crown:    { base: ['#10081a', '#1a103a', '#10081a'], waves: ['#181020', '#3a205a', '#A45BFF'], accent: '#A45BFF' },
  // Dosha palettes (Ayurveda)
  vata:     { base: ['#0c1024', '#181f48', '#0c1024'], waves: ['#15193a', '#2c3478', '#9aa0e0'], accent: '#9aa0e0' },
  pitta:    { base: ['#1a1208', '#3a2814', '#1a1208'], waves: ['#2a1c10', '#5a3e20', '#FFB05B'], accent: '#FFB05B' },
  kapha:    { base: ['#08180e', '#143824', '#08180e'], waves: ['#102a18', '#205a3a', '#9affc8'], accent: '#9affc8' },
};

function bandFor(beat: number): { name: string; color: string; key: BandKey } {
  if (beat < 4)  return { name: 'Delta', color: '#5B6CFF', key: 'delta' };
  if (beat < 8)  return { name: 'Theta', color: '#8A5BFF', key: 'theta' };
  if (beat < 13) return { name: 'Alpha', color: '#5BD0FF', key: 'alpha' };
  if (beat < 30) return { name: 'Beta',  color: '#FFB05B', key: 'beta' };
  return           { name: 'Gamma', color: '#FF5B9C', key: 'gamma' };
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

async function scheduleAffirmationNotifs(pref: NotifPref) {
  if (Platform.OS === 'web') return; // Local scheduled notifs aren't supported in the browser
  if (IS_EXPO_GO) return; // No real scheduling in Expo Go on SDK 53+
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (pref === 'off') return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const times = pref === 'daily'
      ? [{ hour: 9, minute: 0 }]
      : [{ hour: 9, minute: 0 }, { hour: 13, minute: 0 }, { hour: 18, minute: 0 }];
    for (const t of times) {
      const aff = randomAffirmation();
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Simply Ambient', body: aff },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: t.hour,
          minute: t.minute,
        },
      });
    }
  } catch (e) {
    console.warn('notification scheduling failed', e);
  }
}

function randomAffirmation() {
  return NOTIF_AFFIRMATIONS[Math.floor(Math.random() * NOTIF_AFFIRMATIONS.length)];
}

// ---------------------------------------------------------------------------
//   Lunar phase. Conway's algorithm, ~99% accurate
// ---------------------------------------------------------------------------

function lunarPhase(date: Date = new Date()): { glyph: string; name: string; illum: number } {
  let y = date.getFullYear();
  let m = date.getMonth() + 1;
  const d = date.getDate();
  if (m < 3) { y -= 1; m += 12; }
  const j = Math.floor(365.25 * y) + Math.floor(30.6001 * (m + 1)) + d - 694039.09;
  const ip = (j / 29.5305882) % 1; // age fraction 0..1
  const age = ip < 0 ? ip + 1 : ip;
  const illum = (1 - Math.cos(age * 2 * Math.PI)) / 2; // 0..1
  if (age < 0.0625 || age >= 0.9375) return { glyph: '●', name: 'New', illum };
  if (age < 0.1875)  return { glyph: '◐', name: 'Waxing crescent', illum };
  if (age < 0.3125)  return { glyph: '◐', name: 'First quarter', illum };
  if (age < 0.4375)  return { glyph: '◑', name: 'Waxing gibbous', illum };
  if (age < 0.5625)  return { glyph: '○', name: 'Full', illum };
  if (age < 0.6875)  return { glyph: '◑', name: 'Waning gibbous', illum };
  if (age < 0.8125)  return { glyph: '◑', name: 'Last quarter', illum };
  return                  { glyph: '◐', name: 'Waning crescent', illum };
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

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const [left, right] = sampleFn(i / sampleRate, i);
    const l = Math.max(-1, Math.min(1, left));
    const r = Math.max(-1, Math.min(1, right));
    view.setInt16(off, Math.round(l * 32767), true); off += 2;
    view.setInt16(off, Math.round(r * 32767), true); off += 2;
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

  return buildStereoWav(kind === 'fire' ? 6 : 2, (t, i) => {
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
      case 'fire': {
        const sparkLeft = fireCrackle * 0.22 + firePop * 0.18;
        const sparkRight = fireCrackle * 0.15 + firePop * 0.24;
        return [(flame + sparkLeft) * panLeft, (flame * 0.88 + sparkRight) * panRight];
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
      const t = ctx.currentTime;
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

    // Short fade-in to avoid a click on start.
    const t = ctx.currentTime;
    master.gain.linearRampToValueAtTime(WEB_TONE_GAIN, t + 0.04);
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
          left[i] = l;
          right[i] = r;
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
      case 'fire':
        return [flame + this.fireCrackle * 0.22 + this.firePop * 0.18, flame * 0.88 + this.fireCrackle * 0.15 + this.firePop * 0.24];
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
  const [idx, setIdx] = useState(0);
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
  const xfade = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const wash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!playing) {
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
  }, [playing, xfade, drift, wash]);

  const op1 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.20] });
  const op2 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.95] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_H * 0.22] });
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
          top: 0, height: SCREEN_H * 1.6,
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
function WaveBackground({ band, playing }: { band: BandKey; playing: boolean }) {
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

type Tab = 'frequencies' | 'breath' | 'chakras' | 'horoscopes' | 'soundscapes';

const STORAGE_KEY_NOTIF = '@simply_ambient_notif_pref_v1';
const STORAGE_KEY_NAV_SOUNDSCAPES = '@simply_ambient_nav_soundscapes_v1';
const SLEEP_TIMER_OPTIONS = [0, 5, 10, 15, 30, 60] as const; // minutes

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('frequencies');
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundscapesInNav, setSoundscapesInNav] = useState(false);
  const tabFade = useRef(new Animated.Value(1)).current;
  const lastTab = useRef<Tab>(tab);

  useEffect(() => {
    if (lastTab.current !== tab) {
      lastTab.current = tab;
      tabFade.setValue(0);
      Animated.timing(tabFade, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [tab, tabFade]);

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_ONBOARDED).then(v => {
      if (!v) setShowOnboarding(true);
      setOnboardingChecked(true);
    }).catch(() => setOnboardingChecked(true));
    AsyncStorage.getItem(STORAGE_KEY_NAV_SOUNDSCAPES)
      .then(v => setSoundscapesInNav(v === '1'))
      .catch(() => {});
  }, []);

  function setSoundscapesPinned(next: boolean) {
    setSoundscapesInNav(next);
    AsyncStorage.setItem(STORAGE_KEY_NAV_SOUNDSCAPES, next ? '1' : '0').catch(() => {});
    if (!next && tab === 'soundscapes') setTab('frequencies');
  }

  function dismissOnboarding() {
    AsyncStorage.setItem(STORAGE_KEY_ONBOARDED, '1').catch(() => {});
    setShowOnboarding(false);
  }

  const [leftHz, setLeftHz] = useState(DEFAULT_LEFT);
  const [rightHz, setRightHz] = useState(DEFAULT_RIGHT);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<BandKey>('none');

  const [isTonePlaying, setIsTonePlaying] = useState(false);
  const [isToneLoading, setIsToneLoading] = useState(false);

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

  const [lunar] = useState(() => lunarPhase());
  const [mySignId, setMySignId] = useState<string | null>(null);

  // More-tab state
  const [notifPref, setNotifPref] = useState<NotifPref>('off');
  const [affirmation, setAffirmation] = useState<string | null>(null);
  const [affLoading, setAffLoading] = useState(false);

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

  // Affirmations
  async function refreshAffirmation() {
    setAffLoading(true);
    try {
      setAffirmation(randomAffirmation());
    } finally {
      setAffLoading(false);
    }
  }

  // Load notification preference + initial affirmation on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_NOTIF).then(v => {
      if (v === 'daily' || v === 'thrice') setNotifPref(v);
    }).catch(() => {});
    refreshAffirmation();
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

  const tonePlayerRef = useRef<AudioPlayer | null>(null);
  const tonePlayGenRef = useRef(0);
  const bgPlayerRef = useRef<AudioPlayer | null>(null);
  const soundscapePlayerRef = useRef<AudioPlayer | null>(null);
  const soundscapeCacheRef = useRef<Partial<Record<SoundscapeKey, string>>>({});
  // Web-only: gapless oscillator engine, created lazily on first play.
  const webToneRef = useRef<WebToneEngine | null>(null);
  const webSoundscapeRef = useRef<WebSoundscapeEngine | null>(null);

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
      .catch(() => {});
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

  useEffect(() => {
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
        await webToneRef.current.play(clampHz(l), clampHz(r));
        if (myGen !== tonePlayGenRef.current) {
          try { webToneRef.current.stop(); } catch {}
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
      await FileSystem.writeAsStringAsync(TONE_FILE_PATH, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
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
          tonePlayerRef.current.volume = 1;
        }
      } else {
        const p = createAudioPlayer(source);
        p.loop = true;
        p.volume = 1;
        tonePlayerRef.current = p;
      }

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

  function stopTones() {
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
    // Play. Confirmation actually starts playback. State resets on cold
    // start (useState in App), so users get the reminder each new session.
    if (!audioSafetyAck) {
      setShowAudioSafetyModal(true);
      return;
    }
    loadAndPlay(leftHz, rightHz);
  }

  function acknowledgeAudioSafetyAndPlay() {
    setAudioSafetyAck(true);
    setShowAudioSafetyModal(false);
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

  function applyBuiltIn(p: BuiltInPreset) {
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
    setLeftHz(p.leftHz);
    setRightHz(p.rightHz);
    setActivePresetId(p.id);
    const beatHz = Math.abs(p.leftHz - p.rightHz);
    setActiveBand(beatHz === 0 ? 'tuning' : bandFor(beatHz).key);
    if (stateRef.current.isTonePlaying) loadAndPlay(p.leftHz, p.rightHz);
  }

  function applyTuning(t: TuningPreset) {
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
    Alert.alert('Delete preset?', `"${p.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          setUserPresets(curr => curr.filter(x => x.id !== p.id));
          if (activePresetId === p.id) {
            setActivePresetId(null);
            setActiveBand('none');
          }
        },
      },
    ]);
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
      Alert.alert('Could not pick file', String(e));
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
    if (bundled) return { assetId: bundled };

    const cached = soundscapeCacheRef.current[id];
    if (cached) return { uri: cached };

    const base64 = buildSoundscapeWav(id);
    const uri = `${SOUNDSCAPE_FILE_PREFIX}${id}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    soundscapeCacheRef.current[id] = uri;
    return { uri };
  }

  async function playSoundscape(id: SoundscapeKey) {
    try {
      if (Platform.OS === 'web') {
        if (!webSoundscapeRef.current) webSoundscapeRef.current = new WebSoundscapeEngine();
        await webSoundscapeRef.current.play(id, soundscapeVolume);
        setActiveSoundscapeId(id);
        setIsSoundscapePlaying(true);
        return;
      }
      const source = await ensureSoundscapeSource(id);
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

  function stopEverything() {
    setSleepTimer(0);
    stopTones();
    stopSoundscape();
    if (isBgPlaying) {
      try { bgPlayerRef.current?.pause(); } catch {}
      setIsBgPlaying(false);
    }
  }

  // --- Render --------------------------------------------------------------

  return (
    <View style={styles.root}>
      <WaveBackground band={activeBand} playing={isTonePlaying} />
      <StatusBar style="light" />
      <View
        pointerEvents="none"
        style={[styles.lunarBar, { top: insets.top + 6 }]}
      >
        <Text style={styles.lunarGlyph}>{lunar.glyph}</Text>
        <Text style={styles.lunarText}>{lunar.name}</Text>
      </View>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Animated.View style={{ flex: 1, opacity: tabFade }}>
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
                userPresets={userPresets}
                bgFileName={bgFileName}
                isBgPlaying={isBgPlaying}
                bgVolume={bgVolume}
                beatColor={beatColor}
                onCommitLeft={commitLeft}
                onCommitRight={commitRight}
                onSlideLeft={onLeftSlide}
                onSlideRight={onRightSlide}
                onApplyBuiltIn={applyBuiltIn}
                onApplyUser={applyUser}
                onApplyTuning={applyTuning}
                onDeleteUser={deleteUser}
                onSave={openSaveModal}
                onTogglePlay={togglePlay}
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
              />
            )}
            {tab === 'soundscapes' && (
              <SoundscapesView
                soundscapes={SOUNDSCAPES}
                activeSoundscapeId={activeSoundscapeId}
                isSoundscapePlaying={isSoundscapePlaying}
                soundscapeVolume={soundscapeVolume}
                onToggleSoundscape={toggleSoundscape}
                onChangeSoundscapeVolume={changeSoundscapeVolume}
              />
            )}
          </Animated.View>
        </KeyboardAvoidingView>

        <MiniPlayer
          visible={isTonePlaying || isToneLoading || isSoundscapePlaying || isBgPlaying || sleepEndsAt != null}
          title={displayBandName}
          beat={beat}
          accent={beatColor}
          isTonePlaying={isTonePlaying}
          isToneLoading={isToneLoading}
          sleepEndsAt={sleepEndsAt}
          soundscapeName={activeSoundscape?.name ?? (isBgPlaying ? 'Imported audio' : null)}
          soundscapePlaying={isSoundscapePlaying}
          hasSoundscape={activeSoundscapeId != null}
          onSoundscapePress={() => {
            if (activeSoundscapeId) toggleSoundscape(activeSoundscapeId);
            else setTab('soundscapes');
          }}
          onTogglePlay={togglePlay}
          onOpen={() => setTab('frequencies')}
          onStopAll={stopEverything}
        />
        <TabBar
          tab={tab}
          onChange={setTab}
          accent={beatColor}
          soundscapesInNav={soundscapesInNav}
        />
        <MoreLauncher accent={beatColor} onPress={() => setMenuOpen(true)} />
      </SafeAreaView>

      <SlideMenu open={menuOpen} onClose={() => setMenuOpen(false)} accent={beatColor}>
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
          soundscapesInNav={soundscapesInNav}
          onToggleSoundscapesInNav={setSoundscapesPinned}
        />
      </SlideMenu>

      {onboardingChecked && showOnboarding ? (
        <View style={StyleSheet.absoluteFill}>
          <OnboardingView onDone={dismissOnboarding} />
        </View>
      ) : null}

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
        onRequestClose={() => setShowAudioSafetyModal(false)}
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
                onPress={() => setShowAudioSafetyModal(false)}
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
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (fontsLoaded) {
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [fontsLoaded, fadeIn]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#0B0B1F' }} />;
  return (
    <SafeAreaProvider>
      <Animated.View style={{ flex: 1, opacity: fadeIn }}>
        <AppContent />
      </Animated.View>
    </SafeAreaProvider>
  );
});

// ===========================================================================
//   TabBar
// ===========================================================================

function SoundscapesView({
  soundscapes,
  activeSoundscapeId,
  isSoundscapePlaying,
  soundscapeVolume,
  onToggleSoundscape,
  onChangeSoundscapeVolume,
}: {
  soundscapes: Soundscape[];
  activeSoundscapeId: SoundscapeKey | null;
  isSoundscapePlaying: boolean;
  soundscapeVolume: number;
  onToggleSoundscape: (id: SoundscapeKey) => void;
  onChangeSoundscapeVolume: (v: number) => void;
}) {
  const activeName = activeSoundscapeId
    ? soundscapes.find(s => s.id === activeSoundscapeId)?.name ?? 'Ambient layer'
    : 'No layer selected';

  return (
    <ScrollView
      contentContainerStyle={styles.soundscapeScreen}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Soundscapes</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>texture under the tone</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      <View style={styles.soundscapeNowCard}>
        <Text style={styles.beatLabel}>AMBIENT LAYER</Text>
        <Text style={styles.soundscapeNowTitle}>{activeName}</Text>
        <Text style={styles.soundscapeNowMeta}>
          {isSoundscapePlaying ? 'Playing under your current session' : 'Tap a layer below to start'}
        </Text>
        {activeSoundscapeId ? (
          <View style={styles.soundscapeVolumeRow}>
            <Text style={styles.bgVolLabel}>VOLUME · {Math.round(soundscapeVolume * 100)}%</Text>
            <Slider
              style={{ width: '100%', height: 34 }}
              minimumValue={0}
              maximumValue={1}
              value={soundscapeVolume}
              minimumTrackTintColor="#d9b35c"
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="#d9b35c"
              onValueChange={onChangeSoundscapeVolume}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.soundscapeGrid}>
        {soundscapes.map(s => {
          const active = activeSoundscapeId === s.id && isSoundscapePlaying;
          const SoundIcon = s.Icon;
          return (
            <TouchableOpacity
              key={s.id}
              activeOpacity={0.86}
              onPress={() => onToggleSoundscape(s.id)}
              style={[
                styles.soundscapeTile,
                {
                  borderColor: active ? s.color : s.color + '55',
                  backgroundColor: active ? s.color + '22' : 'rgba(0,0,0,0.26)',
                },
              ]}
              accessibilityLabel={`${active ? 'Stop' : 'Play'} ${s.name}`}
            >
              <View style={styles.soundscapeTileGlyph}>
                <SoundIcon size={28} color={s.color} weight="duotone" />
              </View>
              <Text style={styles.soundscapeTileName}>{s.name}</Text>
              <Text style={styles.soundscapeTileBlurb}>{s.blurb}</Text>
              <Text style={[styles.soundscapeTileAction, { color: active ? s.color : '#ffffff77' }]}>
                {active ? 'STOP' : 'PLAY'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  hasSoundscape,
  onSoundscapePress,
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
  hasSoundscape: boolean;
  onSoundscapePress: () => void;
  onTogglePlay: () => void;
  onOpen: () => void;
  onStopAll: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!visible || !sleepEndsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [visible, sleepEndsAt]);

  if (!visible) return null;
  const timerText = sleepEndsAt ? formatRemaining(sleepEndsAt - now) : null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onOpen}
      style={[styles.miniPlayer, { borderColor: accent + '66' }]}
      accessibilityLabel="Open current sound session"
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onTogglePlay}
        style={[styles.miniPlayBtn, { backgroundColor: isTonePlaying ? '#fff' : accent }]}
        accessibilityLabel={isTonePlaying ? 'Pause tones' : 'Play tones'}
      >
        {isToneLoading ? (
          <ActivityIndicator color="#0B0B1F" size="small" />
        ) : (
          <Text style={styles.miniPlayText}>{isTonePlaying ? 'Ⅱ' : '▶'}</Text>
        )}
      </TouchableOpacity>
      <View style={styles.miniBody}>
        <Text style={styles.miniTitle} numberOfLines={1}>{title} · {beat.toFixed(0)} Hz</Text>
        <Text style={styles.miniMeta} numberOfLines={1}>
          {soundscapeName ? soundscapeName : 'Pure binaural tone'}
          {timerText ? ` · fades in ${timerText}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onSoundscapePress}
        style={[
          styles.miniSoundscapeBtn,
          soundscapePlaying && { backgroundColor: accent + '33', borderColor: accent },
        ]}
        accessibilityLabel={hasSoundscape ? (soundscapePlaying ? 'Stop soundscape' : 'Play soundscape') : 'Choose a soundscape'}
      >
        <Waveform size={18} weight="duotone" color={soundscapePlaying ? accent : '#ffffffcc'} />
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onStopAll}
        style={styles.miniStopBtn}
        accessibilityLabel="Stop all audio"
      >
        <Text style={styles.miniStopText}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Slide-in overlay menu that replaces the old "More" tab. The drawer keeps the
// black direction, but gives it a real surface, edge light, and close target
// so it feels designed instead of like an unstyled overlay.
function SlideMenu({
  open,
  onClose,
  accent,
  children,
}: {
  open: boolean;
  onClose: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(420, Math.round(Dimensions.get('window').width * 0.86));
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const closeDragStartRef = useRef(1);

  const animateMenuTo = (toValue: number, duration: number, done?: () => void) => {
    Animated.timing(progress, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) done?.();
    });
  };

  const closePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) && gesture.dx < 0,
      onPanResponderGrant: () => {
        progress.stopAnimation((value) => {
          closeDragStartRef.current = typeof value === 'number' ? value : 1;
        });
      },
      onPanResponderMove: (_, gesture) => {
        progress.setValue(clamp01(closeDragStartRef.current + gesture.dx / panelWidth));
      },
      onPanResponderRelease: (_, gesture) => {
        const shouldClose = gesture.dx < -panelWidth * 0.24 || gesture.vx < -0.65;
        if (shouldClose) onClose();
        else animateMenuTo(1, 180);
      },
      onPanResponderTerminate: () => animateMenuTo(1, 180),
    })
  ).current;

  useEffect(() => {
    if (open) setMounted(true);
    animateMenuTo(open ? 1 : 0, open ? 260 : 200, () => {
      if (!open) setMounted(false);
    });
  }, [open]);

  if (!mounted) return null;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

  return (
    <View style={styles.menuLayer} pointerEvents={open ? 'auto' : 'none'}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, styles.menuBackdrop, { opacity: progress }]} />
      </TouchableWithoutFeedback>
      <Animated.View
        {...closePanResponder.panHandlers}
        style={[
          styles.menuPanel,
          {
            width: panelWidth,
            transform: [{ translateX }],
            borderColor: accent + '33',
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
          locations={[0, 0.38, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.menuAccentRail, { backgroundColor: accent }]} pointerEvents="none" />
        <TouchableOpacity
          onPress={onClose}
          style={[styles.menuClose, { top: insets.top + 14 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Close menu"
        >
          <Text style={styles.menuCloseText}>✕</Text>
        </TouchableOpacity>
        <View style={[styles.menuContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

function TabBar({
  tab,
  onChange,
  accent,
  soundscapesInNav,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  accent: string;
  soundscapesInNav: boolean;
}) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarSafe}>
      <View style={styles.tabBar}>
        <TabButton label="Frequencies" glyph="∿" active={tab === 'frequencies'} accent={accent} onPress={() => onChange('frequencies')} />
        <TabButton label="Breath"      glyph="○" active={tab === 'breath'}      accent={accent} onPress={() => onChange('breath')} />
        <TabButton label="Chakras"     glyph="✦" active={tab === 'chakras'}     accent={accent} onPress={() => onChange('chakras')} />
        <TabButton label="Horoscopes"  glyph="☽" active={tab === 'horoscopes'}  accent={accent} onPress={() => onChange('horoscopes')} />
        {soundscapesInNav ? (
          <TabButton label="Soundscapes" Icon={Waveform} active={tab === 'soundscapes'} accent={accent} onPress={() => onChange('soundscapes')} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function MoreLauncher({
  accent,
  onPress,
}: {
  accent: string;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const launcherY = useRef(new Animated.Value(96)).current;
  const launcherStartYRef = useRef(96);
  const minY = insets.top + 10;
  const maxY = Math.max(minY, SCREEN_H - insets.bottom - 164);
  const dragRange = Math.max(1, maxY - minY);

  const openPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 8,
      onPanResponderGrant: () => {
        launcherY.stopAnimation((value) => {
          launcherStartYRef.current = typeof value === 'number' ? value : launcherStartYRef.current;
        });
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
          launcherY.setValue(clamp01((launcherStartYRef.current + gesture.dy - minY) / dragRange) * dragRange + minY);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if ((gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) || gesture.vx > 0.55) onPress();
      },
    })
  ).current;

  return (
    <Animated.View
      {...openPanResponder.panHandlers}
      style={[
        styles.moreLauncherSlot,
        { transform: [{ translateY: launcherY }] },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={onPress}
        style={[
          styles.moreLauncher,
          { borderColor: accent + '55' },
        ]}
      accessibilityLabel="Open more tools"
      accessibilityRole="button"
    >
      <View style={[styles.moreLauncherRail, { backgroundColor: accent }]} />
      <View style={styles.moreLauncherMarks}>
        <View style={[styles.moreLauncherMark, { backgroundColor: accent }]} />
        <View style={[styles.moreLauncherMark, { backgroundColor: accent, opacity: 0.68 }]} />
        <View style={[styles.moreLauncherMark, { backgroundColor: accent, opacity: 0.42 }]} />
      </View>
      <Text style={styles.moreLauncherText}>More</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TabButton({
  label, glyph, Icon, active, accent, onPress,
}: {
  label: string;
  glyph?: string;
  Icon?: React.ComponentType<IconProps>;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const color = active ? accent : '#ffffff66';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.tabBtn}>
      {Icon ? (
        <View style={styles.tabIconWrap}>
          <Icon size={22} weight="duotone" color={color} />
        </View>
      ) : (
        <Text style={[styles.tabGlyph, { color }]}>{glyph}</Text>
      )}
      <Text style={[styles.tabLabel, { color: active ? accent : '#ffffff77' }]}>{label}</Text>
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
  userPresets: UserPreset[];
  bgFileName: string | null;
  isBgPlaying: boolean;
  bgVolume: number;
  beatColor: string;
  onCommitLeft: (v: number) => void;
  onCommitRight: (v: number) => void;
  onSlideLeft: (v: number) => void;
  onSlideRight: (v: number) => void;
  onApplyBuiltIn: (p: BuiltInPreset) => void;
  onApplyUser: (p: UserPreset) => void;
  onApplyTuning: (t: TuningPreset) => void;
  onDeleteUser: (p: UserPreset) => void;
  onSave: () => void;
  onTogglePlay: () => void;
  onPickBg: () => void;
  onToggleBg: () => void;
  onChangeBgVolume: (v: number) => void;
  onClearBg: () => void;
};

function FrequenciesView(props: FreqViewProps) {
  const {
    leftHz, rightHz, beat, band, activeBand, activeTuning, activeChakra, activePresetId,
    sleepMinutes, onSetSleepTimer,
    isTonePlaying, isToneLoading, userPresets,
    bgFileName, isBgPlaying, bgVolume,
    beatColor,
  } = props;

  const [customSleepOpen, setCustomSleepOpen] = useState(false);
  const [customSleepInput, setCustomSleepInput] = useState('');
  const isCustomSleep = sleepMinutes > 0 && !(SLEEP_TIMER_OPTIONS as readonly number[]).includes(sleepMinutes);

  function commitCustomSleep() {
    const m = parseInt(customSleepInput, 10);
    if (Number.isFinite(m) && m > 0) {
      onSetSleepTimer(Math.min(m, 24 * 60));
    }
    setCustomSleepOpen(false);
    setCustomSleepInput('');
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.enso} />
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Binaural Frequency Generator</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>Manifest your Zen</Text>
          <View style={styles.dividerLine} />
        </View>
        <ManifestQuote />
      </View>

      <View style={[styles.beatCard, { borderColor: beatColor + '55' }]}>
        <View style={styles.beatHeaderRow}>
          <Text style={styles.beatLabel}>BEAT FREQUENCY</Text>
          <TouchableOpacity onPress={props.onSave} style={styles.saveBtn} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>＋ Save</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.beatHz}>
          {beat.toFixed(0)}<Text style={styles.beatHzUnit}> Hz</Text>
        </Text>
        <View style={[styles.bandPill, { backgroundColor: beatColor + '22', borderColor: beatColor }]}>
          <View style={[styles.bandDot, { backgroundColor: beatColor }]} />
          <Text style={[styles.bandText, { color: beatColor }]}>
            {activeChakra
              ? `${activeChakra.name} · ${activeChakra.bija} · ${activeChakra.element}`
              : activeTuning
                ? `${activeTuning.name} · ${activeTuning.intent}`
                : band.name}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={props.onTogglePlay}
          style={[styles.primarySessionBtn, { backgroundColor: isTonePlaying ? '#fff' : beatColor }]}
          accessibilityLabel={isTonePlaying ? 'Stop binaural session' : 'Start binaural session'}
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
      </View>

      <FrequencyControl
        ear="L" label="LEFT"
        hz={leftHz}
        color="#5BD0FF"
        onCommit={props.onCommitLeft}
        onSlide={props.onSlideLeft}
      />
      <FrequencyControl
        ear="R" label="RIGHT"
        hz={rightHz}
        color="#FF5B9C"
        onCommit={props.onCommitRight}
        onSlide={props.onSlideRight}
      />

      <Text style={styles.sectionLabel}>PRESETS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
        {PRESETS.map(p => {
          const active = activePresetId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => props.onApplyBuiltIn(p)}
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
          const userColor = '#9affc8';
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.85}
              onPress={() => props.onApplyUser(p)}
              onLongPress={() => props.onDeleteUser(p)}
              style={[styles.presetChip, {
                backgroundColor: active ? userColor : 'rgba(255,255,255,0.05)',
                borderColor: active ? userColor : 'rgba(154,255,200,0.4)',
                borderStyle: 'dashed',
              }]}
            >
              <Text style={[styles.presetName, { color: active ? '#0B0B1F' : '#fff' }]}>{p.name}</Text>
              <Text style={[styles.presetRange, { color: active ? '#0B0B1F99' : '#ffffff88' }]}>L {p.leftHz} · R {p.rightHz}</Text>
              <Text style={[styles.presetBlurb, { color: active ? '#0B0B1F99' : '#ffffff66' }]}>Hold to delete</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionLabel}>TUNING FREQUENCIES</Text>
      <Text style={styles.sectionSub}>Solfeggio · ancient resonant tones, played equally in both ears</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
        {TUNINGS.map(t => {
          const active = activePresetId === t.id;
          const tuneColor = '#d9b35c';
          return (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.85}
              onPress={() => props.onApplyTuning(t)}
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
      </ScrollView>

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

      <View style={styles.bgCard}>
        <Text style={styles.sectionLabel}>BACKGROUND MUSIC</Text>
        {bgFileName ? (
          <>
            <View style={styles.bgFileRow}>
              <Text style={styles.bgFileName} numberOfLines={1}>{bgFileName}</Text>
              <TouchableOpacity onPress={props.onClearBg} style={styles.bgClearBtn}>
                <Text style={styles.bgClearText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bgControlsRow}>
              <TouchableOpacity onPress={props.onToggleBg} style={styles.bgPlayBtn} activeOpacity={0.8}>
                <Text style={styles.bgPlayText}>{isBgPlaying ? '❚❚' : '▶'}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.bgVolLabel}>VOLUME · {Math.round(bgVolume * 100)}%</Text>
                <Slider
                  style={{ width: '100%', height: 32 }}
                  minimumValue={0}
                  maximumValue={1}
                  value={bgVolume}
                  minimumTrackTintColor="#9affc8"
                  maximumTrackTintColor="rgba(255,255,255,0.12)"
                  thumbTintColor="#9affc8"
                  onValueChange={props.onChangeBgVolume}
                />
              </View>
            </View>
          </>
        ) : (
          <TouchableOpacity onPress={props.onPickBg} style={styles.bgPickBtn} activeOpacity={0.8}>
            <Text style={styles.bgPickText}>＋ Pick an audio file</Text>
            <Text style={styles.bgPickHint}>Plays alongside the binaural tones</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.footnote}>
        Set your intention. Wear stereo headphones. Each ear receives a different tone, and your mind tunes itself to the difference.
      </Text>
    </ScrollView>
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
        >
          <Text style={[styles.adjBtnText, { color }]}>−1</Text>
        </TouchableOpacity>
        <Text style={styles.rangeHint}>tap number to type</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onCommit(hz + 1)}
          style={[styles.adjBtn, { borderColor: color + '99' }]}
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
  scroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 24,
  },

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
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic', textTransform: 'lowercase',
  },
  quote: {
    color: '#ffffff88', fontSize: 14, fontStyle: 'italic',
    marginTop: 18, letterSpacing: 0.5, textAlign: 'center',
    paddingHorizontal: 24, fontWeight: '300',
  },
  beatCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1, borderRadius: 24,
    padding: 18, paddingTop: 14, alignItems: 'center', marginBottom: 18,
  },
  beatHeaderRow: {
    flexDirection: 'row', width: '100%',
    justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  beatLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  beatHz: {
    color: '#fff', fontSize: 56, fontWeight: '300',
    marginVertical: 4, letterSpacing: -1,
  },
  beatHzUnit: { fontSize: 22, color: '#ffffff80', fontWeight: '300' },
  bandPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, marginTop: 6,
  },
  bandDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  bandText: { fontWeight: '600', fontSize: 12, letterSpacing: 1.5 },
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
  presetRow: { paddingRight: 12, paddingVertical: 4 },
  presetChip: {
    minWidth: 130, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 16, marginRight: 10, borderWidth: 1,
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

  sleepRow: { marginTop: 14, marginHorizontal: 8 },
  sleepLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  sleepPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sleepPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sleepPillText: { color: '#ffffff99', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  soundscapeScreen: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 120,
  },
  soundscapeNowCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(91,208,255,0.35)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  soundscapeNowTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0.3,
  },
  soundscapeNowMeta: { color: '#ffffff88', fontSize: 12, marginTop: 4 },
  soundscapeVolumeRow: { marginTop: 16 },
  soundscapeGrid: { gap: 10 },
  soundscapeTile: {
    width: '100%',
    minHeight: 126,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  soundscapeTileGlyph: {
    height: 32,
    justifyContent: 'center',
  },
  soundscapeTileName: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 10 },
  soundscapeTileBlurb: { color: '#ffffff77', fontSize: 12, lineHeight: 17, marginTop: 6 },
  soundscapeTileAction: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginTop: 14 },

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

  bgCard: {
    marginTop: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
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
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  bgClearText: { color: '#fff', fontSize: 14 },
  bgControlsRow: { flexDirection: 'row', alignItems: 'center' },
  bgPlayBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#9affc8',
  },
  bgPlayText: { color: '#0B0B1F', fontSize: 18, fontWeight: '700' },
  bgVolLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 1.5, fontWeight: '600', marginBottom: 2 },

  footnote: {
    color: '#ffffff66', fontSize: 12, textAlign: 'center',
    marginTop: 18, paddingHorizontal: 20, lineHeight: 18,
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
  modalBtnPrimary: { backgroundColor: '#9affc8' },
  modalBtnPrimaryText: { color: '#0B0B1F', fontWeight: '700' },

  menuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    elevation: 60,
  },
  menuBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.74)',
  },
  menuPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    backgroundColor: '#05050C',
    borderRightWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 12, height: 0 },
    elevation: 28,
  },
  menuAccentRail: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 2,
    opacity: 0.82,
  },
  menuClose: {
    position: 'absolute',
    right: 14,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuCloseText: {
    color: '#ffffffcc',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
  },
  menuContent: {
    flex: 1,
    backgroundColor: 'rgba(5,5,12,0.78)',
  },
  moreLauncherSlot: {
    position: 'absolute',
    top: 0,
    left: 14,
    zIndex: 35,
    elevation: 10,
  },
  moreLauncher: {
    minWidth: 82,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    backgroundColor: 'rgba(5,5,12,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  moreLauncherRail: {
    position: 'absolute',
    left: 6,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 2,
    opacity: 0.82,
  },
  moreLauncherMarks: {
    gap: 4,
    marginLeft: 4,
    marginRight: 8,
    alignItems: 'center',
  },
  moreLauncherMark: {
    width: 12,
    height: 2,
    borderRadius: 2,
  },
  moreLauncherText: {
    color: '#ffffff88',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(8,8,22,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  miniPlayBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayText: { color: '#0B0B1F', fontSize: 16, fontWeight: '900' },
  miniBody: { flex: 1, marginHorizontal: 12 },
  miniTitle: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  miniMeta: { color: '#ffffff88', fontSize: 11, marginTop: 2 },
  miniStopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  miniStopText: { color: '#ffffffcc', fontSize: 20, lineHeight: 22, fontWeight: '500' },
  miniSoundscapeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },

  tabBarSafe: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  lunarBar: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  lunarGlyph: {
    color: '#fff',
    fontSize: 14,
    marginRight: 6,
  },
  lunarText: {
    color: '#ffffffdd',
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6,
  },
  tabGlyph: {
    fontSize: 22,
    marginBottom: 2,
    minHeight: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabIconWrap: { minHeight: 24, marginBottom: 2, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '600' },
});
