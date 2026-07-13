# Simply Ambient 2.0 screenshot set

Recaptured on July 13, 2026 from the final 2.0 web export at 1080x2400 by
`node scripts/capture-screenshots.mjs`. Numbering follows the screenshot plan
in `docs/play-store-improvements.md`, which also has the caption for each.

These remain drafts for layout and caption planning. Before uploading to the
Play Console, recapture on an Android device: the web build uses Web Audio
tones, and the status bar, notch, and font hinting differ from the store
requirement of real-device captures.

The current visual-regression set includes:

- `01` Tones session chamber
- `02` layered Soundscapes room
- `03` immersive Breath chamber
- `04` fluid More settings destination
- `05` editorial onboarding intention step
- `06` Chakra spectrum
- `07` Horoscope reading room
- `08` Tarot room
- `09` More hub over an active listening palette
- `10` Breath practice library

To refresh after UI changes: `npm run build:web`, then run the script again.
Run `node scripts/verify-responsive.mjs` for the 320px and 768px smoke pass.
