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
  type AudioPlayer,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

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

import BreathworkView from './BreathworkView';
import ChakrasView from './ChakrasView';
import HoroscopesView from './HoroscopesView';
import MoreView, { type NotifPref } from './MoreView';
import OnboardingView from './OnboardingView';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MIN_HZ = 50;
const MAX_HZ = 1000;
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
const SLIDE_THROTTLE_MS = 220;

type BandKey =
  | 'none' | 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'tuning'
  | 'root' | 'sacral' | 'solar' | 'heart' | 'throat' | 'thirdEye' | 'crown';

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

export type Chakra = {
  id: string;
  band: BandKey;
  number: number;
  name: string;
  sanskrit: string;
  bija: string;
  symbol: string;            // Devanagari bija glyph
  hz: number;
  element: string;
  location: string;
  color: string;
  governs: string;
  blocked: string;
};

export const CHAKRAS: Chakra[] = [
  { id: 'cr-root',     band: 'root',     number: 1, name: 'Root',         sanskrit: 'Muladhara',   bija: 'LAM', symbol: 'लं', hz: 396, element: 'Earth',         location: 'Base of spine',     color: '#FF3838', governs: 'Safety · Stability · Survival',         blocked: 'Fear · Anxiety · Ungroundedness' },
  { id: 'cr-sacral',   band: 'sacral',   number: 2, name: 'Sacral',       sanskrit: 'Svadhisthana',bija: 'VAM', symbol: 'वं', hz: 417, element: 'Water',         location: 'Lower abdomen',     color: '#FF8A38', governs: 'Creativity · Sensuality · Pleasure',     blocked: 'Emotional repression · Stagnant flow' },
  { id: 'cr-solar',    band: 'solar',    number: 3, name: 'Solar Plexus', sanskrit: 'Manipura',    bija: 'RAM', symbol: 'रं', hz: 528, element: 'Fire',          location: 'Upper abdomen',     color: '#FFD000', governs: 'Will · Confidence · Personal power',     blocked: 'Low self-esteem · Control patterns' },
  { id: 'cr-heart',    band: 'heart',    number: 4, name: 'Heart',        sanskrit: 'Anahata',     bija: 'YAM', symbol: 'यं', hz: 639, element: 'Air',           location: 'Center of chest',   color: '#3FE07F', governs: 'Love · Compassion · Connection',         blocked: 'Grief · Resentment · Isolation' },
  { id: 'cr-throat',   band: 'throat',   number: 5, name: 'Throat',       sanskrit: 'Vishuddha',   bija: 'HAM', symbol: 'हं', hz: 741, element: 'Ether',         location: 'Throat',            color: '#3FB6FF', governs: 'Truth · Expression · Voice',             blocked: 'Suppressed truth · Fear of judgment' },
  { id: 'cr-thirdEye', band: 'thirdEye', number: 6, name: 'Third Eye',    sanskrit: 'Ajna',        bija: 'OM',  symbol: 'ॐ',  hz: 852, element: 'Light',         location: 'Between brows',     color: '#5B6CFF', governs: 'Intuition · Insight · Inner vision',     blocked: 'Disconnect from inner knowing' },
  { id: 'cr-crown',    band: 'crown',    number: 7, name: 'Crown',        sanskrit: 'Sahasrara',   bija: 'AUM', symbol: 'ॐ',  hz: 963, element: 'Consciousness', location: 'Top of head',       color: '#A45BFF', governs: 'Unity · Spirituality · Divine connection', blocked: 'Spiritual disconnect · Materialism' },
];

export type Dosha = {
  id: 'vata' | 'pitta' | 'kapha';
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
    yearAhead: 'This year your fire is meant to lead — but lead with patience. Begin only what you can finish, and finish what truly matters.',
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
    yearAhead: 'Trust the current. Surrender is not weakness — it is mastery of flow. Soften the grip.',
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
    name: 'Vata',
    element: 'Air + Ether',
    qualities: 'Light · Cold · Mobile · Dry',
    balanceHz: 432,
    balanceTechnique: 'Nadi Shodhana',
    color: '#9aa0e0',
    description: 'Governs movement, breath, nervous system. Imbalanced: anxiety, insomnia, restlessness. Soothe with grounding warmth and slow, steady breath.',
  },
  {
    id: 'pitta',
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
  // Chakra palettes — saturated, rainbow progression
  root:     { base: ['#1a0a0a', '#3a1a14', '#1a0a0a'], waves: ['#2a1018', '#5a2030', '#FF3838'], accent: '#FF3838' },
  sacral:   { base: ['#1a1208', '#3a2a14', '#1a1208'], waves: ['#2a1c10', '#5a3a20', '#FF8A38'], accent: '#FF8A38' },
  solar:    { base: ['#1a1808', '#3a3214', '#1a1808'], waves: ['#2a2410', '#5a4a20', '#FFD000'], accent: '#FFD000' },
  heart:    { base: ['#0a1a14', '#143a2a', '#0a1a14'], waves: ['#102a20', '#205a3a', '#3FE07F'], accent: '#3FE07F' },
  throat:   { base: ['#0a1418', '#143040', '#0a1418'], waves: ['#10202a', '#205070', '#3FB6FF'], accent: '#3FB6FF' },
  thirdEye: { base: ['#0a0a1a', '#141a3a', '#0a0a1a'], waves: ['#101020', '#202a5a', '#5B6CFF'], accent: '#5B6CFF' },
  crown:    { base: ['#10081a', '#1a103a', '#10081a'], waves: ['#181020', '#3a205a', '#A45BFF'], accent: '#A45BFF' },
};

function bandFor(beat: number): { name: string; color: string; key: BandKey } {
  if (beat < 4)  return { name: 'Delta', color: '#5B6CFF', key: 'delta' };
  if (beat < 8)  return { name: 'Theta', color: '#8A5BFF', key: 'theta' };
  if (beat < 13) return { name: 'Alpha', color: '#5BD0FF', key: 'alpha' };
  if (beat < 30) return { name: 'Beta',  color: '#FFB05B', key: 'beta' };
  return           { name: 'Gamma', color: '#FF5B9C', key: 'gamma' };
}

function clampHz(n: number) {
  return Math.max(MIN_HZ, Math.min(MAX_HZ, Math.round(n)));
}

// Configure foreground display only outside Expo Go, where this raises a
// removed-API warning under SDK 53+.
if (!IS_EXPO_GO) {
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
      const aff = NOTIF_AFFIRMATIONS[Math.floor(Math.random() * NOTIF_AFFIRMATIONS.length)];
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

// ---------------------------------------------------------------------------
//   Lunar phase — Conway's algorithm, ~99% accurate
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
  // @ts-ignore
  return globalThis.btoa(binary);
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
//   WaveBackground — ocean waves animated when playing
// ---------------------------------------------------------------------------

// Background: a rich base gradient plus two cross-fading gradient layers in
// opposing diagonals. As the layers crossfade, the perceived gradient direction
// shifts — no rotating shapes, no blobs, just a morphing color field.
function WaveBackground({ band, playing }: { band: BandKey; playing: boolean }) {
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
        Animated.timing(xfade, { toValue: 1, duration: 13000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(xfade, { toValue: 0, duration: 13000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 50000, easing: Easing.linear, useNativeDriver: true }),
    );
    const c = Animated.loop(
      Animated.sequence([
        Animated.timing(wash, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wash, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    drift.setValue(0);
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [playing, xfade, drift, wash]);

  const op1 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.20] });
  const op2 = xfade.interpolate({ inputRange: [0, 1], outputRange: [0.20, 0.95] });
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_H * 0.18] });
  const washOpacity = wash.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.base[0], overflow: 'hidden' }]} pointerEvents="none">
      {/* Static rich base — always shows even when paused */}
      <LinearGradient
        colors={[palette.base[0], palette.waves[0], palette.base[1], palette.base[2]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer A — diagonal TL → BR, secondary tones with a hot accent stop */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: op1 }]}>
        <LinearGradient
          colors={[palette.waves[1], palette.base[1], palette.accent + 'cc', palette.waves[0]]}
          locations={[0, 0.4, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Layer B — counter-diagonal TR → BL, brighter tones */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: op2 }]}>
        <LinearGradient
          colors={[palette.accent + 'cc', palette.waves[2], palette.base[1], palette.waves[0]]}
          locations={[0, 0.3, 0.65, 1]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Slow vertical accent stripe drifting upward — adds visible motion */}
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

// ===========================================================================
//   App
// ===========================================================================

type Tab = 'frequencies' | 'breath' | 'chakras' | 'horoscopes' | 'more';

const STORAGE_KEY_NOTIF = '@simply_ambient_notif_pref_v1';
const SLEEP_TIMER_OPTIONS = [0, 5, 10, 15, 30, 60] as const; // minutes

// Static pool used when scheduling local push notifications (we can't fetch
// at notification trigger time; the body is set when scheduled).
const NOTIF_AFFIRMATIONS = [
  'You are exactly where you need to be.',
  'Every breath is a fresh beginning.',
  'What you seek is seeking you.',
  'Your presence is enough.',
  'Energy flows where attention goes.',
  'You attract what you vibrate.',
  'Be still, and know.',
  'The mind quiets when the body softens.',
  'You are allowed to take your time.',
  'Trust the next step, even if you cannot see it.',
  'As within, so without.',
  'Today is a small piece of a larger unfolding.',
  'Soften. Listen. Receive.',
  'Your worth is not contingent on output.',
  'Breathe in. Breathe out. Begin again.',
];

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('frequencies');

  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_ONBOARDED).then(v => {
      if (!v) setShowOnboarding(true);
      setOnboardingChecked(true);
    }).catch(() => setOnboardingChecked(true));
  }, []);

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
      const res = await fetch('https://www.affirmations.dev');
      if (!res.ok) throw new Error('bad response');
      const json = await res.json();
      setAffirmation(json?.affirmation ?? null);
    } catch {
      // Fallback to static pool
      setAffirmation(NOTIF_AFFIRMATIONS[Math.floor(Math.random() * NOTIF_AFFIRMATIONS.length)]);
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
        if (stateRef.current.isTonePlaying) stopTones();
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
  const beatColor =
    activeBand === 'none' ? '#9aa0b4' :
    activeChakra ? activeChakra.color :
    activeBand === 'tuning' ? PALETTES.tuning.accent :
    PALETTES[activeBand]?.accent ?? band.color;

  // Mount: audio mode + load saved presets.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (raw) setUserPresets(JSON.parse(raw)); })
      .catch(() => {});
    return () => {
      try { tonePlayerRef.current?.release(); } catch {}
      try { tonePlayerRef.current?.remove?.(); } catch {}
      try { bgPlayerRef.current?.release(); } catch {}
      try { bgPlayerRef.current?.remove?.(); } catch {}
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
      // Yield so the UI can update before we synthesize.
      await new Promise(resolve => setTimeout(resolve, 0));
      const base64 = buildWav(clampHz(l), clampHz(r));
      if (myGen !== tonePlayGenRef.current) return;

      // Write WAV to a stable on-disk path; reload via file URI.
      await FileSystem.writeAsStringAsync(TONE_FILE_PATH, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (myGen !== tonePlayGenRef.current) return;

      // Cache-bust query so the audio system actually re-reads the file.
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

  function togglePlay() {
    if (isTonePlaying || isToneLoading) stopTones();
    else {
      loadAndPlay(leftHz, rightHz);
      recordActivity().catch(() => {});
    }
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
    // Carrier at the Solfeggio frequency, with a 6 Hz theta beat (3 below, 3 above).
    // This produces both the carrier resonance and an actual binaural beat.
    const l = clampHz(t.hz - 3);
    const r = clampHz(t.hz + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(t.id);
    setActiveBand('tuning');
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyChakra(c: Chakra) {
    const l = clampHz(c.hz - 3);
    const r = clampHz(c.hz + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(c.id);
    setActiveBand(c.band);
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  function applyDosha(d: Dosha) {
    const l = clampHz(d.balanceHz - 3);
    const r = clampHz(d.balanceHz + 3);
    setLeftHz(l);
    setRightHz(r);
    setActivePresetId(`dosha-${d.id}`);
    setActiveBand('tuning');
    if (stateRef.current.isTonePlaying) loadAndPlay(l, r);
  }

  // Computed display name for the band — prefers chakra/dosha/tuning names
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
            {tab === 'more' && (
              <MoreView
                notifPref={notifPref}
                onChangeNotifPref={changeNotifPref}
                affirmation={affirmation}
                affirmationLoading={affLoading}
                onRefreshAffirmation={refreshAffirmation}
                isExpoGo={IS_EXPO_GO}
              />
            )}
          </View>
        </KeyboardAvoidingView>

        <TabBar tab={tab} onChange={setTab} accent={beatColor} />
      </SafeAreaView>

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
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
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
}

// ===========================================================================
//   TabBar
// ===========================================================================

function TabBar({ tab, onChange, accent }: { tab: Tab; onChange: (t: Tab) => void; accent: string }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabBarSafe}>
      <View style={styles.tabBar}>
        <TabButton label="Frequencies" glyph="∿" active={tab === 'frequencies'} accent={accent} onPress={() => onChange('frequencies')} />
        <TabButton label="Breath"      glyph="○" active={tab === 'breath'}      accent={accent} onPress={() => onChange('breath')} />
        <TabButton label="Chakras"     glyph="✦" active={tab === 'chakras'}     accent={accent} onPress={() => onChange('chakras')} />
        <TabButton label="Horoscopes"  glyph="☽" active={tab === 'horoscopes'}  accent={accent} onPress={() => onChange('horoscopes')} />
        <TabButton label="More"        glyph="⋯" active={tab === 'more'}        accent={accent} onPress={() => onChange('more')} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label, glyph, active, accent, onPress,
}: { label: string; glyph: string; active: boolean; accent: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.tabBtn}>
      <Text style={[styles.tabGlyph, { color: active ? accent : '#ffffff66' }]}>{glyph}</Text>
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
    bgFileName, isBgPlaying, bgVolume, beatColor,
  } = props;

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
      <Text style={styles.sectionSub}>Solfeggio · ancient healing tones, played equally in both ears</Text>
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

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={props.onTogglePlay}
        style={[styles.playBtn, { backgroundColor: isTonePlaying ? '#fff' : beatColor }]}
      >
        {isToneLoading ? (
          <ActivityIndicator color="#0B0B1F" />
        ) : (
          <Text style={styles.playText}>{isTonePlaying ? 'STOP' : 'PLAY'}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.sleepRow}>
        <Text style={styles.sleepLabel}>SLEEP TIMER</Text>
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
        </View>
      </View>

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
        Set your intention. Wear stereo headphones — each ear receives a different tone, and your mind tunes itself to the difference.
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
  tabGlyph: { fontSize: 22, marginBottom: 2 },
  tabLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '600' },
});
