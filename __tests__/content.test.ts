import { CHAKRAS, DOSHAS, ZODIAC, TECHNIQUES } from '../lib/content';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function uniqueValues<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

describe('CHAKRAS registry', () => {
  it('has exactly 7 chakras', () => {
    expect(CHAKRAS).toHaveLength(7);
  });

  it('has unique ids', () => {
    expect(uniqueValues(CHAKRAS.map(c => c.id))).toBe(true);
  });

  it('numbers run 1 through 7', () => {
    expect(CHAKRAS.map(c => c.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('has unique bands', () => {
    expect(uniqueValues(CHAKRAS.map(c => c.band))).toBe(true);
  });

  it('every hz is within 20..2000', () => {
    for (const c of CHAKRAS) {
      expect(c.hz).toBeGreaterThanOrEqual(20);
      expect(c.hz).toBeLessThanOrEqual(2000);
    }
  });

  it('every color is a 6-digit hex', () => {
    for (const c of CHAKRAS) {
      expect(c.color).toMatch(HEX_COLOR);
    }
  });
});

describe('DOSHAS registry', () => {
  it('has exactly 3 doshas', () => {
    expect(DOSHAS).toHaveLength(3);
  });

  it('has unique ids', () => {
    expect(uniqueValues(DOSHAS.map(d => d.id))).toBe(true);
  });

  it('every balanceTechnique exactly matches a technique name', () => {
    const names = new Set(TECHNIQUES.map(t => t.name));
    for (const d of DOSHAS) {
      expect(names).toContain(d.balanceTechnique);
    }
  });

  it('every balanceHz is within 20..2000', () => {
    for (const d of DOSHAS) {
      expect(d.balanceHz).toBeGreaterThanOrEqual(20);
      expect(d.balanceHz).toBeLessThanOrEqual(2000);
    }
  });
});

describe('ZODIAC registry', () => {
  it('has exactly 12 signs', () => {
    expect(ZODIAC).toHaveLength(12);
  });

  it('has unique ids and glyphs', () => {
    expect(uniqueValues(ZODIAC.map(z => z.id))).toBe(true);
    expect(uniqueValues(ZODIAC.map(z => z.glyph))).toBe(true);
  });

  it('every chakraId exists in CHAKRAS', () => {
    const ids = new Set(CHAKRAS.map(c => c.id));
    for (const z of ZODIAC) {
      expect(ids).toContain(z.chakraId);
    }
  });

  it('date ranges use valid months and days', () => {
    for (const z of ZODIAC) {
      expect(z.startMonth).toBeGreaterThanOrEqual(1);
      expect(z.startMonth).toBeLessThanOrEqual(12);
      expect(z.endMonth).toBeGreaterThanOrEqual(1);
      expect(z.endMonth).toBeLessThanOrEqual(12);
      expect(z.startDay).toBeGreaterThanOrEqual(1);
      expect(z.startDay).toBeLessThanOrEqual(31);
      expect(z.endDay).toBeGreaterThanOrEqual(1);
      expect(z.endDay).toBeLessThanOrEqual(31);
    }
  });

  it('element is one of the four', () => {
    const elements = ['Fire', 'Earth', 'Air', 'Water'];
    for (const z of ZODIAC) {
      expect(elements).toContain(z.element);
    }
  });
});

describe('TECHNIQUES registry', () => {
  it('has at least 16 techniques', () => {
    expect(TECHNIQUES.length).toBeGreaterThanOrEqual(16);
  });

  it('has unique ids and names', () => {
    expect(uniqueValues(TECHNIQUES.map(t => t.id))).toBe(true);
    expect(uniqueValues(TECHNIQUES.map(t => t.name))).toBe(true);
  });

  it('category is calming or activating', () => {
    for (const t of TECHNIQUES) {
      expect(['calming', 'activating']).toContain(t.category);
    }
  });

  it('every technique has at least one phase and every phase.seconds > 0', () => {
    for (const t of TECHNIQUES) {
      expect(t.phases.length).toBeGreaterThanOrEqual(1);
      for (const p of t.phases) {
        expect(p.seconds).toBeGreaterThan(0);
      }
    }
  });

  it('every color is a 6-digit hex', () => {
    for (const t of TECHNIQUES) {
      expect(t.color).toMatch(HEX_COLOR);
    }
  });

  it('every mudra has a nonempty name and instruction', () => {
    for (const t of TECHNIQUES) {
      expect(t.mudra.name.length).toBeGreaterThan(0);
      expect(t.mudra.instruction.length).toBeGreaterThan(0);
    }
  });
});

describe('cross-registry references', () => {
  // These literals mirror the breath recommendation names in OnboardingView's
  // RECS map. OnboardingView pulls in React Native UI, so the names live here
  // as plain strings. Keep both lists in sync.
  const ONBOARDING_BREATH_RECS = ['4-7-8', 'Box Breathing', 'Coherent (5·5)', 'Bhastrika (Bellows)'];

  it('every onboarding breath rec exists in TECHNIQUES', () => {
    const names = new Set(TECHNIQUES.map(t => t.name));
    for (const rec of ONBOARDING_BREATH_RECS) {
      expect(names).toContain(rec);
    }
  });

  // These mirror OnboardingView's chakra recs, formatted there as
  // "<name> (<bija>)", e.g. 'Root (LAM)'. Keep both lists in sync.
  const ONBOARDING_CHAKRA_RECS: Array<[name: string, bija: string]> = [
    ['Root', 'LAM'],
    ['Third Eye', 'OM'],
    ['Heart', 'YAM'],
    ['Solar Plexus', 'RAM'],
  ];

  it('every onboarding chakra rec matches a chakra name and bija', () => {
    for (const [name, bija] of ONBOARDING_CHAKRA_RECS) {
      const chakra = CHAKRAS.find(c => c.name === name);
      expect(chakra).toBeDefined();
      expect(chakra?.bija).toBe(bija);
    }
  });
});
