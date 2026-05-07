import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_NOTIF = '@simply_ambient_notif_pref_v1';
const STORAGE_MOOD = '@simply_ambient_mood_log_v1';
const STORAGE_GRAT = '@simply_ambient_gratitude_v1';

// Email obfuscated so it doesn't appear as plaintext in the bundle.
// (Base64 of the developer's email — used only for form submissions.)
const REPORT_EMAIL_B64 = 'dGl3a2F5QGdtYWlsLmNvbQ==';
function decodeReportEmail(): string {
  // @ts-ignore — atob exists in the React Native runtime
  return globalThis.atob(REPORT_EMAIL_B64);
}

// Donation link — replace with your own Buy Me a Coffee / Ko-fi handle.
const SUPPORT_URL = 'https://www.buymeacoffee.com/kaytiwari';

export type NotifPref = 'off' | 'daily' | 'thrice';

type MoodEntry = { ts: number; value: number };
type GratEntry = { ts: number; text: string };

type Props = {
  notifPref: NotifPref;
  onChangeNotifPref: (p: NotifPref) => void;
  affirmation: string | null;
  affirmationLoading: boolean;
  onRefreshAffirmation: () => void;
};

export default function MoreView({
  notifPref, onChangeNotifPref,
  affirmation, affirmationLoading, onRefreshAffirmation,
}: Props) {
  const [moodLog, setMoodLog] = useState<MoodEntry[]>([]);
  const [gratitude, setGratitude] = useState<GratEntry[]>([]);
  const [gratText, setGratText] = useState('');

  const [bugSubject, setBugSubject] = useState('');
  const [bugBody, setBugBody] = useState('');
  const [bugSending, setBugSending] = useState(false);

  // Load persisted mood + gratitude
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_MOOD).then(v => v && setMoodLog(JSON.parse(v))).catch(() => {});
    AsyncStorage.getItem(STORAGE_GRAT).then(v => v && setGratitude(JSON.parse(v))).catch(() => {});
  }, []);

  function saveMood(value: number) {
    const next = [{ ts: Date.now(), value }, ...moodLog].slice(0, 60);
    setMoodLog(next);
    AsyncStorage.setItem(STORAGE_MOOD, JSON.stringify(next)).catch(() => {});
  }

  function saveGratitude() {
    const text = gratText.trim();
    if (!text) return;
    const next = [{ ts: Date.now(), text }, ...gratitude].slice(0, 100);
    setGratitude(next);
    setGratText('');
    AsyncStorage.setItem(STORAGE_GRAT, JSON.stringify(next)).catch(() => {});
  }

  function deleteGratitude(ts: number) {
    const next = gratitude.filter(g => g.ts !== ts);
    setGratitude(next);
    AsyncStorage.setItem(STORAGE_GRAT, JSON.stringify(next)).catch(() => {});
  }

  async function submitBugReport() {
    if (!bugSubject.trim() && !bugBody.trim()) {
      Alert.alert('Empty report', 'Add a subject or describe the issue first.');
      return;
    }
    setBugSending(true);
    try {
      const url = `https://formsubmit.co/ajax/${decodeReportEmail()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          _subject: `[Simply Ambient] ${bugSubject || 'Bug report'}`,
          _captcha: 'false',
          subject: bugSubject,
          message: bugBody,
        }),
      });
      if (res.ok) {
        Alert.alert('Sent', 'Thank you. The developer will see it soon.');
        setBugSubject('');
        setBugBody('');
      } else {
        Alert.alert('Could not send', 'Please try again later.');
      }
    } catch {
      Alert.alert('Could not send', 'Check your connection and try again.');
    } finally {
      setBugSending(false);
    }
  }

  const moodToday = moodLog.find(
    m => new Date(m.ts).toDateString() === new Date().toDateString(),
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>More</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>Tools for the practice</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ====================  AFFIRMATION  ==================== */}
        <View style={[styles.card, { borderColor: '#9affc855' }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>DAILY AFFIRMATION</Text>
            <TouchableOpacity onPress={onRefreshAffirmation} style={styles.refreshBtn}>
              <Text style={styles.refreshText}>↻</Text>
            </TouchableOpacity>
          </View>
          {affirmationLoading ? (
            <ActivityIndicator color="#9affc8" style={{ marginVertical: 16 }} />
          ) : (
            <Text style={styles.affirmationText}>“{affirmation ?? 'You are exactly where you need to be.'}”</Text>
          )}

          <View style={styles.notifRow}>
            <Text style={styles.notifLabel}>NOTIFICATIONS</Text>
            <View style={styles.notifPills}>
              {(['off', 'daily', 'thrice'] as NotifPref[]).map(p => {
                const active = p === notifPref;
                const label = p === 'off' ? 'Off' : p === 'daily' ? '1×/day' : '3×/day';
                return (
                  <TouchableOpacity
                    key={p}
                    activeOpacity={0.85}
                    onPress={() => onChangeNotifPref(p)}
                    style={[
                      styles.notifPill,
                      active && { borderColor: '#9affc8', backgroundColor: '#9affc822' },
                    ]}
                  >
                    <Text style={[styles.notifPillText, active && { color: '#9affc8' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {notifPref !== 'off' ? (
              <Text style={styles.notifHint}>
                {notifPref === 'daily' ? 'A gentle nudge at 9 a.m.' : 'Nudges at 9 a.m., 1 p.m., 6 p.m.'}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ====================  MOOD CHECK-IN  ==================== */}
        <View style={[styles.card, { borderColor: '#5BD0FF55' }]}>
          <Text style={styles.cardLabel}>MOOD CHECK-IN</Text>
          <Text style={styles.cardSub}>How are you feeling right now?</Text>
          <View style={styles.moodRow}>
            {[1, 2, 3, 4, 5].map(v => {
              const active = moodToday?.value === v;
              const colors = ['#FF5B5B', '#FF8A38', '#FFD000', '#9affc8', '#5BD0FF'];
              const labels = ['Low', 'Off', 'OK', 'Good', 'Great'];
              return (
                <TouchableOpacity
                  key={v}
                  activeOpacity={0.85}
                  onPress={() => saveMood(v)}
                  style={[
                    styles.moodBtn,
                    {
                      borderColor: active ? colors[v - 1] : colors[v - 1] + '55',
                      backgroundColor: active ? colors[v - 1] + '22' : 'rgba(0,0,0,0.20)',
                    },
                  ]}
                >
                  <Text style={[styles.moodValue, { color: colors[v - 1] }]}>{v}</Text>
                  <Text style={[styles.moodLabel, { color: active ? colors[v - 1] : '#ffffff88' }]}>{labels[v - 1]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {moodLog.length > 0 ? (
            <Text style={styles.moodHistory}>
              {moodLog.length} entr{moodLog.length === 1 ? 'y' : 'ies'} logged
            </Text>
          ) : null}
        </View>

        {/* ====================  GRATITUDE JOURNAL  ==================== */}
        <View style={[styles.card, { borderColor: '#FFB05B55' }]}>
          <Text style={styles.cardLabel}>GRATITUDE</Text>
          <Text style={styles.cardSub}>What is one thing you appreciate today?</Text>
          <TextInput
            style={styles.gratInput}
            placeholder="A small or large thing…"
            placeholderTextColor="#ffffff55"
            value={gratText}
            onChangeText={setGratText}
            multiline
            maxLength={300}
          />
          <TouchableOpacity onPress={saveGratitude} style={styles.gratSaveBtn} activeOpacity={0.85}>
            <Text style={styles.gratSaveText}>SAVE</Text>
          </TouchableOpacity>
          {gratitude.slice(0, 5).map(g => (
            <View key={g.ts} style={styles.gratEntry}>
              <Text style={styles.gratEntryDate}>
                {new Date(g.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={styles.gratEntryText}>{g.text}</Text>
              <TouchableOpacity onPress={() => deleteGratitude(g.ts)} style={styles.gratDelBtn}>
                <Text style={styles.gratDelText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ====================  5-4-3-2-1 GROUNDING  ==================== */}
        <View style={[styles.card, { borderColor: '#5B6CFF55' }]}>
          <Text style={styles.cardLabel}>5-4-3-2-1 GROUNDING</Text>
          <Text style={styles.cardSub}>When anxiety rises, return to the senses.</Text>
          <View style={styles.groundList}>
            <Text style={styles.groundItem}><Text style={[styles.groundNum, { color: '#FF5B5B' }]}>5  </Text>things you can <Text style={styles.groundEm}>see</Text></Text>
            <Text style={styles.groundItem}><Text style={[styles.groundNum, { color: '#FFB05B' }]}>4  </Text>things you can <Text style={styles.groundEm}>touch</Text></Text>
            <Text style={styles.groundItem}><Text style={[styles.groundNum, { color: '#FFD000' }]}>3  </Text>things you can <Text style={styles.groundEm}>hear</Text></Text>
            <Text style={styles.groundItem}><Text style={[styles.groundNum, { color: '#9affc8' }]}>2  </Text>things you can <Text style={styles.groundEm}>smell</Text></Text>
            <Text style={styles.groundItem}><Text style={[styles.groundNum, { color: '#5BD0FF' }]}>1  </Text>thing you can <Text style={styles.groundEm}>taste</Text></Text>
          </View>
          <Text style={styles.cardSub}>Move slowly. Breathe between each.</Text>
        </View>

        {/* ====================  SUPPORT  ==================== */}
        <View style={[styles.card, { borderColor: '#d9b35c55' }]}>
          <Text style={styles.cardLabel}>SUPPORT THE DEVELOPER</Text>
          <Text style={styles.supportText}>
            Simply Ambient is built and maintained by one person. If it's brought you peace
            and you'd like more features (sleep stories, custom soundscapes, integrations…),
            a small donation goes a long way.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(SUPPORT_URL).catch(() => {})}
            style={styles.supportBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.supportBtnText}>☕  Buy a coffee</Text>
          </TouchableOpacity>
        </View>

        {/* ====================  BUG REPORT  ==================== */}
        <View style={[styles.card, { borderColor: '#FF5B9C55' }]}>
          <Text style={styles.cardLabel}>REPORT A BUG</Text>
          <Text style={styles.cardSub}>
            Something broken or off? This goes straight to the developer.
          </Text>
          <TextInput
            style={styles.bugInput}
            placeholder="Subject"
            placeholderTextColor="#ffffff55"
            value={bugSubject}
            onChangeText={setBugSubject}
            maxLength={120}
          />
          <TextInput
            style={[styles.bugInput, { minHeight: 90, textAlignVertical: 'top' }]}
            placeholder="Describe what happened, what you expected, and what device you're on…"
            placeholderTextColor="#ffffff55"
            value={bugBody}
            onChangeText={setBugBody}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={submitBugReport}
            disabled={bugSending}
            style={[styles.bugSendBtn, bugSending && { opacity: 0.5 }]}
            activeOpacity={0.85}
          >
            {bugSending ? (
              <ActivityIndicator color="#0B0B1F" />
            ) : (
              <Text style={styles.bugSendText}>SEND REPORT</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          Affirmations from a free public API · Donations and bug reports go directly to the developer.
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
    fontSize: 38, letterSpacing: 2.5,
    textAlign: 'center', lineHeight: 44,
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

  card: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
  },
  cardSub: { color: '#ffffff88', fontSize: 12, marginTop: 4, lineHeight: 17 },

  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  refreshText: { color: '#fff', fontSize: 16 },
  affirmationText: {
    color: '#ffffffdd',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 18, lineHeight: 26,
    marginVertical: 14,
  },

  notifRow: {
    marginTop: 10, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  notifLabel: { color: '#ffffff80', fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  notifPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notifPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  notifPillText: { color: '#ffffff99', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  notifHint: { color: '#ffffff66', fontSize: 11, marginTop: 8, fontStyle: 'italic' },

  moodRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  moodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  moodValue: { fontSize: 18, fontWeight: '700' },
  moodLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '600', marginTop: 2 },
  moodHistory: { color: '#ffffff66', fontSize: 11, fontStyle: 'italic', marginTop: 10 },

  gratInput: {
    color: '#fff', fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    minHeight: 70, textAlignVertical: 'top',
  },
  gratSaveBtn: {
    alignSelf: 'flex-end', marginTop: 10,
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 999, backgroundColor: '#FFB05B',
  },
  gratSaveText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  gratEntry: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  gratEntryDate: { color: '#FFB05B', fontSize: 11, fontWeight: '700', letterSpacing: 1, width: 56, marginTop: 2 },
  gratEntryText: { color: '#ffffffcc', fontSize: 13, flex: 1, lineHeight: 18 },
  gratDelBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  gratDelText: { color: '#ffffff44', fontSize: 14 },

  groundList: { marginTop: 14, marginBottom: 10 },
  groundItem: { color: '#ffffffcc', fontSize: 14, lineHeight: 26 },
  groundNum: { fontSize: 16, fontWeight: '800' },
  groundEm: { fontStyle: 'italic', color: '#fff' },

  supportText: { color: '#ffffffcc', fontSize: 13, lineHeight: 19, marginVertical: 10 },
  supportBtn: {
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#d9b35c', alignItems: 'center',
  },
  supportBtnText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

  bugInput: {
    color: '#fff', fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  bugSendBtn: {
    paddingVertical: 12, borderRadius: 12, marginTop: 12,
    backgroundColor: '#FF5B9C', alignItems: 'center',
  },
  bugSendText: { color: '#0B0B1F', fontWeight: '700', letterSpacing: 2, fontSize: 14 },

  footnote: {
    color: '#ffffff66', fontSize: 11, textAlign: 'center',
    marginTop: 18, paddingHorizontal: 12, fontStyle: 'italic', lineHeight: 16,
  },
});
