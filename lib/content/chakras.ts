import type { BandKey } from './bands';

export type Chakra = {
  id: string;
  band: BandKey;
  number: number;
  name: string;
  sanskrit: string;
  sanskritMeaning: string;   // Translation of the Sanskrit name (e.g. "Root Support")
  bija: string;
  bijaPronunciation: string; // English-phonetic pronunciation guide
  symbol: string;            // Devanagari bija glyph
  hz: number;
  element: string;
  location: string;
  color: string;
  affirmation: string;       // Short mantra, e.g. "I am"
  planets: string;           // Astrological associations
  gland: string;             // Endocrine correspondences
  governs: string;
  blocked: string;
};

export const CHAKRAS: Chakra[] = [
  { id: 'cr-root',     band: 'root',     number: 1, name: 'Root',         sanskrit: 'Muladhara',    sanskritMeaning: 'Root Support', bija: 'LAM', bijaPronunciation: 'lām', symbol: 'लं', hz: 396, element: 'Earth',         location: 'Base of spine',     color: '#D97B72', affirmation: 'I am',         planets: 'Earth · Saturn',     gland: 'Adrenals',           governs: 'Safety · Stability · Survival',         blocked: 'Fear · Anxiety · Ungroundedness' },
  { id: 'cr-sacral',   band: 'sacral',   number: 2, name: 'Sacral',       sanskrit: 'Svadhisthana', sanskritMeaning: 'Sweetness',    bija: 'VAM', bijaPronunciation: 'vām', symbol: 'वं', hz: 417, element: 'Water',         location: 'Lower abdomen',     color: '#DE9C6B', affirmation: 'I feel',       planets: 'Moon',               gland: 'Gonads',             governs: 'Creativity · Sensuality · Pleasure',     blocked: 'Emotional repression · Stagnant flow' },
  { id: 'cr-solar',    band: 'solar',    number: 3, name: 'Solar Plexus', sanskrit: 'Manipura',     sanskritMeaning: 'Lustrous Gem', bija: 'RAM', bijaPronunciation: 'rām', symbol: 'रं', hz: 528, element: 'Fire',          location: 'Upper abdomen',     color: '#D9BE7A', affirmation: 'I do',         planets: 'Mars · Sun',         gland: 'Pancreas · Adrenals', governs: 'Will · Confidence · Personal power',     blocked: 'Low self-esteem · Control patterns' },
  { id: 'cr-heart',    band: 'heart',    number: 4, name: 'Heart',        sanskrit: 'Anahata',      sanskritMeaning: 'Unstruck',     bija: 'YAM', bijaPronunciation: 'yām', symbol: 'यं', hz: 639, element: 'Air',           location: 'Center of chest',   color: '#8FC7A4', affirmation: 'I love',       planets: 'Venus',              gland: 'Thymus',             governs: 'Love · Compassion · Connection',         blocked: 'Grief · Resentment · Isolation' },
  { id: 'cr-throat',   band: 'throat',   number: 5, name: 'Throat',       sanskrit: 'Vishuddha',    sanskritMeaning: 'Purification', bija: 'HAM', bijaPronunciation: 'hām', symbol: 'हं', hz: 741, element: 'Ether',         location: 'Throat',            color: '#85B8D9', affirmation: 'I speak',      planets: 'Mercury',            gland: 'Thyroid',            governs: 'Truth · Expression · Voice',             blocked: 'Suppressed truth · Fear of judgment' },
  { id: 'cr-thirdEye', band: 'thirdEye', number: 6, name: 'Third Eye',    sanskrit: 'Ajna',         sanskritMeaning: 'Command',      bija: 'OM',  bijaPronunciation: 'oṃ',  symbol: 'ॐ',  hz: 852, element: 'Light',         location: 'Between brows',     color: '#8F97DE', affirmation: 'I see',        planets: 'Jupiter · Neptune',  gland: 'Pineal',             governs: 'Intuition · Insight · Inner vision',     blocked: 'Disconnect from inner knowing' },
  { id: 'cr-crown',    band: 'crown',    number: 7, name: 'Crown',        sanskrit: 'Sahasrara',    sanskritMeaning: 'Thousand Fold',bija: 'AUM', bijaPronunciation: 'auṃ', symbol: 'ॐ',  hz: 963, element: 'Consciousness', location: 'Top of head',       color: '#B39BE0', affirmation: 'I understand', planets: 'Uranus',             gland: 'Pituitary',          governs: 'Unity · Spirituality · Divine connection', blocked: 'Spiritual disconnect · Materialism' },
];

export type Dosha = {
  id: 'vata' | 'pitta' | 'kapha';
  band: BandKey;
  name: string;
  element: string;
  qualities: string;
  balanceHz: number;
  balanceTechnique: string;
  color: string;
  description: string;
};

export const DOSHAS: Dosha[] = [
  {
    id: 'vata',
    band: 'vata',
    name: 'Vata',
    element: 'Air + Ether',
    qualities: 'Light · Cold · Mobile · Dry',
    balanceHz: 432,
    balanceTechnique: 'Nadi Shodhana',
    color: '#A6ABE0',
    description: 'Governs movement, breath, nervous system. Imbalanced: scattered, restless, light sleep. Soothe with grounding warmth and slow, steady breath.',
  },
  {
    id: 'pitta',
    band: 'pitta',
    name: 'Pitta',
    element: 'Fire + Water',
    qualities: 'Hot · Sharp · Intense',
    balanceHz: 528,
    balanceTechnique: 'Sitali (Cooling)',
    color: '#E0A470',
    description: 'Governs digestion, transformation, intellect. Imbalanced: irritability, inflammation, burnout. Cool with the breath, soften the gaze.',
  },
  {
    id: 'kapha',
    band: 'kapha',
    name: 'Kapha',
    element: 'Earth + Water',
    qualities: 'Heavy · Slow · Stable · Cool',
    balanceHz: 741,
    balanceTechnique: 'Bhastrika (Bellows)',
    color: '#9DC7AC',
    description: 'Governs structure, immunity, lubrication. Imbalanced: lethargy, attachment, stagnation. Energize with heat, motion, and clear expression.',
  },
];
