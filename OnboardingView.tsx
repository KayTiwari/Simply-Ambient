import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Intent = 'sleep' | 'focus' | 'calm' | 'energy';

const INTENTS: Array<{ id: Intent; label: string; glyph: string; color: string; blurb: string }> = [
  { id: 'sleep',  label: 'Sleep',  glyph: '☾', color: '#5B6CFF', blurb: 'Wind down. Slow the body.' },
  { id: 'focus',  label: 'Focus',  glyph: '◉', color: '#5BD0FF', blurb: 'Clear the mind. Sharpen attention.' },
  { id: 'calm',   label: 'Calm',   glyph: '○', color: '#9affc8', blurb: 'Soften. Return to centre.' },
  { id: 'energy', label: 'Energy', glyph: '✦', color: '#FFB05B', blurb: 'Activate. Build inner heat.' },
];

const RECS: Record<Intent, {
  preset: { name: string; tab: string; reason: string };
  breath: { name: string; reason: string };
  chakra: { name: string; reason: string };
}> = {
  sleep: {
    preset: { name: 'Delta · 2 Hz', tab: 'Frequencies', reason: 'Deep restorative range.' },
    breath: { name: '4-7-8', reason: 'Drops the nervous system toward sleep.' },
    chakra: { name: 'Root (LAM)', reason: 'Grounded, safe, settled.' },
  },
  focus: {
    preset: { name: 'Beta · 18 Hz', tab: 'Frequencies', reason: 'Active, alert state.' },
    breath: { name: 'Box Breathing', reason: 'Steady the nervous system, sharpen attention.' },
    chakra: { name: 'Third Eye (OM)', reason: 'Insight and inner vision.' },
  },
  calm: {
    preset: { name: 'Alpha · 10 Hz', tab: 'Frequencies', reason: 'Relaxed alertness.' },
    breath: { name: 'Coherent (5·5)', reason: 'Optimises heart-rate variability.' },
    chakra: { name: 'Heart (YAM)', reason: 'Open, soft, connected.' },
  },
  energy: {
    preset: { name: 'Gamma · 40 Hz', tab: 'Frequencies', reason: 'Peak cognition and warmth.' },
    breath: { name: 'Bhastrika (Bellows)', reason: 'Rapid breath builds heat and clarity.' },
    chakra: { name: 'Solar Plexus (RAM)', reason: 'Will, vitality, inner fire.' },
  },
};

export default function OnboardingView({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  function transition(next: 0 | 1 | 2) {
    Animated.timing(fade, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(() => {
        setStep(next);
        Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }

  const rec = intent ? RECS[intent] : null;
  const intentMeta = intent ? INTENTS.find(i => i.id === intent) : null;

  return (
    <View style={styles.root}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        {step === 0 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.center}>
              <View style={styles.enso} />
              <Text style={styles.title}>Simply Ambient</Text>
              <Text style={styles.tagline}>Your spiritual center.</Text>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.subtitle}>welcome</Text>
                <View style={styles.dividerLine} />
              </View>
              <Text style={styles.intro}>
                Binaural frequencies, breath techniques, chakras, horoscopes,
                and a small set of grounded daily tools.{'\n\n'}
                Use stereo headphones for the binaural effect to land.
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={() => transition(1)}>
              <Text style={styles.primaryBtnText}>BEGIN</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 1 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.smallTitle}>What brings you here?</Text>
            <Text style={styles.smallSub}>Pick one — you can always switch.</Text>
            <View style={{ marginTop: 18 }}>
              {INTENTS.map(it => {
                const active = intent === it.id;
                return (
                  <TouchableOpacity
                    key={it.id}
                    activeOpacity={0.85}
                    onPress={() => { setIntent(it.id); }}
                    style={[
                      styles.intentCard,
                      {
                        borderColor: active ? it.color : it.color + '55',
                        backgroundColor: active ? it.color + '22' : 'rgba(0,0,0,0.30)',
                      },
                    ]}
                  >
                    <Text style={[styles.intentGlyph, { color: it.color }]}>{it.glyph}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.intentLabel}>{it.label}</Text>
                      <Text style={styles.intentBlurb}>{it.blurb}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.primaryBtn, !intent && { opacity: 0.4 }]}
              disabled={!intent}
              onPress={() => transition(2)}
            >
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDone} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 2 && rec && intentMeta && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.center}>
              <Text style={[styles.intentGlyph, { color: intentMeta.color, fontSize: 48, marginBottom: 8 }]}>{intentMeta.glyph}</Text>
              <Text style={styles.smallTitle}>For {intentMeta.label.toLowerCase()}, try</Text>
              <Text style={styles.smallSub}>{intentMeta.blurb}</Text>
            </View>
            <View style={{ marginTop: 22 }}>
              <RecRow
                label="FREQUENCY"
                title={rec.preset.name}
                where={`Frequencies tab`}
                reason={rec.preset.reason}
                color="#5BD0FF"
              />
              <RecRow
                label="BREATH"
                title={rec.breath.name}
                where={`Breath tab`}
                reason={rec.breath.reason}
                color="#9affc8"
              />
              <RecRow
                label="CHAKRA"
                title={rec.chakra.name}
                where={`Chakras tab`}
                reason={rec.chakra.reason}
                color={intentMeta.color}
              />
            </View>
            <Text style={styles.outro}>
              Everything else — horoscopes, mood, gratitude, grounding — is on the
              Horoscopes and More tabs.
            </Text>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={onDone}>
              <Text style={styles.primaryBtnText}>ENTER</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

function RecRow({
  label, title, where, reason, color,
}: {
  label: string; title: string; where: string; reason: string; color: string;
}) {
  return (
    <View style={[styles.recRow, { borderColor: color + '55' }]}>
      <Text style={[styles.recLabel, { color }]}>{label}</Text>
      <Text style={styles.recTitle}>{title}</Text>
      <Text style={styles.recReason}>{reason}</Text>
      <Text style={styles.recWhere}>{where}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B1F' },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40 },
  center: { alignItems: 'center', marginBottom: 24 },
  enso: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
    marginBottom: 18,
    transform: [{ rotate: '-18deg' }],
  },
  title: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 44, letterSpacing: 2.5,
    textAlign: 'center',
  },
  tagline: {
    color: '#ffffffcc',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 17, letterSpacing: 1,
    textAlign: 'center', marginTop: 6,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  dividerLine: { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  subtitle: {
    color: '#ffffffaa', fontSize: 10, letterSpacing: 4,
    marginHorizontal: 14, fontStyle: 'italic',
  },
  intro: {
    color: '#ffffffcc', fontSize: 14, lineHeight: 22,
    textAlign: 'center', marginTop: 22, paddingHorizontal: 8,
  },

  smallTitle: {
    color: '#fff', fontSize: 22,
    fontFamily: 'CormorantGaramond_500Medium',
    letterSpacing: 0.5, textAlign: 'center',
  },
  smallSub: { color: '#ffffff99', fontSize: 13, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },

  intentCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1,
  },
  intentGlyph: { fontSize: 28, width: 48, textAlign: 'center', marginRight: 8 },
  intentLabel: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: 0.5 },
  intentBlurb: { color: '#ffffff99', fontSize: 12, marginTop: 2 },

  recRow: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  recLabel: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  recTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  recReason: { color: '#ffffffaa', fontSize: 12, marginTop: 4, lineHeight: 17 },
  recWhere: { color: '#ffffff66', fontSize: 11, marginTop: 6, fontStyle: 'italic' },

  outro: {
    color: '#ffffff88', fontSize: 12, lineHeight: 18,
    textAlign: 'center', marginTop: 18, paddingHorizontal: 12,
  },

  primaryBtn: {
    paddingVertical: 16, borderRadius: 999,
    backgroundColor: '#fff', alignItems: 'center',
    marginTop: 24,
  },
  primaryBtnText: { color: '#0B0B1F', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  skipBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  skipText: { color: '#ffffff88', fontSize: 12, letterSpacing: 1 },
});
