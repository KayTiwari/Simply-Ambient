# Play Store Improvements: ASO, Description, Screenshots

Companion to `store-listing.md` (the copy/paste-ready kit). This file is the
improvement plan from the July 2026 tester-report cycle: a sharper
description, keyword themes, a screenshot plan built around the new trust
features, and the fixes the listing needs before the next update.

## Fix before the next store update

1. **Age-rating conflict.** The listing says 4+ while the privacy policy and
   Terms of Service both state the app is intended for users 18 and older.
   Pick one story. Recommendation: keep the 18+ language in the legal docs
   (safest for horoscope/AI content) and answer the Play questionnaire
   accordingly instead of 4+. A reviewer who reads both today sees a
   contradiction.
2. **Republish the hosted privacy policy.** `docs/privacy-policy.md` was
   updated on 2026-07-08 (feedback rename, rate-prompt counters). The app
   links to the GitHub Pages copy, which still shows May 15 until docs/ is
   pushed.
3. **Data Safety form.** No new data types were added (rate counters are
   on-device; the review dialog is drawn by Google Play), so the existing
   answers stand. Re-confirm "no data shared" plus crash diagnostics
   disclosure matches the current form.
4. **Technique count drift.** The app now ships 18 breathing techniques
   (Ujjayi, Dirga, and Wim Hof Style joined the original list).
   `store-listing.md` and the README still said 16 in places; both are
   updated in the repo, and the live Play listing text should be refreshed
   to say 18 at the next update.

## Suggested improved short description (<= 80 chars)

> Ambient sound and binaural frequency studio for sleep, focus, and calm.

Rationale: the current line leads with "Design your own binaural frequency",
which reads as a tool for people who already know the term. Leading with
ambient sound, sleep, focus, and calm covers the highest-volume search
intents while keeping binaural for those who search it.

## Suggested improved long description

Opening paragraph (replaces the current one; feature bullets below it can
stay as they are in `store-listing.md`):

> Simply Ambient is a calm, private space for sound and breath. Design your
> own binaural frequency or start from the classic brainwave bands, layer in
> rain, ocean, forest, or fireplace soundscapes, and let the sleep timer fade
> everything out gently. When you want structure, eighteen guided breathing
> techniques, chakra tones, and a small set of daily practices are one tap
> away.

Add after the feature bullets, before the privacy paragraph:

> **Made to be trusted**
> • A short, skippable walkthrough on first launch, replayable any time
> • No account, no ads, no tracking. Journals stay on your device
> • A one-line privacy summary lives right in Settings, with the full policy
>   one tap away
> • Feedback goes straight to the developer from inside the app

Keep the existing Privacy paragraph and the stereo-headphones note.

## Keyword themes

Work these into the description naturally and into the App Store keyword
field. Grouped by search intent:

| Theme | Terms |
|---|---|
| Ambient sound | ambient sounds, soundscapes, rain sounds, white noise, brown noise |
| Sleep | sleep sounds, sleep timer, fall asleep, deep sleep, relax |
| Focus | focus music, concentration, study sound, deep work |
| Meditation | meditation, mindfulness, calm, breathing exercises, breathwork |
| Binaural | binaural beats, brainwave, theta, solfeggio frequencies, 432 hz, 528 hz |
| Wellness | wellness, stress relief, anxiety relief, grounding, gratitude journal |
| Spiritual | chakra, mantra, horoscope, tarot, manifestation |

App Store keyword field stays under 100 chars; the current string is good,
consider swapping `zen` and `manifestation` for `ambient` and `white noise`
given search volume.

## Screenshot plan (5 shots, phone portrait)

Capture on a current phone at 1080x2400 or higher, dark UI as-is. One short
caption overlaid at the top of each shot, serif (Cormorant Garamond) white
text over the app's own gradient, consistent position across all five.

1. **Frequencies tab, chakra theme active, tone playing**
   Caption: "Tune your own frequency"
   Shows: the L/R sliders, band presets, the living gradient. This is the
   hero shot; the animated background must look alive (catch a mid-fade).

2. **Soundscape + frequency layered (mini player visible)**
   Caption: "Layer rain, ocean, or fire under any tone"
   Shows: Soundscapes page with a soundscape playing plus the mini player
   showing the binaural still running. Communicates the ambient-sound value
   directly.

3. **Breath session mid-inhale, mandala visualization**
   Caption: "Eighteen guided breaths, one calm screen"
   Shows: the polygonal mandala mid-bloom with the phase label. Choose Box
   Breathing or Coherent for a recognizable name on screen.

4. **Settings with the YOUR PRIVACY card, or Safety page**
   Caption: "Private by design. Your journal never leaves this device"
   Shows: the new privacy facts card, the Replay the intro row, and the
   policy link. Trust is the differentiator; show it instead of claiming it.

5. **Walkthrough intent step ("What brings you here?")**
   Caption: "Made for sleep, focus, calm, and energy"
   Shows: the four intent cards with one selected. Doubles as a use-case
   menu for someone skimming the listing.

Optional 6th: Horoscopes tab with the Today widget and lunar phase, caption
"Daily sky, grounded words", for browsers who come for the spiritual layer.

Tablet screenshots (7" and 10"): capture the same five once the 700 dp
centered column ships; the framing shows the full-bleed gradient around the
column, which reads as intentional tablet support to reviewers.

## What the screenshots should communicate emotionally

- **Calm**: dark, unhurried frames; no red badges, no clutter; captions in
  the serif voice of the app.
- **Clarity**: one idea per shot; the caption states a benefit in plain
  words, the UI proves it.
- **Focus**: the mandala/breath shot and the frequencies shot carry the
  "this helps me concentrate and wind down" story.
- **Trust**: the privacy shot does the heavy lifting; captions never
  overclaim (no medical or sleep-cure promises, consistent with the
  disclaimer inside the app).

## Feature graphic (1024x500)

Current asset exists (`assets/feature-graphic.png`). If refreshed: wordmark
plus tagline over the moonlit dusk gradient, one enso ring, no screenshot
collage. Skip text smaller than ~40 px; it turns to mush in the Play banner
crop.

## Release-notes voice (for "What's new")

Keep it in the app's voice, three lines maximum, name real things:

> New: a gentle walkthrough you can replay from Settings, a Feedback page
> that reaches the developer directly, and a privacy summary right where
> you'd look for it. Plus tablet-friendly layouts.
