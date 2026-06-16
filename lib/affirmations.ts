const AFFIRMATION_STARTS = [
  'I am allowed to',
  'I choose to',
  'I can',
  'I trust myself to',
  'I give myself permission to',
  'Today I will',
  'I am learning to',
  'I welcome the chance to',
  'I have enough strength to',
  'I return to myself when I',
];

const AFFIRMATION_ACTIONS = [
  'move slowly',
  'begin again',
  'rest without guilt',
  'honor my limits',
  'speak with care',
  'listen inward',
  'take one clear step',
  'release what is not mine',
  'soften my grip',
  'meet this moment',
];

const AFFIRMATION_ENDINGS = [
  'with patience.',
  'with a steady heart.',
  'without rushing.',
  'one breath at a time.',
  'and remain grounded.',
  'while staying kind to myself.',
  'with quiet confidence.',
  'as I am.',
  'from a place of peace.',
  'and trust the process.',
];

export function buildAffirmations(): string[] {
  const out: string[] = [];
  for (const start of AFFIRMATION_STARTS) {
    for (const action of AFFIRMATION_ACTIONS) {
      for (const ending of AFFIRMATION_ENDINGS) {
        out.push(`${start} ${action} ${ending}`);
      }
    }
  }
  return out;
}

export const NOTIF_AFFIRMATIONS = buildAffirmations();
