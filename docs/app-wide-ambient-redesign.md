# App-wide ambient redesign

This pass brings the main app into the same editorial family as the redesigned
More hub without turning every tab into the same template.

## Shared foundation

- `App.tsx` owns the only full-screen color field. It follows the active tone
  band and now remains in motion for tones, soundscapes, and imported audio.
- `AmbientUI.tsx` adds translucent veils, editorial headers, layered surfaces,
  section introductions, and status strips. Veil accents crossfade when the
  listening palette changes; they never replace the root canvas.
- More's hub and destinations use transparent atmospheric layers. The hidden
  hub fades fully and leaves the accessibility tree while a destination is open.
- The session dock and tab bar use the same glass, radius, type, and highlight
  language as the page surfaces.

## Room identities

| Room | Interaction metaphor | Primary composition |
| --- | --- | --- |
| Tones | Session chamber | Live interference instrument, quick starts, traditional tone library, session layers |
| Breathe | Guided chamber | Ritual counter, practice library, immersive phase coach |
| Chakras | Vertical spectrum | Seven-node map, selected-center reading, separate Ayurveda chapter |
| Stars | Reading room | Horoscope manuscript and an intentional tarot table |
| More | Quiet personal space | Daily check-in, reflective tools, restorative tools, profile and app care |
| Onboarding | Guided threshold | Value, safety, intention, private profile, starting path, field guide |

## Content guardrails introduced in this pass

- Tuning cards describe spiritual and Solfeggio ideas as traditional
  associations rather than medical outcomes.
- Chakra correspondences are explicitly presented as a contemplative map, not
  medical guidance.
- Horoscope and tarot copy distinguishes reflection from factual prediction.
- Binaural controls explain the displayed beat as the difference between the
  two ear frequencies.

## Verification

Run before release:

```sh
npx tsc --noEmit
npm test -- --runInBand
npm run build:web
node scripts/capture-screenshots.mjs
node scripts/verify-responsive.mjs
```

The responsive smoke covers every room at 320 and 768 CSS pixels; the capture
walkthrough records the 360px visual baseline. Also review at 430px. Check every tab with no audio,
tone-only, soundscape-only, and layered playback; verify a More destination
under at least two active bands and the single-color preference.
