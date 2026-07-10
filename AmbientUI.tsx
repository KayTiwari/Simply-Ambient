import React, { useEffect, useRef } from 'react';
import {
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
}: {
  accent: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: 'light' | 'standard' | 'deep';
}) {
  const reveal = useRef(new Animated.Value(0)).current;
  const accentFade = useRef(new Animated.Value(1)).current;
  const [displayAccent, setDisplayAccent] = React.useState(accent);
  const [previousAccent, setPreviousAccent] = React.useState<string | null>(null);

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
    setPreviousAccent(displayAccent);
    setDisplayAccent(accent);
    accentFade.stopAnimation();
    accentFade.setValue(0);
    Animated.timing(accentFade, {
      toValue: 1,
      duration: 620,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPreviousAccent(null);
    });
  }, [accent, accentFade, displayAccent]);

  const base: [string, string, string] = strength === 'light'
    ? ['rgba(8,9,25,0.08)', 'rgba(8,9,25,0.18)', 'rgba(6,7,21,0.30)']
    : strength === 'deep'
      ? ['rgba(8,9,25,0.30)', 'rgba(8,9,25,0.48)', 'rgba(6,7,21,0.68)']
      : ['rgba(8,9,25,0.18)', 'rgba(8,9,25,0.34)', 'rgba(6,7,21,0.52)'];

  return (
    <View style={[shared.veil, style]}>
      <LinearGradient
        colors={base}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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
          <VeilAtmosphere accent={previousAccent} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(reveal, accentFade) }]}
        pointerEvents="none"
      >
        <VeilAtmosphere accent={displayAccent} />
      </Animated.View>
      {children}
    </View>
  );
}

function VeilAtmosphere({ accent }: { accent: string }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[accent + '24', accent + '08', 'transparent']}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={shared.aurora}
      />
      <View style={[shared.orbitLarge, { borderColor: accent + '1C' }]} />
      <View style={[shared.orbitSmall, { borderColor: accent + '16' }]} />
      <View style={[shared.spark, shared.sparkOne, { backgroundColor: accent + '99' }]} />
      <View style={[shared.spark, shared.sparkTwo]} />
    </View>
  );
}

export function EditorialHeader({
  mode,
  title,
  subtitle,
  accent,
  compact = false,
}: {
  mode: string;
  title: string;
  subtitle: string;
  accent: string;
  compact?: boolean;
}) {
  return (
    <View style={[shared.header, compact && shared.headerCompact]}>
      <View style={shared.brandRow}>
        <Text style={shared.brand}>Simply Ambient</Text>
        <View style={[shared.modePill, { borderColor: accent + '55', backgroundColor: accent + '11' }]}>
          <View style={[shared.modeDot, { backgroundColor: accent }]} />
          <Text style={[shared.mode, { color: accent }]}>{mode}</Text>
        </View>
      </View>
      <Text accessibilityRole="header" style={[shared.pageTitle, compact && shared.pageTitleCompact]}>{title}</Text>
      <View style={shared.subtitleRow}>
        <View style={[shared.subtitleRule, { backgroundColor: accent }]} />
        <Text style={shared.pageSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function EditorialSection({
  index,
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
          {index ? `${index} · ` : ''}{eyebrow}
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
}: {
  accent: string;
  label: string;
  detail?: string;
  active?: boolean;
}) {
  return (
    <View style={[shared.status, { borderColor: accent + '38', backgroundColor: accent + '0D' }]}>
      <View style={[shared.statusDot, { backgroundColor: accent, opacity: active ? 1 : 0.48 }]} />
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
  brand: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20,
    letterSpacing: 1.2,
  },
  modePill: {
    minHeight: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  modeDot: { width: 4, height: 4, borderRadius: 2, marginRight: 7 },
  mode: { fontSize: 8.5, fontWeight: '800', letterSpacing: 2.2 },
  pageTitle: {
    color: '#FFFDFE',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 45,
    lineHeight: 46,
    letterSpacing: 0.2,
    marginTop: 17,
  },
  pageTitleCompact: { fontSize: 38, lineHeight: 40, marginTop: 12 },
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
