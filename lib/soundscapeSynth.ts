// Procedural soundscape voices shared by the native WAV renderer and the web
// ScriptProcessor engine. One sample generator per scene lives here so a new
// scene is written once and both platforms play the same sound.
//
// A voice is stateful (filtered noise, random walks, event envelopes). Callers
// feed it a running time in seconds and a running sample index; periodic
// parts use the time, sparse events use the index. Every periodic modulator
// in a voice completes a whole number of cycles within its loop length, so a
// rendered loop wraps without a phase jump.

export type SoundscapeKey =
  | 'rain'
  | 'ocean'
  | 'forest'
  | 'stream'
  | 'fire'
  | 'white'
  | 'pink'
  | 'brown'
  | 'breeze'
  | 'night'
  | 'thunder'
  | 'cabin'
  | 'train'
  | 'boxfan'
  | 'ceilingfan'
  | 'deskfan'
  | 'vent';

export type FanSpeed = 'low' | 'medium' | 'high';
export const FAN_SPEEDS: readonly FanSpeed[] = ['low', 'medium', 'high'];
export const DEFAULT_FAN_SPEED: FanSpeed = 'medium';

// Scenes whose sound changes with the fan speed setting. Vent Hum is a fixed
// duct so speed never applies to it.
const FAN_KEYS: ReadonlySet<string> = new Set(['boxfan', 'ceilingfan', 'deskfan']);

export function isFanSoundscape(kind: string): kind is 'boxfan' | 'ceilingfan' | 'deskfan' {
  return FAN_KEYS.has(kind);
}

export function isFanSpeed(value: unknown): value is FanSpeed {
  return typeof value === 'string' && (FAN_SPEEDS as readonly string[]).includes(value);
}

export const SOUNDSCAPE_SAMPLE_RATE = 44100;

export const NIGHT_CRICKET_LOOP_SECONDS = 16;

// Loop length rendered on native. The web engine runs the same voice without
// a loop, so these only need to hold the whole-cycle rule above.
export function soundscapeLoopSeconds(kind: SoundscapeKey): number {
  switch (kind) {
    case 'thunder': return 12;
    case 'night': return NIGHT_CRICKET_LOOP_SECONDS;
    case 'fire':
    case 'breeze':
    case 'train':
    case 'ceilingfan':
      return 6;
    case 'cabin':
    case 'boxfan':
      return 4;
    case 'deskfan': return DESK_FAN_SWEEP_SECONDS;
    default: return 2;
  }
}

export function seededNoise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

export function soundscapeSeed(kind: string): number {
  return kind.split('').reduce((acc, ch) => acc + ch.charCodeAt(0) * 37, 7919);
}

// ---------------------------------------------------------------------------
//   Summer Night crickets
// ---------------------------------------------------------------------------

type CricketEvent = readonly [start: number, duration: number, pulseHz: number, amplitude: number];

const NIGHT_CRICKETS_LEFT: readonly CricketEvent[] = [
  [0.62, 0.24, 29, 0.76], [2.05, 0.18, 31, 0.58], [3.48, 0.30, 27, 0.92],
  [5.82, 0.21, 32, 0.65], [7.24, 0.27, 29, 0.83], [9.63, 0.19, 33, 0.55],
  [11.18, 0.25, 28, 1], [13.66, 0.22, 30, 0.71], [15.02, 0.20, 32, 0.60],
];
const NIGHT_CRICKETS_RIGHT: readonly CricketEvent[] = [
  [1.16, 0.20, 31, 0.62], [2.72, 0.28, 28, 0.88], [4.46, 0.18, 34, 0.54],
  [6.31, 0.25, 29, 0.78], [8.11, 0.21, 32, 0.68], [10.34, 0.29, 27, 0.96],
  [12.24, 0.19, 33, 0.57], [14.19, 0.26, 29, 0.81],
];

function cricketEnvelope(t: number, events: readonly CricketEvent[]) {
  const cycle = ((t % NIGHT_CRICKET_LOOP_SECONDS) + NIGHT_CRICKET_LOOP_SECONDS)
    % NIGHT_CRICKET_LOOP_SECONDS;
  for (const [start, duration, pulseHz, amplitude] of events) {
    if (cycle < start) break;
    const x = cycle - start;
    if (x >= duration) continue;
    const group = Math.sin(Math.PI * x / duration) ** 2;
    const pulse = (x * pulseHz) % 1;
    const duty = 0.46;
    const syllable = pulse < duty ? Math.sin(Math.PI * pulse / duty) ** 2 : 0;
    return amplitude * group * syllable;
  }
  return 0;
}

export function summerNightSample(t: number, white: number, pink: number, brown: number): [number, number] {
  const twoPi = Math.PI * 2;
  const envLeft = cricketEnvelope(t, NIGHT_CRICKETS_LEFT);
  const envRight = cricketEnvelope(t, NIGHT_CRICKETS_RIGHT);
  const carrierLeft = envLeft > 0 ? (
    Math.sin(twoPi * 3260 * t + 0.14 * Math.sin(twoPi * 11.3 * t)) * 0.52
    + Math.sin(twoPi * 3291 * t + 1.1) * 0.29
    + Math.sin(twoPi * 3227 * t + 0.45) * 0.19
    + white * 0.12
  ) : 0;
  const carrierRight = envRight > 0 ? (
    Math.sin(twoPi * 3820 * t + 0.13 * Math.sin(twoPi * 9.7 * t)) * 0.50
    + Math.sin(twoPi * 3857 * t + 0.7) * 0.31
    + Math.sin(twoPi * 3786 * t + 1.65) * 0.19
    + white * 0.12
  ) : 0;
  const bed = pink * 0.032 + brown * 0.007;
  const colonyLeft = envLeft * carrierLeft * 0.28;
  const colonyRight = envRight * carrierRight * 0.26;
  return [
    bed + colonyLeft + colonyRight * 0.24,
    bed * 0.90 + colonyRight + colonyLeft * 0.22,
  ];
}

// ---------------------------------------------------------------------------
//   Fans
// ---------------------------------------------------------------------------
// Every fan is the same recipe at different rates: a low-passed noise bed
// (the air), amplitude-modulated once per blade pass (the chop), wobbling
// once per rotation (a slightly unbalanced hub), over a faint motor hum.
// Rates are chosen so each completes whole cycles inside the scene's loop.

type FanProfile = {
  rotationHz: number;   // hub revolutions per second
  blades: number;       // blade passes per revolution
  chop: number;         // blade-pass modulation depth
  wobble: number;       // per-revolution modulation depth
  air: number;          // low-passed bed level
  breath: number;       // brighter noise on top of the bed
  hum: number;          // motor tone level
  lowPass: number;      // one-pole coefficient for the bed (higher is darker)
  hiss: number;         // raw white noise as a fraction of breath (static)
};

const BOX_FAN: Record<FanSpeed, FanProfile> = {
  // 4-second loop: rotation rates are multiples of 0.25 Hz.
  // Mostly moving air: the bright breath and raw hiss stay low so the
  // blade chop reads as air, never as static.
  low:    { rotationHz: 14, blades: 5, chop: 0.16, wobble: 0.05, air: 0.32, breath: 0.012, hum: 0.014, lowPass: 0.9978, hiss: 0.04 },
  medium: { rotationHz: 18, blades: 5, chop: 0.18, wobble: 0.06, air: 0.36, breath: 0.018, hum: 0.018, lowPass: 0.9970, hiss: 0.04 },
  high:   { rotationHz: 22, blades: 5, chop: 0.20, wobble: 0.07, air: 0.40, breath: 0.026, hum: 0.022, lowPass: 0.9960, hiss: 0.04 },
};

const CEILING_FAN: Record<FanSpeed, FanProfile> = {
  // 6-second loop: rotation rates are multiples of 1/6 Hz.
  low:    { rotationHz: 1,   blades: 5, chop: 0.34, wobble: 0.10, air: 0.40, breath: 0.010, hum: 0.006, lowPass: 0.9985, hiss: 0.18 },
  medium: { rotationHz: 1.5, blades: 5, chop: 0.38, wobble: 0.12, air: 0.42, breath: 0.016, hum: 0.008, lowPass: 0.9980, hiss: 0.18 },
  high:   { rotationHz: 2.5, blades: 5, chop: 0.42, wobble: 0.14, air: 0.44, breath: 0.024, hum: 0.010, lowPass: 0.9975, hiss: 0.18 },
};

const DESK_FAN: Record<FanSpeed, FanProfile> = {
  // 10-second loop (one oscillation sweep): rotation rates are multiples of 0.1 Hz.
  low:    { rotationHz: 18, blades: 3, chop: 0.14, wobble: 0.04, air: 0.26, breath: 0.040, hum: 0.012, lowPass: 0.9970, hiss: 0.18 },
  medium: { rotationHz: 24, blades: 3, chop: 0.16, wobble: 0.05, air: 0.28, breath: 0.056, hum: 0.016, lowPass: 0.9960, hiss: 0.18 },
  high:   { rotationHz: 30, blades: 3, chop: 0.18, wobble: 0.06, air: 0.30, breath: 0.076, hum: 0.020, lowPass: 0.9950, hiss: 0.18 },
};

export const DESK_FAN_SWEEP_SECONDS = 10;

export function fanProfile(kind: 'boxfan' | 'ceilingfan' | 'deskfan', speed: FanSpeed): FanProfile {
  switch (kind) {
    case 'boxfan': return BOX_FAN[speed];
    case 'ceilingfan': return CEILING_FAN[speed];
    case 'deskfan': return DESK_FAN[speed];
  }
}

// ---------------------------------------------------------------------------
//   Voice
// ---------------------------------------------------------------------------

export type SoundscapeVoice = {
  next(t: number, i: number): [number, number];
};

export type VoiceOptions = {
  seed?: number;
  speed?: FanSpeed;
};

export function createSoundscapeVoice(kind: SoundscapeKey, options: VoiceOptions = {}): SoundscapeVoice {
  const rnd = seededNoise(options.seed ?? soundscapeSeed(kind));
  const speed = options.speed ?? DEFAULT_FAN_SPEED;
  const twoPi = Math.PI * 2;
  let pink = 0;
  let brown = 0;
  let rain = 0;
  let leftDrift = 0;
  let rightDrift = 0;
  let rainDropLeft = 0;
  let rainDropRight = 0;
  let fireCrackle = 0;
  let firePop = 0;
  let breezeLow = 0;
  let thunderLow = 0;
  let cabinLow = 0;
  let trainLow = 0;
  let fanLow = 0;
  let ventLow = 0;
  let ventDeep = 0;

  const fan = isFanSoundscape(kind) ? fanProfile(kind, speed) : null;

  return {
    next(t, i) {
      const white = rnd();
      pink = pink * 0.92 + white * 0.08;
      brown = Math.max(-1, Math.min(1, brown + white * 0.025));
      rain = rain * 0.72 + white * 0.28;
      leftDrift = leftDrift * 0.995 + rnd() * 0.005;
      rightDrift = rightDrift * 0.995 + rnd() * 0.005;

      const panLeft = 0.96 + leftDrift * 0.04;
      const panRight = 0.96 + rightDrift * 0.04;

      switch (kind) {
        case 'rain': {
          if (rnd() > 0.99945) rainDropLeft += 0.45 + Math.abs(rnd()) * 0.35;
          if (rnd() > 0.99950) rainDropRight += 0.42 + Math.abs(rnd()) * 0.32;
          rainDropLeft *= 0.90;
          rainDropRight *= 0.90;
          const mist = pink * 0.09 + rain * 0.08 + brown * 0.025;
          return [(mist + rainDropLeft * 0.08) * panLeft, (mist * 0.92 + rainDropRight * 0.075) * panRight];
        }
        case 'ocean': {
          const tide = Math.sin(twoPi * 0.34 * t) * 0.18 + Math.sin(twoPi * 0.71 * t) * 0.08;
          const foam = pink * 0.13 + tide;
          return [foam * panLeft, (pink * 0.12 + tide * 0.9) * panRight];
        }
        case 'forest': {
          const chirp = Math.sin(twoPi * (1600 + 900 * Math.sin(t * twoPi * 0.17)) * t);
          const leaves = pink * 0.10 + Math.sin(twoPi * 0.09 * t) * 0.04;
          const birds = i % 17111 < 140 ? chirp * 0.035 : 0;
          return [(leaves + birds) * panLeft, (leaves * 0.9 + birds * 0.6) * panRight];
        }
        case 'stream': {
          const chirp = Math.sin(twoPi * (1600 + 900 * Math.sin(t * twoPi * 0.17)) * t);
          const ripple = pink * 0.11 + Math.sin(twoPi * 1.4 * t) * 0.035 + Math.sin(twoPi * 2.8 * t) * 0.018;
          const birds = i % 19789 < 120 ? chirp * 0.025 : 0;
          return [(ripple + birds) * panLeft, (ripple * 0.86 + birds * 0.55) * panRight];
        }
        case 'fire': {
          const flame = brown * 0.09 + pink * 0.08 + Math.sin(twoPi * 1.7 * t) * 0.015;
          if (rnd() > 0.935) fireCrackle += (0.35 + Math.abs(rnd()) * 0.65) * (rnd() > 0 ? 1 : -1);
          if (rnd() > 0.9975) firePop += (0.8 + Math.abs(rnd()) * 0.5) * (rnd() > 0 ? 1 : -1);
          fireCrackle *= 0.72;
          firePop *= 0.90;
          const sparkLeft = fireCrackle * 0.22 + firePop * 0.18;
          const sparkRight = fireCrackle * 0.15 + firePop * 0.24;
          return [(flame + sparkLeft) * panLeft, (flame * 0.88 + sparkRight) * panRight];
        }
        case 'breeze': {
          // Pink and brown noise pass through a very slow one-pole filter, then
          // an integral six-second swell keeps both the texture and loop seam soft.
          breezeLow = breezeLow * 0.9985 + (pink * 0.62 + brown * 0.38) * 0.0015;
          const swell = 0.78
            - Math.cos(twoPi * t / 6) * 0.14
            + Math.sin(twoPi * t / 3) * 0.06;
          const air = (pink * 0.052 + brown * 0.026 + breezeLow * 0.34) * swell;
          return [air * panLeft * 2.1, (air * 0.94 + breezeLow * 0.015) * panRight * 2.1];
        }
        case 'night':
          return summerNightSample(t, white, pink, brown);
        case 'thunder': {
          // One distant rumble per twelve-second loop, shaped with a raised
          // cosine so it arrives and leaves without a transient.
          thunderLow = thunderLow * 0.997 + (brown * 0.75 + pink * 0.25) * 0.003;
          const cycle = t % 12;
          const distance = Math.abs(cycle - 5.4);
          const rumbleEnvelope = distance < 2.35
            ? 0.5 + 0.5 * Math.cos(Math.PI * distance / 2.35)
            : 0;
          const rumble = rumbleEnvelope * (
            thunderLow * 0.16
            + Math.sin(twoPi * 31 * t) * 0.055
            + Math.sin(twoPi * 43 * t + 0.8) * 0.026
          );
          const mist = pink * 0.058 + rain * 0.042 + brown * 0.018;
          return [mist + rumble, mist * 0.91 + rumble * 0.86];
        }
        case 'cabin': {
          cabinLow = cabinLow * 0.9975 + (pink * 0.7 + brown * 0.3) * 0.0025;
          const drift = 0.88 + Math.sin(twoPi * 0.25 * t) * 0.07;
          const body = (
            Math.sin(twoPi * 56 * t) * 0.032
            + Math.sin(twoPi * 112 * t + 0.35) * 0.011
          ) * drift;
          const hum = pink * 0.045 + cabinLow * 0.18;
          return [hum + body, hum * 0.94 + body * 0.90];
        }
        case 'train': {
          trainLow = trainLow * 0.9965 + (brown * 0.78 + pink * 0.22) * 0.0035;
          const railSway = Math.sin(twoPi * 2 * t) * 0.025
            + Math.sin(twoPi * 4 * t + 0.45) * 0.007;
          const rumble = trainLow * 0.25 + brown * 0.038 + pink * 0.022;
          return [(rumble + railSway) * 1.5, (rumble * 0.93 - railSway * 0.72) * 1.5];
        }
        case 'boxfan':
        case 'ceilingfan':
        case 'deskfan': {
          const p = fan as FanProfile;
          fanLow = fanLow * p.lowPass + (pink * 0.55 + brown * 0.45) * (1 - p.lowPass);
          const rotation = twoPi * p.rotationHz * t;
          const chop = 1 + p.chop * Math.sin(rotation * p.blades);
          const wobble = 1 + p.wobble * Math.sin(rotation);
          // Motor hum sits at twice the rotation rate (a two-pole motor) with
          // a softer octave above it.
          const hum = (Math.sin(rotation * 2) * 0.7 + Math.sin(rotation * 4 + 0.6) * 0.3) * p.hum;
          const bed = fanLow * p.air * 1.7 + pink * p.breath + white * p.breath * p.hiss;
          const body = bed * chop * wobble + hum;

          if (kind === 'ceilingfan') {
            // Blades pass overhead from one side to the other: a gentle
            // stereo sway once per revolution.
            const sway = Math.sin(rotation) * 0.28;
            return [body * (1 + sway) * panLeft, body * (1 - sway) * panRight];
          }
          if (kind === 'deskfan') {
            // The head oscillates across the room once per loop. The air is
            // brightest and loudest when the fan faces the listener.
            const position = Math.sin(twoPi * t / DESK_FAN_SWEEP_SECONDS);
            const facing = 1 - Math.abs(position);
            const angle = (position * 0.62 + 1) * (Math.PI / 4);
            const left = Math.cos(angle);
            const right = Math.sin(angle);
            const presence = 0.72 + 0.28 * facing;
            const bright = pink * p.breath * 0.9 * facing * chop;
            return [(body + bright) * presence * left * 1.3, (body + bright) * presence * right * 1.3];
          }
          return [body * panLeft, (body * 0.97 + fanLow * 0.02) * panRight];
        }
        case 'vent': {
          // A duct: mains hum with two harmonics under a dark air bed, plus a
          // narrow band of air resonating in the duct itself.
          ventLow = ventLow * 0.996 + (pink * 0.6 + brown * 0.4) * 0.004;
          ventDeep = ventDeep * 0.9992 + ventLow * 0.0008;
          const duct = (ventLow - ventDeep) * 0.9;
          const mains = (
            Math.sin(twoPi * 60 * t) * 0.024
            + Math.sin(twoPi * 120 * t + 0.4) * 0.011
            + Math.sin(twoPi * 180 * t + 1.1) * 0.005
          );
          const air = ventDeep * 0.55 + duct + pink * 0.028 + white * 0.004;
          return [(air + mains) * panLeft, (air * 0.95 + mains * 0.92) * panRight];
        }
        case 'pink':
          return [pink * 0.24 * panLeft, pink * 0.22 * panRight];
        case 'brown':
          return [brown * 0.25 * panLeft, brown * 0.23 * panRight];
        case 'white':
        default:
          return [white * 0.18 * panLeft, rnd() * 0.18 * panRight];
      }
    },
  };
}
