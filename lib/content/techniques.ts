import type { ComponentType } from 'react';
import {
  Square,
  MoonStars,
  Wind,
  Waves,
  Heartbeat,
  Butterfly,
  InfinityIcon,
  Snowflake,
  ArrowsDownUp,
  Lightning,
  Flame,
  Sun,
  Fire,
  HandFist,
  Sparkle,
  Drop,
  Tree,
  Mountains,
  type IconProps,
} from 'phosphor-react-native';

type TechniqueIcon = ComponentType<IconProps>;

// `target` optionally overrides the breath value a phase animates toward
// (0 = fully exhaled, 1 = fully inhaled). Defaults: Inhale 1, Exhale 0.
export type Phase = { name: 'Inhale' | 'Hold' | 'Exhale'; seconds: number; target?: number };

export type Technique = {
  id: string;
  name: string;
  category: 'calming' | 'activating';
  blurb: string;
  description: string;
  phases: Phase[];
  color: string;
  Icon: TechniqueIcon;
  // Visual character
  petalSides: 3 | 4 | 5 | 6 | 8;
  petalCount: 3 | 4 | 5 | 6 | 8;
  centerSides: 3 | 4 | 5 | 6 | 8;
  // Mudra (hand position) suggestion
  mudra: { name: string; instruction: string };
};

export const TECHNIQUES: Technique[] = [
  {
    id: 'box', name: 'Box Breathing', category: 'calming',
    blurb: '4 · 4 · 4 · 4',
    description: 'Equal inhale, hold, exhale, hold. A structured count that gives attention one steady anchor.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 4 },
      { name: 'Exhale', seconds: 4 },
      { name: 'Hold',   seconds: 4 },
    ],
    color: '#8FB8DE', Icon: Square, petalSides: 4, petalCount: 4, centerSides: 4,
    mudra: { name: 'Gyan Mudra', instruction: 'Touch thumb and index fingertip; rest hands palms-up on knees.' },
  },
  {
    id: '478', name: '4-7-8', category: 'calming',
    blurb: '4 in · 7 hold · 8 out',
    description: 'A popular relaxation rhythm with a long exhale, often chosen as a gentle wind-down practice.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 7 },
      { name: 'Exhale', seconds: 8 },
    ],
    color: '#A498E8', Icon: MoonStars, petalSides: 6, petalCount: 6, centerSides: 6,
    mudra: { name: 'Anjali Mudra', instruction: 'Press palms together at the heart center; relax the shoulders.' },
  },
  {
    id: 'diaphragmatic', name: 'Diaphragmatic', category: 'calming',
    blurb: '4 in · 6 out',
    description: 'Let the belly expand on the inhale, then soften through a slightly longer, comfortable exhale.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#8B96E0', Icon: Wind, petalSides: 8, petalCount: 8, centerSides: 8,
    mudra: { name: 'Hakini Mudra', instruction: 'Touch all five fingertips of one hand to the opposite hand in front of the chest.' },
  },
  {
    id: 'pursed', name: 'Pursed-Lip', category: 'calming',
    blurb: '2 in · 4 out',
    description: 'Inhale through the nose, then exhale slowly through pursed lips for a more measured release.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#93CFBB', Icon: Waves, petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Vayu Mudra', instruction: 'Curl the index finger to the base of the thumb; thumb covers the index. Rest other fingers extended.' },
  },
  {
    id: 'holotropic', name: 'Circular Breath', category: 'activating',
    blurb: '2 in · 2 out · circular',
    description: 'A simplified continuous rhythm with no pause between in and out. This is not facilitated holotropic breathwork. Keep it brief and stop if light-headed.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 2 },
    ],
    color: '#E07A66', Icon: Lightning, petalSides: 3, petalCount: 6, centerSides: 3,
    mudra: { name: 'Open palms', instruction: 'Lay hands palms-up on knees, fingers softly extended. Receiving and surrender.' },
  },
  {
    id: 'shamanic', name: 'Rhythmic Breath', category: 'activating',
    blurb: '2 in · 1 out',
    description: 'A quick active rhythm for an alert practice. Stay seated, keep the breath comfortable, and stop if dizzy.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#C08063', Icon: Fire, petalSides: 3, petalCount: 8, centerSides: 6,
    mudra: { name: 'Power fists', instruction: 'Loose fists at the solar plexus, knuckles facing each other. Gathering inner fire.' },
  },
  {
    id: 'soma', name: 'Power Rhythm', category: 'activating',
    blurb: '3 in · 1 out · 2 hold',
    description: 'A pranayama-inspired three-part rhythm with a brief hold. Keep the effort moderate and the session short.',
    phases: [
      { name: 'Inhale', seconds: 3 },
      { name: 'Exhale', seconds: 1 },
      { name: 'Hold',   seconds: 2 },
    ],
    color: '#E3B368', Icon: Sun, petalSides: 6, petalCount: 6, centerSides: 3,
    mudra: { name: 'Apana Mudra', instruction: 'Tip of thumb touches tips of middle and ring fingers; index and pinky extended.' },
  },
  {
    id: 'coherent', name: 'Coherent (5·5)', category: 'calming',
    blurb: '5 in · 5 out',
    description: 'An even rhythm at roughly six breaths per minute, offering a gentle and predictable point of focus.',
    phases: [
      { name: 'Inhale', seconds: 5 },
      { name: 'Exhale', seconds: 5 },
    ],
    color: '#7FC6C9', Icon: Heartbeat, petalSides: 6, petalCount: 6, centerSides: 6,
    mudra: { name: 'Apana Vayu Mudra', instruction: 'Index curls to base of thumb; tips of middle and ring touch thumb; pinky extended. Heart-opening.' },
  },
  {
    id: 'bhramari', name: 'Bhramari (Bee)', category: 'calming',
    blurb: '4 in · 8 hum-out',
    description: 'A traditional humming breath: inhale slowly, then hum like a bee through the long exhale and notice the vibration.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 8 },
    ],
    color: '#D3C08A', Icon: Butterfly, petalSides: 8, petalCount: 8, centerSides: 8,
    mudra: { name: 'Shanmukhi Mudra', instruction: 'Use thumbs to gently close ears; index over closed eyes; middle fingers beside nostrils; ring + pinky around lips.' },
  },
  {
    id: 'nadi', name: 'Nadi Shodhana', category: 'calming',
    blurb: '4 in · 2 hold · 4 out',
    description: 'A traditional alternate-nostril pattern. Inhale through one side, hold, exhale through the other, then reverse gently.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Hold',   seconds: 2 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#B3A6DE', Icon: ArrowsDownUp, petalSides: 5, petalCount: 6, centerSides: 5,
    mudra: { name: 'Vishnu Mudra', instruction: 'Right hand: fold index and middle fingers into palm. Use thumb to close right nostril, ring + pinky to close left.' },
  },
  {
    id: 'sitali', name: 'Sitali (Cooling)', category: 'calming',
    blurb: '4 in · 6 out',
    description: 'A traditional cooling breath: inhale through a curled tongue or pursed lips, then exhale softly through the nose.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#9FD3E3', Icon: Snowflake, petalSides: 4, petalCount: 8, centerSides: 4,
    mudra: { name: 'Bhairava Mudra', instruction: 'Right hand resting in left palm, both palms facing up in lap.' },
  },
  {
    id: 'sigh', name: 'Physiological Sigh', category: 'calming',
    blurb: '2 short in · long out',
    description: 'Two short inhales through the nose, then one long exhale through the mouth. Use it as a brief, comfortable reset.',
    phases: [
      { name: 'Inhale', seconds: 1, target: 0.6 },
      { name: 'Inhale', seconds: 1, target: 1.0 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#A9C6E8', Icon: Sparkle, petalSides: 3, petalCount: 6, centerSides: 6,
    mudra: { name: 'Pran Mudra', instruction: 'Tips of thumb, ring, and pinky touch; index and middle extended. Activates life force.' },
  },
  {
    id: 'bhastrika', name: 'Bhastrika (Bellows)', category: 'activating',
    blurb: '1 in · 1 out · forceful',
    description: 'A forceful traditional bellows rhythm through the nose. Practice seated, keep sessions short, and stop if light-headed.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#DE9455', Icon: Flame, petalSides: 3, petalCount: 8, centerSides: 3,
    mudra: { name: 'Knee grip', instruction: 'Sit upright, grasp the knees firmly with thumbs out. Anchors the diaphragmatic effort.' },
  },
  {
    id: 'lions', name: "Lion's Breath", category: 'activating',
    blurb: '4 in · 4 roar-out',
    description: 'Inhale through the nose, then exhale with the tongue out and a voiced “ha.” Keep the face and throat comfortable.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 4 },
    ],
    color: '#D68097', Icon: HandFist, petalSides: 5, petalCount: 5, centerSides: 5,
    mudra: { name: 'Lion claws', instruction: 'Stretch fingers wide on the knees like claws, palms down. Opens the throat and chest.' },
  },
  {
    id: 'kapalabhati', name: 'Kapalabhati', category: 'activating',
    blurb: '1 in · 1 out · sharp pulse',
    description: 'A simplified timer for the traditional “skull-shining” breath: passive inhale, sharp nasal exhale. Keep it brief and stop if dizzy.',
    phases: [
      { name: 'Inhale', seconds: 1 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#E19E7E', Icon: InfinityIcon, petalSides: 6, petalCount: 8, centerSides: 3,
    mudra: { name: 'Chin Mudra', instruction: 'Touch tip of thumb and index together; rest hands palms-up on knees, other fingers extended.' },
  },
  {
    id: 'ujjayi', name: 'Ujjayi (Ocean)', category: 'calming',
    blurb: '4 in · 6 out · whispered',
    description: 'A slight throat constriction creates a soft ocean sound on inhale and exhale. Keep it quiet, smooth, and unforced.',
    phases: [
      { name: 'Inhale', seconds: 4 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#7FB8B0', Icon: Drop, petalSides: 6, petalCount: 8, centerSides: 6,
    mudra: { name: 'Jnana Mudra', instruction: 'Tip of thumb meets tip of index; remaining fingers extended. Hands rest on knees, palms up. Receiving wisdom.' },
  },
  {
    id: 'dirga', name: 'Dirga (Three-Part)', category: 'calming',
    blurb: '6 in (belly · ribs · chest) · 6 out',
    description: 'A layered three-part inhale through belly, ribs, then upper chest, followed by an easy reverse-order exhale.',
    phases: [
      { name: 'Inhale', seconds: 6 },
      { name: 'Exhale', seconds: 6 },
    ],
    color: '#A3C29A', Icon: Tree, petalSides: 3, petalCount: 8, centerSides: 6,
    mudra: { name: 'Padma Mudra', instruction: 'Heels of palms and pinkies touch; thumbs touch; other fingers spread like lotus petals at the heart.' },
  },
  {
    id: 'wimhof', name: 'Active 2 · 1', category: 'activating',
    blurb: '2 in · 1 out',
    description: 'A simplified active inhale and passive exhale rhythm. It is not the Wim Hof Method and includes no retention. Stay seated and stop if light-headed.',
    phases: [
      { name: 'Inhale', seconds: 2 },
      { name: 'Exhale', seconds: 1 },
    ],
    color: '#B9C4D9', Icon: Mountains, petalSides: 6, petalCount: 8, centerSides: 6,
    mudra: { name: 'Open palms upward', instruction: 'Hands rest on knees or thighs, palms facing up. Fully open to receive breath.' },
  },
];
