import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { ArrowsClockwise } from 'phosphor-react-native';

import { MoonDisc, type Zodiac, type LunarInfo } from './App';

const HOROSCOPE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
// Local calendar date (not UTC), so "today" matches what the user sees.
function localDayStamp(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function horoscopeCacheKey(signId: string, period: string) {
  // Daily entries are keyed by local date so a new local day is a cache miss;
  // monthly relies on the TTL alone.
  const day = period === 'daily' ? `_${localDayStamp()}` : '';
  return `@simply_ambient_horo_${signId}_${period}${day}_v1`;
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
// Handles "On May 15th, ...", "On Wednesday, May 15, ..." (full or
// abbreviated weekday), and an optional trailing year. Anchored to the
// start of the text on purpose: "On the other hand, ..." and mid-text
// dates are left alone. The month name is required, so bare "On Wednesday,"
// (a genuine forecast opener, no date drift) also survives.
function stripLeadingDate(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(
    /^On\s+(?:(?:Mon|Tue(?:s)?|Wed(?:nes)?|Thu(?:rs?)?|Fri|Sat(?:ur)?|Sun)(?:day)?\.?,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?,?\s+/i,
    '',
  );
  if (cleaned === text) return text;
  // Re-capitalize so "you might feel..." reads as a sentence again.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Quiet freshness stamp for the horoscope box ("Updated 2h ago"). Coarse
// buckets on purpose; nobody needs minute-perfect cache telemetry here.
function freshnessLabel(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 5) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

type Period = 'daily' | 'monthly' | 'yearly';

// Zodiac glyphs like U+2648 default to emoji presentation on Android and in
// browsers (a purple app-icon square that ignores text color). The text
// variation selector plus a serif font stack forces the plain symbol so it
// can be styled like type. The default system-ui stack lacks these glyphs
// entirely, which is what hands them to the emoji font in the first place.
function textGlyph(glyph: string): string {
  return glyph + '\uFE0E';
}
const GLYPH_FONT = Platform.select({
  web: 'Georgia, "Times New Roman", "Noto Sans Symbols", serif',
  default: 'serif',
});

type Props = {
  zodiac: Zodiac[];
  mySign: Zodiac;
  lunar: LunarInfo;
  onSelectMyZodiac: (z: Zodiac) => void;
};

type TarotCard = {
  name: string;
  meaning_up?: string;
  meaning_rev?: string;
  desc?: string;
};

// Spreads layered on top of the daily Card of the Moment. Each draws N cards
// and labels them by classic position so the pull reads as a spread, not a pile.
type SpreadSize = 3 | 5 | 7;
const SPREAD_SIZES: SpreadSize[] = [3, 5, 7];
const SPREAD_POSITIONS: Record<SpreadSize, string[]> = {
  3: ['Past', 'Present', 'Future'],
  5: ['You', 'Challenge', 'Past', 'Future', 'Outcome'],
  7: ['You', 'Challenge', 'Past', 'Present', 'Future', 'Advice', 'Outcome'],
};

// A drawn card carries its orientation. Reversals land at the classic
// roughly one-in-three odds, decided at draw time and kept with the card.
type DrawnCard = { card: TarotCard; reversed: boolean };
const drawReversed = () => Math.random() < 1 / 3;

export default function HoroscopesView({
  zodiac, mySign, lunar, onSelectMyZodiac,
}: Props) {
  const [period, setPeriod] = useState<Period>('daily');
  // The 12-sign picker is collapsed behind a CHANGE button; a permanent
  // "tap to set your sign" strip reads like onboarding that never ends.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [horoscope, setHoroscope] = useState<string | null>(null);
  // When the shown text was fetched (cache ts or fetch time); null for yearly.
  const [horoscopeTs, setHoroscopeTs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [tarot, setTarot] = useState<TarotCard | null>(null);
  const [tarotReversed, setTarotReversed] = useState(false);
  // The card sits face-down until tapped, once per visit. The reveal is the point.
  const [tarotRevealed, setTarotRevealed] = useState(false);
  const [tarotLoading, setTarotLoading] = useState(false);
  const [tarotError, setTarotError] = useState(false);

  const [spreadSize, setSpreadSize] = useState<SpreadSize | null>(null);
  const [spread, setSpread] = useState<DrawnCard[] | null>(null);
  const [spreadRevealed, setSpreadRevealed] = useState<boolean[]>([]);
  const [spreadLoading, setSpreadLoading] = useState(false);
  const [spreadError, setSpreadError] = useState(false);

  // Guards the tarot fetch callbacks against setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function drawSpread(n: SpreadSize) {
    setSpreadSize(n);
    setSpread(null);
    setSpreadRevealed([]);
    setSpreadError(false);
    setSpreadLoading(true);
    fetch(tarotUrl(n))
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!mountedRef.current) return;
        const cards = json?.cards;
        if (Array.isArray(cards) && cards.length) {
          setSpread(cards.slice(0, n).map((card: TarotCard) => ({ card, reversed: drawReversed() })));
          setSpreadRevealed(Array(n).fill(false));
        } else {
          setSpreadError(true);
        }
      })
      .catch(() => { if (mountedRef.current) setSpreadError(true); })
      .finally(() => { if (mountedRef.current) setSpreadLoading(false); });
  }

  function drawTarot(force = false) {
    setTarotError(false);
    setTarotLoading(true);
    setTarotRevealed(false);
    fetch(tarotUrl(1))
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        const c = json?.cards?.[0];
        if (c) {
          const reversed = drawReversed();
          AsyncStorage.setItem(
            TAROT_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), card: c, reversed }),
          ).catch(() => {});
          if (mountedRef.current) {
            setTarot(c);
            setTarotReversed(reversed);
          }
        } else if (mountedRef.current) {
          setTarotError(true);
        }
      })
      .catch(() => { if (mountedRef.current) setTarotError(true); })
      .finally(() => { if (mountedRef.current) setTarotLoading(false); });
  }

  // On first open: show the cached card immediately, refresh once a day.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TAROT_CACHE_KEY).then(raw => {
      if (cancelled) return;
      let stale = true;
      if (raw) {
        try {
          const cached = JSON.parse(raw) as { ts: number; card: TarotCard; reversed?: boolean };
          if (cached?.card) {
            setTarot(cached.card);
            setTarotReversed(cached.reversed === true);
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

    // Yearly is a static intention written into the zodiac data. No API call,
    // so no freshness stamp either.
    if (period === 'yearly') {
      setLoading(false);
      setHoroscope(mySign.yearAhead);
      setHoroscopeTs(null);
      return;
    }

    // Clear the previous sign/period text so it never shows under the new label,
    // and spin until the cache read settles so the fallback quote never flashes.
    setHoroscope(null);
    setHoroscopeTs(null);
    setLoading(true);

    const cacheKey = horoscopeCacheKey(mySign.id, period);
    const url = horoscopeUrl(period, mySign.name);

    (async () => {
      // Show cached value instantly; only refetch when it is stale or missing.
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (cancelled) return;
      let needsFetch = true;
      if (raw) {
        try {
          const cached = JSON.parse(raw) as { ts: number; text: string };
          if (cached?.text) {
            setHoroscope(stripLeadingDate(cached.text));
            if (typeof cached.ts === 'number') setHoroscopeTs(cached.ts);
            if (Date.now() - cached.ts < HOROSCOPE_TTL_MS) {
              needsFetch = false;
            }
          }
        } catch {}
      }

      if (!needsFetch) {
        setLoading(false);
        return;
      }

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
          const now = Date.now();
          setHoroscope(cleaned);
          setHoroscopeTs(now);
          AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: now, text: cleaned })).catch(() => {});
        } else if (!raw) {
          setHoroscope(null);
        }
      } catch {
        // Keep any cached value; with no cache, clear so stale text never shows.
        if (!cancelled && !raw) setHoroscope(null);
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
            <View style={[styles.signBadge, { borderColor: mySign.color + '88', backgroundColor: mySign.color + '16' }]}>
              <Text style={[styles.signBadgeGlyph, { color: mySign.color }]}>{textGlyph(mySign.glyph)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.todaySignName}>{mySign.name}</Text>
              <Text style={[styles.metaText, { color: mySign.color }]}>
                {mySign.element} · {mySign.qualities}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPickerOpen(o => !o)}
              style={styles.changeSignBtn}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={pickerOpen ? 'Close sign picker' : 'Change your zodiac sign'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.changeSignText}>{pickerOpen ? 'CLOSE' : 'CHANGE'}</Text>
            </TouchableOpacity>
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
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${p} horoscope`}
                  accessibilityState={{ selected: active }}
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

          {loading && !horoscope ? (
            <View style={[styles.horoscopeBox, { borderLeftColor: mySign.color }]}>
              <ActivityIndicator color={mySign.color} />
            </View>
          ) : horoscope ? (
            <View style={[styles.horoscopeBox, { borderLeftColor: mySign.color }]}>
              <Text style={styles.horoscopeText}>{horoscope}</Text>
              {period !== 'yearly' && horoscopeTs != null ? (
                <Text style={styles.horoscopeStamp}>{freshnessLabel(horoscopeTs)}</Text>
              ) : null}
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
            <MoonDisc phase={lunar.phase} size={18} />
            <Text style={styles.todayMoonText}>
              {lunar.name} · {illumPct}% illuminated
            </Text>
          </View>
        </View>

        {pickerOpen ? (
          <>
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
                    onPress={() => { onSelectMyZodiac(z); setPickerOpen(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${z.name} as your sign, ${z.element}`}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.zodiacChip,
                      {
                        borderColor: active ? z.color : z.color + '55',
                        backgroundColor: active ? z.color + '22' : 'rgba(0,0,0,0.30)',
                      },
                    ]}
                  >
                    <Text style={[styles.zGlyph, { color: z.color }]}>{textGlyph(z.glyph)}</Text>
                    <Text style={styles.zName}>{z.name}</Text>
                    <Text style={[styles.zElement, { color: z.color }]}>{z.element}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* TAROT CARD OF THE DAY */}
        <View style={[styles.tarotCard, { borderColor: '#B39BE055' }]}>
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
            <ActivityIndicator color="#B39BE0" style={{ marginVertical: 24 }} />
          ) : tarot ? (
            <View style={{ alignItems: 'center' }}>
              <FlipCard
                width={156}
                height={252}
                revealed={tarotRevealed}
                onReveal={() => setTarotRevealed(true)}
                label={tarotRevealed ? `${tarot.name}, ${tarotReversed ? 'reversed' : 'upright'}` : 'Reveal your card'}
                back={<CardBack width={156} height={252} />}
                face={<CardFace name={tarot.name} reversed={tarotReversed} />}
              />
              {!tarotRevealed ? (
                <Text style={styles.tarotHint}>A card has been drawn for you. Turn it when you are ready.</Text>
              ) : (
                <>
                  <Text style={styles.tarotMeaningLead}>
                    {(tarotReversed ? tarot.meaning_rev : tarot.meaning_up) ?? tarot.meaning_up ?? ''}
                  </Text>
                  {tarot.desc ? (
                    <Text style={styles.tarotDesc} numberOfLines={3}>{tarot.desc}</Text>
                  ) : null}
                </>
              )}
            </View>
          ) : tarotError ? (
            <Text style={styles.tarotMeaning}>Could not reach the cards. Try again.</Text>
          ) : (
            <Text style={styles.tarotMeaning}>Pull a card and pause for a moment.</Text>
          )}
        </View>

        {/* TAROT SPREADS */}
        <View style={[styles.tarotCard, { borderColor: '#B39BE055' }]}>
          <Text style={styles.cardLabel}>DRAW A SPREAD</Text>
          <View style={styles.spreadBtnRow}>
            {SPREAD_SIZES.map(n => {
              const active = spreadSize === n;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => drawSpread(n)}
                  style={[styles.spreadBtn, active && { borderColor: '#B39BE0', backgroundColor: '#B39BE022' }]}
                  accessibilityLabel={`Draw ${n}-card spread`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.spreadBtnText, active && { color: '#C6B6EC' }]}>{n}</Text>
                  <Text style={[styles.spreadBtnSub, active && { color: '#C6B6EC99' }]}>cards</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {spreadLoading ? (
            <ActivityIndicator color="#B39BE0" style={{ marginVertical: 22 }} />
          ) : spread && spreadSize ? (
            <>
              <Text style={styles.tarotHint}>The cards are laid face down. Turn each in its own time.</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.spreadRow}
              >
                {spread.map((item, i) => {
                  const revealed = spreadRevealed[i] === true;
                  const pos = SPREAD_POSITIONS[spreadSize][i] ?? `Card ${i + 1}`;
                  return (
                    <View key={i} style={styles.spreadSlot}>
                      <Text style={styles.spreadPos}>{pos}</Text>
                      <FlipCard
                        width={104}
                        height={168}
                        revealed={revealed}
                        onReveal={() =>
                          setSpreadRevealed(prev => prev.map((v, j) => (j === i ? true : v)))
                        }
                        label={revealed ? `${item.card.name}, ${item.reversed ? 'reversed' : 'upright'}` : `Turn the ${pos} card`}
                        back={<CardBack width={104} height={168} compact />}
                        face={<CardFace name={item.card.name} reversed={item.reversed} compact />}
                      />
                      {revealed ? (
                        <Text style={styles.spreadCardMeaning} numberOfLines={4}>
                          {(item.reversed ? item.card.meaning_rev : item.card.meaning_up) ?? item.card.meaning_up ?? ''}
                        </Text>
                      ) : (
                        <View style={styles.spreadMeaningGhost} />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          ) : spreadError ? (
            <Text style={styles.tarotMeaning}>Could not reach the cards. Try again.</Text>
          ) : (
            <Text style={styles.tarotMeaning}>Choose a spread to lay the cards.</Text>
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

// ===========================================================================
//   Tarot cards
// ===========================================================================

// A physical card that turns over. Two faces stacked back to back; tapping
// runs a perspective rotateY flip and the reveal happens mid-turn.
function FlipCard({
  width, height, revealed, onReveal, back, face, label,
}: {
  width: number;
  height: number;
  revealed: boolean;
  onReveal: () => void;
  back: React.ReactNode;
  face: React.ReactNode;
  label: string;
}) {
  const anim = useRef(new Animated.Value(revealed ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: revealed ? 1 : 0,
      duration: 620,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [revealed, anim]);
  const backRot = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const faceRot = anim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onReveal}
      disabled={revealed}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width, height }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ perspective: 1000 }, { rotateY: backRot }], backfaceVisibility: 'hidden' },
        ]}
      >
        {back}
      </Animated.View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ perspective: 1000 }, { rotateY: faceRot }], backfaceVisibility: 'hidden' },
        ]}
      >
        {face}
      </Animated.View>
    </TouchableOpacity>
  );
}

// Face-down card: deep violet ground, hairline gold double border, a small
// night sky (ring, crescent, scattered stars) drawn in Svg.
function CardBack({ width, height, compact }: { width: number; height: number; compact?: boolean }) {
  const w = width - 22;
  const h = height - 22;
  return (
    <View style={styles.cardShellBack}>
      <View style={styles.cardInner}>
        <Svg width={w} height={h} viewBox="0 0 100 162">
          <SvgCircle cx={50} cy={81} r={compact ? 26 : 30} stroke="#C9A96B55" strokeWidth={1} fill="none" />
          <SvgCircle cx={50} cy={81} r={compact ? 18 : 21} stroke="#B39BE033" strokeWidth={0.8} fill="none" />
          <SvgPath
            d="M 58 63 A 19 19 0 1 0 58 99 A 15 15 0 1 1 58 63"
            fill="#C9A96B"
            opacity={0.9}
          />
          <SvgCircle cx={22} cy={26} r={1.3} fill="#C9A96B" opacity={0.8} />
          <SvgCircle cx={80} cy={18} r={0.9} fill="#ffffff" opacity={0.6} />
          <SvgCircle cx={70} cy={38} r={1.1} fill="#C9A96B" opacity={0.55} />
          <SvgCircle cx={16} cy={70} r={0.8} fill="#ffffff" opacity={0.5} />
          <SvgCircle cx={86} cy={92} r={1.2} fill="#C9A96B" opacity={0.6} />
          <SvgCircle cx={24} cy={124} r={1.0} fill="#ffffff" opacity={0.55} />
          <SvgCircle cx={74} cy={136} r={1.3} fill="#C9A96B" opacity={0.75} />
          <SvgCircle cx={44} cy={148} r={0.8} fill="#ffffff" opacity={0.5} />
        </Svg>
      </View>
    </View>
  );
}

// Face-up card: ornament, serif name, orientation. Reversed keeps the text
// readable and turns the ornament instead; the chip carries the meaning.
function CardFace({ name, reversed, compact }: { name: string; reversed: boolean; compact?: boolean }) {
  return (
    <View style={styles.cardShellFace}>
      <View style={[styles.cardInner, { justifyContent: 'space-between', paddingVertical: 12 }]}>
        <Text style={[styles.cardOrnament, reversed && { transform: [{ rotate: '180deg' }] }]}>✦</Text>
        <Text style={[styles.cardFaceName, compact && { fontSize: 15, lineHeight: 19 }]}>
          {name}
        </Text>
        <Text style={[styles.cardOrient, { color: reversed ? '#D68097' : '#9DC7AC' }]}>
          {reversed ? 'REVERSED' : 'UPRIGHT'}
        </Text>
      </View>
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
  signBadge: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  signBadgeGlyph: { fontSize: 26, lineHeight: 32, fontFamily: GLYPH_FONT },
  changeSignBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 8,
  },
  changeSignText: { color: '#ffffff88', fontSize: 9, letterSpacing: 1.4, fontWeight: '700' },
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
  // The reading itself is set in the app's serif voice; plain sans here made
  // the centerpiece feel like an API dump.
  horoscopeText: {
    color: '#ffffffee',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18, lineHeight: 27,
  },
  horoscopeStamp: { color: '#ffffff66', fontSize: 10, fontStyle: 'italic', marginTop: 8 },
  horoscopeFallback: {
    color: '#ffffffdd',
    fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 18, lineHeight: 26,
  },
  horoscopeNote: { color: '#ffffff66', fontSize: 10, fontStyle: 'italic', marginTop: 6 },

  todayMoon: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  todayMoonText: { color: '#ffffff99', fontSize: 12, letterSpacing: 0.5, marginLeft: 8 },

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
  zGlyph: { fontSize: 26, lineHeight: 32, fontFamily: GLYPH_FONT },
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
  tarotMeaning: { color: '#ffffffdd', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  tarotMeaningLead: {
    color: '#ffffffdd', fontSize: 13, lineHeight: 19,
    textAlign: 'center', marginTop: 14, marginBottom: 8,
  },
  tarotDesc: { color: '#ffffff88', fontSize: 12, lineHeight: 17, fontStyle: 'italic', textAlign: 'center' },
  tarotHint: {
    color: '#ffffff77', fontSize: 11, fontStyle: 'italic',
    textAlign: 'center', marginTop: 12,
  },
  spreadBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 2 },
  spreadBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  spreadBtnText: { color: '#ffffffdd', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  spreadBtnSub: { color: '#ffffff66', fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 0.4 },
  spreadRow: { gap: 12, paddingVertical: 14, paddingRight: 8 },
  spreadSlot: { width: 116, alignItems: 'center' },
  spreadPos: {
    color: '#C6B6EC', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8,
  },
  spreadCardMeaning: {
    color: '#ffffff99', fontSize: 11, lineHeight: 15,
    marginTop: 8, textAlign: 'center', minHeight: 60,
  },
  spreadMeaningGhost: { minHeight: 60, marginTop: 8 },

  cardShellBack: {
    flex: 1,
    backgroundColor: '#191233',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C9A96B66',
    padding: 4,
  },
  cardShellFace: {
    flex: 1,
    backgroundColor: '#141126',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#B39BE066',
    padding: 4,
  },
  cardInner: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardOrnament: { color: '#C9A96B', fontSize: 14 },
  cardFaceName: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 21, lineHeight: 26,
    textAlign: 'center', paddingHorizontal: 8,
  },
  cardOrient: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
});
