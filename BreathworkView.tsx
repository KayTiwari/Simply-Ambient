import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

type Phase = { name: 'Inhale' | 'Hold' | 'Exhale'; seconds: number };

type Technique = {
  id: string;
  name: string;
  category: 'calming' | 'activating';
  blurb: string;
  description: string;
  phases: Phase[];
  color: string;
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
    color: '#5BD0FF', petalSides: 4, petalCount: 4, centerSides: 4,
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
    color: '#8A5BFF', petalSides: 6, petalCount: 6, centerSides: 6,
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
    color: '#5B6CFF', petalSides: 8, petalCount: 8, centerSides: 8,
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
    color: '#9affc8', petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Vayu Mudra', instruction: 'Curl the index finger to the base of the thumb; thumb covers the index. Rest other fingers extended.' },
  },
  {
    id: 'holotropic', name: 'Holotropic', category: 'activating',
    blurb: '1 in · 1 out · fast',
    description: 'Rapid, full breaths. Originated by Stanislav Grof. Brief sessions only — can induce altered states.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#FF5B9C', petalSides: 3, petalCount: 6, centerSides: 3,
    mudra: { name: 'Open palms', instruction: 'Lay hands palms-up on knees, fingers softly extended — receiving and surrender.' },
  },
  {
    id: 'shamanic', name: 'Shamanic', category: 'activating',
    blurb: '2 in · 1 out',
    description: 'Rhythmic active breath, rooted in indigenous traditions. Energizes and opens awareness.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#FFB05B', petalSides: 3, petalCount: 8, centerSides: 6,
    mudra: { name: 'Power fists', instruction: 'Loose fists at the solar plexus, knuckles facing each other — gathering inner fire.' },
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
    color: '#d9b35c', petalSides: 6, petalCount: 6, centerSides: 3,
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
    color: '#5BD0FF', petalSides: 6, petalCount: 6, centerSides: 6,
    mudra: { name: 'Apana Vayu Mudra', instruction: 'Index curls to base of thumb; tips of middle and ring touch thumb; pinky extended. Heart-opening.' },
  },
  {
    id: 'bhramari', name: 'Bhramari (Bee)', category: 'calming',
    blurb: '4 in · 8 hum-out',
    description: 'Inhale slowly, then hum like a bee on the long exhale. Stimulates the vagus nerve, raises nitric oxide, eases anxiety, insomnia, and tinnitus.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 8 },
    ],
    color: '#9affc8', petalSides: 8, petalCount: 8, centerSides: 8,
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
    color: '#8A5BFF', petalSides: 5, petalCount: 6, centerSides: 5,
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
    color: '#5B6CFF', petalSides: 4, petalCount: 8, centerSides: 4,
    mudra: { name: 'Bhairava Mudra', instruction: 'Right hand resting in left palm, both palms facing up in lap.' },
  },
  {
    id: 'sigh', name: 'Physiological Sigh', category: 'calming',
    blurb: '2 short in · long out',
    description: 'Two short inhales through the nose, then one long exhale through the mouth. The fastest known way to down-regulate stress in real time.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#5BD0FF', petalSides: 3, petalCount: 6, centerSides: 6,
    mudra: { name: 'Pran Mudra', instruction: 'Tips of thumb, ring, and pinky touch; index and middle extended. Activates life force.' },
  },
  {
    id: 'bhastrika', name: 'Bhastrika (Bellows)', category: 'activating',
    blurb: '1 in · 1 out · forceful',
    description: 'Forceful, equal inhale and exhale through the nose using the diaphragm like a bellows. Builds heat, oxygenates, energizes — keep sessions short.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#FFB05B', petalSides: 3, petalCount: 8, centerSides: 3,
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
    color: '#FF5B9C', petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Lion claws', instruction: 'Stretch fingers wide on the knees like claws, palms down — opens the throat and chest.' },
  },
  {
    id: 'kapalabhati', name: 'Kapalabhati', category: 'activating',
    blurb: 'Passive in · forceful out',
    description: '"Skull-shining breath." Passive inhale, sharp forceful exhale through the nose, repeated rapidly. Cleanses the lungs and energizes the mind.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#FF8FB1', petalSides: 6, petalCount: 8, centerSides: 3,
    mudra: { name: 'Chin Mudra', instruction: 'Touch tip of thumb and index together; rest hands palms-up on knees, other fingers extended.' },
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
    <View style={{ flex: 1 }}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Breath Work</Text>
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

function MalaCounter() {
  const [count, setCount] = useState(0);
  const target = 108;
  const ratio = Math.min(1, count / target);
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
          onPress={() => setCount(0)}
          style={styles.malaResetBtn}
        >
          <Text style={styles.malaResetText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setCount(c => Math.min(target, c + 1))}
          style={styles.malaCountBtn}
        >
          <Text style={styles.malaCountBtnText}>{count >= target ? '✓ Complete' : 'TAP'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.malaHint}>Tap on each breath, mantra, or bead.</Text>
    </View>
  );
}

function TechniqueList({ onPick }: { onPick: (t: Technique) => void }) {
  const calming = TECHNIQUES.filter(t => t.category === 'calming');
  const activating = TECHNIQUES.filter(t => t.category === 'activating');

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <MalaCounter />

      <Text style={styles.sectionLabel}>CALMING</Text>
      <Text style={styles.sectionSub}>Slow the body. Soften the mind.</Text>
      {calming.map(t => (
        <TechniqueCard key={t.id} technique={t} onPress={() => onPick(t)} />
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>ACTIVATING</Text>
      <Text style={styles.sectionSub}>Build energy. Open awareness.</Text>
      {activating.map(t => (
        <TechniqueCard key={t.id} technique={t} onPress={() => onPick(t)} />
      ))}

      <Text style={styles.footnote}>
        Sit upright. Set an intention. The animation will begin when you press play.
      </Text>
    </ScrollView>
  );
}

function TechniqueCard({ technique, onPress }: { technique: Technique; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, { borderColor: technique.color + '55' }]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.cardDot, { backgroundColor: technique.color }]} />
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

function BreathSession({ technique, onBack }: { technique: Technique; onBack: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(technique.phases[0].seconds);
  const [cycle, setCycle] = useState(0);
  const [visual, setVisual] = useState<Visual>('circle');

  // 0 = fully exhaled (petals retracted) ↔ 1 = fully inhaled (petals expanded).
  const breath = useRef(new Animated.Value(0)).current;
  // Continuous rotation 0..1 looping.
  const orbit = useRef(new Animated.Value(0)).current;
  // Rotation of the central polygon (counter-rotates).
  const centerSpin = useRef(new Animated.Value(0)).current;

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

  // Phase loop: drives `breath` and the timer text.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let currentAnim: Animated.CompositeAnimation | null = null;
    let cyc = 0;

    const runPhase = (idx: number) => {
      if (cancelled) return;
      const phase = technique.phases[idx];
      setPhaseIdx(idx);
      setSecondsLeft(phase.seconds);
      if (idx === 0) {
        cyc += 1;
        setCycle(cyc);
      }

      // During Hold the breath value freezes — no motion in/out.
      if (phase.name === 'Inhale') {
        currentAnim = Animated.timing(breath, {
          toValue: 1,
          duration: phase.seconds * 1000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        });
        currentAnim.start();
      } else if (phase.name === 'Exhale') {
        currentAnim = Animated.timing(breath, {
          toValue: 0,
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
        setSecondsLeft(Math.max(0, remaining));
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

  return (
    <View style={styles.sessionWrap}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹  Techniques</Text>
      </TouchableOpacity>

      <Text style={styles.sessionName}>{technique.name}</Text>
      <Text style={[styles.sessionBlurb, { color: technique.color }]}>{technique.blurb}</Text>

      <View style={styles.visualToggle}>
        <TouchableOpacity
          onPress={() => setVisual('circle')}
          activeOpacity={0.85}
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

      {visual === 'circle' ? (
        <BreathCircle
          breath={breath}
          color={technique.color}
          phaseLabel={playing ? phase.name : 'Ready'}
          phaseCount={playing ? secondsLeft : 0}
          cycle={playing ? cycle : 0}
          active={playing}
        />
      ) : (
        <BreathMandala
          breath={breath}
          orbit={orbit}
          centerSpin={centerSpin}
          color={technique.color}
          phaseLabel={playing ? phase.name : 'Ready'}
          phaseCount={playing ? secondsLeft : 0}
          cycle={playing ? cycle : 0}
          active={playing}
        />
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setPlaying(p => !p)}
        style={[styles.playBtn, { backgroundColor: playing ? '#fff' : technique.color }]}
      >
        <Text style={styles.playBtnText}>{playing ? 'STOP' : 'PLAY'}</Text>
      </TouchableOpacity>

      <Text style={styles.sessionDescription}>{technique.description}</Text>

      <View style={[styles.mudraBlock, { borderColor: technique.color + '55' }]}>
        <Text style={[styles.mudraLabel, { color: technique.color }]}>
          MUDRA · {technique.mudra.name.toUpperCase()}
        </Text>
        <Text style={styles.mudraText}>{technique.mudra.instruction}</Text>
      </View>
    </View>
  );
}

// ===========================================================================
//   BreathCircle — minimal circle that scales with breath
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
//   BreathMandala — animated polygonal mandala
// ===========================================================================

const MANDALA_SIZE = 280;
const INNER_R = 60;
const OUTER_R = 110;

function polygonPoints(sides: number, radius: number, cx: number, cy: number, rotate = -Math.PI / 2) {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotate + (2 * Math.PI / sides) * i;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function StaticPolygon({
  sides, size, fill, fillOpacity, stroke, strokeOpacity, strokeWidth, startAngle,
}: {
  sides: number;
  size: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  startAngle?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - (strokeWidth ?? 0) / 2;
  const points = polygonPoints(sides, r, cx, cy, startAngle ?? -Math.PI / 2);
  return (
    <Svg width={size} height={size}>
      <Polygon
        points={points}
        fill={fill ?? 'none'}
        fillOpacity={fillOpacity ?? 1}
        stroke={stroke ?? 'none'}
        strokeOpacity={strokeOpacity ?? 1}
        strokeWidth={strokeWidth ?? 0}
      />
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

// Layers: outer triangle → octagon, stacked concentrically. Each layer rotates
// independently; all scale together with breath.
const POLY_LAYERS: Array<{
  sides: number;
  sizeRatio: number;
  fillOpacity: number;
  strokeOpacity: number;
  rotateSource: 'orbit' | 'orbitReverse' | 'center';
  startAngleDeg: number;
}> = [
  { sides: 3, sizeRatio: 1.00, fillOpacity: 0.05, strokeOpacity: 0.55, rotateSource: 'orbit',         startAngleDeg: 0 },
  { sides: 4, sizeRatio: 0.86, fillOpacity: 0.07, strokeOpacity: 0.65, rotateSource: 'orbitReverse',  startAngleDeg: 30 },
  { sides: 5, sizeRatio: 0.72, fillOpacity: 0.09, strokeOpacity: 0.75, rotateSource: 'center',        startAngleDeg: 18 },
  { sides: 6, sizeRatio: 0.58, fillOpacity: 0.11, strokeOpacity: 0.85, rotateSource: 'orbit',         startAngleDeg: 0 },
  { sides: 7, sizeRatio: 0.44, fillOpacity: 0.14, strokeOpacity: 0.90, rotateSource: 'orbitReverse',  startAngleDeg: 25 },
  { sides: 8, sizeRatio: 0.30, fillOpacity: 0.18, strokeOpacity: 0.95, rotateSource: 'center',        startAngleDeg: 22 },
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
      {POLY_LAYERS.map((layer, i) => {
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
            ]}
          >
            <StaticPolygon
              sides={layer.sides}
              size={size}
              fill={color}
              fillOpacity={layer.fillOpacity}
              stroke={color}
              strokeOpacity={layer.strokeOpacity}
              strokeWidth={1.5}
              startAngle={(layer.startAngleDeg * Math.PI) / 180 - Math.PI / 2}
            />
          </Animated.View>
        );
      })}

      {/* Phase label overlay — centered atop the stack */}
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
  headerWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 14 },
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic',
  },

  toneStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 20, marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  toneDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  toneText: { fontSize: 12, letterSpacing: 0.5 },

  sectionLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
    marginTop: 16, marginBottom: 4, paddingHorizontal: 4,
  },
  sectionSub: {
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    marginBottom: 10, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardBlurb: { fontSize: 11, marginTop: 2, letterSpacing: 1 },
  cardChevron: { color: '#ffffff66', fontSize: 22 },
  cardDescription: { color: '#ffffff88', fontSize: 12, marginTop: 8, lineHeight: 17 },
  cardMudra: { fontSize: 10, marginTop: 6, letterSpacing: 1, fontStyle: 'italic' },

  malaCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 16, marginTop: 8, marginBottom: 14,
    borderWidth: 1, borderColor: '#d9b35c55',
  },
  malaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  malaCountText: { color: '#d9b35c', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  malaBar: {
    height: 4, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 2, overflow: 'hidden',
  },
  malaBarFill: { height: '100%', backgroundColor: '#d9b35c' },
  malaActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  malaResetBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  malaResetText: { color: '#ffffffaa', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  malaCountBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 999,
    backgroundColor: '#d9b35c', alignItems: 'center',
  },
  malaCountBtnText: { color: '#0B0B1F', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  malaHint: { color: '#ffffff66', fontSize: 11, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },

  footnote: {
    color: '#ffffff66', fontSize: 12, textAlign: 'center',
    marginTop: 24, paddingHorizontal: 20, fontStyle: 'italic',
  },

  sessionWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backText: { color: '#ffffffaa', fontSize: 13 },
  sessionName: {
    color: '#fff', fontSize: 26, fontWeight: '300',
    letterSpacing: 1, marginTop: 8,
  },
  sessionBlurb: { fontSize: 13, marginTop: 4, letterSpacing: 1.5 },

  visualToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    padding: 4,
    marginTop: 16,
  },
  toggleBtn: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'transparent',
  },
  toggleText: { color: '#ffffff99', fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },

  circleWrap: {
    width: 280, height: 280,
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 24,
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
    marginVertical: 24,
  },
  absCenter: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
  },
  labelInner: { alignItems: 'center', justifyContent: 'center' },
  phaseText: {
    fontSize: 22, fontWeight: '300',
    letterSpacing: 4, textTransform: 'uppercase',
  },
  phaseCount: { color: '#fff', fontSize: 44, fontWeight: '200', marginTop: 4 },
  cycleText: { color: '#ffffff66', fontSize: 11, letterSpacing: 2, marginTop: 4 },

  playBtn: {
    height: 64, width: '100%',
    borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    marginTop: 16,
  },
  playBtnText: { fontSize: 18, fontWeight: '700', letterSpacing: 4, color: '#0B0B1F' },

  sessionDescription: {
    color: '#ffffff88', fontSize: 13, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 12, lineHeight: 19,
  },
  mudraBlock: {
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mudraLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  mudraText: { color: '#ffffffaa', fontSize: 12, lineHeight: 17 },
});
