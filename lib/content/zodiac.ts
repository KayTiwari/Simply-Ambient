export type Zodiac = {
  id: string;
  glyph: string;
  name: string;
  startMonth: number; startDay: number;
  endMonth: number;   endDay: number;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
  qualities: string;
  intention: string;
  // Maps each zodiac to the chakra whose element matches.
  chakraId: 'cr-root' | 'cr-sacral' | 'cr-solar' | 'cr-heart' | 'cr-throat';
  color: string;
};

export const ZODIAC: Zodiac[] = [
  { id: 'aries',       glyph: '♈', name: 'Aries',       startMonth: 3,  startDay: 21, endMonth: 4,  endDay: 19, element: 'Fire',  qualities: 'Initiator · Bold',          intention: 'Lead with the courage that already lives in you.',
    chakraId: 'cr-solar',  color: '#E07A66' },
  { id: 'taurus',      glyph: '♉', name: 'Taurus',      startMonth: 4,  startDay: 20, endMonth: 5,  endDay: 20, element: 'Earth', qualities: 'Steady · Sensual',          intention: 'Ground in what nourishes. Slow down to taste it.',
    chakraId: 'cr-root',   color: '#A3C29A' },
  { id: 'gemini',      glyph: '♊', name: 'Gemini',      startMonth: 5,  startDay: 21, endMonth: 6,  endDay: 20, element: 'Air',   qualities: 'Curious · Versatile',       intention: 'Speak only what is true. Let the rest pass.',
    chakraId: 'cr-throat', color: '#D9C98A' },
  { id: 'cancer',      glyph: '♋', name: 'Cancer',      startMonth: 6,  startDay: 21, endMonth: 7,  endDay: 22, element: 'Water', qualities: 'Nurturing · Intuitive',     intention: 'Tend to your inner home before the outer world.',
    chakraId: 'cr-sacral', color: '#A9C6E8' },
  { id: 'leo',         glyph: '♌', name: 'Leo',         startMonth: 7,  startDay: 23, endMonth: 8,  endDay: 22, element: 'Fire',  qualities: 'Radiant · Generous',        intention: 'Shine without dimming for anyone.',
    chakraId: 'cr-solar',  color: '#E0A470' },
  { id: 'virgo',       glyph: '♍', name: 'Virgo',       startMonth: 8,  startDay: 23, endMonth: 9,  endDay: 22, element: 'Earth', qualities: 'Discerning · Refined',      intention: 'Refine without becoming rigid.',
    chakraId: 'cr-root',   color: '#9DC7AC' },
  { id: 'libra',       glyph: '♎', name: 'Libra',       startMonth: 9,  startDay: 23, endMonth: 10, endDay: 22, element: 'Air',   qualities: 'Harmonious · Fair',         intention: 'Balance is a verb, not a state.',
    chakraId: 'cr-throat', color: '#E0BFCB' },
  { id: 'scorpio',     glyph: '♏', name: 'Scorpio',     startMonth: 10, startDay: 23, endMonth: 11, endDay: 21, element: 'Water', qualities: 'Deep · Transformative',     intention: 'Let what is dying complete its dying.',
    chakraId: 'cr-sacral', color: '#B39BE0' },
  { id: 'sagittarius', glyph: '♐', name: 'Sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21, element: 'Fire',  qualities: 'Seeker · Free',             intention: 'The far horizon begins under your feet.',
    chakraId: 'cr-solar',  color: '#FF8A38' },
  { id: 'capricorn',   glyph: '♑', name: 'Capricorn',   startMonth: 12, startDay: 22, endMonth: 1,  endDay: 19, element: 'Earth', qualities: 'Disciplined · Grounded',    intention: 'Build patiently. Stone by stone.',
    chakraId: 'cr-root',   color: '#8A6B4A' },
  { id: 'aquarius',    glyph: '♒', name: 'Aquarius',    startMonth: 1,  startDay: 20, endMonth: 2,  endDay: 18, element: 'Air',   qualities: 'Visionary · Independent',   intention: 'Imagine the world you wish to inhabit.',
    chakraId: 'cr-throat', color: '#8FB8DE' },
  { id: 'pisces',      glyph: '♓', name: 'Pisces',      startMonth: 2,  startDay: 19, endMonth: 3,  endDay: 20, element: 'Water', qualities: 'Dreamy · Compassionate',    intention: 'Dissolve into the larger flow.',
    chakraId: 'cr-sacral', color: '#8F97DE' },
];
