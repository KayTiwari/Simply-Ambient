import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
        <VeilAtmosphere accent={displayAccent} motion={ambientMotion} />
      </Animated.View>
      {children}
    </View>
  );
}

function VeilAtmosphere({ accent, motion }: { accent: string; motion: Animated.Value }) {
  const auraX = motion.interpolate({ inputRange: [0, 1], outputRange: [-8, 12] });
  const auraY = motion.interpolate({ inputRange: [0, 1], outputRange: [-5, 11] });
  const auraScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.075] });
  const orbitLargeScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.085] });
  const orbitSmallScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 0.925] });
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
      <Animated.View
        style={[
          shared.orbitLarge,
          { borderColor: accent + '27', transform: [{ scale: orbitLargeScale }] },
        ]}
      />
      <Animated.View
        style={[
          shared.orbitSmall,
          { borderColor: accent + '20', transform: [{ scale: orbitSmallScale }] },
        ]}
      />
      <View style={[shared.spark, shared.sparkOne, { backgroundColor: accent + '99' }]} />
      <View style={[shared.spark, shared.sparkTwo]} />
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
}: {
  mode: string;
  title: string;
  subtitle?: string;
  accent: string;
  compact?: boolean;
  centerBrand?: boolean;
  brandFirst?: boolean;
}) {
  return (
    <View style={[shared.header, compact && shared.headerCompact]}>
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
}: {
  accent: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  quiet?: boolean;
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
      <View style={[shared.surfaceOrb, { backgroundColor: accent + '16' }]} pointerEvents="none" />
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
  orbitLarge: {
    position: 'absolute', top: -188, right: -168,
    width: 370, height: 370, borderRadius: 185, borderWidth: 1,
  },
  orbitSmall: {
    position: 'absolute', top: -70, right: -76,
    width: 190, height: 190, borderRadius: 95, borderWidth: 1,
  },
  spark: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#ffffff88' },
  sparkOne: { top: 122, left: '10%' },
  sparkTwo: { top: 242, right: '18%' },

  header: { paddingTop: 14, paddingHorizontal: 22, paddingBottom: 18 },
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
