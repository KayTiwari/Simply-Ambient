import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AmbientSurface,
  AmbientVeil,
  EditorialHeader,
  EditorialSection,
} from './AmbientUI';

const STORAGE_PROFILE = '@simply_ambient_profile_v1';
// The picked intent (sleep/focus/calm/energy) personalizes the More hub.
const STORAGE_INTENT = '@simply_ambient_intent_v1';

type Intent = 'sleep' | 'focus' | 'calm' | 'energy';

const INTENTS: Array<{ id: Intent; label: string; glyph: string; color: string; blurb: string }> = [
  { id: 'sleep', label: 'Sleep', glyph: '☾', color: '#8F97DE', blurb: 'Wind down. Slow the body.' },
  { id: 'focus', label: 'Focus', glyph: '◉', color: '#8FB8DE', blurb: 'Clear the mind. Sharpen attention.' },
  { id: 'calm', label: 'Calm', glyph: '○', color: '#9DC7AC', blurb: 'Soften. Return to centre.' },
  { id: 'energy', label: 'Energy', glyph: '✦', color: '#E0A470', blurb: 'Activate. Build inner heat.' },
];

const RECS: Record<Intent, {
  preset: { name: string; tab: string; reason: string };
  breath: { name: string; reason: string };
  chakra: { name: string; reason: string };
}> = {
  sleep: {
    preset: { name: 'Delta · 2 Hz', tab: 'Tones', reason: 'A low beat traditionally associated with deep rest.' },
    breath: { name: '4-7-8', reason: 'A long-exhale rhythm for winding down.' },
    chakra: { name: 'Root (LAM)', reason: 'Traditionally associated with groundedness.' },
  },
  focus: {
    preset: { name: 'Beta · 18 Hz', tab: 'Tones', reason: 'A brisk beat often paired with alert work.' },
    breath: { name: 'Box Breathing', reason: 'An even count that gives attention one clear anchor.' },
    chakra: { name: 'Third Eye (OM)', reason: 'Traditionally associated with insight and vision.' },
  },
  calm: {
    preset: { name: 'Alpha · 10 Hz', tab: 'Tones', reason: 'A gentle beat often used for relaxed attention.' },
    breath: { name: 'Coherent (5·5)', reason: 'Even pacing makes an approachable calming practice.' },
    chakra: { name: 'Heart (YAM)', reason: 'Traditionally associated with openness and connection.' },
  },
  energy: {
    preset: { name: 'Gamma · 40 Hz', tab: 'Tones', reason: 'A bright, quick beat for an energizing session.' },
    breath: { name: 'Bhastrika (Bellows)', reason: 'A rapid traditional practice; use briefly and stop if light-headed.' },
    chakra: { name: 'Solar Plexus (RAM)', reason: 'Traditionally associated with will and vitality.' },
  },
};

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_META: Record<Step, { label: string; accent: string }> = {
  0: { label: 'Welcome', accent: '#A69BE2' },
  1: { label: 'Care', accent: '#8FB8DE' },
  2: { label: 'Intention', accent: '#9DC7AC' },
  3: { label: 'Profile', accent: '#B39BE0' },
  4: { label: 'Your path', accent: '#8FC7A4' },
  5: { label: 'Guide', accent: '#E0A470' },
};

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
    body: 'Look for STILLNESS in Tones. The audio fades out gently on its own, so you can drift off.',
    color: '#8F97DE',
  },
  {
    label: 'YOUR OWN MIX',
    body: 'Turn on per-ear tuning to shape each ear separately and type exact Hz values. Save any combination as a preset.',
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
  const insets = useSafeAreaInsets();
  const steps = isReplay ? REPLAY_STEPS : FIRST_RUN_STEPS;
  const [step, setStep] = useState<Step>(0);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [name, setName] = useState('');
  // Birth date as three independent selections; -1 / 0 mean "not picked".
  const [birthMonth, setBirthMonth] = useState<number>(-1); // 0-based, -1 = unset
  const [birthDay, setBirthDay] = useState<number>(0); // 1-31, 0 = unset
  const [birthYear, setBirthYear] = useState<number>(0); // full year, 0 = unset
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
    if (intent) AsyncStorage.setItem(STORAGE_INTENT, intent).catch(() => {});
    onDone();
  }

  // Set once the fade-out lands, consumed by the reveal effect below.
  const pendingReveal = useRef(false);

  function transition(next: Step) {
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      pendingReveal.current = true;
      setStep(next);
    });
  }

  // The reveal must wait for the next page to mount and draw once at opacity
  // 0. Starting it in the same tick as setStep animates the outgoing page's
  // last frames, then the swap lands mid-fade and reads as a flicker.
  useEffect(() => {
    if (!pendingReveal.current) return;
    pendingReveal.current = false;
    const raf = requestAnimationFrame(() => {
      Animated.timing(fade, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => cancelAnimationFrame(raf);
  }, [step, fade]);

  // Advance along the active sequence, so replay mode skips the right steps.
  function goNext() {
    const idx = steps.indexOf(step);
    const next = steps[idx + 1];
    if (next === undefined) persistProfileAndDone();
    else transition(next);
  }

  const rec = intent ? RECS[intent] : null;
  const intentMeta = intent ? INTENTS.find(item => item.id === intent) : null;
  const currentStepIndex = Math.max(0, steps.indexOf(step));
  const accent = intentMeta?.color ?? STEP_META[step].accent;
  // Some Android gesture-nav setups (Samsung with the hint bar hidden) report
  // a zero bottom inset while the gesture area still overlays the window, so
  // give the last element a generous floor instead of trusting the inset.
  const scrollInsets = {
    paddingTop: insets.top + 82,
    paddingBottom: Math.max(insets.bottom, 24) + 72,
  };

  return (
    <AmbientVeil accent={accent} strength="standard" style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardLayer}
      >
        <Animated.View
          style={[
            styles.animatedLayer,
            {
              opacity: fade,
              transform: [{
                translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
              }],
            },
          ]}
        >
          {step === 0 && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode={isReplay ? 'REPLAY' : 'WELCOME'}
                title="Find your quieter center"
                accent={accent}
              />

              <View style={styles.pageBody}>
                <AmbientSurface accent={accent} style={styles.welcomeCard}>
                  <View style={styles.welcomeOrbit} pointerEvents="none">
                    <View style={[styles.welcomeOrbitMiddle, { borderColor: accent + '3D' }]} />
                    <View style={[styles.welcomeOrbitInner, { borderColor: accent + '70' }]} />
                    <View style={[styles.welcomeCore, { backgroundColor: accent }]} />
                  </View>
                  <Text style={[styles.welcomeEyebrow, { color: accent }]}>A SPACE TO RETURN TO</Text>
                  <Text style={styles.welcomeStatement}>
                    Tune your attention.{`\n`}Follow your breath.{`\n`}Notice what shifts.
                  </Text>
                  <Text style={styles.welcomeBody}>
                    Binaural frequencies, breath techniques, chakras, horoscopes,
                    and a small set of grounded daily tools.
                  </Text>
                </AmbientSurface>

                <AmbientSurface accent="#8FB8DE" quiet style={styles.headphoneCard}>
                  <View style={styles.headphoneGlyph}>
                    <Text style={styles.headphoneGlyphText}>L  ·  R</Text>
                  </View>
                  <View style={styles.headphoneCopy}>
                    <Text style={styles.headphoneTitle}>Bring stereo headphones</Text>
                    <Text style={styles.headphoneBody}>
                      Binaural effects depend on each ear hearing its own tone. Earbuds work too.
                    </Text>
                  </View>
                </AmbientSurface>

                <PrimaryAction label="BEGIN" accent={accent} onPress={goNext} />
              </View>
            </ScrollView>
          )}

          {step === 1 && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="LISTEN SAFELY"
                title="Begin with care"
                accent={accent}
              />

              <View style={styles.pageBody}>
                <AmbientSurface accent={accent} style={styles.safetyCard}>
                  <SafetySection
                    number="01"
                    label="HEARING SAFETY"
                    color="#8FB8DE"
                    body="Always start at low volume and raise gradually only if needed. If a tone feels piercing or sharp, stop immediately. Sustained loud headphone listening can damage hearing at any frequency."
                  />
                  <SafetySection
                    number="02"
                    label="NOT MEDICAL ADVICE"
                    color="#B39BE0"
                    body="Simply Ambient is a wellness tool, not a medical device. Frequencies, breathwork, chakras, horoscopes, and AI reflections are for contemplative use only. They do not diagnose, treat, cure, or prevent any condition, and they are not a substitute for professional care."
                  />
                  <SafetySection
                    number="03"
                    label="WHEN NOT TO USE"
                    color="#E0A470"
                    body="Do not use while driving or operating machinery. Consult a physician first if you are pregnant, have a pacemaker, history of seizures or epilepsy, a heart condition, or are prone to dissociation. Stop and seek care if you feel dizzy, nauseous, panicked, or hear ringing."
                  />
                  <SafetySection
                    number="04"
                    label="YOUR DATA"
                    color="#9DC7AC"
                    last
                    body="Everything you enter (profile, mood, gratitude, rants, manifestations) is stored only on this device. Horoscopes send your sign and period. Filtered crash diagnostics never include your journals or saved key. AI Insights contacts Google Gemini only after you tap an action: Journal Themes sends the sources shown as enabled, while Interpret Tarot sends the drawn card, orientation, matching meaning, and description."
                  />
                </AmbientSurface>

                <View style={styles.acknowledgement}>
                  <View style={[styles.ackRule, { backgroundColor: accent }]} />
                  <Text style={styles.safetyAck}>
                    By tapping “I agree” you accept these terms and acknowledge that use is at
                    your own risk. The full notice is available any time under More → Safety
                    & Disclaimer.
                  </Text>
                </View>

                <PrimaryAction label="I AGREE & CONTINUE" accent={accent} onPress={goNext} />
              </View>
            </ScrollView>
          )}

          {step === 2 && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="PERSONALIZE"
                title="What do you need today?"
                subtitle="Choose one intention. It shapes your starting path, never locks you in."
                accent={accent}
              />

              <View style={styles.pageBody}>
                <EditorialSection
                  eyebrow="CHOOSE YOUR DIRECTION"
                  title="Start with a feeling"
                  accent={accent}
                />

                <View
                  style={styles.intentGrid}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Choose your intention"
                >
                  {INTENTS.map(item => {
                    const active = intent === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.78}
                        accessibilityRole="radio"
                        accessibilityLabel={item.label}
                        accessibilityHint={item.blurb}
                        accessibilityState={{ selected: active, checked: active }}
                        onPress={() => setIntent(item.id)}
                        style={styles.intentTouch}
                      >
                        <AmbientSurface
                          accent={item.color}
                          quiet={!active}
                          style={[
                            styles.intentCard,
                            active && { borderColor: item.color + '99' },
                          ]}
                        >
                          <View style={styles.intentTopRow}>
                            <Text style={[styles.intentGlyph, { color: item.color }]}>{item.glyph}</Text>
                            <View
                              style={[
                                styles.intentSelection,
                                { borderColor: item.color + '66' },
                                active && { backgroundColor: item.color },
                              ]}
                            >
                              {active ? <Text style={styles.intentCheck}>✓</Text> : null}
                            </View>
                          </View>
                          <Text style={styles.intentLabel}>{item.label}</Text>
                          <Text style={styles.intentBlurb}>{item.blurb}</Text>
                        </AmbientSurface>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <PrimaryAction
                  label="CONTINUE"
                  accent={accent}
                  disabled={!intent}
                  onPress={goNext}
                />
                <SecondaryAction label="Skip the rest" onPress={persistProfileAndDone} />
              </View>
            </ScrollView>
          )}

          {step === 3 && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="OPTIONAL PROFILE"
                title="Make the space yours"
                subtitle="Save a name and optional birth date to your private profile. Both stay on this device."
                accent={accent}
              />

              <View style={styles.pageBody}>
                <AmbientSurface accent="#9DC7AC" quiet style={styles.privacyCard}>
                  <View style={styles.privacyMark}>
                    <Text style={styles.privacyMarkText}>⌁</Text>
                  </View>
                  <View style={styles.privacyCopy}>
                    <Text style={styles.privacyTitle}>Private by default</Text>
                    <Text style={styles.privacyBody}>
                      Optional and stored locally. You can edit or remove it later in Profile.
                    </Text>
                  </View>
                </AmbientSurface>

                <AmbientSurface accent={accent} style={styles.formCard}>
                  <Text style={[styles.formEyebrow, { color: accent }]}>A LITTLE ABOUT YOU</Text>

                  <Text style={styles.fieldLabel}>NAME</Text>
                  <TextInput
                    accessibilityLabel="Name"
                    style={[styles.fieldInput, { borderColor: accent + '3D' }]}
                    placeholder="What should we call you?"
                    placeholderTextColor="#858294"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                    textContentType="name"
                    maxLength={60}
                  />

                  <View style={styles.dateHeadingRow}>
                    <Text style={styles.fieldLabel}>BIRTH DATE</Text>
                    <Text style={styles.optionalPill}>OPTIONAL</Text>
                  </View>
                  <Text style={styles.fieldHint}>Saved to Profile; choose your sign separately in Stars</Text>

                  <View style={styles.dateRow}>
                    <View style={[styles.datePickerWrap, { flex: 1.4, borderColor: accent + '38' }]}>
                      <Picker
                        accessibilityLabel="Birth month"
                        selectedValue={birthMonth}
                        onValueChange={(value) => {
                          const month = Number(value);
                          setBirthMonth(month);
                          // Keep the picked day valid for the new month (e.g. 31st -> 30).
                          setBirthDay(day => Math.min(day, daysInMonth(month, birthYear)));
                        }}
                        dropdownIconColor="#B8B5C3"
                        style={styles.datePicker}
                      >
                        <Picker.Item label="Month" value={-1} color="#999" />
                        {MONTHS.map((month, index) => (
                          <Picker.Item key={month} label={month} value={index} />
                        ))}
                      </Picker>
                    </View>
                    <View style={[styles.datePickerWrap, { flex: 0.8, borderColor: accent + '38' }]}>
                      <Picker
                        accessibilityLabel="Birth day"
                        selectedValue={birthDay}
                        onValueChange={(value) => setBirthDay(Number(value))}
                        dropdownIconColor="#B8B5C3"
                        style={styles.datePicker}
                      >
                        <Picker.Item label="Day" value={0} color="#999" />
                        {Array.from({ length: birthDayMax }, (_, index) => index + 1).map(day => (
                          <Picker.Item key={day} label={String(day)} value={day} />
                        ))}
                      </Picker>
                    </View>
                    <View style={[styles.datePickerWrap, { flex: 1, borderColor: accent + '38' }]}>
                      <Picker
                        accessibilityLabel="Birth year"
                        selectedValue={birthYear}
                        onValueChange={(value) => {
                          const year = Number(value);
                          setBirthYear(year);
                          // Keep the picked day valid for the new year (Feb 29 -> 28).
                          setBirthDay(day => Math.min(day, daysInMonth(birthMonth, year)));
                        }}
                        dropdownIconColor="#B8B5C3"
                        style={styles.datePicker}
                      >
                        <Picker.Item label="Year" value={0} color="#999" />
                        {BIRTH_YEARS.map(year => (
                          <Picker.Item key={year} label={String(year)} value={year} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </AmbientSurface>

                <Text style={styles.profileFootnote}>
                  Add birth time, location, and MBTI later under More → Profile.
                </Text>

                <PrimaryAction label="CONTINUE" accent={accent} onPress={goNext} />
                <SecondaryAction label="Skip" onPress={goNext} />
              </View>
            </ScrollView>
          )}

          {step === 4 && rec && intentMeta && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="YOUR STARTING PATH"
                title={`A ritual for ${intentMeta.label.toLowerCase()}`}
                subtitle="Three places to begin. Think of this as a gentle first route, not a prescription."
                accent={accent}
              />

              <View style={styles.pageBody}>
                <AmbientSurface accent={accent} style={styles.pathHero}>
                  <Text style={[styles.pathGlyph, { color: intentMeta.color }]}>{intentMeta.glyph}</Text>
                  <View style={styles.pathHeroCopy}>
                    <Text style={[styles.pathEyebrow, { color: intentMeta.color }]}>YOUR INTENTION</Text>
                    <Text style={styles.pathTitle}>{intentMeta.label}</Text>
                    <Text style={styles.pathBlurb}>{intentMeta.blurb}</Text>
                  </View>
                </AmbientSurface>

                <EditorialSection
                  index="01"
                  eyebrow="BEGIN HERE"
                  title="Your first three practices"
                  accent={accent}
                />

                <View style={styles.recommendationStack}>
                  <RecRow
                    index="01"
                    label="FREQUENCY"
                    title={rec.preset.name}
                    where="Tones tab"
                    reason={rec.preset.reason}
                    color="#8FB8DE"
                  />
                  <RecRow
                    index="02"
                    label="BREATH"
                    title={rec.breath.name}
                    where="Breath tab"
                    reason={rec.breath.reason}
                    color="#9DC7AC"
                  />
                  <RecRow
                    index="03"
                    label="CHAKRA"
                    title={rec.chakra.name}
                    where="Chakras tab"
                    reason={rec.chakra.reason}
                    color={intentMeta.color}
                  />
                </View>

                <Text style={styles.outro}>
                  Horoscopes, mood, gratitude, and grounding live on the Horoscopes
                  and More tabs.
                </Text>
                <PrimaryAction label="CONTINUE" accent={accent} onPress={goNext} />
              </View>
            </ScrollView>
          )}

          {/* Defensive fallback: if step 4 is reached without an intent picked
              (shouldn't happen, but state could desync), continue to the tips. */}
          {step === 4 && (!rec || !intentMeta) && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="READY"
                title="Everything is within reach"
                accent={accent}
              />
              <View style={styles.pageBody}>
                <AmbientSurface accent={accent} style={styles.fallbackCard}>
                  <Text style={[styles.fallbackGlyph, { color: accent }]}>✦</Text>
                  <Text style={styles.fallbackTitle}>You’re all set</Text>
                  <Text style={styles.fallbackBody}>Explore freely and begin wherever feels useful today.</Text>
                </AmbientSurface>
                <PrimaryAction label="CONTINUE" accent={accent} onPress={goNext} />
              </View>
            </ScrollView>
          )}

          {step === 5 && (
            <ScrollView
              contentContainerStyle={[styles.scroll, scrollInsets]}
              showsVerticalScrollIndicator={false}
            >
              <EditorialHeader
                mode="FIELD GUIDE"
                title="Know your way around"
                accent={accent}
              />

              <View style={styles.pageBody}>
                <EditorialSection
                  eyebrow="GOOD TO KNOW"
                  title="Small details, close at hand"
                  accent={accent}
                />

                <View style={styles.tipGrid}>
                  {TIPS.map((tip, index) => (
                    <AmbientSurface key={tip.label} accent={tip.color} quiet style={styles.tipCard}>
                      <View style={styles.tipTopRow}>
                        <Text style={[styles.tipIndex, { color: tip.color }]}>
                          {String(index + 1).padStart(2, '0')}
                        </Text>
                        <View style={[styles.tipDot, { backgroundColor: tip.color }]} />
                      </View>
                      <Text style={styles.tipLabel}>{tip.label}</Text>
                      <Text style={styles.tipBody}>{tip.body}</Text>
                    </AmbientSurface>
                  ))}
                </View>

                <AmbientSurface accent={accent} style={styles.readyCard}>
                  <Text style={[styles.readyEyebrow, { color: accent }]}>YOUR SPACE IS READY</Text>
                  <Text style={styles.readyTitle}>Begin where you are.</Text>
                  <Text style={styles.readyBody}>
                    There is no perfect sequence. Choose the room that meets this moment.
                  </Text>
                </AmbientSurface>

                <PrimaryAction label="ENTER SIMPLY AMBIENT" accent={accent} onPress={persistProfileAndDone} />
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Onboarding progress"
        accessibilityValue={{
          min: 1,
          max: steps.length,
          now: currentStepIndex + 1,
          text: `${STEP_META[step].label}, step ${currentStepIndex + 1} of ${steps.length}`,
        }}
        pointerEvents="none"
        style={[styles.progressDock, { top: insets.top + 11 }]}
      >
        <View style={styles.progressMetaRow}>
          <Text style={[styles.progressLabel, { color: accent }]}>{STEP_META[step].label.toUpperCase()}</Text>
          <Text style={styles.progressCount}>
            {String(currentStepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </Text>
        </View>
        <View style={styles.progressRail}>
          {steps.map((sequenceStep, index) => {
            const complete = index < currentStepIndex;
            const current = index === currentStepIndex;
            return (
              <View
                key={sequenceStep}
                style={[
                  styles.progressSegment,
                  (complete || current) && { backgroundColor: accent + (current ? 'FF' : '66') },
                  current && styles.progressSegmentCurrent,
                ]}
              />
            );
          })}
        </View>
      </View>
    </AmbientVeil>
  );
}

function PrimaryAction({
  label,
  accent,
  onPress,
  disabled = false,
}: {
  label: string;
  accent: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.primaryButton,
        {
          backgroundColor: disabled ? 'rgba(255,255,255,0.12)' : accent,
          shadowColor: accent,
        },
      ]}
    >
      <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>
        {label}
      </Text>
      <Text style={[styles.primaryArrow, disabled && styles.primaryButtonTextDisabled]}>→</Text>
    </TouchableOpacity>
  );
}

function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.secondaryButton}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SafetySection({
  number,
  label,
  body,
  color,
  last = false,
}: {
  number: string;
  label: string;
  body: string;
  color: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.safetySection, last && styles.safetySectionLast]}>
      <View style={styles.safetyHeadingRow}>
        <Text style={[styles.safetyNumber, { color }]}>{number}</Text>
        <Text style={styles.safetyLabel}>{label}</Text>
      </View>
      <Text style={styles.safetyBody}>{body}</Text>
    </View>
  );
}

function RecRow({
  index,
  label,
  title,
  where,
  reason,
  color,
}: {
  index: string;
  label: string;
  title: string;
  where: string;
  reason: string;
  color: string;
}) {
  return (
    <AmbientSurface accent={color} quiet style={styles.recRow}>
      <View style={styles.recTopRow}>
        <Text style={[styles.recIndex, { color }]}>{index}</Text>
        <Text style={[styles.recLabel, { color }]}>{label}</Text>
        <Text style={styles.recWhere}>{where}</Text>
      </View>
      <Text style={styles.recTitle}>{title}</Text>
      <Text style={styles.recReason}>{reason}</Text>
    </AmbientSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  keyboardLayer: { flex: 1 },
  animatedLayer: { flex: 1 },
  scroll: { flexGrow: 1 },
  pageBody: { paddingHorizontal: 20 },

  progressDock: {
    position: 'absolute',
    left: 22,
    right: 22,
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(11,12,30,0.54)',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  progressMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.8 },
  progressCount: { color: '#92909F', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  progressRail: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  progressSegment: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressSegmentCurrent: { height: 4 },

  welcomeCard: { minHeight: 315, padding: 21, justifyContent: 'flex-end' },
  welcomeOrbit: {
    position: 'absolute',
    right: -28,
    top: -34,
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeOrbitMiddle: {
    width: 146,
    height: 146,
    borderRadius: 73,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeOrbitInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeCore: { width: 9, height: 9, borderRadius: 5, shadowOpacity: 0.8, shadowRadius: 14 },
  welcomeEyebrow: { fontSize: 8.5, fontWeight: '900', letterSpacing: 2.2 },
  welcomeStatement: {
    color: '#FCFAFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 34,
    lineHeight: 35,
    letterSpacing: 0.1,
    marginTop: 8,
  },
  welcomeBody: { color: '#B5B2C0', fontSize: 11.5, lineHeight: 18, marginTop: 15, maxWidth: 286 },
  headphoneCard: {
    minHeight: 88,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headphoneGlyph: {
    width: 50,
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#8FB8DE55',
    backgroundColor: '#8FB8DE12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  headphoneGlyphText: { color: '#8FB8DE', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  headphoneCopy: { flex: 1 },
  headphoneTitle: { color: '#F6F4FA', fontSize: 13, fontWeight: '700' },
  headphoneBody: { color: '#A6A4B3', fontSize: 10.5, lineHeight: 15, marginTop: 3 },

  primaryButton: {
    minHeight: 56,
    borderRadius: 20,
    paddingHorizontal: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    shadowOpacity: 0.24,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryButtonText: { color: '#090A1C', fontSize: 10, fontWeight: '900', letterSpacing: 2.5 },
  primaryButtonTextDisabled: { color: '#777585' },
  primaryArrow: { color: '#090A1C', fontSize: 18, lineHeight: 20 },
  secondaryButton: {
    minHeight: 46,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 5,
  },
  secondaryButtonText: { color: '#9B99A8', fontSize: 11, letterSpacing: 0.7 },

  safetyCard: { paddingHorizontal: 18, paddingVertical: 3 },
  safetySection: {
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.085)',
  },
  safetySectionLast: { borderBottomWidth: 0 },
  safetyHeadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  safetyNumber: { fontSize: 8, fontWeight: '900', letterSpacing: 1.4, marginRight: 9 },
  safetyLabel: { color: '#D8D5DF', fontSize: 9, letterSpacing: 1.8, fontWeight: '800' },
  safetyBody: { color: '#BCB9C7', fontSize: 11.5, lineHeight: 18 },
  acknowledgement: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, paddingHorizontal: 8 },
  ackRule: { width: 2, height: 34, borderRadius: 1, marginRight: 11, opacity: 0.65 },
  safetyAck: { color: '#8E8C9B', fontSize: 10, fontStyle: 'italic', lineHeight: 16, flex: 1 },

  intentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  intentTouch: { flexGrow: 1, flexBasis: '46%', borderRadius: 24 },
  intentCard: { minHeight: 155, padding: 16, justifyContent: 'space-between' },
  intentTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  intentGlyph: { fontSize: 32, lineHeight: 38 },
  intentSelection: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentCheck: { color: '#0B0B1F', fontSize: 11, fontWeight: '900' },
  intentLabel: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 25,
    lineHeight: 27,
    marginTop: 15,
  },
  intentBlurb: { color: '#A7A5B4', fontSize: 10.5, lineHeight: 15, marginTop: 4 },

  privacyCard: {
    minHeight: 84,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  privacyMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#9DC7AC14',
    borderWidth: 1,
    borderColor: '#9DC7AC44',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  privacyMarkText: { color: '#9DC7AC', fontSize: 25 },
  privacyCopy: { flex: 1 },
  privacyTitle: { color: '#F4F2F8', fontSize: 13, fontWeight: '700' },
  privacyBody: { color: '#9F9DAC', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  formCard: { padding: 18, marginTop: 12 },
  formEyebrow: { fontSize: 8.5, fontWeight: '900', letterSpacing: 2, marginBottom: 20 },
  fieldLabel: { color: '#B0AEBB', fontSize: 8.5, letterSpacing: 1.7, fontWeight: '800' },
  fieldHint: { color: '#7F7D8D', fontSize: 10, fontStyle: 'italic', marginTop: 5, marginBottom: 9 },
  fieldInput: {
    color: '#F9F7FC',
    fontSize: 15,
    minHeight: 51,
    backgroundColor: 'rgba(8,9,25,0.36)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  dateHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  optionalPill: {
    color: '#777585',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dateRow: { flexDirection: 'row', gap: 7 },
  datePickerWrap: {
    minHeight: 50,
    backgroundColor: 'rgba(8,9,25,0.36)',
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  datePicker: { color: '#F7F5FA' },
  profileFootnote: {
    color: '#817F8E',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 14,
  },

  pathHero: { minHeight: 116, padding: 17, flexDirection: 'row', alignItems: 'center' },
  pathGlyph: { width: 62, fontSize: 47, lineHeight: 54, textAlign: 'center', marginRight: 12 },
  pathHeroCopy: { flex: 1 },
  pathEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.8 },
  pathTitle: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 28,
    lineHeight: 30,
    marginTop: 2,
  },
  pathBlurb: { color: '#A7A5B4', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  recommendationStack: { gap: 10 },
  recRow: { padding: 16 },
  recTopRow: { flexDirection: 'row', alignItems: 'center' },
  recIndex: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3, marginRight: 8 },
  recLabel: { fontSize: 8, letterSpacing: 1.7, fontWeight: '900', flex: 1 },
  recWhere: { color: '#797786', fontSize: 9, fontStyle: 'italic' },
  recTitle: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 23,
    lineHeight: 26,
    marginTop: 11,
  },
  recReason: { color: '#AAA8B6', fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  outro: { color: '#838190', fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 17, paddingHorizontal: 14 },
  fallbackCard: { minHeight: 260, padding: 22, alignItems: 'center', justifyContent: 'center' },
  fallbackGlyph: { fontSize: 45, marginBottom: 13 },
  fallbackTitle: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 31,
  },
  fallbackBody: { color: '#AAA8B6', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },

  tipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tipCard: { flexGrow: 1, flexBasis: '46%', minHeight: 181, padding: 15 },
  tipTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tipIndex: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  tipDot: { width: 5, height: 5, borderRadius: 3 },
  tipLabel: { color: '#E8E5ED', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 24 },
  tipBody: { color: '#A5A3B1', fontSize: 10, lineHeight: 15.5, marginTop: 8 },
  readyCard: { padding: 19, marginTop: 12 },
  readyEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.8 },
  readyTitle: {
    color: '#FAF8FF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 29,
    lineHeight: 31,
    marginTop: 6,
  },
  readyBody: { color: '#A6A4B2', fontSize: 10.5, lineHeight: 16, marginTop: 5 },
});
