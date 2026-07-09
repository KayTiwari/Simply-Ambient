// Shared visual primitives for the More section: layered ambient surfaces
// instead of one flat navy screen. Every piece is static (no animation) so
// the section stays calm and cheap to render.
//
// AmbientPageShell  page backdrop: a soft accent wash from the top plus a
//                   faint violet depth layer near the bottom.
// GlowCard          a composed surface: hairline accent border over a quiet
//                   tinted gradient. Use for primary content, not for rows.
// EmptyStateCard    designed empty state: dim glyph, main line, quiet line.
// ActionPill        primary (filled) and ghost (outlined) actions that sit
//                   together in one row.
// PromptChip        a small starter-prompt pill for writing surfaces.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function AmbientPageShell({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[accent + '1C', accent + '08', 'transparent']}
        locations={[0, 0.45, 1]}
        style={styles.topWash}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', '#181236']}
        style={styles.bottomDepth}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function GlowCard({
  accent,
  style,
  children,
}: {
  accent: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.glowCard, { borderColor: accent + '30' }, style]}>
      <LinearGradient
        colors={[accent + '16', accent + '05', 'transparent']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
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
    <View style={styles.emptyCard}>
      <Text style={[styles.emptyGlyph, { color: accent + '77' }]}>{glyph}</Text>
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
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.pill,
        primary
          ? { backgroundColor: accent }
          : { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.pillText, primary ? { color: '#0B0B1F' } : { color: '#ffffffB0' }]}>
        {label}
      </Text>
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
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start with: ${label}`}
      style={[styles.chip, { borderColor: accent + '44', backgroundColor: accent + '12' }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  topWash: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 300,
  },
  bottomDepth: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
    opacity: 0.5,
  },

  glowCard: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28, paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  emptyGlyph: { fontSize: 30, marginBottom: 10 },
  emptyLine: { color: '#ffffffCC', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyHint: { color: '#ffffff77', fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 6 },

  pill: {
    paddingVertical: 13, paddingHorizontal: 22,
    borderRadius: 999, alignItems: 'center', justifyContent: 'center',
  },
  pillText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },

  chip: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1,
  },
  chipText: { color: '#ffffffCC', fontSize: 12.5, lineHeight: 17 },
});
