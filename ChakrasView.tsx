import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Wind, Flame, Mountains, type IconProps } from 'phosphor-react-native';

import type { Chakra, Dosha } from './App';

const DOSHA_ICONS: Record<Dosha['id'], React.ComponentType<IconProps>> = {
  vata: Wind,
  pitta: Flame,
  kapha: Mountains,
};

type Props = {
  chakras: Chakra[];
  doshas: Dosha[];
  activePresetId: string | null;
  onApplyChakra: (c: Chakra) => void;
  onApplyDosha: (d: Dosha) => void;
  toneIsPlaying: boolean;
  toneIsLoading: boolean;
  onTogglePlay: () => void;
  beatHz: number;
  bandColor: string;
  bandName: string;
};

export default function ChakrasView({
  chakras, doshas, activePresetId,
  onApplyChakra, onApplyDosha,
  toneIsPlaying, toneIsLoading, onTogglePlay,
  beatHz, bandName, bandColor,
}: Props) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Chakras</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>Seven gates of the body</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      <View style={styles.controlRow}>
        <View style={[styles.toneStrip, { flex: 1, marginHorizontal: 0 }]}>
          <View style={[styles.toneDot, { backgroundColor: bandColor, opacity: toneIsPlaying ? 1 : 0.4 }]} />
          <Text style={styles.toneText} numberOfLines={1}>
            <Text style={{ color: bandColor, fontWeight: '700' }}>{bandName}</Text>
            <Text style={{ color: '#ffffff99' }}> · {beatHz} Hz {toneIsPlaying ? '· playing' : ''}</Text>
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onTogglePlay}
          style={[styles.playBtn, { backgroundColor: toneIsPlaying ? '#fff' : bandColor }]}
        >
          {toneIsLoading ? (
            <ActivityIndicator color="#0B0B1F" />
          ) : (
            <Text style={styles.playBtnText}>{toneIsPlaying ? 'STOP' : 'PLAY'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>CHAKRAS</Text>
        <Text style={styles.sectionSub}>Seven energy gates of the body</Text>

        {chakras.map(c => {
          const active = activePresetId === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              activeOpacity={0.85}
              onPress={() => onApplyChakra(c)}
              style={[
                styles.card,
                {
                  borderColor: active ? c.color : c.color + '55',
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.symbolBox, { borderColor: c.color + '55' }]}>
                  <Text style={[styles.chakraSymbol, { color: c.color }]}>{c.symbol}</Text>
                  <Text style={styles.numText}>{c.number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{c.name}</Text>
                  <Text style={styles.sanskrit}>
                    {c.sanskrit}
                    <Text style={styles.sanskritMeaning}>  ·  {c.sanskritMeaning}</Text>
                  </Text>
                </View>
                <View style={styles.bijaBlock}>
                  <View style={[styles.bijaRule, { backgroundColor: c.color }]} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.bijaText, { color: c.color, textShadowColor: 'rgba(0,0,0,0.85)' }]}>
                      {c.bija}
                    </Text>
                    <Text style={[styles.bijaPronunciation, { color: c.color, textShadowColor: 'rgba(0,0,0,0.7)' }]}>
                      {c.bijaPronunciation}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{c.hz} Hz</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{c.element}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText} numberOfLines={1}>{c.location}</Text>
              </View>

              <Text style={[styles.affirmation, { color: c.color }]}>
                "{c.affirmation}"
              </Text>

              <Text style={[styles.governs, { color: c.color }]}>{c.governs}</Text>
              <Text style={styles.blocked}>Blocked: <Text style={{ color: '#ffffffaa' }}>{c.blocked}</Text></Text>

              <View style={styles.correspondenceRow}>
                <View style={styles.correspondenceCol}>
                  <Text style={styles.correspondenceLabel}>PLANETS</Text>
                  <Text style={[styles.correspondenceValue, { color: c.color }]}>{c.planets}</Text>
                </View>
                <View style={styles.correspondenceCol}>
                  <Text style={styles.correspondenceLabel}>GLAND</Text>
                  <Text style={[styles.correspondenceValue, { color: c.color }]}>{c.gland}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionLabel}>DOSHAS</Text>
          <Text style={styles.sectionSub}>Ayurvedic constitution · pick one to balance</Text>
        </View>

        {doshas.map(d => {
          const active = activePresetId === `dosha-${d.id}`;
          const DoshaIcon = DOSHA_ICONS[d.id];
          return (
            <TouchableOpacity
              key={d.id}
              activeOpacity={0.85}
              onPress={() => onApplyDosha(d)}
              style={[
                styles.doshaCard,
                {
                  borderColor: active ? d.color : d.color + '55',
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={[
                  styles.doshaIconWrap,
                  {
                    borderColor: d.color + '88',
                    shadowColor: d.color,
                  },
                ]}>
                  <View style={[styles.doshaIconInner, { backgroundColor: d.color + '14' }]} />
                  <DoshaIcon size={26} weight="fill" color={d.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.doshaName}>{d.name}</Text>
                  <Text style={[styles.metaText, { color: d.color }]}>{d.element}</Text>
                </View>
                <View style={styles.bijaBlock}>
                  <View style={[styles.bijaRule, { backgroundColor: d.color }]} />
                  <Text style={[styles.bijaText, { color: d.color, fontSize: 13, letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.85)' }]}>
                    {d.balanceHz} Hz
                  </Text>
                </View>
              </View>
              <Text style={styles.qualities}>{d.qualities}</Text>
              <Text style={styles.doshaDescription}>{d.description}</Text>
              <Text style={styles.balanceLine}>
                <Text style={{ color: '#ffffff99' }}>Balance with </Text>
                <Text style={{ color: d.color, fontWeight: '700' }}>{d.balanceTechnique}</Text>
                <Text style={{ color: '#ffffff99' }}> at </Text>
                <Text style={{ color: d.color, fontWeight: '700' }}>{d.balanceHz} Hz</Text>
              </Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.footnote}>
          Tap a chakra to tune both ears around its carrier frequency with a 6 Hz theta beat. Sit upright, place attention on the body location, and let the bija mantra arise inwardly.
        </Text>
      </ScrollView>
    </View>
  );
}

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
    letterSpacing: 4, textTransform: 'uppercase', marginTop: 2,
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
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
  },
  controlHint: {
    flex: 1,
    color: '#ffffff77',
    fontSize: 12,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
  playBtn: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    minWidth: 96,
  },
  playBtnText: {
    color: '#0B0B1F',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
  },

  card: {
    backgroundColor: 'rgba(11, 11, 31, 0.78)',
    borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  numAndDot: {
    width: 36, alignItems: 'center', marginRight: 12,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginBottom: 4 },
  numText: { color: '#ffffff66', fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  symbolBox: {
    width: 52, height: 52,
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: 'rgba(11, 11, 31, 0.85)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  chakraSymbol: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  sanskrit: {
    color: '#ffffff88',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 14,
    marginTop: 1,
  },
  bijaBlock: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 10,
  },
  bijaRule: {
    width: 1.5, height: 32, marginRight: 10,
    opacity: 0.85,
  },
  bijaText: {
    fontFamily: 'Cinzel_700Bold',
    fontSize: 19, letterSpacing: 3,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bijaPronunciation: {
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 15, letterSpacing: 0.4,
    marginTop: 2,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  metaText: { color: '#ffffffaa', fontSize: 11, letterSpacing: 0.3 },
  metaDot: { color: '#ffffff44', fontSize: 11, marginHorizontal: 6 },
  governs: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 },
  blocked: { color: '#ffffff66', fontSize: 11, fontStyle: 'italic' },

  sanskritMeaning: {
    color: '#ffffff66',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 13,
    fontWeight: '400',
  },
  affirmation: {
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 18,
    letterSpacing: 0.5,
    marginTop: 6, marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  correspondenceRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 18,
  },
  correspondenceCol: { flex: 1 },
  correspondenceLabel: {
    color: '#ffffff55',
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  correspondenceValue: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  sectionLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
    paddingHorizontal: 4, marginBottom: 4,
  },
  sectionSub: {
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    marginBottom: 10, paddingHorizontal: 4,
  },

  doshaCard: {
    backgroundColor: 'rgba(11, 11, 31, 0.78)',
    borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1,
  },
  doshaIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    marginRight: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, overflow: 'hidden',
    shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  doshaIconInner: { ...StyleSheet.absoluteFillObject },
  doshaName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  qualities: { color: '#ffffff88', fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  doshaDescription: { color: '#ffffff99', fontSize: 12, marginTop: 8, lineHeight: 18 },
  balanceLine: { fontSize: 12, marginTop: 8 },

  footnote: {
    color: '#ffffff66', fontSize: 12, textAlign: 'center',
    marginTop: 24, paddingHorizontal: 12, fontStyle: 'italic', lineHeight: 18,
  },

  todayCard: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 18, padding: 16, marginBottom: 18, borderWidth: 1,
  },
  todayLabel: {
    color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600',
    marginBottom: 8,
  },
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  todaySignName: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 26,
    letterSpacing: 1,
  },
  todayIntention: {
    color: '#ffffffcc', fontSize: 14, fontStyle: 'italic',
    marginTop: 12, lineHeight: 20,
  },
  horoscopeBox: {
    marginTop: 14,
    paddingLeft: 12,
    paddingVertical: 6,
    borderLeftWidth: 2,
  },
  horoscopeLabel: {
    color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600',
    marginBottom: 4,
  },
  horoscopeText: { color: '#ffffffcc', fontSize: 13, lineHeight: 19 },
  horoscopeFallback: { color: '#ffffffcc', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  horoscopeNote: { color: '#ffffff66', fontSize: 10, fontStyle: 'italic', marginTop: 6 },
  todayMoon: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  todayMoonGlyph: { color: '#ffffffcc', fontSize: 16, marginRight: 8 },
  todayMoonText: { color: '#ffffff99', fontSize: 12, letterSpacing: 0.5 },

  zodiacRow: { paddingRight: 12, paddingVertical: 4 },
  zodiacChip: {
    minWidth: 84,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
  },
  zGlyph: { fontSize: 26, lineHeight: 32 },
  zName: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 0.5 },
  zElement: { fontSize: 9, letterSpacing: 1, fontWeight: '600', marginTop: 2 },
});
