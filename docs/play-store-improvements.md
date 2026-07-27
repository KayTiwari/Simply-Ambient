# Google Play 2.0.0 closed-test rollout checklist

Companion to [`store-listing.md`](store-listing.md). This replaces the pre-2.0 tester audit and tracks the material needed for the next closed-test update.

## Release position

Simply Ambient 2.0 is no longer only a binaural generator with supporting breath cards. The store story should lead with a private ambient studio:

1. Shape a real-time binaural tone.
2. Layer 13 offline soundscapes and imported audio.
3. Follow a guided breath or an auto-advancing listening path.
4. Keep local reflection and sky tools nearby without an account.

Use the exact copy in `store-listing.md` for the next closed-test AAB. Do not reuse the previous listing's active Compatibility claim, yearly horoscope, global lunar chip, or single-card-only tarot description.

## Before uploading the 2.0.0 AAB

- [ ] Run `npx tsc --noEmit`, `npm test -- --runInBand`, and `npm run build:web`.
- [ ] Complete every 2.0 item in `qa-checklist.md`, including orbit motion, first-play glass, routine timing, soundscape gain transitions, AI key errors, and pinned-nav overflow.
- [ ] Confirm `app.json` and `package.json` both say 2.0.0. EAS owns Android version code remotely.
- [ ] Verify the hosted Privacy Policy and Terms show July 13, 2026 after GitHub Pages deploys.
- [ ] Recheck Play Data Safety against the network table in the privacy policy.
- [ ] Resolve the old rating mismatch. The legal documents say the app is intended for users 18 and older, so the store questionnaire and audience settings must not claim 4+.
- [ ] Verify the Gemini key used for testing is a current restricted auth key and has never been pasted into a public issue, source file, or screenshot.

## Screenshot sequence

Capture the final Android build at 1080x2400 or higher. Use one short benefit line per image and avoid medical claims.

1. **Tones playing**
   “Shape your own frequency”
   Show Beat, Carrier, tone volume, animated orbits, and glass miniplayer.

2. **Layered Soundscapes**
   “Set the weather around your practice”
   Show scene-specific art, active volume, and another audio lane in the miniplayer.

3. **Breath mandala**
   “Eighteen guided rhythms, one calm screen”
   Show the lotus mid-phase plus cycle and cue controls.

4. **Routine path**
   “Follow a path when choosing feels like work”
   Show a routine playing and the miniplayer's current/upcoming steps.

5. **More hub**
   “Private reflection, close when you need it”
   Show Mood, Grounding, Soundscapes, and Routines without a crowded nav.

6. **Stars or tarot**
   “Daily sky, grounded words”
   Show Daily/Weekly/Monthly, lunar countdown, or an orientation-aware tarot spread.

7. **Privacy in Settings**
   “Local first. No account. No ads.”
   Show the privacy card and replayable intro.

Draft web captures in `docs/screenshots/` are useful for framing but are not substitutes for final Android captures.

## Feature graphic

`assets/feature-graphic.svg` and `.png` now use the 2.0 dark ambient system, frequency orbits, and the current value proposition. Confirm the PNG remains exactly 1024x500 before uploading.

## Release notes for Play Console

### 2.0.1

> The soundscape scenes are now alive: forest light and breeze motes wander like fireflies, cabin stars glitter while the window lights flicker, and stream glints ride the current. Soundscapes starts pinned in the navbar for one-tap access. The Stars page header now scrolls with the page, paused scenes hold perfectly still, and the app targets Android 16.

### 2.0.0

> Simply Ambient is now a complete ambient studio. Version 2.0 adds 13 offline soundscapes, three auto-advancing listening paths, a rebuilt tone chamber with its own volume control, eyes-closed breath cues, richer tarot, pinnable reflection rooms, and a calmer sound-responsive design throughout.

## Post-upload closed-test sweep

- [ ] Install from Play rather than a local APK so Store Review behavior is real.
- [ ] Upgrade over 1.0.5 and confirm saved presets, journals, profile, sign, and settings remain intact.
- [ ] Fresh-install 2.0.0 and complete the full intro.
- [ ] Run a 15-minute audio session with the screen off and Bluetooth headphones.
- [ ] Submit Feedback, open the hosted legal pages, and verify live Daily/Weekly/Monthly readings.
- [ ] Record tester device, Android version, audio route, and exact reproduction steps for every issue.
