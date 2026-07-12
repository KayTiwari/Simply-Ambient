import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * Shared editorial primitives for the five main rooms of Simply Ambient.
 * Everything here is translucent by design: App owns the live, band-aware
 * color field and these components add hierarchy without hiding it.
 */

export function AmbientVeil({
  accent,
  children,
  style,
  strength = 'standard',
  active = false,
  motionHz = 0,
  accentTransitionMs = 620,
}: {
  accent: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: 'light' | 'standard' | 'deep';
  active?: boolean;
  motionHz?: number;
  accentTransitionMs?: number;
}) {
  const reveal = useRef(new Animated.Value(0)).current;
  const accentFade = useRef(new Animated.Value(1)).current;
  const ambientMotion = useRef(new Animated.Value(0)).current;
  const [displayAccent, setDisplayAccent] = React.useState(accent);
  const [previousAccent, setPreviousAccent] = React.useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reveal]);

  useEffect(() => {
    if (accent === displayAccent) return;
    if (reduceMotion) {
      accentFade.stopAnimation();
      accentFade.setValue(1);
      setPreviousAccent(null);
      setDisplayAccent(accent);
      return;
    }
    setPreviousAccent(displayAccent);
    setDisplayAccent(accent);
    accentFade.stopAnimation();
    accentFade.setValue(0);
    Animated.timing(accentFade, {
      toValue: 1,
      duration: accentTransitionMs,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPreviousAccent(null);
    });
  }, [accent, accentFade, accentTransitionMs, displayAccent, reduceMotion]);

  useEffect(() => {
    ambientMotion.stopAnimation();
    if (!active || reduceMotion) {
      Animated.timing(ambientMotion, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    const normalizedHz = Math.max(0, Math.min(40, motionHz));
    const halfCycle = Math.round(6200 - normalizedHz * 55);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ambientMotion, {
        toValue: 1,
        duration: halfCycle,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(ambientMotion, {
        toValue: 0,
        duration: halfCycle,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, ambientMotion, motionHz, reduceMotion]);

  // Interference ripples run at the same band-aware tempo as the drift:
  // slower for delta, quicker for gamma. Only the live accent layer ripples;
  // the outgoing layer holds still while it fades, so the accent crossfade
  // reads exactly as before.
  const rippleHz = Math.max(0, Math.min(40, motionHz));
  const ripplePeriod = Math.round(6400 - rippleHz * 55);
  const rippleActive = active && !reduceMotion;

  const base: [string, string, string] = strength === 'light'
    ? ['rgba(8,9,25,0.08)', 'rgba(8,9,25,0.18)', 'rgba(6,7,21,0.30)']
    : strength === 'deep'
      ? ['rgba(8,9,25,0.30)', 'rgba(8,9,25,0.48)', 'rgba(6,7,21,0.68)']
      : ['rgba(8,9,25,0.18)', 'rgba(8,9,25,0.34)', 'rgba(6,7,21,0.52)'];
  const baseDriftX = ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [-7, 9] });
  const baseDriftY = ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [-5, 8] });
  const baseScale = ambientMotion.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.085] });

  return (
    <View style={[shared.veil, style]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: baseDriftX }, { translateY: baseDriftY }, { scale: baseScale }] },
        ]}
        pointerEvents="none"
      >
        <LinearGradient colors={base} locations={[0, 0.52, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {previousAccent ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: Animated.multiply(
                reveal,
                accentFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              ),
            },
          ]}
          pointerEvents="none"
        >
          <VeilAtmosphere accent={previousAccent} motion={ambientMotion} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(reveal, accentFade) }]}
        pointerEvents="none"
      >
        <VeilAtmosphere
          accent={displayAccent}
          motion={ambientMotion}
          rippleActive={rippleActive}
          ripplePeriod={ripplePeriod}
        />
      </Animated.View>
      {children}
    </View>
  );
}

function VeilAtmosphere({
  accent,
  motion,
  rippleActive = false,
  ripplePeriod = 6000,
}: {
  accent: string;
  motion: Animated.Value;
  rippleActive?: boolean;
  ripplePeriod?: number;
}) {
  const auraX = motion.interpolate({ inputRange: [0, 1], outputRange: [-8, 12] });
  const auraY = motion.interpolate({ inputRange: [0, 1], outputRange: [-5, 11] });
  const auraScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.075] });
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          shared.aurora,
          { transform: [{ translateX: auraX }, { translateY: auraY }, { scale: auraScale }] },
        ]}
      >
        <LinearGradient
          colors={[accent + '24', accent + '08', 'transparent']}
          locations={[0, 0.56, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <RippleField accent={accent} active={rippleActive} periodMs={ripplePeriod} motion={motion} />
      <CornerRipples accent={accent} active={rippleActive} periodMs={ripplePeriod} />
    </View>
  );
}

// Rings blooming outward from the top-right corner while sound plays, the
// third voice of the atmosphere alongside the aurora and the ear ripples.
// Gated upstream by rippleActive, so reduce-motion is already respected.
function CornerRipples({
  accent,
  active,
  periodMs,
}: {
  accent: string;
  active: boolean;
  periodMs: number;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const rings = useRef([new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: active ? 1 : 0,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, fade]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const run = (v: Animated.Value) => {
      v.setValue(0);
      Animated.timing(v, {
        toValue: 1, duration: periodMs, easing: Easing.out(Easing.sin), useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive) run(v);
      });
    };
    run(rings[0]);
    const timer = setTimeout(() => { if (alive) run(rings[1]); }, periodMs / 2);
    return () => {
      alive = false;
      clearTimeout(timer);
      rings.forEach(v => { v.stopAnimation(); v.setValue(0); });
    };
  }, [active, periodMs, rings]);

  return (
    <>
      {rings.map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            shared.cornerRing,
            {
              borderColor: accent,
              opacity: Animated.multiply(
                fade,
                v.interpolate({ inputRange: [0, 0.14, 1], outputRange: [0, 0.32, 0] }),
              ),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.1] }) }],
            },
          ]}
        />
      ))}
    </>
  );
}

// Two soft ring sources, left ear and right ear, sending slow ripples that
// cross mid-screen where a quiet glow swells at the beat tempo. While idle a
// single faint resting ring per source hints at the still pond; playing
// crossfades the hints out and the live ripples in.
const RINGS_PER_SOURCE = 3;

function RippleField({
  accent,
  active,
  periodMs,
  motion,
}: {
  accent: string;
  active: boolean;
  periodMs: number;
  motion: Animated.Value;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const rings = useRef(
    Array.from({ length: RINGS_PER_SOURCE * 2 }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: active ? 1 : 0,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, fade]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Animated.loop around a lone timing stops after its first pass on some
    // platforms, so each ring relaunches itself from its completion callback:
    // one JS call per ring every few seconds, animation itself native-driven.
    const run = (v: Animated.Value) => {
      v.setValue(0);
      Animated.timing(v, {
        toValue: 1, duration: periodMs, easing: Easing.linear, useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && alive) run(v);
      });
    };
    rings.forEach((v, i) => {
      // Left source rings launch a third of a period apart; the right source
      // sits half a step behind so the two never pulse in unison.
      const source = Math.floor(i / RINGS_PER_SOURCE);
      const k = i % RINGS_PER_SOURCE;
      const delay = (k / RINGS_PER_SOURCE) * periodMs + source * (periodMs / (RINGS_PER_SOURCE * 2));
      timers.push(setTimeout(() => { if (alive) run(v); }, delay));
    });
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      rings.forEach(v => { v.stopAnimation(); v.setValue(0); });
    };
  }, [active, periodMs, rings]);

  const restingOpacity = fade.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });
  const meetOpacity = Animated.multiply(
    fade,
    motion.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
  );
  const meetScale = motion.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] });

  const ring = (v: Animated.Value, source: 0 | 1, key: number) => (
    <Animated.View
      key={key}
      style={[
        shared.rippleRing,
        source === 0 ? shared.rippleLeft : shared.rippleRight,
        {
          borderColor: accent,
          opacity: Animated.multiply(
            fade,
            v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.4, 0] }),
          ),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1.6] }) }],
        },
      ]}
    />
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[shared.rippleMeet, { opacity: meetOpacity, transform: [{ scale: meetScale }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="veilMeet">
              <Stop offset="0" stopColor={accent} stopOpacity={0.3} />
              <Stop offset="0.7" stopColor={accent} stopOpacity={0.08} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#veilMeet)" />
        </Svg>
      </Animated.View>
      {rings.map((v, i) => ring(v, i < RINGS_PER_SOURCE ? 0 : 1, i))}
      <Animated.View
        style={[shared.rippleRing, shared.rippleLeft, shared.rippleRest, { borderColor: accent, opacity: restingOpacity }]}
      />
      <Animated.View
        style={[shared.rippleRing, shared.rippleRight, shared.rippleRest, { borderColor: accent, opacity: restingOpacity }]}
      />
    </View>
  );
}

export function EditorialHeader({
  title,
  subtitle,
  accent,
  compact = false,
  centerBrand = false,
  brandFirst = false,
  glass = false,
}: {
  mode: string;
  title: string;
  subtitle?: string;
  accent: string;
  compact?: boolean;
  centerBrand?: boolean;
  brandFirst?: boolean;
  glass?: boolean;
}) {
  return (
    <View style={[shared.header, glass && shared.headerGlassContainer, compact && shared.headerCompact]}>
      {glass ? <HeaderGlass accent={accent} /> : null}
      <View style={[shared.brandRow, centerBrand && shared.brandRowCentered]}>
        <Text
          accessibilityRole={brandFirst ? 'header' : undefined}
          style={[
            shared.brand,
            centerBrand && shared.brandCentered,
            brandFirst && shared.brandPrimary,
          ]}
        >
          Simply Ambient
        </Text>
      </View>
      <Text
        accessibilityRole="header"
        style={[
          shared.pageTitle,
          compact && shared.pageTitleCompact,
          brandFirst && shared.pageTitleSecondary,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <View style={shared.subtitleRow}>
          <View style={[shared.subtitleRule, { backgroundColor: accent }]} />
          <Text style={shared.pageSubtitle}>{subtitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function HeaderGlass({ accent }: { accent: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Platform.OS === 'web' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            shared.headerGlassWeb,
            { backgroundColor: accent + '08' },
          ]}
        />
      ) : (
        <BlurView
          intensity={34}
          tint="dark"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0.052)', accent + '09', 'rgba(8,9,25,0.15)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', accent + '3C', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={shared.headerGlassEdge}
      />
    </View>
  );
}

export function EditorialSection({
  eyebrow,
  title,
  subtitle,
  accent,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  accent: string;
}) {
  return (
    <View style={shared.section}>
      <View style={shared.sectionEyebrowRow}>
        <View style={[shared.sectionRule, { backgroundColor: accent }]} />
        <Text style={[shared.sectionEyebrow, { color: accent }]}>
          {eyebrow}
        </Text>
      </View>
      <Text accessibilityRole="header" style={shared.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={shared.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function AmbientSurface({
  accent,
  children,
  style,
  quiet = false,
  showOrb = true,
}: {
  accent: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  quiet?: boolean;
  showOrb?: boolean;
}) {
  return (
    <View
      style={[
        shared.surface,
        quiet && shared.surfaceQuiet,
        { borderColor: accent + (quiet ? '26' : '46'), shadowColor: accent },
        style,
      ]}
    >
      <LinearGradient
        colors={quiet
          ? ['rgba(34,35,61,0.58)', accent + '08', 'rgba(10,11,29,0.72)']
          : [accent + '22', 'rgba(31,32,58,0.76)', 'rgba(9,10,27,0.84)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {showOrb ? (
        <View style={[shared.surfaceOrb, { backgroundColor: accent + '16' }]} pointerEvents="none" />
      ) : null}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={shared.surfaceHighlight}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function StatusStrip({
  accent,
  label,
  detail,
  active = false,
  pulse: pulsing = false,
}: {
  accent: string;
  label: string;
  detail?: string;
  active?: boolean;
  pulse?: boolean;
}) {
  const pulseValue = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    pulseValue.stopAnimation();
    if (!pulsing || reduceMotion) {
      pulseValue.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseValue, {
        toValue: 1,
        duration: 850,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(pulseValue, {
        toValue: 0,
        duration: 850,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulseValue, pulsing, reduceMotion]);

  const dotScale = pulseValue.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const dotOpacity = pulseValue.interpolate({
    inputRange: [0, 1],
    outputRange: [active ? 0.72 : 0.48, active ? 1 : 0.48],
  });

  return (
    <View style={[shared.status, { borderColor: accent + '38', backgroundColor: accent + '0D' }]}>
      <Animated.View
        style={[
          shared.statusDot,
          { backgroundColor: accent, opacity: dotOpacity, transform: [{ scale: dotScale }] },
        ]}
      />
      <Text style={[shared.statusLabel, { color: accent }]} numberOfLines={1}>{label}</Text>
      {detail ? <Text style={shared.statusDetail} numberOfLines={1}> · {detail}</Text> : null}
    </View>
  );
}

const shared = StyleSheet.create({
  veil: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  aurora: {
    position: 'absolute',
    top: -92,
    left: -96,
    right: -48,
    height: 430,
    borderBottomRightRadius: 280,
  },
  rippleRing: {
    position: 'absolute',
    width: '58%', aspectRatio: 1,
    borderRadius: 9999, borderWidth: 1.5,
  },
  rippleLeft: { left: '-24%', top: '26%' },
  rippleRight: { right: '-24%', top: '34%' },
  rippleRest: { transform: [{ scale: 0.5 }] },
  rippleMeet: {
    position: 'absolute',
    left: '16%', top: '24%',
    width: '68%', aspectRatio: 1,
  },
  cornerRing: {
    position: 'absolute', width: 170, height: 170, borderRadius: 85,
    borderWidth: 1, top: -52, right: -66,
  },
  header: { paddingTop: 14, paddingHorizontal: 22, paddingBottom: 18 },
  headerGlassContainer: {
    position: 'relative', overflow: 'hidden', zIndex: 30, elevation: 18,
    backgroundColor: 'rgba(8,9,25,0.07)',
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerGlassWeb: ({
    backdropFilter: 'blur(30px) saturate(135%)',
    WebkitBackdropFilter: 'blur(30px) saturate(135%)',
  } as any),
  headerGlassEdge: { position: 'absolute', left: 22, right: 22, bottom: 0, height: 1 },
  headerCompact: { paddingTop: 8, paddingBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRowCentered: { justifyContent: 'center' },
  brand: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20,
    letterSpacing: 1.2,
  },
  brandCentered: { textAlign: 'center' },
  brandPrimary: {
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: 1.5,
  },
  pageTitle: {
    color: '#FFFDFE',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 45,
    lineHeight: 46,
    letterSpacing: 0.2,
    marginTop: 17,
  },
  pageTitleCompact: { fontSize: 38, lineHeight: 40, marginTop: 12 },
  pageTitleSecondary: {
    fontSize: 30,
    lineHeight: 34,
    marginTop: 10,
    color: 'rgba(255,253,254,0.88)',
  },
  subtitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 9 },
  subtitleRule: { width: 24, height: 2, borderRadius: 1, marginTop: 8, marginRight: 10 },
  pageSubtitle: { color: '#C2C0CF', fontSize: 12.5, lineHeight: 18, flex: 1, maxWidth: 330 },

  section: { marginTop: 28, marginBottom: 13 },
  sectionEyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionRule: { width: 20, height: 2, borderRadius: 1, marginRight: 9 },
  sectionEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 2.2 },
  sectionTitle: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: 0.2,
  },
  sectionSubtitle: { color: '#A5A4B5', fontSize: 11.5, lineHeight: 17, marginTop: 3 },

  surface: {
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: 'rgba(15,16,36,0.66)',
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  surfaceQuiet: { shadowOpacity: 0.06, shadowRadius: 12 },
  surfaceOrb: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    right: -72, top: -96,
  },
  surfaceHighlight: { position: 'absolute', top: 0, left: 24, right: 24, height: 1 },

  status: {
    minHeight: 38, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center',
    overflow: 'hidden',
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  statusLabel: { flexShrink: 0, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  statusDetail: { color: '#B0AEBD', fontSize: 11, flex: 1, minWidth: 0, flexShrink: 1 },
});
