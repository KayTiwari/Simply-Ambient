# Web version (browser build)

Simply Ambient is an Expo app, so the same source that ships to Google Play
also compiles to a browser build via `react-native-web`. There is no separate
web codebase: every change to `App.tsx` and the views is part of the web app on
the next build. This is how iPhone users (and anyone without the Android app)
reach Simply Ambient.

## Build locally

```bash
npm run build:web    # runs: expo export -p web  ->  ./dist
npx serve dist       # preview the static site
```

Open the printed `localhost` URL. The output in `dist/` is a plain static site
(HTML + JS + font assets) that any static host can serve.

## Auto-deploy on Vercel

`vercel.json` already holds the build settings, so connecting the repo is a
one-time setup. After that, every push that updates the app also updates the
web version automatically.

1. Go to vercel.com -> **Add New -> Project** and import
   `KayTiwari/Simply-Ambient`.
2. Vercel reads `vercel.json`:
   - Build command: `npx expo export -p web`
   - Output directory: `dist`
3. Deploy. Every push to `main` now triggers a rebuild and redeploy.
4. (Optional) Add a custom domain (e.g. `app.simplyambient.com`) under
   **Project -> Settings -> Domains**.

The same `vercel.json` maps to Netlify if you prefer: build command
`npx expo export -p web`, publish directory `dist`.

## What differs on web vs. native

The browser build runs the exact same UI. Three platform branches handle the
differences:

- **Audio playback** — native loops a 1-second synthesized WAV (`buildWav`)
  played from a cache file. Browsers restart a looped buffer with an audible
  gap, so web instead generates the tones live with the Web Audio API: two
  oscillators panned hard left/right through a channel merger (`WebToneEngine`).
  That is gapless by construction, frequency-accurate, and glides smoothly when
  you drag the sliders. Loudness matches native (amplitude 0.28). Use headphones
  for the binaural effect, same as native.
- **Daily affirmation notifications** — no-op on web (local scheduled
  notifications aren't available in the browser).
- **Haptics** — no-op on web automatically.
