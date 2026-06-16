import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowsClockwise } from 'phosphor-react-native';

import type { Zodiac } from './App';

const HOROSCOPE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
function horoscopeCacheKey(signId: string, period: string) {
  return `@simply_ambient_horo_${signId}_${period}_v1`;
}
const TAROT_CACHE_KEY = '@simply_ambient_tarot_v1';
const TAROT_TTL_MS = 24 * 60 * 60 * 1000;

// freehoroscopeapi.com sends no CORS headers, so the browser build routes
// through our same-origin Vercel proxy (/api/*). Native fetches the API
// directly. Both return the identical response shape.
const ON_WEB = Platform.OS === 'web';
function tarotUrl(n: number): string {
  return ON_WEB
    ? `/api/tarot?n=${n}`
    : `https://freehoroscopeapi.com/api/v1/tarot/cards/random?n=${n}`;
}
function horoscopeUrl(period: string, signName: string): string {
  if (ON_WEB) {
    return period === 'daily'
      ? `/api/horoscope?period=daily&sign=${encodeURIComponent(signName)}&day=TODAY`
      : `/api/horoscope?period=monthly&sign=${encodeURIComponent(signName)}`;
  }
  return period === 'daily'
    ? `https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${signName}&day=TODAY`
    : `https://freehoroscopeapi.com/api/v1/get-horoscope/monthly?sign=${signName}`;
}

// freehoroscopeapi.com is on IST (UTC+5:30), so when it's late evening in
// US timezones its "TODAY" is already the user's "tomorrow", and the
// response text bakes in that date ("On May 17th, you might feel..."). We
// strip the leading date phrase so the body is timezone-agnostic and stays
// consistent with the local TODAY · <date> label in the header.
function stripLeadingDate(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(
    /^On\s+(?:(?:Mon|Tues?|Wednes?|Thurs?|Fri|Satur?|Sun)(?:day)?,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+/i,
    '',
  );
  if (cleaned === text) return text;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

type Period = 'daily' | 'monthly' | 'yearly';

type Props = {
  zodiac: Zodiac[];
  mySign: Zodiac;
  lunar: { glyph: string; name: string; illum: number };
  onSelectMyZodiac: (z: Zodiac) => void;
};

type TarotCard = {
  name: string;
  meaning_up?: string;
  meaning_rev?: string;
  desc?: string;
};

export default function HoroscopesView({
  zodiac, mySign, lunar, onSelectMyZodiac,
}: Props) {
  const [period, setPeriod] = useState<Period>('daily');
  const [horoscope, setHoroscope] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tarot, setTarot] = useState<TarotCard | null>(null);
  const [tarotLoading, setTarotLoading] = useState(false);

  function drawTarot(force = false) {
    setTarotLoading(true);
    fetch(tarotUrl(1))
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        const c = json?.cards?.[0];
        if (c) {
          setTarot(c);
          AsyncStorage.setItem(TAROT_CACHE_KEY, JSON.stringify({ ts: Date.now(), card: c })).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setTarotLoading(false));
  }

  // On first open: show the cached card immediately, refresh once a day.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TAROT_CACHE_KEY).then(raw => {
      if (cancelled) return;
      let stale = true;
      if (raw) {
        try {
          const cached = JSON.parse(raw) as { ts: number; card: TarotCard };
          if (cached?.card) {
            setTarot(cached.card);
            stale = Date.now() - cached.ts >= TAROT_TTL_MS;
          }
        } catch {}
      }
      if (stale) drawTarot();
    }).catch(() => drawTarot());
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Yearly is a static intention written into the zodiac data. No API call.
    if (period === 'yearly') {
      setLoading(false);
      setHoroscope(mySign.yearAhead);
      return;
    }

    const cacheKey = horoscopeCacheKey(mySign.id, period);

    // Show cached value instantly, then refetch in the background if stale.
    AsyncStorage.getItem(cacheKey).then(raw => {
      if (cancelled || !raw) return;
      try {
        const cached = JSON.parse(raw) as { ts: number; text: string };
        if (cached?.text) setHoroscope(stripLeadingDate(cached.text));
      } catch {}
    }).catch(() => {});

    const url = horoscopeUrl(period, mySign.name);

    (async () => {
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      let needsFetch = true;
      if (raw) {
        try {
          const cached = JSON.parse(raw) as { ts: number; text: string };
          if (cached?.text && Date.now() - cached.ts < HOROSCOPE_TTL_MS) {
            needsFetch = false;
          }
        } catch {}
      }

      if (needsFetch) setLoading(true);
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('bad response');
        const json = await r.json();
        const text =
          json?.data?.horoscope ??
          json?.data?.horoscope_data ??
          null;
        if (cancelled) return;
        if (text) {
          const cleaned = stripLeadingDate(text);
          setHoroscope(cleaned);
          AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), text: cleaned })).catch(() => {});
        } else if (!raw) {
          setHoroscope(null);
        }
      } catch {
        // If we already had a cached value, just keep it.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [mySign.id, period, mySign.yearAhead]);

  const dateText = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const illumPct = Math.round(lunar.illum * 100);

  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' }).toUpperCase();
  const yearText = new Date().getFullYear();
  const periodLabel =
    period === 'daily' ? 'TODAY · ' + dateText.toUpperCase() :
    period === 'monthly' ? 'THIS MONTH · ' + monthName :
    'YEAR AHEAD · ' + yearText;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerWrap}>
        <Text style={styles.ambience}>Simply Ambient</Text>
        <Text style={styles.title}>Horoscopes</Text>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.subtitle}>As above, so below</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Today / week / month widget */}
        <View style={[styles.todayCard, { borderColor: mySign.color + '55' }]}>
          <Text style={styles.todayLabel}>{periodLabel}</Text>
          <View style={styles.todayRow}>
            <Text style={[styles.zGlyph, { color: mySign.color, fontSize: 44 }]}>{mySign.glyph}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.todaySignName}>{mySign.name}</Text>
              <Text style={[styles.metaText, { color: mySign.color }]}>
                {mySign.element} · {mySign.qualities}
              </Text>
            </View>
          </View>

          {/* Period toggle */}
          <View style={styles.periodRow}>
            {(['daily', 'monthly', 'yearly'] as Period[]).map(p => {
              const active = p === period;
              return (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.85}
                  onPress={() => setPeriod(p)}
                  style={[
                    styles.periodBtn,
                    active && {
                      backgroundColor: mySign.color + '22',
                      borderColor: mySign.color,
                    },
                  ]}
                >
                  <Text style={[styles.periodText, active && { color: mySign.color }]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={[styles.horoscopeBox, { borderLeftColor: mySign.color }]}>
              <ActivityIndicator color={mySign.color} />
            </View>
          ) : horoscope ? (
            <View style={[styles.horoscopeBox, { borderLeftColor: mySign.color }]}>
              <Text style={styles.horoscopeText}>{horoscope}</Text>
            </View>
          ) : (
            <View style={[styles.horoscopeBox, { borderLeftColor: mySign.color }]}>
              <Text style={styles.horoscopeFallback}>“{mySign.intention}”</Text>
              <Text style={styles.horoscopeNote}>
                (Couldn't reach the horoscope service. Showing the sign's intention.)
              </Text>
            </View>
          )}

          <View style={styles.todayMoon}>
            <Text style={styles.todayMoonGlyph}>{lunar.glyph}</Text>
            <Text style={styles.todayMoonText}>
              {lunar.name} · {illumPct}% illuminated
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>YOUR ZODIAC SIGN</Text>
        <Text style={styles.sectionSub}>
          Tap to set your sign. Saved on this device
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.zodiacRow}
        >
          {zodiac.map(z => {
            const active = mySign.id === z.id;
            return (
              <TouchableOpacity
                key={z.id}
                activeOpacity={0.85}
                onPress={() => onSelectMyZodiac(z)}
                style={[
                  styles.zodiacChip,
                  {
                    borderColor: active ? z.color : z.color + '55',
                    backgroundColor: active ? z.color + '22' : 'rgba(0,0,0,0.30)',
                  },
                ]}
              >
                <Text style={[styles.zGlyph, { color: z.color }]}>{z.glyph}</Text>
                <Text style={styles.zName}>{z.name}</Text>
                <Text style={[styles.zElement, { color: z.color }]}>{z.element}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* TAROT CARD OF THE DAY */}
        <View style={[styles.tarotCard, { borderColor: '#A45BFF55' }]}>
          <View style={styles.tarotHeaderRow}>
            <Text style={styles.cardLabel}>CARD OF THE MOMENT</Text>
            <TouchableOpacity
              onPress={() => drawTarot()}
              style={styles.tarotRefreshBtn}
              accessibilityLabel="Draw a new tarot card"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowsClockwise size={16} color="#fff" weight="regular" />
            </TouchableOpacity>
          </View>
          {tarotLoading ? (
            <ActivityIndicator color="#A45BFF" style={{ marginVertical: 24 }} />
          ) : tarot ? (
            <>
              <Text style={styles.tarotName}>{tarot.name}</Text>
              {tarot.meaning_up ? (
                <Text style={styles.tarotMeaning}>{tarot.meaning_up}</Text>
              ) : null}
              {tarot.desc ? (
                <Text style={styles.tarotDesc} numberOfLines={4}>{tarot.desc}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.tarotMeaning}>Pull a card and pause for a moment.</Text>
          )}
        </View>

        <Text style={styles.footnote}>
          Horoscopes and tarot are fetched from a free public API.
          Take what resonates, leave the rest.
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
    fontSize: 30, letterSpacing: 1,
  },
  metaText: { fontSize: 11, letterSpacing: 0.5, marginTop: 2 },

  periodRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 999, padding: 4,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'transparent',
  },
  periodText: { color: '#ffffff80', fontSize: 11, letterSpacing: 1.5, fontWeight: '600' },

  horoscopeBox: {
    marginTop: 14,
    paddingLeft: 12, paddingVertical: 6,
    borderLeftWidth: 2,
  },
  horoscopeText: { color: '#ffffffdd', fontSize: 14, lineHeight: 21 },
  horoscopeFallback: { color: '#ffffffcc', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  horoscopeNote: { color: '#ffffff66', fontSize: 10, fontStyle: 'italic', marginTop: 6 },

  todayMoon: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  todayMoonGlyph: { color: '#ffffffcc', fontSize: 16, marginRight: 8 },
  todayMoonText: { color: '#ffffff99', fontSize: 12, letterSpacing: 0.5 },

  sectionLabel: {
    color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600',
    paddingHorizontal: 4, marginBottom: 4,
  },
  sectionSub: {
    color: '#ffffff66', fontSize: 11, fontStyle: 'italic',
    marginBottom: 10, paddingHorizontal: 4,
  },

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

  footnote: {
    color: '#ffffff66', fontSize: 12, textAlign: 'center',
    marginTop: 24, paddingHorizontal: 12, fontStyle: 'italic', lineHeight: 18,
  },
  cardLabel: { color: '#ffffff80', fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  tarotCard: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderRadius: 18, padding: 16, marginTop: 22, borderWidth: 1,
  },
  tarotHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tarotRefreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tarotRefreshText: { color: '#fff', fontSize: 16 },
  tarotName: {
    color: '#A45BFF',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 26, letterSpacing: 1, marginBottom: 6,
  },
  tarotMeaning: { color: '#ffffffdd', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  tarotDesc: { color: '#ffffff88', fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
});
