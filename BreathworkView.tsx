import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { buildCueWav } from './lib/binauralMath';
import { maybeRequestReview, recordSessionCompleted } from './lib/rateApp';
import {
  Square,
  MoonStars,
  Wind,
  Waves,
  Heartbeat,
  Butterfly,
  InfinityIcon,
  Snowflake,
  ArrowsDownUp,
  Lightning,
  Flame,
  Sun,
  Fire,
  HandFist,
  Sparkle,
  Drop,
  Tree,
  Mountains,
  type IconProps,
} from 'phosphor-react-native';

const STORAGE_HAPTIC = '@simply_ambient_mala_haptic_v1';
const STORAGE_MALA_COUNT = '@simply_ambient_mala_count_v1';
const STORAGE_BREATH_CUES = '@simply_ambient_breath_cues_v1';

// Audio cues per phase: a soft sine blip that rises into an inhale, holds
// level, and falls into an exhale (C5/E5/D5 territory, gentle enough to sit
// under a running binaural tone or soundscape).
const CUE_TONES: Record<'Inhale' | 'Hold' | 'Exhale', [number, number]> = {
  Inhale: [523, 659],
  Hold: [587, 587],
  Exhale: [659, 523],
};
type HapticLevel = 'off' | 'low' | 'high';

type TechniqueIcon = React.ComponentType<IconProps>;

// `target` optionally overrides the breath value a phase animates toward
// (0 = fully exhaled, 1 = fully inhaled). Defaults: Inhale 1, Exhale 0.
type Phase = { name: 'Inhale' | 'Hold' | 'Exhale'; seconds: number; target?: number };

type Technique = {
  id: string;
  name: string;
  category: 'calming' | 'activating';
  blurb: string;
  description: string;
  phases: Phase[];
  color: string;
  Icon: TechniqueIcon;
  // Visual character
  petalSides: 3 | 4 | 5 | 6 | 8;
  petalCount: 3 | 4 | 5 | 6 | 8;
  centerSides: 3 | 4 | 5 | 6 | 8;
  // Mudra (hand position) suggestion
  mudra: { name: string; instruction: string };
};

const TECHNIQUES: Technique[] = [
  {
    id: 'box', name: 'Box Breathing', category: 'calming',
    blurb: '4 · 4 · 4 · 4',
    description: 'Equal inhale, hold, exhale, hold. Used by Navy SEALs to steady the nervous system.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 4 },
      { name: 'Exhale', seconds: 4 },
      { name: 'Hold',   seconds: 4 },
    ],
    color: '#8FB8DE', Icon: Square, petalSides: 4, petalCount: 4, centerSides: 4,
    mudra: { name: 'Gyan Mudra', instruction: 'Touch thumb and index fingertip; rest hands palms-up on knees.' },
  },
  {
    id: '478', name: '4-7-8', category: 'calming',
    blurb: '4 in · 7 hold · 8 out',
    description: 'Dr. Andrew Weil’s relaxation breath. Drops you toward sleep.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 7 },
      { name: 'Exhale', seconds: 8 },
    ],
    color: '#A498E8', Icon: MoonStars, petalSides: 6, petalCount: 6, centerSides: 6,
    mudra: { name: 'Anjali Mudra', instruction: 'Press palms together at the heart center; relax the shoulders.' },
  },
  {
    id: 'diaphragmatic', name: 'Diaphragmatic', category: 'calming',
    blurb: '4 in · 6 out',
    description: 'Deep belly breathing. Engages the diaphragm; activates rest-and-digest.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#8B96E0', Icon: Wind, petalSides: 8, petalCount: 8, centerSides: 8,
    mudra: { name: 'Hakini Mudra', instruction: 'Touch all five fingertips of one hand to the opposite hand in front of the chest.' },
  },
  {
    id: 'pursed', name: 'Pursed-Lip', category: 'calming',
    blurb: '2 in · 4 out',
    description: 'Inhale through the nose, exhale slowly through pursed lips. Eases breathlessness.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#93CFBB', Icon: Waves, petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Vayu Mudra', instruction: 'Curl the index finger to the base of the thumb; thumb covers the index. Rest other fingers extended.' },
  },
  {
    id: 'holotropic', name: 'Holotropic', category: 'activating',
    blurb: '2 in · 2 out · circular',
    description: 'Deep continuous circular breathing. No pause between in and out. Originated by Stanislav Grof. Brief sessions only. Can induce altered states.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 2 },
    ],
    color: '#E07A66', Icon: Lightning, petalSides: 3, petalCount: 6, centerSides: 3,
    mudra: { name: 'Open palms', instruction: 'Lay hands palms-up on knees, fingers softly extended. Receiving and surrender.' },
  },
  {
    id: 'shamanic', name: 'Shamanic', category: 'activating',
    blurb: '2 in · 1 out',
    description: 'Rhythmic active breath, rooted in indigenous traditions. Energizes and opens awareness.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#C08063', Icon: Fire, petalSides: 3, petalCount: 8, centerSides: 6,
    mudra: { name: 'Power fists', instruction: 'Loose fists at the solar plexus, knuckles facing each other. Gathering inner fire.' },
  },
  {
    id: 'soma', name: 'SOMA', category: 'activating',
    blurb: '3 in · 1 out · 2 hold',
    description: 'SOMA Breath: pranayama-inspired power breath. Heat, focus, vitality.',
    phases: [
      { name: 'Inhale', seconds: 3 },
      { name: 'Exhale', seconds: 1 },
      { name: 'Hold',   seconds: 2 },
    ],
    color: '#E3B368', Icon: Sun, petalSides: 6, petalCount: 6, centerSides: 3,
    mudra: { name: 'Apana Mudra', instruction: 'Tip of thumb touches tips of middle and ring fingers; index and pinky extended.' },
  },
  {
    id: 'coherent', name: 'Coherent (5·5)', category: 'calming',
    blurb: '5 in · 5 out',
    description: 'Resonant breathing at ~6 breaths/min. Optimizes heart-rate variability and vagal tone.',
    phases: [
      { name: 'Inhale', seconds: 5 },
      { name: 'Exhale', seconds: 5 },
    ],
    color: '#7FC6C9', Icon: Heartbeat, petalSides: 6, petalCount: 6, centerSides: 6,
    mudra: { name: 'Apana Vayu Mudra', instruction: 'Index curls to base of thumb; tips of middle and ring touch thumb; pinky extended. Heart-opening.' },
  },
  {
    id: 'bhramari', name: 'Bhramari (Bee)', category: 'calming',
    blurb: '4 in · 8 hum-out',
    description: 'Inhale slowly, then hum like a bee on the long exhale. Said to stimulate the vagus nerve. Often used to settle a racing mind before sleep.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 8 },
    ],
    color: '#D3C08A', Icon: Butterfly, petalSides: 8, petalCount: 8, centerSides: 8,
    mudra: { name: 'Shanmukhi Mudra', instruction: 'Use thumbs to gently close ears; index over closed eyes; middle fingers beside nostrils; ring + pinky around lips.' },
  },
  {
    id: 'nadi', name: 'Nadi Shodhana', category: 'calming',
    blurb: '4 in · 2 hold · 4 out',
    description: 'Alternate-nostril breathing. Inhale through one nostril, hold, exhale through the other, then reverse. Balances the nervous system and the brain hemispheres.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 2 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#B3A6DE', Icon: ArrowsDownUp, petalSides: 5, petalCount: 6, centerSides: 5,
    mudra: { name: 'Vishnu Mudra', instruction: 'Right hand: fold index and middle fingers into palm. Use thumb to close right nostril, ring + pinky to close left.' },
  },
  {
    id: 'sitali', name: 'Sitali (Cooling)', category: 'calming',
    blurb: '4 in · 6 out',
    description: 'Curl your tongue (or purse your lips). Inhale through the tongue/mouth, exhale through the nose. Cools the body, soothes pitta heat.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#9FD3E3', Icon: Snowflake, petalSides: 4, petalCount: 8, centerSides: 4,
    mudra: { name: 'Bhairava Mudra', instruction: 'Right hand resting in left palm, both palms facing up in lap.' },
  },
  {
    id: 'sigh', name: 'Physiological Sigh', category: 'calming',
    blurb: '2 short in · long out',
    description: 'Two short inhales through the nose, then one long exhale through the mouth. The fastest known way to down-regulate stress in the moment.',
    phases: [
      { name: 'Inhale', seconds: 1, target: 0.6 },
      { name: 'Inhale', seconds: 1, target: 1.0 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#A9C6E8', Icon: Sparkle, petalSides: 3, petalCount: 6, centerSides: 6,
    mudra: { name: 'Pran Mudra', instruction: 'Tips of thumb, ring, and pinky touch; index and middle extended. Activates life force.' },
  },
  {
    id: 'bhastrika', name: 'Bhastrika (Bellows)', category: 'activating',
    blurb: '1 in · 1 out · forceful',
    description: 'Forceful, equal inhale and exhale through the nose using the diaphragm like a bellows. Builds heat, oxygenates, energizes. Keep sessions short.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#DE9455', Icon: Flame, petalSides: 3, petalCount: 8, centerSides: 3,
    mudra: { name: 'Knee grip', instruction: 'Sit upright, grasp the knees firmly with thumbs out. Anchors the diaphragmatic effort.' },
  },
  {
    id: 'lions', name: "Lion's Breath", category: 'activating',
    blurb: '4 in · 4 roar-out',
    description: 'Inhale deeply through the nose. Exhale forcefully through the mouth with tongue out, eyes wide, making a "ha" sound. Releases facial and throat tension.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#D68097', Icon: HandFist, petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Lion claws', instruction: 'Stretch fingers wide on the knees like claws, palms down. Opens the throat and chest.' },
  },
  {
    id: 'kapalabhati', name: 'Kapalabhati', category: 'activating',
    blurb: '1 in · 1 out · sharp pulse',
    description: '"Skull-shining breath." Passive inhale, sharp forceful exhale through the nose, repeated rapidly. Faster cadence than holotropic. Cleanses the lungs and energizes the mind.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#E19E7E', Icon: InfinityIcon, petalSides: 6, petalCount: 8, centerSides: 3,
    mudra: { name: 'Chin Mudra', instruction: 'Touch tip of thumb and index together; rest hands palms-up on knees, other fingers extended.' },
  },
  {
    id: 'ujjayi', name: 'Ujjayi (Ocean)', category: 'calming',
    blurb: '4 in · 6 out · whispered',
    description: 'Slight constriction at the back of the throat creates a soft ocean-wave sound on inhale and exhale. Slows the breath, focuses the mind, warms the body. The breath of yoga and pranayama.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#7FB8B0', Icon: Drop, petalSides: 6, petalCount: 8, centerSides: 6,
    mudra: { name: 'Jnana Mudra', instruction: 'Tip of thumb meets tip of index; remaining fingers extended. Hands rest on knees, palms up. Receiving wisdom.' },
  },
  {
    id: 'dirga', name: 'Dirga (Three-Part)', category: 'calming',
    blurb: '6 in (belly · ribs · chest) · 6 out',
    description: 'Layered three-part inhale. First fill the belly, then the ribs, then the upper chest. Exhale in reverse. Maximizes lung capacity and quiets the nervous system.',
    phases: [
      { name: 'Inhale', seconds: 6 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#A3C29A', Icon: Tree, petalSides: 3, petalCount: 8, centerSides: 6,
    mudra: { name: 'Padma Mudra', instruction: 'Heels of palms and pinkies touch; thumbs touch; other fingers spread like lotus petals at the heart.' },
  },
  {
    id: 'wimhof', name: 'Wim Hof Style', category: 'activating',
    blurb: '2 in · 1 out · 30 rounds',
    description: 'Deep active inhale, passive exhale, repeated ~30 times before a long retention. Floods the body with oxygen, raises adrenaline, builds cold tolerance and immune resilience.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#B9C4D9', Icon: Mountains, petalSides: 6, petalCount: 8, centerSides: 6,
    mudra: { name: 'Open palms upward', instruction: 'Hands rest on knees or thighs, palms facing up. Fully open to receive breath.' },
  },
];

type Props = {
  toneIsPlaying: boolean;
  beatHz: number;
  bandName: string;
  bandColor: string;
};

export default function BreathworkView({ toneIsPlaying, beatHz, bandName, bandColor }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const technique = TECHNIQUES.find(t => t.id === activeId) ?? null;

  return (
    <View style={[{ flex: 1 }, styles.tabScrim]}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Breath Work Visualizer</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>Breath is the bridge</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      {toneIsPlaying ? (
        <View style={styles.toneStrip}>
          <View style={[styles.toneDot, { backgroundColor: bandColor }]} />
          <Text style={styles.toneText}>
            <Text style={{ color: bandColor, fontWeight: '700' }}>{bandName}</Text>
            <Text style={{ color: '#ffffff99' }}> · {beatHz} Hz binaural still playing</Text>
          </Text>
        </View>
      ) : null}

      {technique ? (
        <BreathSession technique={technique} onBack={() => setActiveId(null)} />
      ) : (
        <TechniqueList onPick={t => setActiveId(t.id)} />
      )}
    </View>
  );
}

// Celebratory buzz when a full mala (108) is completed. Android gets its own
// vibration rhythm (buzz · buzz · long buzz); iOS/others get a timed haptic
// sequence ending on a success "ding" (pattern timings are unreliable on iOS).
// Returns the scheduled timeout ids so the caller can cancel them on unmount.
function malaCompleteBuzz(level: HapticLevel): ReturnType<typeof setTimeout>[] {
  if (level === 'off') return [];
  const high = level === 'high';
  if (Platform.OS === 'android') {
    // [wait, buzz, wait, buzz, wait, long buzz]
    Vibration.vibrate(high ? [0, 240, 120, 240, 120, 500] : [0, 130, 100, 130, 100, 320]);
    return [];
  }
  const big = high ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium;
  const small = high ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(small).catch(() => {});
  return [
    setTimeout(() => Haptics.impactAsync(small).catch(() => {}), 150),
    setTimeout(() => Haptics.impactAsync(big).catch(() => {}), 320),
    setTimeout(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
      540,
    ),
  ];
}

function MalaCounter() {
  const [count, setCount] = useState(0);
  const [haptic, setHaptic] = useState<HapticLevel>('low');
  const buzzTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const target = 108;
  const ratio = Math.min(1, count / target);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_HAPTIC).then(v => {
      if (v === 'off' || v === 'low' || v === 'high') setHaptic(v);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_MALA_COUNT).then(v => {
      const n = v == null ? NaN : parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0 && n <= target) setCount(n);
    }).catch(() => {});
  }, []);

  // Cancel any in-flight celebration buzz if the counter unmounts mid-sequence.
  useEffect(() => {
    return () => {
      buzzTimeouts.current.forEach(clearTimeout);
      Vibration.cancel();
    };
  }, []);

  function persistCount(n: number) {
    AsyncStorage.setItem(STORAGE_MALA_COUNT, String(n)).catch(() => {});
  }

  function setHapticPref(p: HapticLevel) {
    setHaptic(p);
    AsyncStorage.setItem(STORAGE_HAPTIC, p).catch(() => {});
    if (p !== 'off') {
      // Preview tap so the user can feel the chosen level
      Haptics.impactAsync(
        p === 'high' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
    }
  }

  function tap() {
    if (haptic !== 'off') {
      Haptics.impactAsync(
        haptic === 'high' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
    }
    setCount(c => {
      const next = Math.min(target, c + 1);
      if (next === target && c < target) {
        buzzTimeouts.current = malaCompleteBuzz(haptic);
        // A full mala counts toward the rate-prompt gate; no dialog here so
        // the celebration buzz stays undisturbed.
        recordSessionCompleted().catch(() => {});
      }
      persistCount(next);
      return next;
    });
  }

  return (
    <View style={styles.malaCard}>
      <View style={styles.malaTopRow}>
        <Text style={styles.cardName}>Mala Counter</Text>
        <Text style={styles.malaCountText}>{count} / {target}</Text>
      </View>
      <View style={styles.malaBar}>
        <View style={[styles.malaBarFill, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.malaActions}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { setCount(0); persistCount(0); }}
          accessibilityRole="button"
          accessibilityLabel="Reset mala count to zero"
          style={styles.malaResetBtn}
        >
          <Text style={styles.malaResetText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={tap}
          accessibilityRole="button"
          accessibilityLabel={count >= target ? 'Mala complete' : `Count one bead, ${count} of ${target}`}
          style={styles.malaCountBtn}
        >
          <Text style={styles.malaCountBtnText}>{count >= target ? '✓ Complete' : 'TAP'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.malaHapticRow}>
        <Text style={styles.malaHapticLabel}>VIBRATION</Text>
        <View style={styles.malaHapticPills}>
          {(['off', 'low', 'high'] as HapticLevel[]).map(p => {
            const active = p === haptic;
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.85}
                onPress={() => setHapticPref(p)}
                accessibilityRole="button"
                accessibilityLabel={`Vibration ${p}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.malaHapticPill,
                  active && { borderColor: '#d9b35c', backgroundColor: '#d9b35c22' },
                ]}
              >
                <Text style={[styles.malaHapticText, active && { color: '#d9b35c' }]}>
                  {p === 'off' ? 'Off' : p === 'low' ? 'Low' : 'High'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <Text style={styles.malaHint}>Tap on each breath, mantra, or bead.</Text>
    </View>
  );
}

function TechniqueList({ onPick }: { onPick: (t: Technique) => void }) {
  const insets = useSafeAreaInsets();
  const calming = TECHNIQUES.filter(t => t.category === 'calming');
  const activating = TECHNIQUES.filter(t => t.category === 'activating');

  return (
    <ScrollView
      // Clear the ~80px tab bar rendered by App.tsx plus the safe-area inset.
      contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <MalaCounter />

      <Text style={styles.sectionLabel}>CALMING</Text>
      <Text style={styles.sectionSub}>Slow the body. Soften the mind.</Text>
      {calming.map(t => (
        <TechniqueCard key={t.id} technique={t} onPress={() => onPick(t)} />
      ))}

      <Text style={styles.sectionLabel}>ACTIVATING</Text>
      <Text style={styles.sectionSub}>Build energy. Open awareness.</Text>
      {activating.map(t => (
        <TechniqueCard key={t.id} technique={t} onPress={() => onPick(t)} />
      ))}
    </ScrollView>
  );
}

function TechniqueCard({ technique, onPress }: { technique: Technique; onPress: () => void }) {
  const Icon = technique.Icon;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${technique.name}, ${technique.blurb}. Open breathing session.`}
      style={styles.card}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardIconSlot}>
          <Icon size={24} weight="duotone" color={technique.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{technique.name}</Text>
          <Text style={[styles.cardBlurb, { color: technique.color }]}>{technique.blurb}</Text>
        </View>
        <Text style={styles.cardChevron}>›</Text>
      </View>
      <Text style={styles.cardDescription}>{technique.description}</Text>
      <Text style={[styles.cardMudra, { color: technique.color }]}>mudra · {technique.mudra.name}</Text>
    </TouchableOpacity>
  );
}

// ===========================================================================
//   BreathSession
// ===========================================================================

type Visual = 'circle' | 'mandala';

// Session length choices. null = endless (the original behavior).
const CYCLE_CHOICES: Array<number | null> = [null, 5, 10, 20];

// Soft tick on each phase change so eyes-closed practice can follow along.
// Native only; web has no haptics.
function phaseTick() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

function BreathSession({ technique, onBack }: { technique: Technique; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(technique.phases[0].seconds);
  const [cycle, setCycle] = useState(0);
  const [visual, setVisual] = useState<Visual>('circle');
  const [targetCycles, setTargetCycles] = useState<number | null>(null);
  const [complete, setComplete] = useState(false);

  // Audio cues for eyes-closed practice: a soft blip on each phase change,
  // played through its own tiny players so it layers over any running
  // binaural tone, soundscape, or imported audio.
  const [cuesOn, setCuesOn] = useState(false);
  const cuesOnRef = useRef(false);
  useEffect(() => { cuesOnRef.current = cuesOn; }, [cuesOn]);
  const cuePlayersRef = useRef<Partial<Record<keyof typeof CUE_TONES, AudioPlayer>>>({});
  const webCueCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_BREATH_CUES).then(v => {
      if (v === '1') setCuesOn(true);
    }).catch(() => {});
    return () => {
      Object.values(cuePlayersRef.current).forEach(p => {
        try { p?.release(); } catch {}
        try { (p as any)?.remove?.(); } catch {}
      });
      cuePlayersRef.current = {};
    };
  }, []);

  function setCuesPref(on: boolean) {
    setCuesOn(on);
    AsyncStorage.setItem(STORAGE_BREATH_CUES, on ? '1' : '0').catch(() => {});
  }

  // Native players are synthesized lazily the first time cues turn on.
  useEffect(() => {
    if (!cuesOn || Platform.OS === 'web' || cuePlayersRef.current.Inhale) return;
    let cancelled = false;
    (async () => {
      try {
        for (const name of Object.keys(CUE_TONES) as Array<keyof typeof CUE_TONES>) {
          const [f0, f1] = CUE_TONES[name];
          const path = `${FileSystem.cacheDirectory}breath-cue-${name.toLowerCase()}.wav`;
          await FileSystem.writeAsStringAsync(path, buildCueWav(f0, f1), {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (cancelled) return;
          const player = createAudioPlayer({ uri: path });
          player.volume = 0.5;
          cuePlayersRef.current[name] = player;
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [cuesOn]);

  function playCue(name: keyof typeof CUE_TONES) {
    if (!cuesOnRef.current) return;
    const [f0, f1] = CUE_TONES[name];
    if (Platform.OS === 'web') {
      try {
        if (!webCueCtxRef.current) {
          const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
          webCueCtxRef.current = new AC();
        }
        const ctx = webCueCtxRef.current!;
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.linearRampToValueAtTime(f1, t + 0.24);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.32);
      } catch {}
      return;
    }
    const player = cuePlayersRef.current[name];
    if (!player) return;
    try {
      player.seekTo(0);
      player.play();
    } catch {}
  }

  // Read by the phase loop through a ref so changing the length mid-session
  // takes effect at the next cycle boundary without restarting the loop.
  const targetCyclesRef = useRef<number | null>(null);
  useEffect(() => {
    targetCyclesRef.current = targetCycles;
  }, [targetCycles]);

  // 0 = fully exhaled (petals retracted) ↔ 1 = fully inhaled (petals expanded).
  const breath = useRef(new Animated.Value(0)).current;
  // Continuous rotation 0..1 looping.
  const orbit = useRef(new Animated.Value(0)).current;
  // Rotation of the central polygon (counter-rotates).
  const centerSpin = useRef(new Animated.Value(0)).current;
  // Crossfade between the two visualizers (0 = circle, 1 = mandala). Both stay
  // mounted so the native-driven breath animation never detaches mid-phase.
  const visualFade = useRef(new Animated.Value(0)).current;

  const totalCycleMs = useMemo(
    () => technique.phases.reduce((s, p) => s + p.seconds * 1000, 0),
    [technique],
  );
  const calming = technique.category === 'calming';
  const orbitDuration = calming ? Math.max(20000, totalCycleMs * 3) : Math.max(8000, totalCycleMs * 3);
  const centerDuration = calming ? 40000 : 16000;

  // Continuous orbit + center spin (only while playing).
  useEffect(() => {
    if (!playing) {
      orbit.stopAnimation();
      centerSpin.stopAnimation();
      return;
    }
    orbit.setValue(0);
    centerSpin.setValue(0);
    const o = Animated.loop(
      Animated.timing(orbit, { toValue: 1, duration: orbitDuration, easing: Easing.linear, useNativeDriver: true }),
    );
    const c = Animated.loop(
      Animated.timing(centerSpin, { toValue: 1, duration: centerDuration, easing: Easing.linear, useNativeDriver: true }),
    );
    o.start();
    c.start();
    return () => { o.stop(); c.stop(); };
  }, [playing, orbit, centerSpin, orbitDuration, centerDuration]);

  // Crossfade when the user switches visualizer. Both layers remain mounted, so
  // breath/orbit keep running and the swap is seamless instead of freezing.
  useEffect(() => {
    Animated.timing(visualFade, {
      toValue: visual === 'mandala' ? 1 : 0,
      duration: 360,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visual, visualFade]);

  // Phase loop: drives `breath` and the timer text.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let currentAnim: Animated.CompositeAnimation | null = null;
    let cyc = 0;
    let started = false;

    const finishSession = () => {
      setPlaying(false);
      setComplete(true);
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } catch {}
      }
      recordSessionCompleted().catch(() => {});
      // A finished breath session is the calmest good moment in the app, so
      // it is the one place the (heavily gated, once-ever) review dialog may
      // appear. Delayed so the "Complete" state lands first.
      setTimeout(() => { maybeRequestReview().catch(() => {}); }, 1500);
    };

    const runPhase = (idx: number) => {
      if (cancelled) return;
      const phase = technique.phases[idx];
      if (idx === 0) {
        cyc += 1;
        const target = targetCyclesRef.current;
        if (target != null && cyc > target) {
          finishSession();
          return;
        }
      }
      // Skip the haptic tick on the very first phase; it fires on changes
      // only. The audio cue sounds on every phase, including the first, so
      // eyes-closed users get a clear start signal.
      if (started) phaseTick();
      started = true;
      playCue(phase.name);
      setPhaseIdx(idx);
      setSecondsLeft(phase.seconds);
      if (idx === 0) {
        setCycle(cyc);
      }

      // During Hold the breath value freezes. No motion in/out.
      if (phase.name === 'Inhale') {
        currentAnim = Animated.timing(breath, {
          toValue: phase.target ?? 1,
          duration: phase.seconds * 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        });
        currentAnim.start();
      } else if (phase.name === 'Exhale') {
        currentAnim = Animated.timing(breath, {
          toValue: phase.target ?? 0,
          duration: phase.seconds * 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        });
        currentAnim.start();
      }

      let remaining = phase.seconds;
      intervalId = setInterval(() => {
        if (cancelled) return;
        remaining -= 1;
        // Clamp to 1: the final interval tick races the phase timeout, so
        // letting it show 0 makes short (1s) phases flash 0 or never tick.
        setSecondsLeft(Math.max(1, remaining));
      }, 1000);

      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
        if (cancelled) return;
        runPhase((idx + 1) % technique.phases.length);
      }, phase.seconds * 1000);
    };

    runPhase(0);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      if (currentAnim) currentAnim.stop();
    };
  }, [playing, technique, breath]);

  // "Complete" shows briefly, then the session settles back to Ready.
  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => setComplete(false), 3000);
    return () => clearTimeout(t);
  }, [complete]);

  // Reset when stopped or technique changes.
  useEffect(() => {
    if (!playing) {
      Animated.timing(breath, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
      setPhaseIdx(0);
      setSecondsLeft(technique.phases[0].seconds);
      setCycle(0);
    }
  }, [playing, technique, breath]);

  const phase = technique.phases[phaseIdx];
  const circleOpacity = visualFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const mandalaOpacity = visualFade;
  const phaseLabel = complete ? 'Complete' : playing ? phase.name : 'Ready';

  return (
    <ScrollView
      // Clear the ~80px tab bar rendered by App.tsx plus the safe-area inset,
      // so the mudra card at the bottom is never hidden behind the tab icons.
      contentContainerStyle={[styles.sessionWrap, { paddingBottom: insets.bottom + 90 }]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to technique list"
        style={styles.backBtn}
      >
        <Text style={styles.backText}>‹  Techniques</Text>
      </TouchableOpacity>

      <Text style={styles.sessionName}>{technique.name}</Text>
      <Text style={[styles.sessionBlurb, { color: technique.color }]}>{technique.blurb}</Text>

      <View style={styles.visualToggle}>
        <TouchableOpacity
          onPress={() => setVisual('circle')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Circle visual"
          accessibilityState={{ selected: visual === 'circle' }}
          style={[
            styles.toggleBtn,
            visual === 'circle' && {
              backgroundColor: technique.color + '22',
              borderColor: technique.color,
            },
          ]}
        >
          <Text style={[styles.toggleText, visual === 'circle' && { color: technique.color }]}>○ Circle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setVisual('mandala')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Mandala visual"
          accessibilityState={{ selected: visual === 'mandala' }}
          style={[
            styles.toggleBtn,
            visual === 'mandala' && {
              backgroundColor: technique.color + '22',
              borderColor: technique.color,
            },
          ]}
        >
          <Text style={[styles.toggleText, visual === 'mandala' && { color: technique.color }]}>✦ Mandala</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.lengthRow}>
        {CYCLE_CHOICES.map(c => {
          const active = c === targetCycles;
          const label = c == null ? 'Endless' : `${c} cycles`;
          return (
            <TouchableOpacity
              key={c ?? 'endless'}
              activeOpacity={0.85}
              onPress={() => { setTargetCycles(c); setComplete(false); }}
              accessibilityRole="button"
              accessibilityLabel={c == null ? 'Endless session' : `End after ${c} cycles`}
              accessibilityState={{ selected: active }}
              style={[
                styles.lengthPill,
                active && {
                  backgroundColor: technique.color + '22',
                  borderColor: technique.color,
                },
              ]}
            >
              <Text style={[styles.lengthText, active && { color: technique.color }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setCuesPref(!cuesOn)}
          accessibilityRole="button"
          accessibilityLabel={cuesOn ? 'Turn off audio cues' : 'Turn on audio cues, a soft tone on each phase change'}
          accessibilityState={{ selected: cuesOn }}
          style={[
            styles.lengthPill,
            cuesOn && {
              backgroundColor: technique.color + '22',
              borderColor: technique.color,
            },
          ]}
        >
          <Text style={[styles.lengthText, cuesOn && { color: technique.color }]}>♪ Cues</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.visualStack}>
        <Animated.View
          style={[styles.visualLayer, { opacity: circleOpacity }]}
          pointerEvents={visual === 'circle' ? 'auto' : 'none'}
        >
          <BreathCircle
            breath={breath}
            color={technique.color}
            phaseLabel={phaseLabel}
            phaseCount={playing ? secondsLeft : 0}
            cycle={playing ? cycle : 0}
            active={playing || complete}
          />
        </Animated.View>
        <Animated.View
          style={[styles.visualLayer, { opacity: mandalaOpacity }]}
          pointerEvents={visual === 'mandala' ? 'auto' : 'none'}
        >
          <BreathMandala
            breath={breath}
            orbit={orbit}
            centerSpin={centerSpin}
            color={technique.color}
            phaseLabel={phaseLabel}
            phaseCount={playing ? secondsLeft : 0}
            cycle={playing ? cycle : 0}
            active={playing || complete}
          />
        </Animated.View>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { setComplete(false); setPlaying(p => !p); }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Stop breathing session' : 'Start breathing session'}
        style={[styles.playBtn, { backgroundColor: playing ? '#fff' : technique.color }]}
      >
        <Text style={styles.playBtnText}>{playing ? 'STOP' : 'PLAY'}</Text>
      </TouchableOpacity>

      <Text style={styles.sessionDescription}>{technique.description}</Text>

      <View style={styles.mudraBlock}>
        <Text style={[styles.mudraLabel, { color: technique.color }]}>
          MUDRA · {technique.mudra.name.toUpperCase()}
        </Text>
        <Text style={styles.mudraText}>{technique.mudra.instruction}</Text>
      </View>
    </ScrollView>
  );
}

// ===========================================================================
//   BreathCircle. Minimal circle that scales with breath
// ===========================================================================

type CircleProps = {
  breath: Animated.Value;
  color: string;
  phaseLabel: string;
  phaseCount: number;
  cycle: number;
  active: boolean;
};

function BreathCircle({ breath, color, phaseLabel, phaseCount, cycle, active }: CircleProps) {
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.0] });
  return (
    <View style={styles.circleWrap}>
      <View style={[styles.outerHalo, { borderColor: color + '33' }]} />
      <Animated.View
        style={[
          styles.circle,
          {
            backgroundColor: color + '22',
            borderColor: color,
            transform: [{ scale }],
          },
        ]}
      />
      <View pointerEvents="none" style={styles.circleLabelWrap}>
        <Text style={[styles.phaseText, { color: active ? color : '#ffffff66' }]}>
          {phaseLabel}
        </Text>
        {active && phaseCount > 0 && <Text style={styles.phaseCount}>{phaseCount}</Text>}
        {active && cycle > 0 && <Text style={styles.cycleText}>cycle {cycle}</Text>}
      </View>
    </View>
  );
}

// ===========================================================================
//   BreathMandala. Animated lotus / cymatic mandala
// ===========================================================================

const MANDALA_SIZE = 280;

function LotusMandalaSvg({
  color,
  size,
  variant,
}: {
  color: string;
  size: number;
  variant: 'outer' | 'middle' | 'inner';
}) {
  const center = size / 2;
  const count = variant === 'outer' ? 24 : variant === 'middle' ? 16 : 8;
  const petalRx = variant === 'outer' ? 8 : variant === 'middle' ? 10 : 13;
  const petalRy = variant === 'outer' ? 42 : variant === 'middle' ? 34 : 28;
  const petalCy = variant === 'outer' ? 54 : variant === 'middle' ? 68 : 82;
  const ringR = variant === 'outer' ? 106 : variant === 'middle' ? 82 : 56;
  const strokeOpacity = variant === 'outer' ? 0.62 : variant === 'middle' ? 0.72 : 0.86;
  const fillOpacity = variant === 'outer' ? 0.035 : variant === 'middle' ? 0.055 : 0.075;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={center} cy={center} r={ringR} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={1} />
      <Circle cx={center} cy={center} r={ringR * 0.72} fill="none" stroke={color} strokeOpacity={0.12} strokeWidth={1} />
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i;
        return (
          <G key={`petal-${i}`} origin={`${center}, ${center}`} rotation={angle}>
            <Ellipse
              cx={center}
              cy={petalCy}
              rx={petalRx}
              ry={petalRy}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={color}
              strokeOpacity={strokeOpacity}
              strokeWidth={1.05}
            />
          </G>
        );
      })}
      {Array.from({ length: count }).map((_, i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const r = ringR + (variant === 'outer' ? 10 : 7);
        return (
          <Circle
            key={`bead-${i}`}
            cx={center + Math.cos(angle) * r}
            cy={center + Math.sin(angle) * r}
            r={variant === 'inner' ? 1.8 : 1.35}
            fill={color}
            fillOpacity={variant === 'outer' ? 0.5 : 0.7}
          />
        );
      })}
      {variant === 'middle' ? (
        Array.from({ length: 8 }).map((_, i) => {
          const angle = (360 / 8) * i;
          return (
            <G key={`ray-${i}`} origin={`${center}, ${center}`} rotation={angle}>
              <Line
                x1={center}
                y1={center - 22}
                x2={center}
                y2={center - 96}
                stroke={color}
                strokeOpacity={0.18}
                strokeWidth={1}
              />
            </G>
          );
        })
      ) : null}
    </Svg>
  );
}

type MandalaProps = {
  breath: Animated.Value;
  orbit: Animated.Value;
  centerSpin: Animated.Value;
  color: string;
  phaseLabel: string;
  phaseCount: number;
  cycle: number;
  active: boolean;
};

// Layered lotus rings rotate independently; all breathe together.
const MANDALA_LAYERS: Array<{
  variant: 'outer' | 'middle' | 'inner';
  sizeRatio: number;
  rotateSource: 'orbit' | 'orbitReverse' | 'center';
  opacity: number;
}> = [
  { variant: 'outer', sizeRatio: 1.0, rotateSource: 'orbit', opacity: 0.86 },
  { variant: 'middle', sizeRatio: 0.82, rotateSource: 'orbitReverse', opacity: 0.95 },
  { variant: 'inner', sizeRatio: 0.58, rotateSource: 'center', opacity: 1 },
];

function BreathMandala({
  breath, orbit, centerSpin, color,
  phaseLabel, phaseCount, cycle, active,
}: MandalaProps) {
  const orbitFwd = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const orbitRev = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const centerFwd = centerSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // All polygons grow together on inhale, contract on exhale.
  const stackScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.0] });

  return (
    <View style={styles.mandalaWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.absCenter,
          styles.mandalaGlow,
          {
            borderColor: color,
            shadowColor: color,
            transform: [{ scale: stackScale }],
          },
        ]}
      />

      {MANDALA_LAYERS.map((layer, i) => {
        const size = layer.sizeRatio * MANDALA_SIZE;
        const rotation =
          layer.rotateSource === 'orbit' ? orbitFwd :
          layer.rotateSource === 'orbitReverse' ? orbitRev :
          centerFwd;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.absCenter,
              {
                width: size,
                height: size,
                transform: [{ scale: stackScale }, { rotate: rotation }],
              },
              { opacity: layer.opacity },
            ]}
          >
            <LotusMandalaSvg
              variant={layer.variant}
              size={size}
              color={color}
            />
          </Animated.View>
        );
      })}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.absCenter,
          styles.mandalaCore,
          {
            borderColor: color,
            backgroundColor: color + '18',
            shadowColor: color,
            transform: [{ scale: stackScale }],
          },
        ]}
      />

      {/* Phase label overlay. Centered atop the stack */}
      <View pointerEvents="none" style={styles.absCenter}>
        <View style={styles.labelInner}>
          <Text style={[styles.phaseText, { color: active ? color : '#ffffff66' }]}>
            {phaseLabel}
          </Text>
          {active && phaseCount > 0 && (
            <Text style={styles.phaseCount}>{phaseCount}</Text>
          )}
          {active && cycle > 0 && (
            <Text style={styles.cycleText}>cycle {cycle}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ===========================================================================
//   Styles
// ===========================================================================

const styles = StyleSheet.create({
  // Dark scrim so the technique's vivid color stays readable regardless of
  // whatever global band/tuning palette is active behind the tab.
  tabScrim: { backgroundColor: 'rgba(0,0,0,0.32)' },

  headerWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
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
    letterSpacing: 4, textTransform: 'uppercase',
    marginTop: 2,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic',
  },

  toneStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    marginHorizontal: 20, marginTop: 2,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
  },
  toneDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  toneText: { fontSize: 12, letterSpacing: 0.5 },

  sectionLabel: {
    color: '#ffffff77', fontSize: 10, letterSpacing: 2, fontWeight: '700',
    marginTop: 24, marginBottom: 4, paddingHorizontal: 4,
  },
  sectionSub: {
    color: '#ffffffB0', fontSize: 12, lineHeight: 18,
    marginBottom: 10, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18, padding: 14, marginBottom: 8,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIconSlot: {
    width: 34, marginRight: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardBlurb: { fontSize: 11, marginTop: 2, letterSpacing: 1 },
  cardChevron: { color: '#ffffff44', fontSize: 20 },
  cardDescription: { color: '#ffffffB0', fontSize: 12, marginTop: 8, lineHeight: 17 },
  cardMudra: {
    fontSize: 10, marginTop: 6, letterSpacing: 1.5,
    fontWeight: '600', textTransform: 'uppercase',
  },

  malaCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 18, padding: 14, marginTop: 10, marginBottom: 0,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  malaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  malaCountText: { color: '#d9b35c', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  malaBar: {
    height: 4, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden',
  },
  malaBarFill: { height: '100%', backgroundColor: '#d9b35c' },
  malaActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  malaResetBtn: {
    paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  malaResetText: { color: '#ffffffB0', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  malaCountBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 999,
    backgroundColor: '#d9b35c', alignItems: 'center',
  },
  malaCountBtnText: { color: '#0B0B1F', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  malaHint: { color: '#ffffff77', fontSize: 11, marginTop: 10, textAlign: 'center' },
  malaHapticRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  malaHapticLabel: { color: '#ffffff77', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  malaHapticPills: { flexDirection: 'row', gap: 6 },
  malaHapticPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  malaHapticText: { color: '#ffffff99', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  // Scroll content, so no flex: 1; the ScrollView itself fills the screen.
  sessionWrap: { alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backText: { color: '#ffffffB0', fontSize: 13, letterSpacing: 0.5 },
  sessionName: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 28, letterSpacing: 1, marginTop: 6,
  },
  sessionBlurb: { fontSize: 13, marginTop: 2, letterSpacing: 1.5 },

  visualToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    padding: 3,
    marginTop: 14,
  },
  toggleBtn: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1, borderColor: 'transparent',
  },
  toggleText: { color: '#ffffff99', fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },

  lengthRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 6, marginTop: 10,
  },
  lengthPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  lengthText: { color: '#ffffff99', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  visualStack: {
    width: 280, height: 280,
    marginVertical: 20,
    alignSelf: 'center',
  },
  visualLayer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  circleWrap: {
    width: 280, height: 280,
    alignItems: 'center', justifyContent: 'center',
  },
  outerHalo: {
    position: 'absolute',
    width: 280, height: 280, borderRadius: 140,
    borderWidth: 1,
  },
  circle: {
    width: 240, height: 240, borderRadius: 120,
    borderWidth: 2,
  },
  circleLabelWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },

  mandalaWrap: {
    width: MANDALA_SIZE, height: MANDALA_SIZE,
    alignItems: 'center', justifyContent: 'center',
  },
  absCenter: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
  },
  mandalaGlow: {
    width: 252,
    height: 252,
    borderRadius: 126,
    borderWidth: 1,
    opacity: 0.34,
    backgroundColor: 'rgba(255,255,255,0.025)',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  mandalaCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    opacity: 0.92,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  labelInner: { alignItems: 'center', justifyContent: 'center' },
  phaseText: {
    fontSize: 22, fontWeight: '300',
    letterSpacing: 4, textTransform: 'uppercase',
  },
  phaseCount: { color: '#fff', fontSize: 44, fontWeight: '200', marginTop: 4 },
  cycleText: { color: '#ffffff66', fontSize: 11, letterSpacing: 2, marginTop: 4 },

  playBtn: {
    height: 58, width: '100%',
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    marginTop: 14,
  },
  playBtnText: { fontSize: 18, fontWeight: '700', letterSpacing: 4, color: '#0B0B1F' },

  sessionDescription: {
    color: '#ffffffB0', fontSize: 13, textAlign: 'center',
    marginTop: 20, paddingHorizontal: 12, lineHeight: 18,
  },
  mudraBlock: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14, width: '100%',
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  mudraLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  mudraText: { color: '#ffffffB0', fontSize: 12, lineHeight: 18 },
});
