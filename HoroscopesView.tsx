import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import {
  ArrowsClockwise,
  BellRinging,
  BookOpen,
  Butterfly,
  Coins,
  Crown,
  Eye,
  Flashlight,
  FlowerLotus,
  GlobeHemisphereWest,
  Heart,
  Horse,
  InfinityIcon,
  Lightning,
  Link,
  MagicWand,
  MoonStars,
  PersonSimpleTaiChi,
  Scales,
  Sparkle,
  Star,
  Sun,
  Sword,
  Wine,
  type IconProps,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonDisc, type LunarInfo } from './App';
import {
  AmbientSurface,
  AmbientVeil,
  EditorialHeader,
  EditorialSection,
  StatusStrip,
} from './AmbientUI';
import type { Zodiac } from './lib/content';
import { lunarCountdownLabel } from './lib/lunar';

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
  // weekly and monthly rely on the TTL alone.
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
function horoscopeUrl(period: Period, signName: string): string {
  const encodedSign = encodeURIComponent(signName);
  if (ON_WEB) {
    return period === 'daily'
      ? `/api/horoscope?period=daily&sign=${encodedSign}&day=TODAY`
      : `/api/horoscope?period=${period}&sign=${encodedSign}`;
  }
  return period === 'daily'
    ? `https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${encodedSign}&day=TODAY`
    : `https://freehoroscopeapi.com/api/v1/get-horoscope/${period}?sign=${encodedSign}`;
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

type Period = 'daily' | 'weekly' | 'monthly';
const PERIODS: Period[] = ['daily', 'weekly', 'monthly'];
const PERIOD_ROW_INSET = 4;
type ReadingMode = 'horoscope' | 'tarot';
const MODE_SEGMENT_GAP = 6;

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
  toneIsPlaying: boolean;
  beatHz: number;
};

type TarotCard = {
  name: string;
  type?: string; // 'major' | 'minor' per the API
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

type TarotVisual = {
  Icon: React.ComponentType<IconProps>;
  upright: string;
  reversed: string;
};

// A compact archetype system keeps every card visually meaningful without
// shipping a heavy image deck. Major arcana get their own emblem; minor
// arcana inherit a clear suit symbol. The keyword changes with orientation.
const MAJOR_TAROT_VISUALS: Record<string, TarotVisual> = {
  fool: { Icon: Sparkle, upright: 'BEGINNING', reversed: 'HESITATION' },
  magician: { Icon: MagicWand, upright: 'WILL', reversed: 'MISDIRECTION' },
  highpriestess: { Icon: Eye, upright: 'INTUITION', reversed: 'DISCONNECT' },
  empress: { Icon: FlowerLotus, upright: 'NURTURE', reversed: 'DEPLETION' },
  emperor: { Icon: Crown, upright: 'STRUCTURE', reversed: 'RIGIDITY' },
  hierophant: { Icon: BookOpen, upright: 'TRADITION', reversed: 'RETHINKING' },
  lovers: { Icon: Heart, upright: 'ALIGNMENT', reversed: 'DISCORD' },
  chariot: { Icon: Horse, upright: 'DIRECTION', reversed: 'DRIFT' },
  strength: { Icon: InfinityIcon, upright: 'COURAGE', reversed: 'SELF-DOUBT' },
  hermit: { Icon: Flashlight, upright: 'INNER LIGHT', reversed: 'ISOLATION' },
  wheeloffortune: { Icon: ArrowsClockwise, upright: 'TURNING', reversed: 'RESISTANCE' },
  justice: { Icon: Scales, upright: 'BALANCE', reversed: 'IMBALANCE' },
  hangedman: { Icon: PersonSimpleTaiChi, upright: 'SURRENDER', reversed: 'STALLING' },
  death: { Icon: Butterfly, upright: 'TRANSFORM', reversed: 'RESISTANCE' },
  temperance: { Icon: Wine, upright: 'HARMONY', reversed: 'EXCESS' },
  devil: { Icon: Link, upright: 'ATTACHMENT', reversed: 'RELEASE' },
  tower: { Icon: Lightning, upright: 'UPHEAVAL', reversed: 'AVOIDANCE' },
  star: { Icon: Star, upright: 'HOPE', reversed: 'DISCOURAGEMENT' },
  moon: { Icon: MoonStars, upright: 'MYSTERY', reversed: 'CONFUSION' },
  sun: { Icon: Sun, upright: 'VITALITY', reversed: 'DIMMED JOY' },
  judgement: { Icon: BellRinging, upright: 'AWAKENING', reversed: 'SELF-DOUBT' },
  judgment: { Icon: BellRinging, upright: 'AWAKENING', reversed: 'SELF-DOUBT' },
  world: { Icon: GlobeHemisphereWest, upright: 'COMPLETION', reversed: 'UNFINISHED' },
};

const SUIT_TAROT_VISUALS: Array<{ match: RegExp; visual: TarotVisual }> = [
  { match: /\bwands?\b/i, visual: { Icon: MagicWand, upright: 'FIRE · DRIVE', reversed: 'BLOCKED FIRE' } },
  { match: /\bcups?\b/i, visual: { Icon: Wine, upright: 'WATER · FEELING', reversed: 'EMOTIONAL BLOCK' } },
  { match: /\bswords?\b/i, visual: { Icon: Sword, upright: 'AIR · CLARITY', reversed: 'INNER CONFLICT' } },
  { match: /\b(pentacles?|coins?)\b/i, visual: { Icon: Coins, upright: 'EARTH · GROUNDING', reversed: 'MATERIAL BLOCK' } },
];

function tarotVisualFor(name: string): TarotVisual {
  const normalized = name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '');
  const major = MAJOR_TAROT_VISUALS[normalized];
  if (major) return major;
  return SUIT_TAROT_VISUALS.find(item => item.match.test(name))?.visual
    ?? { Icon: Sparkle, upright: 'REFLECTION', reversed: 'RECONSIDER' };
}

// '1' = the minor arcana are shuffled in; majors are always in the pool.
const INCLUDE_MINOR_KEY = '@simply_ambient_tarot_minor_v1';

// The API tags each card with type 'major' | 'minor'; the suit-name pattern
// is the fallback for any response that omits it. ("Wheel of Fortune" also
// contains "of", so the pattern requires a suit.)
function isMinorArcana(card: TarotCard): boolean {
  if (card.type) return card.type.toLowerCase() === 'minor';
  return /\bof (Wands|Cups|Swords|Pentacles)\b/i.test(card.name ?? '');
}

// The API deals at most 10 cards per request and cannot filter by arcana,
// so draw in batches, dedupe by name, and keep only majors when asked.
// Majors are ~28% of the deck, so a few batches cover a 7-card spread.
async function fetchCards(count: number, majorOnly: boolean): Promise<TarotCard[]> {
  const out: TarotCard[] = [];
  const seen = new Set<string>();
  const attempts = majorOnly ? 6 : 2;
  for (let i = 0; i < attempts && out.length < count; i++) {
    const r = await fetch(tarotUrl(10));
    if (!r.ok) continue;
    const json = await r.json();
    const cards: TarotCard[] = Array.isArray(json?.cards) ? json.cards : [];
    for (const c of cards) {
      if (!c?.name || seen.has(c.name)) continue;
      if (majorOnly && isMinorArcana(c)) continue;
      seen.add(c.name);
      out.push(c);
      if (out.length >= count) break;
    }
  }
  return out;
}

export default function HoroscopesView({
  zodiac, mySign, lunar, onSelectMyZodiac, toneIsPlaying, beatHz,
}: Props) {
  const insets = useSafeAreaInsets();
  const [readingMode, setReadingMode] = useState<ReadingMode>('horoscope');
  const [modeRowWidth, setModeRowWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const modePosition = useRef(new Animated.Value(0)).current;
  const contentReveal = useRef(new Animated.Value(1)).current;
  const contentDirection = useRef(1);
  const signThemeReveal = useRef(new Animated.Value(1)).current;
  const [signTransitioning, setSignTransitioning] = useState(false);
  const [period, setPeriod] = useState<Period>('daily');
  const [periodRowWidth, setPeriodRowWidth] = useState(0);
  const periodPosition = useRef(new Animated.Value(0)).current;
  // The 12-sign picker is collapsed behind a CHANGE button; a permanent
  // "tap to set your sign" strip reads like onboarding that never ends.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [horoscope, setHoroscope] = useState<string | null>(null);
  // When the shown text was fetched, either from cache or the live service.
  const [horoscopeTs, setHoroscopeTs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [tarot, setTarot] = useState<TarotCard | null>(null);
  const [includeMinor, setIncludeMinor] = useState(false);
  const includeMinorRef = useRef(false);
  useEffect(() => { includeMinorRef.current = includeMinor; }, [includeMinor]);
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

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (active) setReduceMotion(enabled); })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (!reduceMotion) return;
    modePosition.stopAnimation();
    contentReveal.stopAnimation();
    periodPosition.stopAnimation();
    signThemeReveal.stopAnimation();
    modePosition.setValue(readingMode === 'tarot' ? 1 : 0);
    contentReveal.setValue(1);
    periodPosition.setValue(PERIODS.indexOf(period));
    signThemeReveal.setValue(1);
    setSignTransitioning(false);
  }, [contentReveal, modePosition, period, periodPosition, readingMode, reduceMotion, signThemeReveal]);

  const selectReadingMode = (nextMode: ReadingMode) => {
    if (nextMode === readingMode) return;
    const currentIndex = readingMode === 'tarot' ? 1 : 0;
    const nextIndex = nextMode === 'tarot' ? 1 : 0;
    contentDirection.current = nextIndex > currentIndex ? 1 : -1;
    modePosition.stopAnimation();
    contentReveal.stopAnimation();

    if (reduceMotion) {
      modePosition.setValue(nextIndex);
      contentReveal.setValue(1);
      setReadingMode(nextMode);
      return;
    }

    // Hide the outgoing room before React swaps it, then let the incoming
    // room arrive from the direction of the selected segment.
    contentReveal.setValue(0);
    setReadingMode(nextMode);
    Animated.parallel([
      Animated.timing(modePosition, {
        toValue: nextIndex,
        duration: 340,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentReveal, {
        toValue: 1,
        duration: 280,
        delay: 35,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const selectPeriod = (nextPeriod: Period) => {
    if (nextPeriod === period) return;
    const nextIndex = PERIODS.indexOf(nextPeriod);
    setPeriod(nextPeriod);
    periodPosition.stopAnimation();
    if (reduceMotion) {
      periodPosition.setValue(nextIndex);
      return;
    }
    Animated.spring(periodPosition, {
      toValue: nextIndex,
      stiffness: 230,
      damping: 26,
      mass: 0.82,
      overshootClamping: true,
      restDisplacementThreshold: 0.2,
      restSpeedThreshold: 0.2,
      useNativeDriver: true,
    }).start();
  };

  const selectZodiacSign = (nextSign: Zodiac) => {
    if (nextSign.id === mySign.id) {
      setPickerOpen(false);
      return;
    }
    if (signTransitioning) return;

    signThemeReveal.stopAnimation();
    if (reduceMotion) {
      onSelectMyZodiac(nextSign);
      setPickerOpen(false);
      signThemeReveal.setValue(1);
      return;
    }

    setSignTransitioning(true);
    Animated.timing(signThemeReveal, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        setSignTransitioning(false);
        return;
      }
      onSelectMyZodiac(nextSign);
      setPickerOpen(false);
      Animated.timing(signThemeReveal, {
        toValue: 1,
        duration: 680,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setSignTransitioning(false));
    });
  };

  // Guards the tarot fetch callbacks against setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Daily cache keys embed the date, so without a sweep yesterday's entries
  // would pile up forever (one per sign per day). Remove any daily key that
  // is stamped with a different local day. Weekly and monthly keys carry no
  // date and stay bounded at one per sign and period.
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const today = localDayStamp();
        const stale = keys.filter(k =>
          k.startsWith('@simply_ambient_horo_') &&
          /_daily_\d{4}-\d{2}-\d{2}_v1$/.test(k) &&
          !k.endsWith(`_daily_${today}_v1`),
        );
        if (stale.length) await AsyncStorage.multiRemove(stale);
      } catch {}
    })();
  }, []);

  async function drawSpread(n: SpreadSize) {
    setSpreadSize(n);
    setSpread(null);
    setSpreadRevealed([]);
    setSpreadError(false);
    setSpreadLoading(true);
    try {
      const cards = await fetchCards(n, !includeMinorRef.current);
      if (!mountedRef.current) return;
      if (cards.length === n) {
        setSpread(cards.map(card => ({ card, reversed: drawReversed() })));
        setSpreadRevealed(Array(n).fill(false));
      } else {
        setSpreadError(true);
      }
    } catch {
      if (mountedRef.current) setSpreadError(true);
    } finally {
      if (mountedRef.current) setSpreadLoading(false);
    }
  }

  async function drawTarot(force = false) {
    setTarotError(false);
    setTarotLoading(true);
    setTarotRevealed(false);
    try {
      const [c] = await fetchCards(1, !includeMinorRef.current);
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
    } catch {
      if (mountedRef.current) setTarotError(true);
    } finally {
      if (mountedRef.current) setTarotLoading(false);
    }
  }

  function toggleIncludeMinor() {
    const next = !includeMinor;
    setIncludeMinor(next);
    includeMinorRef.current = next;
    AsyncStorage.setItem(INCLUDE_MINOR_KEY, next ? '1' : '0').catch(() => {});
    // Turning minors off while a minor card sits face-down deals a fresh one.
    if (!next && tarot && isMinorArcana(tarot)) drawTarot();
  }

  useEffect(() => {
    AsyncStorage.getItem(INCLUDE_MINOR_KEY).then(v => {
      if (v === '1') {
        setIncludeMinor(true);
        includeMinorRef.current = true;
      }
    }).catch(() => {});
  }, []);

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
  }, [mySign.id, mySign.name, period]);

  const dateText = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const illumPct = Math.round(lunar.illum * 100);
  const lunarCountdown = lunarCountdownLabel(lunar.phase);

  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' }).toUpperCase();
  const periodLabel =
    period === 'daily' ? 'TODAY · ' + dateText.toUpperCase() :
    period === 'weekly' ? 'THIS WEEK' :
    'THIS MONTH · ' + monthName;

  const accent = readingMode === 'horoscope' ? mySign.color : '#B39BE0';
  const forecastTitle =
    period === 'daily' ? 'A note for today' :
    period === 'weekly' ? 'The rhythm of this week' :
    `The shape of ${new Date().toLocaleDateString(undefined, { month: 'long' })}`;
  const modeSegmentWidth = Math.max(0, (modeRowWidth - MODE_SEGMENT_GAP) / 2);
  const modeSegmentTravel = modeSegmentWidth + MODE_SEGMENT_GAP;
  const periodSegmentWidth = Math.max(0, (periodRowWidth - PERIOD_ROW_INSET * 2) / PERIODS.length);

  return (
    <AmbientVeil
      accent={accent}
      strength="light"
      active={toneIsPlaying}
      motionHz={beatHz}
      accentTransitionMs={920}
    >
      <Animated.View style={[styles.signThemeLayer, { opacity: signThemeReveal }]}>
      <EditorialHeader
        mode="REFLECT"
        title="Read the sky"
        accent={accent}
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <AmbientSurface accent={accent} quiet showOrb={false} style={styles.modeSurface}>
          <View
            style={styles.modeRow}
            accessibilityRole="tablist"
            onLayout={event => {
              const nextWidth = event.nativeEvent.layout.width;
              setModeRowWidth(current => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current);
            }}
          >
            {modeSegmentWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.modeSelectionPill,
                  {
                    width: modeSegmentWidth,
                    borderColor: accent + '66',
                    backgroundColor: accent + '18',
                    shadowColor: accent,
                    transform: [{
                      translateX: modePosition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, modeSegmentTravel],
                      }),
                    }],
                  },
                ]}
              />
            ) : null}
            {([
              { id: 'horoscope', label: 'HOROSCOPE', hint: 'Sign & moon', glyph: '☉', color: mySign.color },
              { id: 'tarot', label: 'TAROT', hint: 'Cards & spreads', glyph: '✦', color: '#B39BE0' },
            ] as Array<{ id: ReadingMode; label: string; hint: string; glyph: string; color: string }>).map(item => {
              const active = readingMode === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => selectReadingMode(item.id)}
                  activeOpacity={0.84}
                  accessibilityRole="tab"
                  accessibilityLabel={`${item.label}. ${item.hint}`}
                  accessibilityState={{ selected: active }}
                  style={styles.modeButton}
                >
                  <View
                    style={[
                      styles.modeGlyphWrap,
                      {
                        borderColor: item.color + (active ? '66' : '35'),
                        backgroundColor: active ? item.color + '10' : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.modeGlyph, { color: item.color }]}>{item.glyph}</Text>
                  </View>
                  <View style={styles.modeCopy}>
                    <Text style={[styles.modeLabel, active && { color: item.color }]}>{item.label}</Text>
                    <Text style={styles.modeHint}>{item.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </AmbientSurface>

        <Animated.View
          style={[
            styles.modeContent,
            {
              opacity: contentReveal,
              transform: [{
                translateX: contentReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [contentDirection.current * 14, 0],
                }),
              }],
            },
          ]}
        >
          {readingMode === 'horoscope' ? (
          <>
            <EditorialSection
              index="01"
              eyebrow="CELESTIAL WEATHER"
              title="Your sign, under today's moon"
              accent={mySign.color}
            />
        {/* Today / week / month widget */}
        <AmbientSurface accent={mySign.color} showOrb={false} style={styles.todayCard}>
          <View style={styles.todayRow}>
            <View style={[styles.signBadge, { borderColor: mySign.color + '88', backgroundColor: mySign.color + '16' }]}>
              <Text style={[styles.signBadgeGlyph, { color: mySign.color }]}>{textGlyph(mySign.glyph)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.todayLabel, { color: mySign.color }]}>YOUR SIGN</Text>
              <Text style={styles.todaySignName}>{mySign.name}</Text>
              <Text style={styles.metaText}>
                {mySign.element} · {mySign.qualities}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPickerOpen(o => !o)}
              style={[styles.changeSignBtn, pickerOpen && { borderColor: mySign.color + '77' }]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={pickerOpen ? 'Close sign picker' : 'Change your zodiac sign'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.changeSignText, pickerOpen && { color: mySign.color }]}>
                {pickerOpen ? 'CLOSE' : 'CHANGE'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.skyRule} />
          <View style={styles.todayMoon}>
            <View style={[styles.moonDiscWrap, { borderColor: mySign.color + '35' }]}>
              <MoonDisc phase={lunar.phase} size={34} />
            </View>
            <View style={styles.moonCopy}>
              <Text style={styles.todayLabel}>LUNAR WEATHER</Text>
              <Text style={styles.todayMoonName}>{lunar.name}</Text>
              <Text style={styles.todayMoonText}>{lunarCountdown}</Text>
            </View>
            <View style={[styles.illuminationBadge, { borderColor: mySign.color + '44' }]}>
              <Text style={[styles.illuminationNumber, { color: mySign.color }]}>{illumPct}%</Text>
              <Text style={styles.illuminationLabel}>LIT</Text>
            </View>
          </View>
        </AmbientSurface>

        {pickerOpen ? (
          <>
            <EditorialSection
              eyebrow="YOUR LENS"
              title="Choose your sign"
              subtitle="Choose a sign; you can change it whenever you need."
              accent={mySign.color}
            />
            <AmbientSurface accent={mySign.color} quiet showOrb={false} style={styles.pickerSurface}>
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
                      onPress={() => selectZodiacSign(z)}
                      disabled={signTransitioning}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${z.name} as your sign, ${z.element}`}
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.zodiacChip,
                        {
                          borderColor: active ? z.color : z.color + '45',
                          backgroundColor: active ? z.color + '1D' : 'rgba(255,255,255,0.025)',
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
            </AmbientSurface>
          </>
        ) : null}

        <EditorialSection
          index="02"
          eyebrow="THE READING"
          title={forecastTitle}
          accent={mySign.color}
        />

        <View
          style={styles.periodRow}
          accessibilityRole="tablist"
          onLayout={event => {
            const nextWidth = event.nativeEvent.layout.width;
            setPeriodRowWidth(current => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current);
          }}
        >
          {periodSegmentWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.periodSelectionPill,
                {
                  width: periodSegmentWidth,
                  borderColor: mySign.color + '70',
                  backgroundColor: mySign.color + '1C',
                  shadowColor: mySign.color,
                  transform: [{
                    translateX: periodPosition.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [0, periodSegmentWidth, periodSegmentWidth * 2],
                    }),
                  }],
                },
              ]}
            />
          ) : null}
          {PERIODS.map(p => {
            const active = p === period;
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.85}
                onPress={() => selectPeriod(p)}
                accessibilityRole="tab"
                accessibilityLabel={`Show ${p} horoscope`}
                accessibilityState={{ selected: active }}
                style={styles.periodBtn}
              >
                <Text style={[styles.periodText, active && { color: mySign.color }]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <AmbientSurface accent={mySign.color} showOrb={false} style={styles.manuscript}>
          <View style={styles.manuscriptHeading}>
            <Text style={[styles.manuscriptKicker, { color: mySign.color }]}>{periodLabel}</Text>
            <Text style={[styles.manuscriptGlyph, { color: mySign.color }]}>{textGlyph(mySign.glyph)}</Text>
          </View>
          <View style={[styles.manuscriptRule, { backgroundColor: mySign.color + '45' }]} />
          {loading && !horoscope ? (
            <View style={styles.readingState}>
              <ActivityIndicator color={mySign.color} />
              <Text style={styles.stateTitle}>Reading the sky…</Text>
              <Text style={styles.stateHint}>Checking for the latest reflection.</Text>
            </View>
          ) : horoscope ? (
            <>
              <Text style={styles.manuscriptBody}>{horoscope}</Text>
              <StatusStrip
                accent={mySign.color}
                label="CURRENT READING"
                detail={horoscopeTs != null ? freshnessLabel(horoscopeTs) : 'held locally'}
                active
              />
            </>
          ) : (
            <>
              <Text style={styles.fallbackQuote}>“{mySign.intention}”</Text>
              <View style={styles.fallbackNote}>
                <Text style={styles.fallbackNoteTitle}>The service is quiet right now.</Text>
                <Text style={styles.fallbackNoteText}>
                  Showing the intention already held in your sign instead.
                </Text>
              </View>
            </>
          )}
        </AmbientSurface>
          </>
        ) : (
          <>
            <EditorialSection
              index="01"
              eyebrow="CARD OF THE MOMENT"
              title="Turn one card, when you're ready"
              accent="#B39BE0"
            />

        {/* TAROT CARD OF THE DAY */}
        <AmbientSurface accent="#B39BE0" showOrb={false} style={styles.tarotCard}>
          <View style={styles.tarotHeaderRow}>
            <View>
              <Text style={styles.cardLabel}>DAILY DRAW</Text>
              <Text style={styles.tarotRoomTitle}>Card of the moment</Text>
            </View>
            <TouchableOpacity
              onPress={() => drawTarot()}
              style={styles.tarotRefreshBtn}
              accessibilityLabel="Draw a new tarot card"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowsClockwise size={17} color="#C6B6EC" weight="regular" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={toggleIncludeMinor}
            activeOpacity={0.85}
            accessibilityRole="switch"
            accessibilityState={{ checked: includeMinor }}
            accessibilityLabel="Shuffle the minor arcana into the deck"
            style={[styles.arcanaToggle, includeMinor && { borderColor: '#B39BE0', backgroundColor: '#B39BE022' }]}
          >
            <View style={styles.deckChoiceCopy}>
              <Text style={styles.deckChoiceLabel}>THE DECK</Text>
              <Text style={styles.deckChoiceTitle}>
                {includeMinor ? 'Major + minor arcana' : 'Major arcana only'}
              </Text>
            </View>
            <View style={[styles.deckChoiceState, includeMinor && { backgroundColor: '#B39BE0' }]}>
              <Text style={[styles.deckChoiceStateText, includeMinor && { color: '#111225' }]}>
                {includeMinor ? 'ALL' : 'MAJOR'}
              </Text>
            </View>
          </TouchableOpacity>
          {tarotLoading ? (
            <View style={styles.readingState}>
              <ActivityIndicator color="#B39BE0" />
              <Text style={styles.stateTitle}>Shuffling the deck…</Text>
              <Text style={styles.stateHint}>A card will rest here in a moment.</Text>
            </View>
          ) : tarot ? (
            <View style={styles.tarotStage}>
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
                <View style={styles.tarotPrompt}>
                  <Text style={styles.tarotPromptTitle}>A card is waiting face down.</Text>
                  <Text style={styles.tarotPromptText}>Turn it when you are ready to notice what it brings up.</Text>
                  <StatusStrip accent="#B39BE0" label="FACE DOWN" detail="tap the card to reveal" active />
                </View>
              ) : (
                <View style={styles.tarotInterpretation}>
                  <Text style={styles.tarotInterpretationLabel}>WHAT IT MAY INVITE</Text>
                  <Text style={styles.tarotMeaningLead}>
                    {(tarotReversed ? tarot.meaning_rev : tarot.meaning_up) ?? tarot.meaning_up ?? ''}
                  </Text>
                  {tarot.desc ? <Text style={styles.tarotDesc}>{tarot.desc}</Text> : null}
                  <StatusStrip
                    accent={tarotReversed ? '#D68097' : '#9DC7AC'}
                    label={tarotReversed ? 'REVERSED' : 'UPRIGHT'}
                    detail={tarot.name}
                    active
                  />
                </View>
              )}
            </View>
          ) : tarotError ? (
            <View style={styles.readingState}>
              <Text style={styles.stateGlyph}>◇</Text>
              <Text style={styles.stateTitle}>The cards could not arrive.</Text>
              <Text style={styles.stateHint}>Check your connection, then use the redraw button above.</Text>
            </View>
          ) : (
            <View style={styles.readingState}>
              <Text style={styles.stateGlyph}>✦</Text>
              <Text style={styles.stateTitle}>The table is ready.</Text>
              <Text style={styles.stateHint}>Draw a card and pause for a moment.</Text>
            </View>
          )}
        </AmbientSurface>

        {/* TAROT SPREADS */}
        <EditorialSection
          index="02"
          eyebrow="SPREADS"
          title="Lay out a wider question"
          subtitle="Choose a shape, then turn each position in its own time."
          accent="#B39BE0"
        />
        <AmbientSurface accent="#B39BE0" quiet showOrb={false} style={styles.spreadRoom}>
          <Text style={styles.spreadChoiceLabel}>CHOOSE THE SHAPE</Text>
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
            <View style={styles.readingState}>
              <ActivityIndicator color="#B39BE0" />
              <Text style={styles.stateTitle}>Laying out the cards…</Text>
            </View>
          ) : spread && spreadSize ? (
            <>
              <Text style={styles.spreadGuide}>The cards are face down. Turn each in its own time.</Text>
              {/* Wrapping rows sized so nothing scrolls or clips: 3 across,
                  5 as 3+2, 7 as 4+3. Meanings collect in a list below as
                  cards are revealed. */}
              <View style={styles.spreadGrid}>
                {spread.map((item, i) => {
                  const revealed = spreadRevealed[i] === true;
                  const pos = SPREAD_POSITIONS[spreadSize][i] ?? `Card ${i + 1}`;
                  const cw = spreadSize === 7 ? 70 : 90;
                  const ch = spreadSize === 7 ? 114 : 146;
                  return (
                    <View key={i} style={styles.spreadSlot}>
                      <Text style={styles.spreadPos} numberOfLines={1}>{pos}</Text>
                      <FlipCard
                        width={cw}
                        height={ch}
                        revealed={revealed}
                        onReveal={() =>
                          setSpreadRevealed(prev => prev.map((v, j) => (j === i ? true : v)))
                        }
                        label={revealed ? `${item.card.name}, ${item.reversed ? 'reversed' : 'upright'}` : `Turn the ${pos} card`}
                        back={<CardBack width={cw} height={ch} compact />}
                        face={<CardFace name={item.card.name} reversed={item.reversed} compact small={spreadSize === 7} />}
                      />
                    </View>
                  );
                })}
              </View>
              {spread.some((_, i) => spreadRevealed[i]) ? (
                <View style={styles.spreadReadList}>
                  <Text style={styles.spreadReadHeading}>THE READING SO FAR</Text>
                  {spread.map((item, i) => {
                    if (!spreadRevealed[i]) return null;
                    const pos = SPREAD_POSITIONS[spreadSize][i] ?? `Card ${i + 1}`;
                    return (
                      <View key={i} style={styles.spreadReadItem}>
                        <Text style={styles.spreadPos}>
                          {pos} · {item.card.name}{item.reversed ? ' · reversed' : ''}
                        </Text>
                        <Text style={styles.spreadReadMeaning}>
                          {(item.reversed ? item.card.meaning_rev : item.card.meaning_up) ?? item.card.meaning_up ?? ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : spreadError ? (
            <View style={styles.readingState}>
              <Text style={styles.stateGlyph}>◇</Text>
              <Text style={styles.stateTitle}>The spread could not be laid.</Text>
              <Text style={styles.stateHint}>Check your connection and choose the spread again.</Text>
            </View>
          ) : (
            <View style={styles.spreadEmpty}>
              <Text style={styles.spreadEmptyGlyph}>⌁</Text>
              <Text style={styles.spreadEmptyTitle}>No cards on the table yet.</Text>
              <Text style={styles.spreadEmptyText}>Three is concise. Five adds context. Seven opens the widest lens.</Text>
            </View>
          )}
        </AmbientSurface>
          </>
          )}
        </Animated.View>

        <View style={styles.closing}>
          <View style={[styles.closingLine, { backgroundColor: accent + '40' }]} />
          <Text style={[styles.closingGlyph, { color: accent }]}>{readingMode === 'horoscope' ? '☾' : '✦'}</Text>
          <View style={[styles.closingLine, { backgroundColor: accent + '40' }]} />
          <Text style={styles.footnote}>
            Horoscopes and tarot come from a free public API. Take what resonates, leave the rest.
          </Text>
        </View>
      </ScrollView>
      </Animated.View>
    </AmbientVeil>
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
function CardFace({
  name, reversed, compact, small,
}: {
  name: string;
  reversed: boolean;
  compact?: boolean;
  small?: boolean;
}) {
  const visual = tarotVisualFor(name);
  const SymbolIcon = visual.Icon;
  const symbolColor = reversed ? '#D68097' : '#C9A96B';
  const symbolSize = small ? 19 : compact ? 26 : 42;
  return (
    <View style={styles.cardShellFace}>
      <View style={[styles.cardInner, { justifyContent: 'space-between', paddingVertical: small ? 8 : 12 }]}>
        {!small ? <Text style={styles.cardOrnament}>✦</Text> : null}
        <View style={styles.cardSymbolBlock}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[
              styles.cardSymbolSeal,
              compact && styles.cardSymbolSealCompact,
              small && styles.cardSymbolSealSmall,
              {
                borderColor: symbolColor + '66',
                backgroundColor: symbolColor + '10',
                transform: [{ rotate: reversed ? '180deg' : '0deg' }],
              },
            ]}
          >
            <View style={[styles.cardSymbolOrbit, { borderColor: symbolColor + '35' }]} />
            <SymbolIcon size={symbolSize} color={symbolColor} weight="duotone" />
          </View>
          {!compact ? (
            <Text style={[styles.cardArchetype, { color: symbolColor }]} numberOfLines={1}>
              {reversed ? visual.reversed : visual.upright}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.cardFaceName,
            compact && { fontSize: 15, lineHeight: 19 },
            small && { fontSize: 12, lineHeight: 15, paddingHorizontal: 4 },
          ]}
        >
          {name}
        </Text>
        <Text style={[styles.cardOrient, small && { fontSize: 7, letterSpacing: 1.2 }, { color: reversed ? '#D68097' : '#9DC7AC' }]}>
          {reversed ? 'REVERSED' : 'UPRIGHT'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  signThemeLayer: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  modeSurface: { padding: 5, marginBottom: 2 },
  modeRow: { flexDirection: 'row', gap: MODE_SEGMENT_GAP, position: 'relative' },
  modeSelectionPill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    borderRadius: 20, borderWidth: 1,
    shadowOpacity: 0.22, shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 }, elevation: 2,
  },
  modeButton: {
    flex: 1, minHeight: 58, borderRadius: 20, borderWidth: 1,
    borderColor: 'transparent', paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', zIndex: 1,
  },
  modeGlyphWrap: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 9,
  },
  modeGlyph: { fontSize: 17 },
  modeCopy: { flex: 1 },
  modeLabel: { color: '#C1BFCE', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  modeHint: { color: '#7F8092', fontSize: 9.5, marginTop: 2 },
  modeContent: { width: '100%' },

  skyRule: { height: 1, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  moonDiscWrap: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,8,23,0.20)',
  },
  moonCopy: { flex: 1, marginLeft: 12 },
  todayMoonName: {
    color: '#F6F3FC', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20, lineHeight: 23,
  },
  illuminationBadge: {
    minWidth: 50, minHeight: 48, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,8,23,0.22)',
  },
  illuminationNumber: { fontSize: 13, fontWeight: '800' },
  illuminationLabel: { color: '#77788B', fontSize: 7, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  pickerSurface: { paddingVertical: 10, paddingLeft: 10 },

  manuscript: { padding: 20, minHeight: 220 },
  manuscriptHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manuscriptKicker: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.7, flexShrink: 1 },
  manuscriptGlyph: { fontFamily: GLYPH_FONT, fontSize: 26, lineHeight: 30 },
  manuscriptRule: { height: 1, marginTop: 11, marginBottom: 17 },
  manuscriptBody: {
    color: '#F2EEF8', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, lineHeight: 29, marginBottom: 18,
  },
  fallbackQuote: {
    color: '#F2EEF8', fontFamily: 'CormorantGaramond_500Medium_Italic',
    fontSize: 22, lineHeight: 31, textAlign: 'center', marginVertical: 16,
  },
  fallbackNote: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14, marginTop: 8,
  },
  fallbackNoteTitle: { color: '#D0CEDA', fontSize: 11.5, fontWeight: '700' },
  fallbackNoteText: { color: '#858698', fontSize: 11, lineHeight: 16, marginTop: 4 },

  readingState: { minHeight: 146, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  stateGlyph: { color: '#B39BE0', fontSize: 28, marginBottom: 8 },
  stateTitle: {
    color: '#F5F2FB', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, lineHeight: 23, textAlign: 'center', marginTop: 10,
  },
  stateHint: { color: '#898A9D', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },

  tarotRoomTitle: {
    color: '#F8F4FF', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 23, lineHeight: 26, marginTop: 3,
  },
  deckChoiceCopy: { flex: 1 },
  deckChoiceLabel: { color: '#8C8D9F', fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4 },
  deckChoiceTitle: { color: '#DAD6E4', fontSize: 11.5, marginTop: 3 },
  deckChoiceState: {
    minWidth: 57, minHeight: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)',
  },
  deckChoiceStateText: { color: '#8E8FA1', fontSize: 7.5, fontWeight: '800', letterSpacing: 1 },
  tarotStage: { alignItems: 'center', paddingTop: 5 },
  tarotPrompt: { width: '100%', marginTop: 17, gap: 8 },
  tarotPromptTitle: {
    color: '#F2EFF8', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18, textAlign: 'center',
  },
  tarotPromptText: { color: '#9293A5', fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 3 },
  tarotInterpretation: { width: '100%', marginTop: 18 },
  tarotInterpretationLabel: { color: '#B39BE0', fontSize: 8, fontWeight: '800', letterSpacing: 1.7, textAlign: 'center' },

  spreadRoom: { padding: 16 },
  spreadChoiceLabel: { color: '#9F94BA', fontSize: 8, fontWeight: '800', letterSpacing: 1.7 },
  spreadGuide: { color: '#8E8FA2', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 15 },
  spreadReadHeading: { color: '#9F94BA', fontSize: 8, fontWeight: '800', letterSpacing: 1.7, marginBottom: 2 },
  spreadEmpty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  spreadEmptyGlyph: { color: '#B39BE0', fontSize: 29 },
  spreadEmptyTitle: {
    color: '#F3F0F8', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 19, marginTop: 9, textAlign: 'center',
  },
  spreadEmptyText: { color: '#87889A', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },

  closing: { alignItems: 'center', marginTop: 31, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  closingLine: { width: 30, height: 1 },
  closingGlyph: { fontSize: 16, marginHorizontal: 10 },
  todayCard: { padding: 18 },
  todayLabel: {
    color: '#8F90A3', fontSize: 8, letterSpacing: 1.6, fontWeight: '800',
    marginBottom: 3,
  },
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  signBadge: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  signBadgeGlyph: { fontSize: 29, lineHeight: 35, fontFamily: GLYPH_FONT },
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
  metaText: { color: '#9899AB', fontSize: 11, letterSpacing: 0.5, marginTop: 2 },

  periodRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(18,19,42,0.56)',
    borderRadius: 18, padding: 4,
    marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  periodSelectionPill: {
    position: 'absolute',
    left: PERIOD_ROW_INSET,
    top: PERIOD_ROW_INSET,
    bottom: PERIOD_ROW_INSET,
    borderRadius: 14,
    borderWidth: 1,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  periodBtn: {
    flex: 1, minHeight: 42,
    paddingHorizontal: 7, paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  periodText: { color: '#8D8EA0', fontSize: 9.5, letterSpacing: 1.5, fontWeight: '800' },

  todayMoon: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 15,
  },
  todayMoonText: { color: '#9293A6', fontSize: 10.5, letterSpacing: 0.3, marginTop: 1 },

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
    width: '100%', color: '#747587', fontSize: 10.5, textAlign: 'center',
    marginTop: 7, paddingHorizontal: 12, fontStyle: 'italic', lineHeight: 16,
  },
  cardLabel: { color: '#9188A9', fontSize: 8, letterSpacing: 1.8, fontWeight: '800' },
  tarotCard: { padding: 18 },
  tarotHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  tarotRefreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tarotMeaningLead: {
    color: '#F0ECF7', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18, lineHeight: 27,
    textAlign: 'center', marginTop: 12, marginBottom: 10,
  },
  tarotDesc: {
    color: '#9293A6', fontSize: 11.5, lineHeight: 18,
    fontStyle: 'italic', textAlign: 'center', marginBottom: 15,
  },
  spreadBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 2 },
  spreadBtn: {
    flex: 1, minHeight: 58,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  spreadBtnText: { color: '#ffffffdd', fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
  spreadBtnSub: { color: '#ffffff66', fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 0.4 },
  spreadGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    columnGap: 8, rowGap: 14, marginTop: 14,
  },
  spreadSlot: { alignItems: 'center' },
  spreadPos: {
    color: '#C6B6EC', fontSize: 9, fontWeight: '800',
    letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6,
  },
  spreadReadList: {
    marginTop: 18, gap: 13, paddingTop: 15,
    borderTopWidth: 1, borderTopColor: 'rgba(179,155,224,0.24)',
  },
  spreadReadItem: { borderLeftWidth: 2, borderLeftColor: '#B39BE0', paddingLeft: 11 },
  spreadReadMeaning: {
    color: '#C6C2D0', fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 15, lineHeight: 21, marginTop: 3,
  },
  arcanaToggle: {
    alignSelf: 'stretch', minHeight: 52,
    paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 18,
    flexDirection: 'row', alignItems: 'center',
  },

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
  cardSymbolBlock: { alignItems: 'center', justifyContent: 'center' },
  cardSymbolSeal: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cardSymbolSealCompact: { width: 42, height: 42, borderRadius: 21 },
  cardSymbolSealSmall: { width: 30, height: 30, borderRadius: 15 },
  cardSymbolOrbit: {
    position: 'absolute',
    width: '76%', height: '76%', borderRadius: 999,
    borderWidth: 1,
  },
  cardArchetype: {
    maxWidth: 116,
    color: '#C9A96B',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 1.35,
    marginTop: 5,
    textAlign: 'center',
  },
  cardFaceName: {
    color: '#fff',
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 21, lineHeight: 26,
    textAlign: 'center', paddingHorizontal: 8,
  },
  cardOrient: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
});
