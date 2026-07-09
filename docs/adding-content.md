# Adding Content

Most of the app's content lives in `lib/content/`, the content registry. Adding a chakra, dosha, zodiac entry, or breath technique means appending to an array in one of those files. This guide walks through each content type, plus the pieces that still live in `App.tsx` and `lib/affirmations.ts`.

After any content change, run `npm test`. The suite in `__tests__/content.test.ts` validates registry invariants: counts, unique ids, hex colors, frequency ranges, and the cross-references described below.

## Breath techniques

File: `lib/content/techniques.ts`, array `TECHNIQUES`.

Append a new object with these fields:

- `id`: short unique string, lowercase (e.g. `'box'`, `'478'`).
- `name`: display name. This string is a cross-reference key, see the warning below.
- `category`: `'calming'` or `'activating'`. Controls which section of the technique list it appears in.
- `blurb`: the short cadence line shown on the card (e.g. `'4 in · 7 hold · 8 out'`).
- `description`: one to three sentences shown on the detail screen.
- `phases`: array of `{ name: 'Inhale' | 'Hold' | 'Exhale', seconds: number }`. An optional `target` (0 to 1) overrides the breath value the phase animates toward, used for stacked inhales like the Physiological Sigh.
- `color`: 6-digit hex, themes the card and session visuals.
- `Icon`: a phosphor icon component. Import it at the top of `techniques.ts` from `phosphor-react-native` if it is new to the file.
- `petalSides`, `petalCount`, `centerSides`: each one of 3, 4, 5, 6, or 8. These shape the mandala animation.
- `mudra`: `{ name, instruction }`, the suggested hand position shown during a session.

Cross-reference warning: two places reference techniques by their exact `name` string.

1. `DOSHAS` in `lib/content/chakras.ts`: each dosha's `balanceTechnique` must match a technique name character for character.
2. `RECS` in `OnboardingView.tsx`: the onboarding recommendations name techniques directly (e.g. `'Coherent (5·5)'`).

If you rename a technique, update both. `npm test` catches a `balanceTechnique` mismatch and checks the onboarding names against a mirrored list in `__tests__/content.test.ts`; keep that list in sync too.

## Chakras and doshas

File: `lib/content/chakras.ts`, arrays `CHAKRAS` and `DOSHAS`.

Chakra fields are documented inline on the `Chakra` type. Points worth calling out:

- `band` must be a `BandKey` (see `lib/content/bands.ts`) and each band needs a matching palette in the `PALETTES` record in `App.tsx`, since the band drives the animated background when a chakra preset plays.
- `hz` is the tone frequency and must stay within 20 to 2000.
- The test suite expects exactly 7 chakras numbered 1 through 7 with unique ids and bands, so editing an existing entry is the common case here.
- Onboarding recommends chakras with strings formatted as `<name> (<bija>)`, e.g. `'Root (LAM)'`. If you change a chakra `name` or `bija`, update `RECS` in `OnboardingView.tsx` and the mirrored list in `__tests__/content.test.ts`.

Doshas follow the same pattern: `band` needs a palette, `balanceHz` must stay within 20 to 2000, and `balanceTechnique` must match a technique name exactly. The suite expects exactly 3 doshas.

## Zodiac year-ahead copy

File: `lib/content/zodiac.ts`, array `ZODIAC`.

To edit a sign's reading, change its `yearAhead` (the longer reading) or `intention` (the one-line prompt). Keep `id`, `glyph`, and the date ranges as they are. Each sign's `chakraId` maps it to the chakra whose element matches; if you change one, it must be a real id from `CHAKRAS`. The suite expects exactly 12 signs.

## Soundscapes

Soundscapes stay in `App.tsx` because they tie into the audio engine. Adding one takes four steps:

1. Add the id to the `SoundscapeKey` union.
2. Append an entry to `SOUNDSCAPES` (id, name, blurb, phosphor `Icon`, color).
3. If it ships as a bundled file, add a `require('./assets/soundscapes/<file>.mp3')` entry to `BUNDLED_SOUNDSCAPES` and drop the file in `assets/soundscapes/`.
4. Add a loudness entry to `SOUNDSCAPE_GAIN` so the new bed sits at a comparable level to the others.

Licensing: every bundled audio file needs an entry in `assets/soundscapes/ATTRIBUTION.md` with its source URL and license. Prefer CC0 or CC BY material and follow the format already in that file.

## Affirmations

File: `lib/affirmations.ts`. Affirmations are generated as a cross-product of three arrays: `AFFIRMATION_STARTS`, `AFFIRMATION_ACTIONS`, and `AFFIRMATION_ENDINGS`. Adding one phrase to any array multiplies the pool, so a single new entry in each array adds hundreds of combinations. Every start must read naturally into every action, and every action into every ending; read a few random combinations aloud before committing. `__tests__/affirmations.test.ts` guards the output.

## Tuning presets and band presets

`TUNINGS` (fixed-frequency tuning presets like 432 Hz and the solfeggio set) and `PRESETS` (brainwave band presets like Delta and Gamma-40) live in `App.tsx` by design, since they feed directly into the audio engine's carrier and beat frequencies. Edit them in place there.

## House rules

- Run `npm test` after any content change. The registry invariants in `__tests__/content.test.ts` are the safety net for typos, duplicate ids, and broken cross-references.
- Every AsyncStorage key must start with `@simply_ambient_` or `@binaural_`.
