// Scene art for the soundscape player: filled shapes and gradients in depth
// layers, in place of the old single-opacity stroke outlines. Four rules:
// fill rather than outline, nothing at uniform opacity, at least two depth
// layers, and the lower-left text zone stays quiet.
//
// While the layer is audibly playing, scenes drift: rain falls, swells roll,
// embers rise, static shimmers. Paused or idle scenes hold still, matching
// the app's rule that motion accompanies sound. All animation drives plain
// Animated.View transforms and opacity (native driver); nothing animates
// SVG props, so it stays smooth on old Android and on web.
//
// Seamless wraps: a wrapping layer renders its pattern twice in an oversized
// Svg and translates by exactly one period. The period is derived from the
// same cover-scale the base layer uses, so the two stay pixel-aligned.

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

// A 0..1 sawtooth while active; parked at 0 otherwise.
function useLoop(active: boolean, duration: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => { anim.stop(); v.setValue(0); };
  }, [active, duration, v]);
  return v;
}

// Eased there-and-back 0..1..0 while active; parked at 0 otherwise.
function useYoyo(active: boolean, duration: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => { anim.stop(); v.setValue(0); };
  }, [active, duration, v]);
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

// A horizontally wrapping layer (stream shimmer, train streaks).
function WrapXLayer({
  playing, duration, w, h, direction = -1, opacity = 1, render,
}: {
  playing: boolean; duration: number; w: number; h: number;
  direction?: 1 | -1; opacity?: number;
  render: (xOff: number) => React.ReactNode;
}) {
  const loop = useLoop(playing, duration);
  if (!w || !h) return null;
  const period = W * coverScale(w, h);
  const translateX = loop.interpolate({ inputRange: [0, 1], outputRange: [0, direction * period] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, bottom: 0,
        left: -period, width: period * 2 + w,
        opacity, transform: [{ translateX }],
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

// A layer that sways sideways and back (swells, breeze ribbons).
function SwayLayer({
  playing, duration, amplitude, children, opacityRange,
}: {
  playing: boolean; duration: number; amplitude: number;
  children: React.ReactNode; opacityRange?: [number, number];
}) {
  const yoyo = useYoyo(playing, duration);
  const translateX = yoyo.interpolate({ inputRange: [0, 1], outputRange: [-amplitude, amplitude] });
  const opacity = opacityRange
    ? yoyo.interpolate({ inputRange: [0, 1], outputRange: opacityRange })
    : 1;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateX }] }]}>
      <SceneSvg>{children}</SceneSvg>
    </Animated.View>
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
  return Array.from({ length: count }, () => ({
    x: 6 + r() * 308,
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

const FOREST_DAPPLE = (() => {
  const r = prng(11);
  return Array.from({ length: 13 }, () => ({ x: 12 + r() * 296, y: 6 + r() * 62, r: 4 + r() * 12, o: 0.16 + r() * 0.14 }));
})();

const FIRE_EMBERS = (() => {
  const r = prng(9);
  return Array.from({ length: 7 }, () => ({ x: 120 + r() * 90, y: 22 + r() * 78, r: 1 + r() * 2.2 }));
})();

const NIGHT_STARS = (() => {
  const r = prng(17);
  return Array.from({ length: 11 }, () => ({ x: 8 + r() * 220, y: 8 + r() * 70, halo: 2.6 + r() * 2, core: 0.7 + r() * 0.5, o: 0.55 + r() * 0.3 }));
})();
const NIGHT_FLIES = (() => {
  const r = prng(18);
  return Array.from({ length: 3 }, () => ({ x: 30 + r() * 260, y: 100 + r() * 12 }));
})();

const STREAM_PEBBLES = (() => {
  const r = prng(5);
  return Array.from({ length: 4 }, () => ({ x: 40 + r() * 240, y: 108 + r() * 6, rx: 7 + r() * 8, ry: 3.5 + r() * 2 }));
})();
const STREAM_GLINTS = (() => {
  const r = prng(6);
  return Array.from({ length: 3 }, () => ({ x: 50 + r() * 220, y: 70 + r() * 20 }));
})();

const OCEAN_FOAM = (() => {
  const r = prng(3);
  return Array.from({ length: 5 }, () => ({ x: 30 + r() * 260, y: 95 + r() * 6, r: 0.9 + r(), o: 0.14 + r() * 0.12 }));
})();

const BREEZE_MOTES = (() => {
  const r = prng(13);
  return Array.from({ length: 4 }, () => ({ x: 40 + r() * 250, y: 20 + r() * 80, r: 1 + r() }));
})();

const CABIN_STARS = (() => {
  const r = prng(23);
  return Array.from({ length: 8 }, () => ({ x: r() * 320, y: 6 + r() * 48, r: 0.8 + r() * 0.6, o: 0.25 + r() * 0.3 }));
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

function OceanScene({ color, playing }: SceneProps) {
  const bands = [
    { d: 'M0 58 C55 46 95 66 160 56 S275 42 320 54 L320 120 L0 120 Z', top: 0.16, amp: 6, dur: 9000 },
    { d: 'M0 78 C60 64 110 88 175 76 S280 62 320 76 L320 120 L0 120 Z', top: 0.26, amp: 8, dur: 7200 },
    { d: 'M0 98 C70 86 120 108 190 96 S285 84 320 98 L320 120 L0 120 Z', top: 0.4, amp: 10, dur: 5600 },
  ];
  return (
    <>
      <SceneSvg>
        <Defs><RGrad id="oGlow" color={color} stops={[[0, 0.16], [1, 0]]} /></Defs>
        <Ellipse cx={235} cy={26} rx={150} ry={40} fill="url(#oGlow)" />
      </SceneSvg>
      {bands.map((b, i) => (
        <SwayLayer key={i} playing={playing} duration={b.dur} amplitude={b.amp}>
          <Defs><VGrad id={`oBand${i}`} color={color} stops={[[0, b.top], [1, 0.02]]} /></Defs>
          {/* Extend past both edges so the sway never shows a seam. */}
          <Path d={b.d} fill={`url(#oBand${i})`} transform="translate(-12,0) scale(1.08,1)" />
        </SwayLayer>
      ))}
      <SceneSvg>
        {OCEAN_FOAM.map((f, i) => (
          <Circle key={i} cx={f.x} cy={f.y} r={f.r} fill="#ffffff" opacity={f.o} />
        ))}
      </SceneSvg>
    </>
  );
}

function ForestScene({ color, playing }: SceneProps) {
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
      <PulseLayer playing={playing} duration={6400} range={[0.7, 1]}>
        <Defs>
          {FOREST_DAPPLE.map((d, i) => (
            <RGrad key={i} id={`fDap${i}`} color={color} stops={[[0, d.o], [1, 0]]} />
          ))}
        </Defs>
        {FOREST_DAPPLE.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={`url(#fDap${i})`} />
        ))}
      </PulseLayer>
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
      <WrapXLayer playing={playing} duration={7000} w={w} h={h} render={xOff => (
        <>
          <Defs><HGrad id="sFlow" color={color} stops={[[0, 0], [0.18, 0.3], [0.45, 0.12], [0.7, 0.32], [1, 0]]} /></Defs>
          <Path transform={`translate(${xOff},0)`} d="M0 82 C60 70 110 96 180 84 S280 66 320 80 L320 102 C270 90 210 108 150 98 S60 92 0 102 Z" fill="url(#sFlow)" />
        </>
      )} />
      <WrapXLayer playing={playing} duration={10400} w={w} h={h} render={xOff => (
        <>
          <Defs><HGrad id="sFlow2" color={color} stops={[[0, 0], [0.3, 0.16], [0.6, 0.07], [0.85, 0.18], [1, 0]]} /></Defs>
          <Path transform={`translate(${xOff},0)`} d="M0 64 C70 56 130 74 200 66 S290 54 320 62 L320 74 C260 66 200 82 140 76 S50 72 0 78 Z" fill="url(#sFlow2)" />
        </>
      )} />
      <PulseLayer playing={playing} duration={2600} range={[0.4, 1]}>
        {STREAM_GLINTS.map((g, i) => (
          <Circle key={i} cx={g.x} cy={g.y} r={0.9} fill="#ffffff" opacity={0.35} />
        ))}
      </PulseLayer>
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

function BreezeScene({ color, playing }: SceneProps) {
  const ribbons = [
    { d: 'M0 30 C60 18 120 40 190 28 S290 16 320 26 L320 31 C280 22 230 34 180 34 S70 26 0 35 Z', o: 0.85, amp: 10, dur: 8200 },
    { d: 'M0 62 C70 50 140 70 210 58 S300 48 320 56 L320 62 C290 52 240 66 180 64 S60 58 0 68 Z', o: 0.63, amp: 8, dur: 10600 },
    { d: 'M0 94 C60 84 130 102 200 92 S300 82 320 90 L320 95 C280 86 220 98 160 96 S60 90 0 100 Z', o: 0.41, amp: 6, dur: 13000 },
  ];
  return (
    <>
      {ribbons.map((rb, i) => (
        <SwayLayer key={i} playing={playing} duration={rb.dur} amplitude={rb.amp}>
          <Defs><HGrad id={`bRib${i}`} color={color} stops={[[0, 0], [0.3, 0.3], [0.7, 0.3], [1, 0]]} /></Defs>
          <Path d={rb.d} fill={`url(#bRib${i})`} opacity={rb.o} transform="translate(-12,0) scale(1.08,1)" />
        </SwayLayer>
      ))}
      <PulseLayer playing={playing} duration={4200} range={[0.5, 1]}>
        {BREEZE_MOTES.map((m, i) => (
          <Circle key={i} cx={m.x} cy={m.y} r={m.r} fill={color} opacity={0.3} />
        ))}
      </PulseLayer>
    </>
  );
}

function NightScene({ color, playing }: SceneProps) {
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
      <PulseLayer playing={playing} duration={4600} range={[0.55, 1]}>
        <Defs><RGrad id="nTwinkle" color="#ffffff" stops={[[0, 0.2], [1, 0]]} /></Defs>
        {NIGHT_STARS.map((s, i) => (
          <React.Fragment key={i}>
            <Circle cx={s.x} cy={s.y} r={s.halo} fill="url(#nTwinkle)" />
            <Circle cx={s.x} cy={s.y} r={s.core} fill="#ffffff" opacity={s.o} />
          </React.Fragment>
        ))}
      </PulseLayer>
      <PulseLayer playing={playing} duration={3200} range={[0.35, 1]}>
        <Defs><RGrad id="nFly" color="#E8D28A" stops={[[0, 0.5], [1, 0]]} /></Defs>
        {NIGHT_FLIES.map((f, i) => (
          <Circle key={i} cx={f.x} cy={f.y} r={2.4} fill="url(#nFly)" />
        ))}
      </PulseLayer>
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

function CabinScene({ color, playing }: SceneProps) {
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
      <SceneSvg>
        <Defs>
          {[0, 1, 2, 3].map(i => (
            <RGrad key={i} id={`cWin${i}`} color={color} stops={[[0, 0.34 - i * 0.06], [1, 0]]} />
          ))}
        </Defs>
        {CABIN_STARS.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffffff" opacity={s.o} />
        ))}
        {[0, 1, 2, 3].map(i => {
          const x = 36 + i * 66;
          return (
            <React.Fragment key={i}>
              <Ellipse cx={x} cy={104} rx={17} ry={11} fill={`url(#cWin${i})`} />
              <Rect x={x - 7} y={98} width={14} height={12} rx={6} fill={color} opacity={0.2 - i * 0.03} />
            </React.Fragment>
          );
        })}
      </SceneSvg>
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
