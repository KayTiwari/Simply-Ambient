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
import { TECHNIQUES, type Technique } from './lib/content';
import {
  AmbientSurface,
  AmbientVeil,
  EditorialHeader,
  EditorialSection,
  StatusStrip,
} from './AmbientUI';

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

type Props = {
  toneIsPlaying: boolean;
  beatHz: number;
  bandName: string;
  bandColor: string;
};

export default function BreathworkView({ toneIsPlaying, beatHz, bandName, bandColor }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const technique = TECHNIQUES.find(t => t.id === activeId) ?? null;
  const accent = technique?.color ?? bandColor;

  return (
    <AmbientVeil accent={accent} strength={technique ? 'deep' : 'standard'}>
      <EditorialHeader
        mode="RESTORE"
        title="Follow the breath"
        subtitle={technique
          ? 'Let the form recede. Follow one phase, then the next.'
          : 'Choose a rhythm for the moment you are in.'}
        accent={accent}
        compact={Boolean(technique)}
      />

      {toneIsPlaying ? (
        <View style={styles.toneStripWrap}>
          <StatusStrip
            accent={bandColor}
            label={`${bandName.toUpperCase()} TONE`}
            detail={`${beatHz} Hz continues underneath`}
            active
          />
        </View>
      ) : null}

      {technique ? (
        <BreathSession technique={technique} onBack={() => setActiveId(null)} />
      ) : (
        <TechniqueList accent={accent} onPick={t => setActiveId(t.id)} />
      )}
    </AmbientVeil>
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

function MalaCounter({ accent }: { accent: string }) {
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
    <AmbientSurface accent={accent} quiet style={styles.malaCard}>
      <View style={styles.malaTopRow}>
        <View style={styles.malaTitleGroup}>
          <Text style={[styles.malaEyebrow, { color: accent }]}>QUIET RITUAL</Text>
          <Text style={styles.malaTitle}>One bead at a time</Text>
        </View>
        <View style={[styles.malaCountSeal, { borderColor: accent + '55', backgroundColor: accent + '10' }]}>
          <Text style={[styles.malaCountText, { color: accent }]}>{count}</Text>
          <Text style={styles.malaTargetText}>/ {target}</Text>
        </View>
      </View>
      <Text style={styles.malaIntro}>Keep a tactile count through breath, mantra, or meditation.</Text>
      <View style={styles.malaBar}>
        <View style={[styles.malaBarFill, { width: `${ratio * 100}%`, backgroundColor: accent }]} />
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
          style={[styles.malaCountBtn, { backgroundColor: accent }]}
        >
          <Text style={styles.malaCountBtnText}>{count >= target ? '✓ COMPLETE' : 'COUNT A BEAD'}</Text>
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
                  active && { borderColor: accent, backgroundColor: accent + '18' },
                ]}
              >
                <Text style={[styles.malaHapticText, active && { color: accent }]}>
                  {p === 'off' ? 'Off' : p === 'low' ? 'Low' : 'High'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </AmbientSurface>
  );
}

function TechniqueList({ accent, onPick }: { accent: string; onPick: (t: Technique) => void }) {
  const insets = useSafeAreaInsets();
  const calming = TECHNIQUES.filter(t => t.category === 'calming');
  const activating = TECHNIQUES.filter(t => t.category === 'activating');

  return (
    <ScrollView
      // Clear the ~80px tab bar rendered by App.tsx plus the safe-area inset.
      contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <EditorialSection
        index="01"
        eyebrow="RITUAL"
        title="Mark the moment"
        subtitle="A quiet counter for practices that do not need a timer."
        accent={accent}
      />
      <MalaCounter accent="#D9B86C" />

      <EditorialSection
        index="02"
        eyebrow="SETTLE"
        title="Return to stillness"
        subtitle="Measured rhythms to soften the body and quiet the mind."
        accent={accent}
      />
      {calming.map((t, index) => (
        <TechniqueCard key={t.id} index={index + 1} technique={t} onPress={() => onPick(t)} />
      ))}

      <EditorialSection
        index="03"
        eyebrow="AWAKEN"
        title="Gather your energy"
        subtitle="Brighter cadences for presence, focus, and momentum."
        accent={accent}
      />
      {activating.map((t, index) => (
        <TechniqueCard key={t.id} index={index + 1} technique={t} onPress={() => onPick(t)} />
      ))}
    </ScrollView>
  );
}

function TechniqueCard({
  technique,
  index,
  onPress,
}: {
  technique: Technique;
  index: number;
  onPress: () => void;
}) {
  const Icon = technique.Icon;
  const cadence = technique.phases.map(phase => `${phase.name} ${phase.seconds}s`).join('  ·  ');
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${technique.name}, ${technique.blurb}. Open breathing session.`}
      style={styles.cardTouch}
    >
      <AmbientSurface accent={technique.color} style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardIndex, { color: technique.color }]}>PRACTICE {String(index).padStart(2, '0')}</Text>
          <View style={[styles.cardArrow, { borderColor: technique.color + '3D' }]}>
            <Text style={[styles.cardChevron, { color: technique.color }]}>↗</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <View style={[styles.cardIconSlot, { borderColor: technique.color + '42', backgroundColor: technique.color + '12' }]}>
            <Icon size={28} weight="duotone" color={technique.color} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardName}>{technique.name}</Text>
            <Text style={[styles.cardBlurb, { color: technique.color }]}>{technique.blurb}</Text>
          </View>
        </View>
        <Text style={styles.cardDescription}>{technique.description}</Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardCadence}>{cadence}</Text>
          <Text style={[styles.cardMudra, { color: technique.color }]}>{technique.mudra.name}</Text>
        </View>
      </AmbientSurface>
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
  const activating = technique.category === 'activating';
  const [targetCycles, setTargetCycles] = useState<number | null>(activating ? 5 : null);
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
  const targetLabel = targetCycles == null ? 'Endless practice' : `${targetCycles} cycle practice`;
  const cycleChoices = activating ? [5, 10] : CYCLE_CHOICES;

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
        <Text style={styles.backText}>‹  ALL PRACTICES</Text>
      </TouchableOpacity>

      <Text style={[styles.sessionEyebrow, { color: technique.color }]}>GUIDED PRACTICE</Text>
      <Text style={styles.sessionName}>{technique.name}</Text>
      <Text style={[styles.sessionBlurb, { color: technique.color }]}>{technique.blurb}</Text>
      <View style={styles.sessionStatus} accessibilityLiveRegion="polite">
        <StatusStrip
          accent={technique.color}
          label={phaseLabel.toUpperCase()}
          detail={playing ? `${secondsLeft}s · cycle ${cycle}` : targetLabel}
          active={playing || complete}
        />
      </View>
      {activating ? (
        <View style={[styles.activatingNotice, { borderColor: technique.color + '45' }]}>
          <Text style={[styles.activatingNoticeLabel, { color: technique.color }]}>ACTIVE RHYTHM</Text>
          <Text style={styles.activatingNoticeText}>Stay seated · keep it brief · stop if light-headed</Text>
        </View>
      ) : null}

      <AmbientSurface accent={technique.color} quiet style={styles.controlDeck}>
        <View style={styles.controlHeadingRow}>
          <Text style={styles.controlEyebrow}>SESSION SHAPE</Text>
          <Text style={[styles.controlValue, { color: technique.color }]}>{targetLabel}</Text>
        </View>
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
          {cycleChoices.map(c => {
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
      </AmbientSurface>

      <AmbientSurface accent={technique.color} style={styles.breathChamber}>
        <View style={styles.chamberTopRow}>
          <View>
            <Text style={[styles.chamberEyebrow, { color: technique.color }]}>BREATHING CHAMBER</Text>
            <Text style={styles.chamberInstruction}>{playing ? 'Stay with the current phase' : 'Begin when your body feels ready'}</Text>
          </View>
          <View style={[styles.chamberLiveDot, { borderColor: technique.color + '55' }]}>
            <View style={[styles.chamberLiveDotCore, { backgroundColor: technique.color, opacity: playing ? 1 : 0.35 }]} />
          </View>
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

        <View style={styles.phasePath} accessibilityLiveRegion="polite">
          {technique.phases.map((item, index) => {
            const current = playing && index === phaseIdx;
            return (
              <View key={`${item.name}-${index}`} style={styles.phasePathItem}>
                <View style={[
                  styles.phasePathRule,
                  { backgroundColor: current ? technique.color : 'rgba(255,255,255,0.10)' },
                ]} />
                <Text style={[styles.phasePathName, current && { color: technique.color }]}>{item.name}</Text>
                <Text style={styles.phasePathTime}>{item.seconds}s</Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { setComplete(false); setPlaying(p => !p); }}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Stop breathing session' : 'Start breathing session'}
          style={[
            styles.playBtn,
            {
              backgroundColor: playing ? 'rgba(255,255,255,0.94)' : technique.color,
              shadowColor: technique.color,
            },
          ]}
        >
          <Text style={styles.playBtnText}>{playing ? 'END PRACTICE' : 'BEGIN PRACTICE'}</Text>
        </TouchableOpacity>
      </AmbientSurface>

      <EditorialSection
        index="02"
        eyebrow="FORM"
        title="A little guidance"
        subtitle="Use the visual as a suggestion; your breath sets the pace."
        accent={technique.color}
      />
      <AmbientSurface accent={technique.color} quiet style={styles.guidanceBlock}>
        <Text style={styles.sessionDescription}>{technique.description}</Text>
        <View style={styles.guidanceRule} />
        <Text style={[styles.mudraLabel, { color: technique.color }]}>
          MUDRA · {technique.mudra.name.toUpperCase()}
        </Text>
        <Text style={styles.mudraText}>{technique.mudra.instruction}</Text>
      </AmbientSurface>
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
  toneStripWrap: { paddingHorizontal: 20, marginTop: -4, marginBottom: 3 },

  // Practice library — each card reads as a small editorial object rather
  // than a row in a settings list.
  cardTouch: { marginBottom: 12, borderRadius: 26 },
  card: {
    padding: 18,
    minHeight: 190,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 13,
  },
  cardIndex: { fontSize: 8.5, fontWeight: '800', letterSpacing: 2.2 },
  cardArrow: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  cardChevron: { fontSize: 15, marginTop: -1 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIconSlot: {
    width: 54, height: 54, borderRadius: 18, marginRight: 13, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cardCopy: { flex: 1 },
  cardName: {
    color: '#FFFDFE', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25, lineHeight: 27, letterSpacing: 0.2,
  },
  cardBlurb: { fontSize: 10, marginTop: 3, letterSpacing: 1.7, fontWeight: '700' },
  cardDescription: { color: '#B9B6C6', fontSize: 12, marginTop: 14, lineHeight: 18 },
  cardMetaRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.075)',
    marginTop: 14, paddingTop: 11, gap: 12,
  },
  cardCadence: { color: '#8E8C9D', fontSize: 8.5, lineHeight: 13, letterSpacing: 0.5, flex: 1 },
  cardMudra: {
    fontSize: 8.5, letterSpacing: 1.3,
    fontWeight: '800', textTransform: 'uppercase', textAlign: 'right',
  },

  // Mala is intentionally quieter and more tactile than the guided library.
  malaCard: {
    padding: 18,
  },
  malaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  malaTitleGroup: { flex: 1, paddingRight: 12 },
  malaEyebrow: { fontSize: 8.5, fontWeight: '800', letterSpacing: 2.2, marginBottom: 5 },
  malaTitle: {
    color: '#FAF8FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 24, lineHeight: 26,
  },
  malaCountSeal: {
    minWidth: 68, height: 52, borderRadius: 18, borderWidth: 1,
    paddingHorizontal: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
  },
  malaCountText: {
    fontFamily: 'CormorantGaramond_500Medium', fontSize: 27, lineHeight: 31,
  },
  malaTargetText: { color: '#8F8D9B', fontSize: 10, marginLeft: 3 },
  malaIntro: { color: '#A8A5B5', fontSize: 11.5, lineHeight: 17, marginTop: 11, maxWidth: 280 },
  malaBar: {
    height: 3, marginTop: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden',
  },
  malaBarFill: { height: '100%' },
  malaActions: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 },
  malaResetBtn: {
    minHeight: 46, paddingHorizontal: 16,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.035)', alignItems: 'center', justifyContent: 'center',
  },
  malaResetText: { color: '#B4B1C0', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  malaCountBtn: {
    flex: 1, minHeight: 46, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  malaCountBtnText: { color: '#0B0B1F', fontSize: 10.5, fontWeight: '900', letterSpacing: 2.2 },
  malaHapticRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14, paddingTop: 12, gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  malaHapticLabel: { color: '#838191', fontSize: 8.5, letterSpacing: 1.9, fontWeight: '800' },
  malaHapticPills: { flexDirection: 'row', gap: 6 },
  malaHapticPill: {
    minHeight: 30, paddingHorizontal: 11, justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  malaHapticText: { color: '#9B98A8', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Guided session — a slim setup rail feeding one dominant visual chamber.
  sessionWrap: { paddingHorizontal: 20 },
  backBtn: {
    alignSelf: 'flex-start', minHeight: 38, paddingVertical: 9, paddingHorizontal: 2,
    justifyContent: 'center',
  },
  backText: { color: '#AAA7B6', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  sessionEyebrow: { fontSize: 8.5, fontWeight: '800', letterSpacing: 2.4, marginTop: 7 },
  sessionName: {
    color: '#FFFDFE',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 37, lineHeight: 40, letterSpacing: 0.1, marginTop: 5,
  },
  sessionBlurb: { fontSize: 11, marginTop: 3, letterSpacing: 1.6, fontWeight: '700' },

  sessionStatus: { marginTop: 14 },
  activatingNotice: {
    width: '100%', marginTop: 9, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 13, borderWidth: 1, backgroundColor: 'rgba(8,9,25,0.30)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  activatingNoticeLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  activatingNoticeText: { color: '#A9A7B6', fontSize: 9.5, flexShrink: 1, textAlign: 'right' },
  controlDeck: { width: '100%', padding: 14, marginTop: 10 },
  controlHeadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  controlEyebrow: { color: '#8E8B9A', fontSize: 8, fontWeight: '800', letterSpacing: 1.9 },
  controlValue: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.7 },

  visualToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(5,6,20,0.35)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)',
    borderRadius: 14,
    padding: 3,
    marginTop: 12,
  },
  toggleBtn: {
    flex: 1, minHeight: 34,
    borderRadius: 11,
    borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText: { color: '#9996A7', fontSize: 10, letterSpacing: 1.1, fontWeight: '700' },

  lengthRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 6, marginTop: 9,
  },
  lengthPill: {
    minHeight: 31, paddingHorizontal: 10, justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  lengthText: { color: '#9693A3', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },

  breathChamber: { width: '100%', marginTop: 13, paddingTop: 18, paddingBottom: 16 },
  chamberTopRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  chamberEyebrow: { fontSize: 8.5, fontWeight: '800', letterSpacing: 2.1 },
  chamberInstruction: { color: '#9996A6', fontSize: 10.5, marginTop: 4 },
  chamberLiveDot: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  chamberLiveDotCore: { width: 7, height: 7, borderRadius: 4 },

  visualStack: {
    width: 280, height: 280,
    marginTop: 12, marginBottom: 6,
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
    backgroundColor: 'rgba(255,255,255,0.012)',
  },
  circle: {
    width: 226, height: 226, borderRadius: 113,
    borderWidth: 1.5,
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
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25, lineHeight: 28, fontWeight: '400',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  phaseCount: { color: '#FFFDFE', fontSize: 42, fontWeight: '200', marginTop: 1 },
  cycleText: { color: '#858292', fontSize: 9, letterSpacing: 1.8, marginTop: 3, textTransform: 'uppercase' },

  phasePath: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 5,
    marginTop: 2, marginBottom: 14,
  },
  phasePathItem: { flex: 1 },
  phasePathRule: { height: 2, borderRadius: 1, marginBottom: 7 },
  phasePathName: { color: '#8C8999', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  phasePathTime: { color: '#6F6D7D', fontSize: 8.5, marginTop: 2 },

  playBtn: {
    minHeight: 54,
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16,
    shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  playBtnText: { fontSize: 10.5, fontWeight: '900', letterSpacing: 2.5, color: '#0B0B1F' },

  sessionDescription: {
    color: '#C0BDCB', fontSize: 12.5, lineHeight: 19,
  },
  guidanceBlock: { width: '100%', padding: 18 },
  guidanceRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.075)', marginVertical: 16 },
  mudraLabel: { fontSize: 8.5, letterSpacing: 2, fontWeight: '800', marginBottom: 6 },
  mudraText: { color: '#AAA7B7', fontSize: 12, lineHeight: 18 },
});
