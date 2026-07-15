// Scene art for the soundscape player: filled shapes and gradients in depth
// layers, in place of the old single-opacity stroke outlines. Four rules:
// fill rather than outline, nothing at uniform opacity, at least two depth
// layers, and the lower-left text zone stays quiet.
//
// While the layer is audibly playing, scenes drift: rain falls, swells roll,
// embers rise, fireflies wander, static shimmers. Paused or idle scenes hold
// still, matching the app's rule that motion accompanies sound. All animation
// drives plain Animated.View transforms and opacity (native driver); nothing
// animates SVG props, so it stays smooth on old Android and on web.
//
// Seamless wraps: a wrapping layer renders its pattern twice in an oversized
// Svg and translates by exactly one period. The period is derived from the
// same cover-scale the base layer uses, so the two stay pixel-aligned.
//
// Point elements (dapple orbs, motes, fireflies, stars, cabin windows) are
// sprites: each is a tiny standalone Svg pinned to its viewBox point with the
// same cover-scale math, free to wander, glitter, or flicker on its own
// native-driver transform.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient as TintGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Waveform, type IconProps } from 'phosphor-react-native';

type SceneSoundscape = {
  id: string;
  color: string;
  Icon: React.ComponentType<IconProps>;
};

const W = 320;
const H = 120;

function solidAccent(color: string): string {
  return /^#[0-9a-f]{8}$/i.test(color) ? color.slice(0, 7) : color;
}

// Deterministic pseudo-random, so every render composes identically.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type StopSpec = Array<[number, number]>;

function gradStops(color: string, stops: StopSpec) {
  return stops.map(([offset, opacity], i) => (
    <Stop key={i} offset={String(offset)} stopColor={color} stopOpacity={opacity} />
  ));
}

function VGrad({ id, color, stops }: { id: string; color: string; stops: StopSpec }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {gradStops(color, stops)}
    </LinearGradient>
  );
}

function HGrad({ id, color, stops }: { id: string; color: string; stops: StopSpec }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {gradStops(color, stops)}
    </LinearGradient>
  );
}

function RGrad({ id, color, stops }: { id: string; color: string; stops: StopSpec }) {
  return (
    <RadialGradient id={id}>
      {gradStops(color, stops)}
    </RadialGradient>
  );
}

function SceneSvg({
  vbW = W, vbH = H, children,
}: {
  vbW?: number; vbH?: number; children: React.ReactNode;
}) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    >
      {children}
    </Svg>
  );
}

// A 0..1 sawtooth while active; parked at 0 otherwise. Self-restarting from
// the completion callback, since Animated.loop around a lone timing stops
// after its first pass on some platforms. The optional lead holds the value
// at 0 before every pass (stream glints rest between runs).
function useLoop(active: boolean, duration: number, lead = 0): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    let alive = true;
    // Cleanup stops the composite, never v directly: during the lead the
    // delay runs on an internal value, so v.stopAnimation() would miss it
    // and the queued pass would still fire on a paused scene.
    let anim: Animated.CompositeAnimation | null = null;
    const run = () => {
      v.setValue(0);
      const pass = Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true });
      anim = lead ? Animated.sequence([Animated.delay(lead), pass]) : pass;
      anim.start(({ finished }) => {
        if (finished && alive) run();
      });
    };
    run();
    return () => { alive = false; anim?.stop(); v.setValue(0); };
  }, [active, duration, lead, v]);
  return v;
}

// Eased there-and-back 0..1..0 while active; parked at 0 otherwise. The
// optional lead delays the first swing so a field of elements starts out of
// phase.
function useYoyo(active: boolean, duration: number, lead = 0): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const anim = lead ? Animated.sequence([Animated.delay(lead), loop]) : loop;
    anim.start();
    return () => { anim.stop(); v.setValue(0); };
  }, [active, duration, lead, v]);
  return v;
}

// Timed one-value choreography (thunder flashes, the wingtip strobe).
type SeqStep = { to?: number; duration?: number; delay?: number };
function useSequenceLoop(active: boolean, steps: SeqStep[], restValue = 0): Animated.Value {
  const v = useRef(new Animated.Value(restValue)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(restValue); return; }
    const anim = Animated.loop(
      Animated.sequence(
        steps.map(s =>
          s.delay != null
            ? Animated.delay(s.delay)
            : Animated.timing(v, { toValue: s.to ?? 0, duration: s.duration ?? 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ),
      ),
    );
    anim.start();
    return () => { anim.stop(); v.setValue(restValue); };
  }, [active, v, restValue]); // steps are static per scene
  return v;
}

// Cover-scale math shared by every layer (preserveAspectRatio slice).
function coverScale(w: number, h: number): number {
  return Math.max(w / W, h / H);
}

// A vertically wrapping layer: pattern rendered at yOff 0 and H, drifting by
// one period. direction 1 drifts down (rain), -1 drifts up (embers).
function WrapYLayer({
  playing, duration, w, h, direction = 1, opacity = 1, render,
}: {
  playing: boolean; duration: number; w: number; h: number;
  direction?: 1 | -1; opacity?: number;
  render: (yOff: number) => React.ReactNode;
}) {
  const loop = useLoop(playing, duration);
  if (!w || !h) return null;
  const period = H * coverScale(w, h);
  const translateY = loop.interpolate({ inputRange: [0, 1], outputRange: [0, direction * period] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 0, right: 0,
        top: -period, height: period * 2 + h,
        opacity, transform: [{ translateY }],
      }}
    >
      <SceneSvg vbH={H * 3}>
        {render(0)}
        {render(H)}
        {render(H * 2)}
      </SceneSvg>
    </Animated.View>
  );
}

// A horizontally wrapping layer (stream shimmer, breeze gusts, train
// streaks). The optional bob lifts the whole band up and back as it drifts,
// so water and wind undulate while they travel.
function WrapXLayer({
  playing, duration, w, h, direction = -1, opacity = 1, bobAmplitude = 0, bobDuration = 6000, render,
}: {
  playing: boolean; duration: number; w: number; h: number;
  direction?: 1 | -1; opacity?: number;
  bobAmplitude?: number; bobDuration?: number;
  render: (xOff: number) => React.ReactNode;
}) {
  const loop = useLoop(playing, duration);
  const bob = useYoyo(playing && bobAmplitude !== 0, bobDuration);
  if (!w || !h) return null;
  const period = W * coverScale(w, h);
  const translateX = loop.interpolate({ inputRange: [0, 1], outputRange: [0, direction * period] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -bobAmplitude * coverScale(w, h)] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, bottom: 0,
        left: -period, width: period * 2 + w,
        opacity, transform: [{ translateX }, { translateY }],
      }}
    >
      <SceneSvg vbW={W * 3}>
        {render(0)}
        {render(W)}
        {render(W * 2)}
      </SceneSvg>
    </Animated.View>
  );
}

// A tiny standalone Svg pinned to one viewBox point via the shared
// cover-scale math, so a single element can carry its own native-driver
// transform. Local coordinates run 0..size with the element centered.
function Sprite({
  cx, cy, size, w, h, style, children,
}: {
  cx: number; cy: number; size: number; w: number; h: number;
  style?: React.ComponentProps<typeof Animated.View>['style'];
  children: React.ReactNode;
}) {
  if (!w || !h) return null;
  const s = coverScale(w, h);
  const px = size * s;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: cx * s + (w - W * s) / 2 - px / 2,
          top: cy * s + (h - H * s) / 2 - px / 2,
          width: px,
          height: px,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

// A sprite that wanders like a firefly: the x and y bobs run on different
// periods, so the combined path traces a slow looping drift. Both axes rest
// at 0, and a paused scene holds the authored composition.
function DriftSprite({
  playing, cx, cy, size, w, h, motion, opacityRange, children,
}: {
  playing: boolean; cx: number; cy: number; size: number; w: number; h: number;
  motion: Motion; opacityRange?: [number, number]; children: React.ReactNode;
}) {
  const s = coverScale(w, h);
  const xYoyo = useYoyo(playing, motion.xDur, motion.lead);
  const yYoyo = useYoyo(playing, motion.yDur, motion.lead * 0.6);
  const translateX = xYoyo.interpolate({ inputRange: [0, 1], outputRange: [0, motion.xAmp * s] });
  const translateY = yYoyo.interpolate({ inputRange: [0, 1], outputRange: [0, -motion.yAmp * s] });
  const opacity = opacityRange
    ? yYoyo.interpolate({ inputRange: [0, 1], outputRange: opacityRange })
    : 1;
  return (
    <Sprite cx={cx} cy={cy} size={size} w={w} h={h} style={{ opacity, transform: [{ translateX }, { translateY }] }}>
      {children}
    </Sprite>
  );
}

// A sprite that glitters: a quick bright pop that settles back down, with a
// slight scale-up at the peak, each star on its own timetable.
type Twinkle = { lead: number; rise: number; fall: number; rest: number };
function TwinkleSprite({
  playing, cx, cy, size, w, h, timing, baseOpacity, pop = 1.6, children,
}: {
  playing: boolean; cx: number; cy: number; size: number; w: number; h: number;
  timing: Twinkle; baseOpacity: number; pop?: number; children: React.ReactNode;
}) {
  const spark = useSequenceLoop(playing, [
    { delay: timing.lead },
    { to: 1, duration: timing.rise },
    { to: 0, duration: timing.fall },
    { delay: timing.rest },
  ]);
  const opacity = spark.interpolate({ inputRange: [0, 1], outputRange: [baseOpacity, 1] });
  const scale = spark.interpolate({ inputRange: [0, 1], outputRange: [1, pop] });
  return (
    <Sprite cx={cx} cy={cy} size={size} w={w} h={h} style={{ opacity, transform: [{ scale }] }}>
      {children}
    </Sprite>
  );
}

// A sprite whose light dips and recovers at odd intervals (cabin windows).
type Flicker = { lead: number; dipA: number; dipB: number; rest: number };
function FlickerSprite({
  playing, cx, cy, size, w, h, flicker, children,
}: {
  playing: boolean; cx: number; cy: number; size: number; w: number; h: number;
  flicker: Flicker; children: React.ReactNode;
}) {
  const glow = useSequenceLoop(playing, [
    { delay: flicker.lead },
    { to: flicker.dipA, duration: 90 },
    { to: 1, duration: 160 },
    { to: flicker.dipB, duration: 70 },
    { to: 1, duration: 140 },
    { delay: flicker.rest },
  ], 1);
  return (
    <Sprite cx={cx} cy={cy} size={size} w={w} h={h} style={{ opacity: glow }}>
      {children}
    </Sprite>
  );
}

// A glint riding the current: it slides downstream while fading in and out,
// rests, then runs again. Travel matches the leftward drift of the flow
// bands.
function GlintSprite({
  playing, cx, cy, w, h, run, duration, lead, r,
}: {
  playing: boolean; cx: number; cy: number; w: number; h: number;
  run: number; duration: number; lead: number; r: number;
}) {
  const t = useLoop(playing, duration, lead);
  const s = coverScale(w, h);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, -run * s] });
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.8, 0.8, 0] });
  const size = r * 2 + 1;
  return (
    <Sprite cx={cx} cy={cy} size={size} w={w} h={h} style={{ opacity, transform: [{ translateX }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="#ffffff" />
    </Sprite>
  );
}

// A layer that only breathes in opacity (dapple, stars, static).
function PulseLayer({
  playing, duration, range, children,
}: {
  playing: boolean; duration: number; range: [number, number];
  children: React.ReactNode;
}) {
  const yoyo = useYoyo(playing, duration);
  const opacity = yoyo.interpolate({ inputRange: [0, 1], outputRange: range });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <SceneSvg>{children}</SceneSvg>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Precomputed compositions (deterministic; same numbers as the design mocks).
// ---------------------------------------------------------------------------

type Streak = { x: number; y: number; w: number; h: number; o: number };
function makeStreaks(seed: number, count: number, wMin: number, wMax: number, hMin: number, hMax: number, oMin: number, oMax: number, ySpread: number): Streak[] {
  const r = prng(seed);
  // Stratified x placement: one streak per equal column, jittered inside it,
  // so the rain reads evenly across the card.
  return Array.from({ length: count }, (_, i) => ({
    x: 6 + ((i + r()) / count) * 308,
    y: r() * ySpread,
    w: wMin + r() * (wMax - wMin),
    h: hMin + r() * (hMax - hMin),
    o: oMin + r() * (oMax - oMin),
  }));
}
const RAIN_BACK = makeStreaks(7, 18, 1.1, 1.4, 16, 32, 0.16, 0.3, 100);
const RAIN_FRONT = makeStreaks(8, 11, 1.9, 2.4, 26, 48, 0.34, 0.56, 90);
const THUNDER_RAIN = makeStreaks(19, 9, 1.0, 1.2, 16, 30, 0.24, 0.32, 46);

type Dot = { x: number; y: number; r: number; o: number };
function makeDots(seed: number, count: number, rMin: number, rMax: number): Dot[] {
  const r = prng(seed);
  return Array.from({ length: count }, () => {
    const y = r() * 118;
    return { x: r() * 320, y, r: rMin + r() * (rMax - rMin), o: (0.08 + r() * 0.3) * (1 - y / 340) };
  });
}
const NOISE_WHITE = makeDots(31, 260, 0.5, 1.2);
const NOISE_PINK = makeDots(37, 150, 0.9, 1.9);
const NOISE_BROWN = makeDots(41, 80, 1.4, 2.8);

// Per-sprite wander tunings: mismatched x/y periods bend each path into a
// slow open loop, staggered leads keep neighbors out of phase, and drift
// sets the reach in viewBox units. Amplitude signs flip per sprite so the
// field circulates both ways.
type Motion = { xDur: number; yDur: number; lead: number; xAmp: number; yAmp: number };
function makeMotion(seed: number, count: number, drift: number): Motion[] {
  const r = prng(seed);
  return Array.from({ length: count }, () => ({
    xDur: 6400 + r() * 5200,
    yDur: 4600 + r() * 3800,
    lead: r() * 2600,
    xAmp: drift * (0.7 + r() * 0.6) * (r() < 0.5 ? -1 : 1),
    yAmp: drift * (0.8 + r() * 0.7),
  }));
}

const FOREST_DAPPLE = (() => {
  const r = prng(11);
  return Array.from({ length: 13 }, () => ({ x: 12 + r() * 296, y: 6 + r() * 62, r: 4 + r() * 12, o: 0.16 + r() * 0.14 }));
})();
const DAPPLE_MOTION = makeMotion(111, FOREST_DAPPLE.length, 7);

const FIRE_EMBERS = (() => {
  const r = prng(9);
  return Array.from({ length: 7 }, () => ({ x: 120 + r() * 90, y: 22 + r() * 78, r: 1 + r() * 2.2 }));
})();

const NIGHT_STARS = (() => {
  const r = prng(17);
  return Array.from({ length: 11 }, () => ({ x: 8 + r() * 220, y: 8 + r() * 70, halo: 2.6 + r() * 2, core: 0.7 + r() * 0.5, o: 0.55 + r() * 0.3 }));
})();
const STAR_MOTION = makeMotion(119, NIGHT_STARS.length, 4);
const NIGHT_FLIES = (() => {
  const r = prng(18);
  return Array.from({ length: 3 }, () => ({ x: 30 + r() * 260, y: 100 + r() * 12 }));
})();
const FLY_MOTION = makeMotion(117, NIGHT_FLIES.length, 11);

const STREAM_PEBBLES = (() => {
  const r = prng(5);
  return Array.from({ length: 4 }, () => ({ x: 40 + r() * 240, y: 108 + r() * 6, rx: 7 + r() * 8, ry: 3.5 + r() * 2 }));
})();
// Glints ride the current: each has a start point, a downstream run, and its
// own pace and rest.
const STREAM_SPARKS = (() => {
  const r = prng(6);
  return Array.from({ length: 6 }, () => ({
    x: 24 + r() * 230, y: 62 + r() * 34, run: 46 + r() * 60,
    dur: 3200 + r() * 2800, lead: r() * 2600, r: 0.8 + r() * 0.5,
  }));
})();

const OCEAN_FOAM = (() => {
  const r = prng(3);
  return Array.from({ length: 5 }, () => ({ x: 30 + r() * 260, y: 95 + r() * 6, r: 0.9 + r(), o: 0.14 + r() * 0.12 }));
})();

const BREEZE_MOTES = (() => {
  const r = prng(13);
  return Array.from({ length: 4 }, () => ({ x: 40 + r() * 250, y: 20 + r() * 80, r: 1 + r() }));
})();
const MOTE_MOTION = makeMotion(113, BREEZE_MOTES.length, 9);

// Wind ribbons that tile seamlessly when they wrap: two identical humps per
// 320-unit period, with the seam tangent matching the start tangent. The
// bottom edge repeats the top curve offset by the thickness.
function ribbonPath(y: number, a: number, th: number): string {
  return [
    `M0 ${y}`,
    `C 53 ${y - a} 107 ${y + a} 160 ${y}`,
    `C 213 ${y - a} 267 ${y + a} 320 ${y}`,
    `L320 ${y + th}`,
    `C 267 ${y + th + a} 213 ${y + th - a} 160 ${y + th}`,
    `C 107 ${y + th + a} 53 ${y + th - a} 0 ${y + th}`,
    'Z',
  ].join(' ');
}
const BREEZE_RIBBONS = [
  { y: 26, a: 9, th: 6, o: 0.8, dur: 6200, bobAmp: 4, bobDur: 5200 },
  { y: 58, a: 7, th: 5, o: 0.6, dur: 9400, bobAmp: 3, bobDur: 6800 },
  { y: 92, a: 5, th: 4, o: 0.4, dur: 12800, bobAmp: 2.5, bobDur: 8200 },
].map(rb => ({ ...rb, d: ribbonPath(rb.y, rb.a, rb.th) }));

const CABIN_STARS = (() => {
  const r = prng(23);
  return Array.from({ length: 8 }, () => ({ x: r() * 320, y: 6 + r() * 48, r: 0.8 + r() * 0.6, o: 0.25 + r() * 0.3 }));
})();
// Glitter and flicker timetables: stars pop bright and settle, windows dip
// twice and recover, each on its own clock.
const CABIN_TWINKLES = (() => {
  const r = prng(24);
  return CABIN_STARS.map(() => ({
    lead: 400 + r() * 4200, rise: 120 + r() * 140,
    fall: 280 + r() * 320, rest: 700 + r() * 2600,
  }));
})();
const CABIN_FLICKERS = (() => {
  const r = prng(25);
  return Array.from({ length: 4 }, () => ({
    lead: 1200 + r() * 3600, dipA: 0.4 + r() * 0.25,
    dipB: 0.55 + r() * 0.25, rest: 900 + r() * 2400,
  }));
})();

const TRAIN_STREAKS = (() => {
  const r = prng(29);
  return Array.from({ length: 7 }, () => ({ x: r() * 130, y: 14 + r() * 74, w: 90 + r() * 170, h: 1.4 + r() * 1.6, o: 0.3 + r() * 0.4 }));
})();
const TRAIN_TOWNS = (() => {
  const r = prng(30);
  return Array.from({ length: 3 }, () => ({ x: 60 + r() * 220, y: 30 + r() * 40, r: 3.5 + r() * 2.5 }));
})();

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

type SceneProps = { color: string; playing: boolean; w: number; h: number };

function RainScene({ color, playing, w, h }: SceneProps) {
  const streaks = (list: Streak[], pfx: string) => (yOff: number) =>
    list.map((s, i) => (
      <Rect key={`${pfx}${yOff}-${i}`} x={s.x} y={s.y + yOff} width={s.w} height={s.h} rx={s.w / 2} fill={`url(#${pfx}Streak)`} opacity={s.o} />
    ));
  return (
    <>
      <SceneSvg>
        <Defs>
          <RGrad id="rainMist" color={color} stops={[[0, 0.22], [1, 0]]} />
          <RGrad id="rainSheen" color={color} stops={[[0, 0.14], [1, 0]]} />
        </Defs>
        <Ellipse cx={90} cy={122} rx={190} ry={34} fill="url(#rainMist)" />
        <Ellipse cx={265} cy={8} rx={120} ry={55} fill="url(#rainSheen)" />
      </SceneSvg>
      <WrapYLayer playing={playing} duration={5600} w={w} h={h} render={yOff => (
        <>
          <Defs><VGrad id="rbStreak" color={color} stops={[[0, 0], [0.22, 0.55], [0.75, 0.35], [1, 0]]} /></Defs>
          {streaks(RAIN_BACK, 'rb')(yOff)}
        </>
      )} />
      <WrapYLayer playing={playing} duration={3000} w={w} h={h} render={yOff => (
        <>
          <Defs><VGrad id="rfStreak" color={color} stops={[[0, 0], [0.22, 0.55], [0.75, 0.35], [1, 0]]} /></Defs>
          {streaks(RAIN_FRONT, 'rf')(yOff)}
        </>
      )} />
    </>
  );
}

// One tidal breath for the ocean: the heave travels top, middle, bottom on
// the way up, then releases bottom, middle, top on the way down, so the top
// band holds its crest longest. Values are a shared 8.8s timeline; each band
// runs its own delay/rise/hold/fall/rest sequence inside it.
const TIDE_RISE = 2000;
const TIDE_PERIOD = 8800;
const TIDE_BANDS = [
  { lead: 0,    hold: 3800, rest: 1000, amp: 9 },  // top
  { lead: 800,  hold: 2200, rest: 1800, amp: 11 }, // middle
  { lead: 1600, hold: 600,  rest: 2600, amp: 13 }, // bottom
];

function useTide(active: boolean, lead: number, hold: number, rest: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(lead),
        Animated.timing(v, { toValue: 1, duration: TIDE_RISE, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay(hold),
        Animated.timing(v, { toValue: 0, duration: TIDE_RISE, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay(rest),
      ]),
    );
    anim.start();
    return () => { anim.stop(); v.setValue(0); };
  }, [active, lead, hold, rest, v]);
  return v;
}

function TideBand({
  playing, lead, hold, rest, amp, children,
}: {
  playing: boolean; lead: number; hold: number; rest: number; amp: number;
  children: React.ReactNode;
}) {
  const tide = useTide(playing, lead, hold, rest);
  const translateY = tide.interpolate({ inputRange: [0, 1], outputRange: [0, -amp] });
  return (
    <Animated.View
      pointerEvents="none"
      // Overshoot below the card so a lifted band never exposes its underside.
      style={[StyleSheet.absoluteFill, { bottom: -16, transform: [{ translateY }] }]}
    >
      <SceneSvg>{children}</SceneSvg>
    </Animated.View>
  );
}

function OceanScene({ color, playing }: SceneProps) {
  const bands = [
    { d: 'M0 58 C55 46 95 66 160 56 S275 42 320 54 L320 140 L0 140 Z', top: 0.16 },
    { d: 'M0 78 C60 64 110 88 175 76 S280 62 320 76 L320 140 L0 140 Z', top: 0.26 },
    { d: 'M0 98 C70 86 120 108 190 96 S285 84 320 98 L320 140 L0 140 Z', top: 0.4 },
  ];
  return (
    <>
      <SceneSvg>
        <Defs><RGrad id="oGlow" color={color} stops={[[0, 0.16], [1, 0]]} /></Defs>
        <Ellipse cx={235} cy={26} rx={150} ry={40} fill="url(#oGlow)" />
      </SceneSvg>
      {bands.map((b, i) => (
        <TideBand key={i} playing={playing} {...TIDE_BANDS[i]}>
          <Defs><VGrad id={`oBand${i}`} color={color} stops={[[0, b.top], [1, 0.02]]} /></Defs>
          <Path d={b.d} fill={`url(#oBand${i})`} />
        </TideBand>
      ))}
      <SceneSvg>
        {OCEAN_FOAM.map((f, i) => (
          <Circle key={i} cx={f.x} cy={f.y} r={f.r} fill="#ffffff" opacity={f.o} />
        ))}
      </SceneSvg>
    </>
  );
}

function ForestScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      <SceneSvg>
        <Defs>
          <VGrad id="fTrunk" color={color} stops={[[0, 0.2], [1, 0]]} />
          <RGrad id="fFloor" color={color} stops={[[0, 0.14], [1, 0]]} />
        </Defs>
        <Path d="M52 14 L57 14 L61 120 L46 120 Z" fill="url(#fTrunk)" opacity={0.5} />
        <Path d="M236 2 L242 2 L248 120 L228 120 Z" fill="url(#fTrunk)" opacity={0.35} />
        <Ellipse cx={160} cy={126} rx={180} ry={26} fill="url(#fFloor)" />
      </SceneSvg>
      {FOREST_DAPPLE.map((d, i) => (
        <DriftSprite
          key={i} playing={playing} cx={d.x} cy={d.y} size={d.r * 2}
          w={w} h={h} motion={DAPPLE_MOTION[i]} opacityRange={[0.65, 1]}
        >
          <Defs><RGrad id={`fDap${i}`} color={color} stops={[[0, d.o], [1, 0]]} /></Defs>
          <Circle cx={d.r} cy={d.r} r={d.r} fill={`url(#fDap${i})`} />
        </DriftSprite>
      ))}
    </>
  );
}

function StreamScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      <SceneSvg>
        <Defs>
          {STREAM_PEBBLES.map((_, i) => (
            <VGrad key={i} id={`sPeb${i}`} color={color} stops={[[0, 0.28], [1, 0.04]]} />
          ))}
        </Defs>
        {STREAM_PEBBLES.map((p, i) => (
          <Ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={`url(#sPeb${i})`} />
        ))}
      </SceneSvg>
      <WrapXLayer playing={playing} duration={7000} w={w} h={h} bobAmplitude={3} bobDuration={5200} render={xOff => (
        <>
          <Defs><HGrad id="sFlow" color={color} stops={[[0, 0], [0.18, 0.3], [0.45, 0.12], [0.7, 0.32], [1, 0]]} /></Defs>
          <Path transform={`translate(${xOff},0)`} d="M0 82 C60 70 110 96 180 84 S280 66 320 80 L320 102 C270 90 210 108 150 98 S60 92 0 102 Z" fill="url(#sFlow)" />
        </>
      )} />
      <WrapXLayer playing={playing} duration={10400} w={w} h={h} bobAmplitude={2} bobDuration={7400} render={xOff => (
        <>
          <Defs><HGrad id="sFlow2" color={color} stops={[[0, 0], [0.3, 0.16], [0.6, 0.07], [0.85, 0.18], [1, 0]]} /></Defs>
          <Path transform={`translate(${xOff},0)`} d="M0 64 C70 56 130 74 200 66 S290 54 320 62 L320 74 C260 66 200 82 140 76 S50 72 0 78 Z" fill="url(#sFlow2)" />
        </>
      )} />
      {STREAM_SPARKS.map((g, i) => (
        <GlintSprite
          key={i} playing={playing} cx={g.x} cy={g.y} w={w} h={h}
          run={g.run} duration={g.dur} lead={g.lead} r={g.r}
        />
      ))}
    </>
  );
}

function FireScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      <SceneSvg>
        <Defs><RGrad id="hHearth" color={color} stops={[[0, 0.4], [0.5, 0.16], [1, 0]]} /></Defs>
        <Ellipse cx={160} cy={128} rx={150} ry={74} fill="url(#hHearth)" />
      </SceneSvg>
      <PulseLayer playing={playing} duration={2400} range={[0.72, 1]}>
        <Defs><RGrad id="hCore" color="#F2C089" stops={[[0, 0.5], [1, 0]]} /></Defs>
        <Ellipse cx={160} cy={126} rx={62} ry={36} fill="url(#hCore)" />
      </PulseLayer>
      <WrapYLayer playing={playing} duration={7200} w={w} h={h} direction={-1} render={yOff => (
        <>
          <Defs>
            {FIRE_EMBERS.map((_, i) => (
              <RGrad key={i} id={`hEmb${yOff}-${i}`} color={color} stops={[[0, 0.5], [1, 0]]} />
            ))}
          </Defs>
          {FIRE_EMBERS.map((e, i) => (
            <Circle key={i} cx={e.x} cy={e.y + yOff} r={e.r} fill={`url(#hEmb${yOff}-${i})`} opacity={0.7 * (1 - e.y / 130) + 0.15} />
          ))}
        </>
      )} />
    </>
  );
}

function StippleScene({ color, playing, dots, flicker }: { color: string; playing: boolean; dots: Dot[]; flicker: number }) {
  const half = Math.ceil(dots.length / 2);
  const a = dots.slice(0, half);
  const b = dots.slice(half);
  const field = (list: Dot[]) => list.map((d, i) => (
    <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={d.o} />
  ));
  return (
    <>
      <PulseLayer playing={playing} duration={flicker} range={[0.55, 1]}>{field(a)}</PulseLayer>
      <PulseLayer playing={playing} duration={flicker * 1.5} range={[1, 0.55]}>{field(b)}</PulseLayer>
    </>
  );
}

function BreezeScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      {BREEZE_RIBBONS.map((rb, i) => (
        <WrapXLayer
          key={i} playing={playing} duration={rb.dur} w={w} h={h} direction={1}
          opacity={rb.o} bobAmplitude={rb.bobAmp} bobDuration={rb.bobDur}
          render={xOff => (
            <>
              <Defs><HGrad id={`bRib${i}`} color={color} stops={[[0, 0], [0.25, 0.32], [0.6, 0.22], [1, 0]]} /></Defs>
              <Path transform={`translate(${xOff},0)`} d={rb.d} fill={`url(#bRib${i})`} />
            </>
          )}
        />
      ))}
      {BREEZE_MOTES.map((m, i) => {
        const size = m.r * 2 + 2;
        return (
          <DriftSprite
            key={i} playing={playing} cx={m.x} cy={m.y} size={size}
            w={w} h={h} motion={MOTE_MOTION[i]} opacityRange={[0.4, 1]}
          >
            <Circle cx={size / 2} cy={size / 2} r={m.r} fill={color} opacity={0.35} />
          </DriftSprite>
        );
      })}
    </>
  );
}

function NightScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      <SceneSvg>
        <Defs>
          <VGrad id="nSky" color={color} stops={[[0, 0.14], [1, 0]]} />
          <RGrad id="nHalo" color={color} stops={[[0, 0.3], [1, 0]]} />
        </Defs>
        <Rect x={0} y={0} width={320} height={120} fill="url(#nSky)" />
        <Circle cx={252} cy={34} r={34} fill="url(#nHalo)" />
        <Path d="M252 12 A22 22 0 1 0 252 56 A17.5 17.5 0 1 1 252 12 Z" fill={color} opacity={0.75} />
      </SceneSvg>
      {NIGHT_STARS.map((s, i) => {
        const size = s.halo * 2 + 2;
        const c = size / 2;
        return (
          <DriftSprite
            key={i} playing={playing} cx={s.x} cy={s.y} size={size}
            w={w} h={h} motion={STAR_MOTION[i]} opacityRange={[0.55, 1]}
          >
            <Defs><RGrad id={`nTw${i}`} color="#ffffff" stops={[[0, 0.2], [1, 0]]} /></Defs>
            <Circle cx={c} cy={c} r={s.halo} fill={`url(#nTw${i})`} />
            <Circle cx={c} cy={c} r={s.core} fill="#ffffff" opacity={s.o} />
          </DriftSprite>
        );
      })}
      {NIGHT_FLIES.map((f, i) => (
        <DriftSprite
          key={i} playing={playing} cx={f.x} cy={f.y} size={6}
          w={w} h={h} motion={FLY_MOTION[i]} opacityRange={[0.3, 1]}
        >
          <Defs><RGrad id={`nFly${i}`} color="#E8D28A" stops={[[0, 0.5], [1, 0]]} /></Defs>
          <Circle cx={3} cy={3} r={2.4} fill={`url(#nFly${i})`} />
        </DriftSprite>
      ))}
    </>
  );
}

function ThunderScene({ color, playing, w, h }: SceneProps) {
  // Sheet lightning: long dark hold, a bright pop, a dim echo, back to dark.
  const flash = useSequenceLoop(playing, [
    { delay: 3600 },
    { to: 1, duration: 110 },
    { to: 0.2, duration: 260 },
    { to: 0.7, duration: 90 },
    { to: 0, duration: 460 },
    { delay: 2200 },
  ]);
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: flash }]}>
        <SceneSvg>
          <Defs><RGrad id="tFlash" color="#DCE4F5" stops={[[0, 0.34], [0.6, 0.1], [1, 0]]} /></Defs>
          <Ellipse cx={118} cy={30} rx={85} ry={34} fill="url(#tFlash)" />
        </SceneSvg>
      </Animated.View>
      <SceneSvg>
        <Defs>
          <RGrad id="tBack" color={color} stops={[[0, 0.3], [1, 0]]} />
          <RGrad id="tFront" color="#2A2F4C" stops={[[0, 0.9], [0.75, 0.55], [1, 0]]} />
        </Defs>
        <Ellipse cx={70} cy={26} rx={62} ry={24} fill="url(#tBack)" />
        <Ellipse cx={160} cy={20} rx={76} ry={26} fill="url(#tBack)" />
        <Ellipse cx={250} cy={30} rx={66} ry={24} fill="url(#tBack)" />
        <Ellipse cx={105} cy={38} rx={74} ry={26} fill="url(#tFront)" />
        <Ellipse cx={215} cy={40} rx={84} ry={28} fill="url(#tFront)" />
      </SceneSvg>
      <WrapYLayer playing={playing} duration={6400} w={w} h={h} render={yOff => (
        <>
          <Defs><VGrad id="tStreak" color={color} stops={[[0, 0], [0.3, 0.24], [1, 0]]} /></Defs>
          {THUNDER_RAIN.map((s, i) => (
            <Rect key={i} x={s.x} y={s.y + 58 + yOff} width={s.w} height={s.h} rx={0.5} fill="url(#tStreak)" opacity={0.28} />
          ))}
        </>
      )} />
    </>
  );
}

function CabinScene({ color, playing, w, h }: SceneProps) {
  const strobe = useSequenceLoop(playing, [
    { to: 1, duration: 80 },
    { to: 0, duration: 160 },
    { delay: 2400 },
  ]);
  return (
    <>
      <PulseLayer playing={playing} duration={9000} range={[0.8, 1]}>
        <Defs><VGrad id="cDawn" color={color} stops={[[0, 0], [0.55, 0.1], [0.78, 0.26], [1, 0.05]]} /></Defs>
        <Rect x={0} y={40} width={320} height={80} fill="url(#cDawn)" />
        <Rect x={0} y={82} width={320} height={1.4} fill={color} opacity={0.3} />
      </PulseLayer>
      {CABIN_STARS.map((s, i) => {
        const size = s.r * 2 + 2;
        return (
          <TwinkleSprite
            key={i} playing={playing} cx={s.x} cy={s.y} size={size}
            w={w} h={h} timing={CABIN_TWINKLES[i]} baseOpacity={s.o}
          >
            <Circle cx={size / 2} cy={size / 2} r={s.r} fill="#ffffff" />
          </TwinkleSprite>
        );
      })}
      {[0, 1, 2, 3].map(i => (
        <FlickerSprite
          key={i} playing={playing} cx={36 + i * 66} cy={104} size={40}
          w={w} h={h} flicker={CABIN_FLICKERS[i]}
        >
          <Defs><RGrad id={`cWin${i}`} color={color} stops={[[0, 0.34 - i * 0.06], [1, 0]]} /></Defs>
          <Ellipse cx={20} cy={20} rx={17} ry={11} fill={`url(#cWin${i})`} />
          <Rect x={13} y={14} width={14} height={12} rx={6} fill={color} opacity={0.2 - i * 0.03} />
        </FlickerSprite>
      ))}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: strobe }]}>
        <SceneSvg>
          <Defs><RGrad id="cStrobe" color="#ffffff" stops={[[0, 0.5], [1, 0]]} /></Defs>
          <Circle cx={296} cy={70} r={5} fill="url(#cStrobe)" />
          <Circle cx={296} cy={70} r={1.2} fill="#ffffff" opacity={0.8} />
        </SceneSvg>
      </Animated.View>
    </>
  );
}

function TrainScene({ color, playing, w, h }: SceneProps) {
  return (
    <>
      <SceneSvg>
        <Defs><HGrad id="trRail" color={color} stops={[[0, 0], [0.5, 0.4], [1, 0]]} /></Defs>
        <Rect x={20} y={104} width={280} height={1.6} rx={0.8} fill="url(#trRail)" />
        <Rect x={60} y={111} width={200} height={1.2} rx={0.6} fill="url(#trRail)" opacity={0.5} />
      </SceneSvg>
      <PulseLayer playing={playing} duration={3400} range={[0.45, 1]}>
        <Defs><RGrad id="trTown" color="#E8D28A" stops={[[0, 0.36], [1, 0]]} /></Defs>
        {TRAIN_TOWNS.map((t, i) => (
          <React.Fragment key={i}>
            <Circle cx={t.x} cy={t.y} r={t.r} fill="url(#trTown)" />
            <Circle cx={t.x} cy={t.y} r={1} fill="#E8D28A" opacity={0.7} />
          </React.Fragment>
        ))}
      </PulseLayer>
      <WrapXLayer playing={playing} duration={2100} w={w} h={h} render={xOff => (
        <>
          <Defs><HGrad id="trSpeed" color={color} stops={[[0, 0], [0.25, 0.36], [0.75, 0.2], [1, 0]]} /></Defs>
          {TRAIN_STREAKS.map((s, i) => (
            <Rect key={i} x={s.x + xOff} y={s.y} width={s.w} height={s.h} rx={1.2} fill="url(#trSpeed)" opacity={s.o} />
          ))}
        </>
      )} />
    </>
  );
}

function IdleScene({ color }: { color: string }) {
  return (
    <SceneSvg>
      <Defs>
        <VGrad id="idleBand" color={color} stops={[[0, 0.14], [1, 0]]} />
        <RGrad id="idleGlow" color={color} stops={[[0, 0.12], [1, 0]]} />
      </Defs>
      <Ellipse cx={240} cy={12} rx={140} ry={50} fill="url(#idleGlow)" />
      <Path d="M0 66 C55 54 100 74 165 64 S280 50 320 62 L320 120 L0 120 Z" fill="url(#idleBand)" opacity={0.7} />
    </SceneSvg>
  );
}

// ---------------------------------------------------------------------------

export function SoundscapeScene({
  soundscape,
  playing,
}: {
  soundscape: SceneSoundscape | null;
  playing: boolean;
}) {
  const id = soundscape?.id ?? 'idle';
  const color = solidAccent(soundscape?.color ?? '#8FB8DE');
  const SceneIcon = soundscape?.Icon ?? Waveform;
  const [size, setSize] = useState({ w: 0, h: 0 });

  const props: SceneProps = { color, playing, w: size.w, h: size.h };
  const scene = (() => {
    switch (id) {
      case 'rain': return <RainScene {...props} />;
      case 'ocean': return <OceanScene {...props} />;
      case 'forest': return <ForestScene {...props} />;
      case 'stream': return <StreamScene {...props} />;
      case 'fire': return <FireScene {...props} />;
      case 'white': return <StippleScene color={color} playing={playing} dots={NOISE_WHITE} flicker={1100} />;
      case 'pink': return <StippleScene color={color} playing={playing} dots={NOISE_PINK} flicker={1700} />;
      case 'brown': return <StippleScene color={color} playing={playing} dots={NOISE_BROWN} flicker={2600} />;
      case 'breeze': return <BreezeScene {...props} />;
      case 'night': return <NightScene {...props} />;
      case 'thunder': return <ThunderScene {...props} />;
      case 'cabin': return <CabinScene {...props} />;
      case 'train': return <TrainScene {...props} />;
      default: return <IdleScene color={color} />;
    }
  })();

  return (
    <View
      style={[styles.scene, { backgroundColor: color + '0D' }]}
      pointerEvents="none"
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize(prev => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      <TintGradient
        colors={[color + '24', color + '08', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {scene}
      <View style={[styles.sceneIcon, { borderColor: color + '55', backgroundColor: color + '16' }]}>
        <SceneIcon size={28} color={color} weight="duotone" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Static tile art for the More hub. Same grammar as the player scenes,
// dialed down to sit behind tile copy; no motion, since nothing is playing
// from a menu.
// ---------------------------------------------------------------------------

const TILE_RAIN_BACK = (() => {
  const r = prng(43);
  return Array.from({ length: 10 }, () => ({
    x: 150 + r() * 165, y: r() * 90, w: 1.1 + r() * 0.3, h: 14 + r() * 14, o: 0.14 + r() * 0.12,
  }));
})();
const TILE_RAIN_FRONT = (() => {
  const r = prng(44);
  return Array.from({ length: 7 }, () => ({
    x: 160 + r() * 152, y: r() * 80, w: 1.8 + r() * 0.5, h: 20 + r() * 18, o: 0.28 + r() * 0.18,
  }));
})();

export function TileScene({
  kind,
  color,
}: {
  kind: 'routines' | 'soundscapes';
  color: string;
}) {
  const accent = solidAccent(color);
  if (kind === 'routines') {
    // A session path: one soft ribbon climbing the tile, three steps along
    // it brightening toward the destination.
    const nodes = [
      { x: 38, y: 118, r: 4.5, o: 0.45 },
      { x: 86, y: 74, r: 5.5, o: 0.65 },
      { x: 130, y: 42, r: 6.5, o: 0.9 },
    ];
    return (
      <View style={styles.tileScene} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 160 160" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          <Defs>
            <HGrad id="rtPath" color={accent} stops={[[0, 0], [0.35, 0.3], [0.75, 0.3], [1, 0.05]]} />
            <RGrad id="rtAura" color={accent} stops={[[0, 0.16], [1, 0]]} />
            {nodes.map((n, i) => (
              <RGrad key={i} id={`rtNode${i}`} color={accent} stops={[[0, n.o * 0.5], [1, 0]]} />
            ))}
          </Defs>
          <Ellipse cx={128} cy={34} rx={78} ry={54} fill="url(#rtAura)" />
          <Path
            d="M18 130 C52 122 56 84 86 76 S124 52 134 40 L138 44 C126 58 96 82 88 84 S54 128 22 134 Z"
            fill="url(#rtPath)"
          />
          {nodes.map((n, i) => (
            <React.Fragment key={i}>
              <Circle cx={n.x} cy={n.y} r={n.r * 2.6} fill={`url(#rtNode${i})`} />
              <Circle cx={n.x} cy={n.y} r={n.r * 0.42} fill={accent} opacity={n.o} />
            </React.Fragment>
          ))}
        </Svg>
      </View>
    );
  }
  // Soundscapes: a quiet weather medley, rain on the right over a low swell.
  return (
    <View style={styles.tileScene} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <VGrad id="tsStreak" color={accent} stops={[[0, 0], [0.22, 0.55], [0.75, 0.35], [1, 0]]} />
          <RGrad id="tsSheen" color={accent} stops={[[0, 0.14], [1, 0]]} />
          <RGrad id="tsMist" color={accent} stops={[[0, 0.16], [1, 0]]} />
          <VGrad id="tsSwell" color={accent} stops={[[0, 0.18], [1, 0.02]]} />
        </Defs>
        <Ellipse cx={272} cy={6} rx={110} ry={48} fill="url(#tsSheen)" />
        {TILE_RAIN_BACK.map((s, i) => (
          <Rect key={`b${i}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.w / 2} fill="url(#tsStreak)" opacity={s.o} />
        ))}
        {TILE_RAIN_FRONT.map((s, i) => (
          <Rect key={`f${i}`} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.w / 2} fill="url(#tsStreak)" opacity={s.o} />
        ))}
        <Path d="M0 112 C60 102 120 120 190 110 S290 98 320 108 L320 140 L0 140 Z" fill="url(#tsSwell)" />
        <Ellipse cx={268} cy={142} rx={130} ry={26} fill="url(#tsMist)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    overflow: 'hidden',
  },
  sceneIcon: {
    position: 'absolute', width: 50, height: 50, borderRadius: 25,
    right: 22, top: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  tileScene: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
});
