import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Wind, Flame, Mountains, type IconProps } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AmbientSurface,
  AmbientVeil,
  EditorialHeader,
  EditorialSection,
  StatusStrip,
} from './AmbientUI';
import type { Chakra, Dosha } from './lib/content';

const DOSHA_ICONS: Record<Dosha['id'], React.ComponentType<IconProps>> = {
  vata: Wind,
  pitta: Flame,
  kapha: Mountains,
};

// Every node keeps the same vertical footprint so the selection plate can
// travel on a stable track even on narrow phones. Copy is constrained to one
// line where needed; the 70pt row remains a comfortable touch target.
const SPECTRUM_ROW_HEIGHT = 70;
const SPECTRUM_PADDING_VERTICAL = 10;

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
  chakras,
  doshas,
  activePresetId,
  onApplyChakra,
  onApplyDosha,
  toneIsPlaying,
  toneIsLoading,
  onTogglePlay,
  beatHz,
  bandName,
  bandColor,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedChakraId, setSelectedChakraId] = useState(() => (
    chakras.find(chakra => chakra.id === activePresetId)?.id
      ?? chakras.find(chakra => chakra.name === 'Heart')?.id
      ?? chakras[0]?.id
      ?? ''
  ));
  const [reduceMotion, setReduceMotion] = useState(false);
  const spectrum = useMemo(() => [...chakras].reverse(), [chakras]);
  const selectedChakra = chakras.find(chakra => chakra.id === selectedChakraId)
    ?? chakras[0]
    ?? null;
  const selectedSpectrumIndex = Math.max(
    0,
    spectrum.findIndex(chakra => chakra.id === selectedChakra?.id),
  );
  const selectionOffset = useRef(
    new Animated.Value(selectedSpectrumIndex * SPECTRUM_ROW_HEIGHT),
  ).current;

  useEffect(() => {
    if (chakras.some(chakra => chakra.id === activePresetId)) {
      setSelectedChakraId(activePresetId ?? '');
    }
  }, [activePresetId, chakras]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const toValue = selectedSpectrumIndex * SPECTRUM_ROW_HEIGHT;
    selectionOffset.stopAnimation();

    if (reduceMotion) {
      selectionOffset.setValue(toValue);
      return;
    }

    Animated.spring(selectionOffset, {
      toValue,
      stiffness: 210,
      damping: 25,
      mass: 0.82,
      overshootClamping: false,
      restDisplacementThreshold: 0.25,
      restSpeedThreshold: 0.25,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, selectedSpectrumIndex, selectionOffset]);

  const selectChakra = (chakra: Chakra) => {
    setSelectedChakraId(chakra.id);
    onApplyChakra(chakra);
  };

  return (
    <AmbientVeil accent={bandColor} strength="light" active={toneIsPlaying} motionHz={beatHz}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <EditorialHeader
          mode="ALIGN"
          title="Move through the spectrum"
          accent={bandColor}
        />

        <View style={styles.body}>
          <AmbientSurface accent={bandColor} style={styles.toneConsole}>
            <View style={styles.consoleTopRow}>
              <Text style={styles.consoleEyebrow}>CURRENT TONE</Text>
              <StatusStrip
                accent={bandColor}
                label={toneIsPlaying ? 'LISTENING' : 'READY'}
                detail={bandName}
                active={toneIsPlaying}
                pulse={toneIsPlaying}
              />
            </View>

            <View style={styles.consoleMainRow}>
              <View style={styles.frequencyBlock}>
                <View style={styles.frequencyLine}>
                  <Text style={styles.frequencyValue}>{beatHz}</Text>
                  <Text style={[styles.frequencyUnit, { color: bandColor }]}>Hz</Text>
                </View>
                <Text style={styles.frequencyCaption}>
                  {toneIsPlaying ? 'The selected tone is playing' : 'Choose a center below, then begin'}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={toneIsPlaying ? 'Stop chakra tone' : 'Play chakra tone'}
                accessibilityState={{ disabled: toneIsLoading }}
                disabled={toneIsLoading}
                onPress={onTogglePlay}
                style={[
                  styles.playButton,
                  {
                    backgroundColor: toneIsPlaying ? '#F8F5FF' : bandColor,
                    shadowColor: bandColor,
                    opacity: toneIsLoading ? 0.68 : 1,
                  },
                ]}
              >
                {toneIsLoading ? (
                  <ActivityIndicator color="#0B0B1F" size="small" />
                ) : (
                  <>
                    <View style={toneIsPlaying ? styles.stopGlyph : styles.playGlyph} />
                    <Text style={styles.playButtonText}>{toneIsPlaying ? 'STOP' : 'BEGIN'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </AmbientSurface>

          <EditorialSection
            index="01"
            eyebrow="CHAKRA MAP"
            title="Seven centers, one listening path"
            subtitle="Tap any point to tune the tone and open its correspondences."
            accent={bandColor}
          />

          <AmbientSurface accent={bandColor} quiet style={styles.spectrumSurface}>
            <View style={styles.spectrumLine} pointerEvents="none" />
            {selectedChakra ? (
              <Animated.View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={[
                  styles.spectrumSelection,
                  {
                    backgroundColor: selectedChakra.color + '14',
                    borderColor: selectedChakra.color + '4D',
                    shadowColor: selectedChakra.color,
                    transform: [{ translateY: selectionOffset }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.selectionAccent,
                    { backgroundColor: selectedChakra.color },
                  ]}
                />
                <View
                  style={[
                    styles.selectionNodeRing,
                    { borderColor: selectedChakra.color + 'B8' },
                  ]}
                />
                <View
                  style={[
                    styles.selectionGlow,
                    { backgroundColor: selectedChakra.color + '18' },
                  ]}
                />
              </Animated.View>
            ) : null}
            {spectrum.map(chakra => {
              const selected = chakra.id === selectedChakra?.id;
              const active = chakra.id === activePresetId;

              return (
                <TouchableOpacity
                  key={chakra.id}
                  activeOpacity={0.76}
                  accessibilityRole="button"
                  accessibilityLabel={`${chakra.name} chakra, ${chakra.hz} hertz, ${chakra.location}`}
                  accessibilityHint="Tunes the tone and opens this center's details"
                  accessibilityState={{ selected }}
                  onPress={() => selectChakra(chakra)}
                  style={styles.spectrumRow}
                >
                  <View style={styles.nodeColumn}>
                    <View style={styles.nodeHalo}>
                      <View style={[styles.node, { backgroundColor: chakra.color }]} />
                    </View>
                  </View>

                  <View style={styles.spectrumCopy}>
                    <View style={styles.spectrumNameRow}>
                      <Text style={[styles.spectrumIndex, { color: chakra.color }]}>
                        {String(chakra.number).padStart(2, '0')}
                      </Text>
                      <Text style={styles.spectrumName} numberOfLines={1}>{chakra.name}</Text>
                      {active ? (
                        <View style={[styles.tunedPill, { borderColor: chakra.color + '66' }]}>
                          <Text style={[styles.tunedText, { color: chakra.color }]}>TUNED</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.spectrumMeta} numberOfLines={1}>
                      {chakra.sanskrit} · {chakra.location}
                    </Text>
                  </View>

                  <View style={styles.hzBlock}>
                    <Text style={[styles.hzValue, { color: chakra.color }]}>{chakra.hz}</Text>
                    <Text style={styles.hzUnit}>HZ</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </AmbientSurface>

          {selectedChakra ? (
            <AmbientSurface
              accent={selectedChakra.color}
              style={[styles.readingCard, { borderColor: selectedChakra.color + '55' }]}
            >
              <Text
                style={[styles.symbolWatermark, { color: selectedChakra.color + '18' }]}
                pointerEvents="none"
              >
                {selectedChakra.symbol}
              </Text>

              <View style={styles.readingTopRow}>
                <View style={[styles.symbolMedallion, { borderColor: selectedChakra.color + '70' }]}>
                  <Text style={[styles.symbol, { color: selectedChakra.color }]}>
                    {selectedChakra.symbol}
                  </Text>
                </View>
                <View style={styles.readingHeading}>
                  <Text style={[styles.readingEyebrow, { color: selectedChakra.color }]}>
                    CENTER {String(selectedChakra.number).padStart(2, '0')} · {selectedChakra.element.toUpperCase()}
                  </Text>
                  <Text style={styles.readingTitle}>{selectedChakra.name}</Text>
                  <Text style={styles.sanskritLine}>
                    {selectedChakra.sanskrit} · {selectedChakra.sanskritMeaning}
                  </Text>
                </View>
              </View>

              <View style={[styles.mantraPanel, { borderColor: selectedChakra.color + '38' }]}>
                <View>
                  <Text style={styles.microLabel}>AFFIRMATION</Text>
                  <Text style={[styles.affirmation, { color: selectedChakra.color }]}>
                    “{selectedChakra.affirmation}”
                  </Text>
                </View>
                <View style={styles.mantraRule} />
                <View style={styles.bijaColumn}>
                  <Text style={styles.microLabel}>BIJA</Text>
                  <Text style={[styles.bija, { color: selectedChakra.color }]}>
                    {selectedChakra.bija}
                  </Text>
                  <Text style={styles.pronunciation}>{selectedChakra.bijaPronunciation}</Text>
                </View>
              </View>

              <View style={styles.detailPair}>
                <View style={styles.detailColumn}>
                  <Text style={styles.microLabel}>ASSOCIATED WITH</Text>
                  <Text style={styles.detailValue}>{selectedChakra.governs}</Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.microLabel}>WHEN CONSTRICTED</Text>
                  <Text style={styles.detailValue}>{selectedChakra.blocked}</Text>
                </View>
              </View>

              <View style={styles.correspondenceGrid}>
                <View style={styles.correspondenceCell}>
                  <Text style={styles.microLabel}>LOCATION</Text>
                  <Text style={[styles.correspondenceValue, { color: selectedChakra.color }]}>
                    {selectedChakra.location}
                  </Text>
                </View>
                <View style={styles.correspondenceCell}>
                  <Text style={styles.microLabel}>PLANETARY</Text>
                  <Text style={[styles.correspondenceValue, { color: selectedChakra.color }]}>
                    {selectedChakra.planets}
                  </Text>
                </View>
                <View style={styles.correspondenceCell}>
                  <Text style={styles.microLabel}>GLAND</Text>
                  <Text style={[styles.correspondenceValue, { color: selectedChakra.color }]}>
                    {selectedChakra.gland}
                  </Text>
                </View>
              </View>

              <Text style={styles.contextNote}>
                These contemplative correspondences come from varied modern and traditional lineages; use them as a reflective map, not medical guidance.
              </Text>
            </AmbientSurface>
          ) : null}

          <View style={styles.exploreDivider} />

          <EditorialSection
            index="02"
            eyebrow="EXPLORE"
            title="Ayurvedic constitutions"
            accent={bandColor}
          />

          <View style={styles.doshaStack}>
            {doshas.map(dosha => {
              const active = activePresetId === `dosha-${dosha.id}`;
              const DoshaIcon = DOSHA_ICONS[dosha.id];

              return (
                <TouchableOpacity
                  key={dosha.id}
                  activeOpacity={0.78}
                  accessibilityRole="button"
                  accessibilityLabel={`${dosha.name} dosha, ${dosha.element}, balance at ${dosha.balanceHz} hertz`}
                  accessibilityHint="Applies this dosha balancing tone"
                  accessibilityState={{ selected: active }}
                  onPress={() => onApplyDosha(dosha)}
                  style={styles.doshaTouch}
                >
                  <AmbientSurface
                    accent={dosha.color}
                    quiet
                    style={[
                      styles.doshaCard,
                      active && { borderColor: dosha.color + '88' },
                    ]}
                  >
                    <View style={styles.doshaTopRow}>
                      <View
                        style={[
                          styles.doshaIcon,
                          {
                            borderColor: dosha.color + '66',
                            backgroundColor: dosha.color + '12',
                          },
                        ]}
                      >
                        <DoshaIcon size={25} weight="fill" color={dosha.color} />
                      </View>

                      <View style={styles.doshaHeading}>
                        <Text style={[styles.doshaEyebrow, { color: dosha.color }]}>
                          {dosha.element.toUpperCase()}
                        </Text>
                        <Text style={styles.doshaName}>{dosha.name}</Text>
                      </View>

                      <View style={[styles.doshaHz, { borderColor: dosha.color + '44' }]}>
                        <Text style={[styles.doshaHzValue, { color: dosha.color }]}>
                          {dosha.balanceHz}
                        </Text>
                        <Text style={styles.doshaHzUnit}>HZ</Text>
                      </View>
                    </View>

                    <Text style={styles.qualities}>{dosha.qualities}</Text>
                    <Text style={styles.doshaDescription}>{dosha.description}</Text>

                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>BALANCING PRACTICE</Text>
                      <Text style={[styles.balanceTechnique, { color: dosha.color }]}>
                        {dosha.balanceTechnique}  →
                      </Text>
                    </View>

                    {active ? (
                      <View style={[styles.activeDoshaRule, { backgroundColor: dosha.color }]} />
                    ) : null}
                  </AmbientSurface>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.footerNote}>
            Sound settings are for personal reflection and relaxation. Listen at a comfortable volume.
          </Text>
        </View>
      </ScrollView>
    </AmbientVeil>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  body: { paddingHorizontal: 20 },

  toneConsole: { padding: 16, marginBottom: 2 },
  consoleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  consoleEyebrow: {
    color: '#A9A7B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.1,
  },
  consoleMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 17,
    gap: 14,
  },
  frequencyBlock: { flex: 1 },
  frequencyLine: { flexDirection: 'row', alignItems: 'baseline' },
  frequencyValue: {
    color: '#FCFAFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 42,
    lineHeight: 42,
    letterSpacing: -0.6,
  },
  frequencyUnit: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginLeft: 7,
  },
  frequencyCaption: { color: '#A6A4B4', fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  playButton: {
    minWidth: 106,
    minHeight: 50,
    borderRadius: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  playButtonText: {
    color: '#0A0B1E',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  playGlyph: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#0A0B1E',
    marginRight: 9,
  },
  stopGlyph: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#0A0B1E',
    marginRight: 9,
  },

  spectrumSurface: {
    paddingVertical: SPECTRUM_PADDING_VERTICAL,
    paddingHorizontal: 10,
  },
  spectrumLine: {
    position: 'absolute',
    top: SPECTRUM_PADDING_VERTICAL + SPECTRUM_ROW_HEIGHT / 2,
    bottom: SPECTRUM_PADDING_VERTICAL + SPECTRUM_ROW_HEIGHT / 2,
    left: 37,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  spectrumSelection: {
    position: 'absolute',
    top: SPECTRUM_PADDING_VERTICAL + 2,
    left: 10,
    right: 10,
    height: SPECTRUM_ROW_HEIGHT - 4,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.17,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  selectionAccent: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  selectionNodeRing: {
    position: 'absolute',
    left: 12,
    top: (SPECTRUM_ROW_HEIGHT - 34) / 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  selectionGlow: {
    position: 'absolute',
    right: -34,
    top: -47,
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  spectrumRow: {
    zIndex: 1,
    height: SPECTRUM_ROW_HEIGHT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  nodeColumn: { width: 34, alignItems: 'center', marginRight: 10 },
  nodeHalo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(11,12,31,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.38,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  node: { width: 8, height: 8, borderRadius: 4 },
  spectrumCopy: { flex: 1, minWidth: 0 },
  spectrumNameRow: { flexDirection: 'row', alignItems: 'center' },
  spectrumIndex: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginRight: 8 },
  spectrumName: { color: '#F8F6FC', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  spectrumMeta: { color: '#9997AA', fontSize: 10.5, marginTop: 4 },
  tunedPill: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tunedText: { fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  hzBlock: { minWidth: 44, alignItems: 'flex-end', marginLeft: 8 },
  hzValue: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18,
    lineHeight: 19,
  },
  hzUnit: { color: '#777586', fontSize: 7, fontWeight: '800', letterSpacing: 1.2 },

  readingCard: { marginTop: 14, padding: 19 },
  symbolWatermark: {
    position: 'absolute',
    right: -16,
    top: 40,
    fontSize: 148,
    lineHeight: 160,
    fontWeight: '600',
  },
  readingTopRow: { flexDirection: 'row', alignItems: 'center' },
  symbolMedallion: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  symbol: { fontSize: 29, lineHeight: 34, fontWeight: '500' },
  readingHeading: { flex: 1 },
  readingEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.7 },
  readingTitle: {
    color: '#FCFAFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 30,
    lineHeight: 31,
    marginTop: 3,
  },
  sanskritLine: {
    color: '#B1AFBE',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 13,
    marginTop: 2,
  },
  mantraPanel: {
    borderWidth: 1,
    borderRadius: 19,
    backgroundColor: 'rgba(8,9,25,0.31)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginTop: 18,
  },
  microLabel: { color: '#777586', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.5 },
  affirmation: {
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 23,
    lineHeight: 26,
    marginTop: 3,
  },
  mantraRule: { width: 1, height: 38, backgroundColor: 'rgba(255,255,255,0.11)' },
  bijaColumn: { alignItems: 'flex-end' },
  bija: { fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 2.5, marginTop: 2 },
  pronunciation: {
    color: '#9F9DAF',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 13,
    marginTop: 1,
  },
  detailPair: { flexDirection: 'row', gap: 16, marginTop: 17 },
  detailColumn: { flex: 1 },
  detailValue: { color: '#C8C5D1', fontSize: 10.5, lineHeight: 16, marginTop: 5 },
  correspondenceGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
    marginTop: 17,
    paddingTop: 14,
    gap: 12,
  },
  correspondenceCell: { flex: 1 },
  correspondenceValue: { fontSize: 10.5, lineHeight: 15, fontWeight: '600', marginTop: 4 },
  contextNote: { color: '#777586', fontSize: 9, lineHeight: 14, marginTop: 17 },

  exploreDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginTop: 28,
    marginBottom: -10,
  },
  doshaStack: { gap: 11 },
  doshaTouch: { borderRadius: 26 },
  doshaCard: { padding: 17 },
  doshaTopRow: { flexDirection: 'row', alignItems: 'center' },
  doshaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  doshaHeading: { flex: 1 },
  doshaEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  doshaName: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25,
    lineHeight: 27,
    marginTop: 1,
  },
  doshaHz: {
    minWidth: 56,
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,9,25,0.31)',
  },
  doshaHzValue: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  doshaHzUnit: { color: '#777586', fontSize: 6.5, fontWeight: '900', letterSpacing: 1.2 },
  qualities: { color: '#A4A2B2', fontSize: 10.5, letterSpacing: 0.5, marginTop: 13 },
  doshaDescription: { color: '#C0BECA', fontSize: 11, lineHeight: 17, marginTop: 7 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 13,
    paddingTop: 12,
    gap: 10,
  },
  balanceLabel: { color: '#777586', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.3 },
  balanceTechnique: { fontSize: 10.5, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  activeDoshaRule: { height: 2, borderRadius: 1, marginTop: 13 },
  footerNote: {
    color: '#6F6D7D',
    fontSize: 9.5,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 22,
    marginTop: 23,
  },
});
