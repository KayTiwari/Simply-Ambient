export type Zodiac = {
  id: string;
  glyph: string;
  name: string;
  startMonth: number; startDay: number;
  endMonth: number;   endDay: number;
  element: 'Fire' | 'Earth' | 'Air' | 'Water';
  qualities: string;
  intention: string;
  yearAhead: string;
  // Maps each zodiac to the chakra whose element matches.
  chakraId: 'cr-root' | 'cr-sacral' | 'cr-solar' | 'cr-heart' | 'cr-throat';
  color: string;
};

export const ZODIAC: Zodiac[] = [
  { id: 'aries',       glyph: '♈', name: 'Aries',       startMonth: 3,  startDay: 21, endMonth: 4,  endDay: 19, element: 'Fire',  qualities: 'Initiator · Bold',          intention: 'Lead with the courage that already lives in you.',
    yearAhead: 'This year your fire is meant to lead. But lead with patience. Begin only what you can finish, and finish what truly matters.',
    chakraId: 'cr-solar',  color: '#E07A66' },
  { id: 'taurus',      glyph: '♉', name: 'Taurus',      startMonth: 4,  startDay: 20, endMonth: 5,  endDay: 20, element: 'Earth', qualities: 'Steady · Sensual',          intention: 'Ground in what nourishes. Slow down to taste it.',
    yearAhead: 'A year for slow, deliberate building. The pleasure is in the process, not the prize. Trust your senses.',
    chakraId: 'cr-root',   color: '#A3C29A' },
  { id: 'gemini',      glyph: '♊', name: 'Gemini',      startMonth: 5,  startDay: 21, endMonth: 6,  endDay: 20, element: 'Air',   qualities: 'Curious · Versatile',       intention: 'Speak only what is true. Let the rest pass.',
    yearAhead: 'Your many threads come together this year. Choose what to weave and what to release. Less, but deeper.',
    chakraId: 'cr-throat', color: '#D9C98A' },
  { id: 'cancer',      glyph: '♋', name: 'Cancer',      startMonth: 6,  startDay: 21, endMonth: 7,  endDay: 22, element: 'Water', qualities: 'Nurturing · Intuitive',     intention: 'Tend to your inner home before the outer world.',
    yearAhead: 'Tend the inner home this year. Strong roots make lasting branches. Receive as readily as you give.',
    chakraId: 'cr-sacral', color: '#A9C6E8' },
  { id: 'leo',         glyph: '♌', name: 'Leo',         startMonth: 7,  startDay: 23, endMonth: 8,  endDay: 22, element: 'Fire',  qualities: 'Radiant · Generous',        intention: 'Shine without dimming for anyone.',
    yearAhead: 'Step into your light without dimming for anyone. Your warmth is generous, not obligatory.',
    chakraId: 'cr-solar',  color: '#E0A470' },
  { id: 'virgo',       glyph: '♍', name: 'Virgo',       startMonth: 8,  startDay: 23, endMonth: 9,  endDay: 22, element: 'Earth', qualities: 'Discerning · Refined',      intention: 'Refine without becoming rigid.',
    yearAhead: 'Refine, don\'t perfect. Done with care beats endless polishing. Trust the simpler path.',
    chakraId: 'cr-root',   color: '#9DC7AC' },
  { id: 'libra',       glyph: '♎', name: 'Libra',       startMonth: 9,  startDay: 23, endMonth: 10, endDay: 22, element: 'Air',   qualities: 'Harmonious · Fair',         intention: 'Balance is a verb, not a state.',
    yearAhead: 'The balance you seek is internal. Stop outsourcing your steadiness to other people\'s moods.',
    chakraId: 'cr-throat', color: '#E0BFCB' },
  { id: 'scorpio',     glyph: '♏', name: 'Scorpio',     startMonth: 10, startDay: 23, endMonth: 11, endDay: 21, element: 'Water', qualities: 'Deep · Transformative',     intention: 'Let what is dying complete its dying.',
    yearAhead: 'A year of release. What completes its dying makes room for what is coming. Trust the dark.',
    chakraId: 'cr-sacral', color: '#B39BE0' },
  { id: 'sagittarius', glyph: '♐', name: 'Sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21, element: 'Fire',  qualities: 'Seeker · Free',             intention: 'The far horizon begins under your feet.',
    yearAhead: 'The horizon you chase is wide enough to include rest. Travel slowly. Notice where you are.',
    chakraId: 'cr-solar',  color: '#FF8A38' },
  { id: 'capricorn',   glyph: '♑', name: 'Capricorn',   startMonth: 12, startDay: 22, endMonth: 1,  endDay: 19, element: 'Earth', qualities: 'Disciplined · Grounded',    intention: 'Build patiently. Stone by stone.',
    yearAhead: 'Build patiently. The structures you raise this year will hold for decades. Don\'t skip foundations.',
    chakraId: 'cr-root',   color: '#8A6B4A' },
  { id: 'aquarius',    glyph: '♒', name: 'Aquarius',    startMonth: 1,  startDay: 20, endMonth: 2,  endDay: 18, element: 'Air',   qualities: 'Visionary · Independent',   intention: 'Imagine the world you wish to inhabit.',
    yearAhead: 'Imagine larger than you\'ve allowed. The vision you withhold serves no one. Speak it.',
    chakraId: 'cr-throat', color: '#8FB8DE' },
  { id: 'pisces',      glyph: '♓', name: 'Pisces',      startMonth: 2,  startDay: 19, endMonth: 3,  endDay: 20, element: 'Water', qualities: 'Dreamy · Compassionate',    intention: 'Dissolve into the larger flow.',
    yearAhead: 'Trust the current. Surrender is not weakness. It is mastery of flow. Soften the grip.',
    chakraId: 'cr-sacral', color: '#8F97DE' },
];
