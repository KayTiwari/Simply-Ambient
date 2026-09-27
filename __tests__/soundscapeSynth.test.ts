import {
  createSoundscapeVoice,
  soundscapeLoopSeconds,
  fanProfile,
  isFanSoundscape,
  isFanSpeed,
  FAN_SPEEDS,
  DESK_FAN_SWEEP_SECONDS,
  SOUNDSCAPE_SAMPLE_RATE,
  type SoundscapeKey,
  type FanSpeed,
} from '../lib/soundscapeSynth';

const ALL_KEYS: SoundscapeKey[] = [
  'rain', 'ocean', 'forest', 'stream', 'fire', 'white', 'pink', 'brown',
  'breeze', 'night', 'thunder', 'cabin', 'train',
  'boxfan', 'ceilingfan', 'deskfan', 'vent',
];
const FAN_KEYS = ['boxfan', 'ceilingfan', 'deskfan'] as const;

// Mirrors SOUNDSCAPE_GAIN in App.tsx for the generated scenes under test.
const GAIN: Partial<Record<SoundscapeKey, number>> = {
  cabin: 0.90, train: 1, boxfan: 0.65, ceilingfan: 0.60, deskfan: 1, vent: 0.72,
};

type Stats = { rms: number; peak: number; leftRms: number; rightRms: number };

function render(kind: SoundscapeKey, seconds: number, speed: FanSpeed = 'medium', from = 0): Stats {
  const voice = createSoundscapeVoice(kind, { speed });
  const start = Math.floor(from * SOUNDSCAPE_SAMPLE_RATE);
  const end = Math.floor((from + seconds) * SOUNDSCAPE_SAMPLE_RATE);
  let sum = 0; let sumL = 0; let sumR = 0; let peak = 0;
  for (let i = 0; i < end; i++) {
    const [l, r] = voice.next(i / SOUNDSCAPE_SAMPLE_RATE, i);
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error(`${kind} produced a non-finite sample`);
    if (i < start) continue;
    sum += l * l + r * r; sumL += l * l; sumR += r * r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  const n = end - start;
  return { rms: Math.sqrt(sum / (2 * n)), peak, leftRms: Math.sqrt(sumL / n), rightRms: Math.sqrt(sumR / n) };
}

const dbfs = (x: number) => 20 * Math.log10(x);

describe('soundscape voices', () => {
  it('every scene renders finite audio under the web peak guard', () => {
    for (const kind of ALL_KEYS) {
      const { peak, rms } = render(kind, 1);
      expect(peak).toBeLessThan(0.82);
      expect(rms).toBeGreaterThan(0.001);
    }
  });

  it('fans and the vent sit near -20 dBFS effective at medium speed', () => {
    for (const kind of ['boxfan', 'ceilingfan', 'deskfan', 'vent'] as const) {
      const { rms } = render(kind, soundscapeLoopSeconds(kind));
      const effective = dbfs(rms * (GAIN[kind] ?? 1));
      expect(effective).toBeGreaterThan(-23);
      expect(effective).toBeLessThan(-17);
    }
  });

  it('fans sit between Airplane Cabin and Night Train in level', () => {
    const cabin = dbfs(render('cabin', 4).rms * GAIN.cabin!);
    const train = dbfs(render('train', 6).rms * GAIN.train!);
    for (const kind of FAN_KEYS) {
      const fan = dbfs(render(kind, soundscapeLoopSeconds(kind)).rms * GAIN[kind]!);
      expect(fan).toBeGreaterThan(cabin);
      expect(fan).toBeLessThan(train);
    }
  });

  it('a faster fan is louder and brighter than a slower one', () => {
    for (const kind of FAN_KEYS) {
      const secs = soundscapeLoopSeconds(kind);
      const low = render(kind, secs, 'low').rms;
      const medium = render(kind, secs, 'medium').rms;
      const high = render(kind, secs, 'high').rms;
      expect(medium).toBeGreaterThan(low);
      expect(high).toBeGreaterThan(medium);
    }
  });

  it('every fan modulator completes whole cycles inside its loop', () => {
    for (const kind of FAN_KEYS) {
      const loop = soundscapeLoopSeconds(kind);
      for (const speed of FAN_SPEEDS) {
        const p = fanProfile(kind, speed);
        const cycles = p.rotationHz * loop;
        expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9);
      }
    }
    expect(soundscapeLoopSeconds('deskfan')).toBe(DESK_FAN_SWEEP_SECONDS);
  });

  it('the desk fan sweeps from one ear to the other', () => {
    // A quarter sweep in: the head faces one side. Three quarters in: the other.
    const q = DESK_FAN_SWEEP_SECONDS / 4;
    const first = render('deskfan', 1, 'medium', q - 0.5);
    const third = render('deskfan', 1, 'medium', 3 * q - 0.5);
    expect(first.rightRms).toBeGreaterThan(first.leftRms * 1.3);
    expect(third.leftRms).toBeGreaterThan(third.rightRms * 1.3);
  });

  it('classifies fan scenes and speeds', () => {
    expect(isFanSoundscape('boxfan')).toBe(true);
    expect(isFanSoundscape('vent')).toBe(false);
    expect(isFanSoundscape('rain')).toBe(false);
    expect(isFanSpeed('high')).toBe(true);
    expect(isFanSpeed('turbo')).toBe(false);
    expect(isFanSpeed(null)).toBe(false);
  });
});
