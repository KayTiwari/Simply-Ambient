// Visual primitives for the More section. They deliberately do more than
// tint controls: the shell creates atmosphere, cards establish depth, and
// actions/empty states carry the same tactile language across very different
// wellness tools.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function AmbientPageShell({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  const atmosphere = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(atmosphere, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [atmosphere]);

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={['#17182F', '#0C0D22', '#080919']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: atmosphere }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[accent + '42', accent + '12', 'transparent']}
          locations={[0, 0.5, 1]}
          start={{ x: 0.05, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.topAurora}
        />
        <LinearGradient
          colors={['#8F79D122', '#3C41790C', 'transparent']}
          style={styles.sideAura}
        />
        <View style={[styles.orbitLarge, { borderColor: accent + '17' }]} />
        <View style={[styles.orbitSmall, { borderColor: accent + '12' }]} />
        <View style={[styles.star, styles.starOne, { backgroundColor: accent + '99' }]} />
        <View style={[styles.star, styles.starTwo]} />
        <View style={[styles.star, styles.starThree, { backgroundColor: accent + '88' }]} />
        <LinearGradient
          colors={['transparent', '#15112B99']}
          style={styles.bottomDepth}
        />
      </Animated.View>
      {children}
    </View>
  );
}

export function GlowCard({
  accent,
  style,
  children,
  quiet = false,
}: {
  accent: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  quiet?: boolean;
}) {
  return (
    <View
      style={[
        styles.glowCard,
        quiet && styles.glowCardQuiet,
        { borderColor: accent + (quiet ? '24' : '48'), shadowColor: accent },
        style,
      ]}
    >
      <LinearGradient
        colors={
          quiet
            ? ['rgba(31,32,57,0.88)', accent + '0B', 'rgba(16,17,36,0.94)']
            : [accent + '29', 'rgba(35,36,63,0.96)', 'rgba(15,16,35,0.98)']
        }
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.cardAura, { backgroundColor: accent + '18' }]} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardHighlight}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function EmptyStateCard({
  glyph,
  accent,
  line,
  hint,
}: {
  glyph: string;
  accent: string;
  line: string;
  hint?: string;
}) {
  return (
    <View style={[styles.emptyCard, { borderColor: accent + '2E' }]}>
      <LinearGradient
        colors={[accent + '18', 'rgba(24,25,49,0.92)', 'rgba(14,15,33,0.96)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.emptyGlyphWrap, { borderColor: accent + '44', backgroundColor: accent + '14' }]}>
        <Text style={[styles.emptyGlyph, { color: accent }]}>{glyph}</Text>
      </View>
      <Text style={styles.emptyLine}>{line}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function ActionPill({
  label,
  accent,
  kind = 'primary',
  onPress,
  disabled = false,
}: {
  label: string;
  accent: string;
  kind?: 'primary' | 'ghost';
  onPress: () => void;
  disabled?: boolean;
}) {
  const primary = kind === 'primary';
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.pill,
        primary
          ? { backgroundColor: accent, borderColor: accent, shadowColor: accent }
          : { borderColor: 'rgba(255,255,255,0.20)', backgroundColor: 'rgba(255,255,255,0.035)' },
        disabled && styles.disabled,
      ]}
    >
      {primary ? <View style={styles.pillSheen} pointerEvents="none" /> : null}
      <Text
        numberOfLines={1}
        style={[styles.pillText, primary ? styles.pillTextPrimary : styles.pillTextGhost]}
      >
        {label}
      </Text>
      <Text style={[styles.pillArrow, primary ? styles.pillTextPrimary : styles.pillTextGhost]}>→</Text>
    </TouchableOpacity>
  );
}

export function PromptChip({
  label,
  accent,
  onPress,
}: {
  label: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start with: ${label}`}
      style={[styles.chip, { borderColor: accent + '4D', backgroundColor: accent + '13' }]}
    >
      <View style={[styles.chipDot, { backgroundColor: accent }]} />
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MoreSectionGroup({
  eyebrow,
  title,
  subtitle,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionGroup}>
      <View style={styles.sectionHeadingRow}>
        <View style={[styles.sectionMarker, { backgroundColor: accent }]} />
        <Text style={[styles.sectionEyebrow, { color: accent }]}>{eyebrow}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.sectionChildren}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#080919', overflow: 'hidden' },
  topAurora: {
    position: 'absolute', top: -80, left: -80, right: -40, height: 430,
    borderBottomRightRadius: 260,
  },
  sideAura: {
    position: 'absolute', top: 250, right: -150, width: 330, height: 520,
    borderRadius: 260, transform: [{ rotate: '-18deg' }], opacity: 0.8,
  },
  bottomDepth: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },
  orbitLarge: {
    position: 'absolute', width: 330, height: 330, borderRadius: 165,
    borderWidth: 1, top: -164, right: -142,
  },
  orbitSmall: {
    position: 'absolute', width: 170, height: 170, borderRadius: 85,
    borderWidth: 1, top: -52, right: -66,
  },
  star: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#ffffff77' },
  starOne: { top: 118, left: '11%' },
  starTwo: { top: 205, right: '22%' },
  starThree: { top: 430, left: '8%', width: 2, height: 2 },

  glowCard: {
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: '#18192F',
    overflow: 'hidden',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  glowCardQuiet: { shadowOpacity: 0.08, shadowRadius: 14 },
  cardAura: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    right: -62, top: -82,
  },
  cardHighlight: { position: 'absolute', top: 0, left: 22, right: 22, height: 1 },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: 30, paddingHorizontal: 24,
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyGlyphWrap: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyGlyph: { fontSize: 24 },
  emptyLine: {
    color: '#F7F4FF', fontSize: 16, fontWeight: '600',
    textAlign: 'center', lineHeight: 22,
  },
  emptyHint: {
    color: '#AAAABE', fontSize: 12.5, textAlign: 'center',
    lineHeight: 19, marginTop: 7, maxWidth: 280,
  },

  pill: {
    minHeight: 48,
    minWidth: 125,
    flexShrink: 1,
    paddingVertical: 12, paddingHorizontal: 9,
    borderRadius: 18, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  pillSheen: {
    position: 'absolute', left: 1, right: 1, top: 1, height: '47%',
    borderTopLeftRadius: 17, borderTopRightRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pillText: { fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  pillTextPrimary: { color: '#0B0B1F' },
  pillTextGhost: { color: '#DAD8E6' },
  pillArrow: { fontSize: 14, marginLeft: 5, marginTop: -1 },
  disabled: { opacity: 0.38, shadowOpacity: 0 },

  chip: {
    minHeight: 44,
    paddingVertical: 11, paddingHorizontal: 13,
    borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  chipDot: { width: 4, height: 4, borderRadius: 2, marginRight: 8, opacity: 0.8 },
  chipText: { color: '#D8D6E2', fontSize: 12, lineHeight: 17 },

  sectionGroup: { marginTop: 30 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionMarker: { width: 18, height: 2, borderRadius: 1, marginRight: 9 },
  sectionEyebrow: { fontSize: 9.5, fontWeight: '800', letterSpacing: 2.3 },
  sectionTitle: {
    color: '#FAF8FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25, lineHeight: 29, letterSpacing: 0.3,
  },
  sectionSubtitle: { color: '#9293A8', fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  sectionChildren: { marginTop: 13 },
});
