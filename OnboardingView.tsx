import React, { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';

const STORAGE_PROFILE = '@simply_ambient_profile_v1';

type Intent = 'sleep' | 'focus' | 'calm' | 'energy';

const INTENTS: Array<{ id: Intent; label: string; glyph: string; color: string; blurb: string }> = [
  { id: 'sleep',  label: 'Sleep',  glyph: '☾', color: '#8F97DE', blurb: 'Wind down. Slow the body.' },
  { id: 'focus',  label: 'Focus',  glyph: '◉', color: '#8FB8DE', blurb: 'Clear the mind. Sharpen attention.' },
  { id: 'calm',   label: 'Calm',   glyph: '○', color: '#9DC7AC', blurb: 'Soften. Return to centre.' },
  { id: 'energy', label: 'Energy', glyph: '✦', color: '#E0A470', blurb: 'Activate. Build inner heat.' },
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

type Step = 0 | 1 | 2 | 3 | 4 | 5;

// The walkthrough is a sequence, replay-aware: a returning user replaying it
// from Settings skips the legal step (already agreed) and the profile step
// (already stored), keeping the replay purely about learning the app.
const FIRST_RUN_STEPS: Step[] = [0, 1, 2, 3, 4, 5];
const REPLAY_STEPS: Step[] = [0, 2, 4, 5];

// Practical tips that the guided part of the flow doesn't teach.
const TIPS: Array<{ label: string; body: string; color: string }> = [
  {
    label: 'SOUNDSCAPES',
    body: 'Layer rain, ocean, forest, or fire under any frequency. Find them under More, or in the mini player while a tone plays.',
    color: '#8FB8DE',
  },
  {
    label: 'SLEEP TIMER',
    body: 'On the Frequencies tab, just below Play. The audio fades out gently on its own, so you can drift off.',
    color: '#8F97DE',
  },
  {
    label: 'YOUR OWN MIX',
    body: 'Tune each ear separately, or tap a displayed Hz to type an exact value. Save any combination as a preset with the save button.',
    color: '#9DC7AC',
  },
  {
    label: 'MAKE IT YOURS',
    body: 'More → Settings pins the background to a single calm color. You can replay this walkthrough from there any time.',
    color: '#E0A470',
  },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CURRENT_YEAR = new Date().getFullYear();
// Years newest-first so common adult birth years are near the top of the list.
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1920 + 1 }, (_, i) => CURRENT_YEAR - i);

function daysInMonth(monthIndex: number, year: number): number {
  // monthIndex is 0-based. Day 0 of next month = last day of this month.
  if (monthIndex < 0) return 31;
  return new Date(year || 2000, monthIndex + 1, 0).getDate();
}

export default function OnboardingView({
  onDone,
  isReplay = false,
}: {
  onDone: () => void;
  isReplay?: boolean;
}) {
  const steps = isReplay ? REPLAY_STEPS : FIRST_RUN_STEPS;
  const [step, setStep] = useState<Step>(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [name, setName] = useState('');
  // Birth date as three independent selections; -1 / 0 mean "not picked".
  const [birthMonth, setBirthMonth] = useState<number>(-1); // 0-based, -1 = unset
  const [birthDay, setBirthDay] = useState<number>(0);      // 1-31, 0 = unset
  const [birthYear, setBirthYear] = useState<number>(0);    // full year, 0 = unset
  const fade = useRef(new Animated.Value(1)).current;

  const birthDayMax = daysInMonth(birthMonth, birthYear);

  function persistProfileAndDone() {
    const profile: Record<string, string> = {};
    if (name.trim()) profile.name = name.trim();
    // Only store a birth date when all three parts are chosen.
    if (birthMonth >= 0 && birthDay > 0 && birthYear > 0) {
      const mm = String(birthMonth + 1).padStart(2, '0');
      const dd = String(Math.min(birthDay, birthDayMax)).padStart(2, '0');
      profile.birthDate = `${birthYear}-${mm}-${dd}`;
    }
    if (Object.keys(profile).length > 0) {
      AsyncStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile)).catch(() => {});
    }
    onDone();
  }

  function transition(next: Step) {
    Animated.timing(fade, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      .start(() => {
        setStep(next);
        Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }

  // Advance along the active sequence, so replay mode skips the right steps.
  function goNext() {
    const idx = steps.indexOf(step);
    const next = steps[idx + 1];
    if (next === undefined) persistProfileAndDone();
    else transition(next);
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
                You'll need stereo headphones or earbuds to experience binaural
                frequencies. The effect only works when each ear hears its own tone.
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>BEGIN</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 1 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.smallTitle}>Before you begin</Text>
            <Text style={styles.smallSub}>Read this once. It applies to the whole app.</Text>

            <View style={styles.safetySection}>
              <Text style={styles.safetyLabel}>HEARING SAFETY</Text>
              <Text style={styles.safetyBody}>
                Always start at low volume and raise gradually only if needed. If a tone
                feels piercing or sharp, stop immediately. Sustained loud headphone
                listening can damage hearing at any frequency.
              </Text>
            </View>

            <View style={styles.safetySection}>
              <Text style={styles.safetyLabel}>NOT MEDICAL ADVICE</Text>
              <Text style={styles.safetyBody}>
                Simply Ambient is a wellness tool, not a medical device. Frequencies,
                breathwork, chakras, horoscopes, and AI reflections are for contemplative
                use only. They do not diagnose, treat, cure, or prevent any condition,
                and they are not a substitute for professional care.
              </Text>
            </View>

            <View style={styles.safetySection}>
              <Text style={styles.safetyLabel}>WHEN NOT TO USE</Text>
              <Text style={styles.safetyBody}>
                Do not use while driving or operating machinery. Consult a physician first
                if you are pregnant, have a pacemaker, history of seizures or epilepsy, a
                heart condition, or are prone to dissociation. Stop and seek care if you
                feel dizzy, nauseous, panicked, or hear ringing.
              </Text>
            </View>

            <View style={styles.safetySection}>
              <Text style={styles.safetyLabel}>YOUR DATA</Text>
              <Text style={styles.safetyBody}>
                Everything you enter (profile, mood, gratitude, rants, manifestations) is
                stored only on this device. Nothing leaves the app unless you explicitly
                tap an analyse button on the AI Insights page, which sends only the data
                sources you toggle on to Google Gemini using your own API key.
              </Text>
            </View>

            <Text style={styles.safetyAck}>
              By tapping "I agree" you accept these terms and acknowledge that use is at
              your own risk. The full notice is available any time under More → Safety
              & Disclaimer.
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>I AGREE & CONTINUE</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 2 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.smallTitle}>What brings you here?</Text>
            <Text style={styles.smallSub}>Pick one. You can always switch.</Text>
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
              onPress={goNext}
            >
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDone} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip the rest</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 3 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.smallTitle}>A little about you</Text>
            <Text style={styles.smallSub}>
              Optional. Stored only on this device. Used to personalize horoscopes and
              AI reflections.
            </Text>

            <View style={{ marginTop: 22 }}>
              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="What should we call you?"
                placeholderTextColor="#ffffff55"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                maxLength={60}
              />

              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>BIRTH DATE</Text>
              <Text style={styles.fieldHint}>Used to suggest your zodiac sign</Text>
              <View style={styles.dateRow}>
                <View style={[styles.datePickerWrap, { flex: 1.4 }]}>
                  <Picker
                    selectedValue={birthMonth}
                    onValueChange={(v) => {
                      const m = Number(v);
                      setBirthMonth(m);
                      // Keep the picked day valid for the new month (e.g. 31st -> 30).
                      setBirthDay(d => Math.min(d, daysInMonth(m, birthYear)));
                    }}
                    dropdownIconColor="#ffffff99"
                    style={styles.datePicker}
                  >
                    <Picker.Item label="Month" value={-1} color="#999" />
                    {MONTHS.map((m, i) => (
                      <Picker.Item key={m} label={m} value={i} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.datePickerWrap, { flex: 0.8 }]}>
                  <Picker
                    selectedValue={birthDay}
                    onValueChange={(v) => setBirthDay(Number(v))}
                    dropdownIconColor="#ffffff99"
                    style={styles.datePicker}
                  >
                    <Picker.Item label="Day" value={0} color="#999" />
                    {Array.from({ length: birthDayMax }, (_, i) => i + 1).map((d) => (
                      <Picker.Item key={d} label={String(d)} value={d} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.datePickerWrap, { flex: 1 }]}>
                  <Picker
                    selectedValue={birthYear}
                    onValueChange={(v) => {
                      const y = Number(v);
                      setBirthYear(y);
                      // Keep the picked day valid for the new year (Feb 29 -> 28).
                      setBirthDay(d => Math.min(d, daysInMonth(birthMonth, y)));
                    }}
                    dropdownIconColor="#ffffff99"
                    style={styles.datePicker}
                  >
                    <Picker.Item label="Year" value={0} color="#999" />
                    {BIRTH_YEARS.map((y) => (
                      <Picker.Item key={y} label={String(y)} value={y} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            <Text style={[styles.smallSub, { marginTop: 18 }]}>
              You can fill more (birth time, location, MBTI) later under More → Profile.
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 4 && rec && intentMeta && (
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
                color="#8FB8DE"
              />
              <RecRow
                label="BREATH"
                title={rec.breath.name}
                where={`Breath tab`}
                reason={rec.breath.reason}
                color="#9DC7AC"
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
              Horoscopes, mood, gratitude, and grounding live on the Horoscopes
              and More tabs.
            </Text>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Defensive fallback: if step 4 is reached without an intent picked
            (shouldn't happen, but state could desync), continue to the tips. */}
        {step === 4 && (!rec || !intentMeta) && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.center}>
              <Text style={styles.smallTitle}>You're all set</Text>
              <Text style={styles.smallSub}>Everything is on the tabs at the bottom.</Text>
            </View>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 5 && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.smallTitle}>Good to know</Text>
            <Text style={styles.smallSub}>Four small things people find later. Now you won't have to.</Text>
            <View style={{ marginTop: 10 }}>
              {TIPS.map(tip => (
                <View key={tip.label} style={[styles.recRow, { borderColor: tip.color + '55' }]}>
                  <Text style={[styles.recLabel, { color: tip.color }]}>{tip.label}</Text>
                  <Text style={styles.recReason}>{tip.body}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity activeOpacity={0.85} style={styles.primaryBtn} onPress={persistProfileAndDone}>
              <Text style={styles.primaryBtnText}>ENTER</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Animated.View>

      <View style={styles.dotsRow} pointerEvents="none">
        {steps.map((s, i) => (
          <View
            key={s}
            style={[
              styles.dot,
              i === Math.max(0, steps.indexOf(step)) && styles.dotActive,
            ]}
          />
        ))}
      </View>
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
  dotsRow: {
    position: 'absolute', top: 52, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dotActive: { backgroundColor: 'rgba(255,255,255,0.85)' },
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

  safetySection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  safetyLabel: {
    color: '#9aa0b4',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
  },
  safetyBody: {
    color: '#ffffffcc',
    fontSize: 13,
    lineHeight: 19,
  },
  safetyAck: {
    color: '#ffffff88',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 22,
    marginBottom: 6,
    textAlign: 'center',
  },

  fieldLabel: {
    color: '#ffffff80',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
  },
  fieldHint: {
    color: '#ffffff66',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  fieldInput: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  datePickerWrap: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
  },
  datePicker: {
    color: '#fff',
  },
});
