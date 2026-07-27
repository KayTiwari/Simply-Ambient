# Changelog

This file records user-facing Simply Ambient releases. Version 2.0.0 is compared with the previous finished Android production build, 1.0.5.

## 2.0.1 · July 2026

- Soundscapes now starts pinned in the navbar, so it is one tap away on a fresh install. Tap the pin on its page to remove it; the choice sticks across launches.
- Scene elements now animate individually: forest light and breeze motes wander like fireflies, Summer Night glows drift, Airplane Cabin stars glitter while the window lights flicker, stream glints ride the current, breeze ribbons stream and undulate, and rain falls evenly across the card.
- Paused soundscapes hold perfectly still; a resting stream glint no longer drifts across a frozen card.
- The Stars header now scrolls away with the page instead of staying pinned, matching Chakras.
- Android builds target API 36 (Android 16), meeting the August 2026 Google Play requirement.

## 2.0.0 · July 2026

### Audio and listening

- Rebuilt Tones around a target Beat and Carrier while retaining advanced left/right controls from 50 to 500 Hz.
- Added a dedicated binaural-tone volume control.
- Added continuously rotating frequency orbits whose motion responds to the current frequencies and eases back to rest after pause.
- Expanded the offline soundscape library from 8 to 13 with Night Breeze, Summer Night, Distant Thunder, Airplane Cabin, and Night Train.
- Added animated scene artwork to the active soundscape panel.
- Rebalanced soundscape gains, especially the noise layers and quieter travel/night recordings.
- Replaced Distant Thunder with a bundled CC0 field recording and rebuilt Summer Night around discrete cricket chirps.
- Added independent tone, soundscape, and imported-audio lanes plus a custom sleep timer.

### Routines and miniplayer

- Added playable Morning Focus, Evening Wind-down, and Deep Sleep paths.
- Paths now advance through their frequencies automatically using background-safe timing.
- The glass miniplayer shows the path name, current frequency, live time remaining, completed steps, and unavailable-looking future steps.
- Unified tone, routine, soundscape, and imported-audio controls in one frosted-glass surface.
- Fixed first-play opacity and live backdrop blur so content behind the miniplayer remains visible as softened color.

### Breath practice

- Added optional rising, steady, and falling phase tones for eyes-closed practice.
- Made the active breathing visual itself a start/stop control.
- Added Endless alongside 5, 10, and 20-cycle targets for every practice.
- Rebuilt the mandala as a more intricate layered lotus form.
- Added calmer phase transitions and preserved the Breath library scroll position when leaving and returning.

### Chakras, Stars, and tarot

- Added actual chakra sigils to the seven-center spectrum with an animated selection plate.
- Replaced the old yearly horoscope with live Daily, Weekly, and Monthly periods.
- Added smooth zodiac palette transitions and a subtle current-reading pulse.
- Lunar Weather now shows days until the Full Moon while waxing and days until the New Moon while waning.
- Added tarot archetype and suit emblems, upright and reversed orientation, Major/All deck choices, and 3/5/7-card spreads.
- Marked Natal Chart and Compatibility as Coming Soon rather than exposing unfinished flows.

### More and reflection

- Redesigned the More hub and every room around a calmer editorial, mobile-first system.
- Added a personalized greeting, saved intent, current mood, and honest local activity signals.
- Made eligible More rooms pinnable to the navbar and added horizontal scrolling with edge affordances when shortcuts overflow.
- Added custom gratitude reminder times.
- Reworked Grounding as an animated five-step ritual.
- Added release-without-saving and private-save paths to Release the Noise.
- Made Mood day-scoped with same-day replacement, clearer history, and sparse-state handling.
- Made affirmations stable for the local day while retaining manual reroll.
- Added arrival tracking to Intentions and clearer consent controls to AI Insights.

### Visual, accessibility, privacy, and reliability

- Rebuilt all five tabs, onboarding, and More rooms with frequency-responsive gradients, interference ripples, corner ripples, and touch-born motion.
- Added a selectable still-background color.
- Replaced full-screen slides with calmer fade-and-settle transitions where appropriate.
- Added responsive phone/tablet constraints, safe-area-aware endings, improved touch targets, and clearer accessibility roles and states.
- Added Reduce Motion behavior for new motion systems.
- Added filtered anonymous Sentry diagnostics, clearer privacy disclosures, and header-based Gemini authentication so keys do not enter request URLs.
- Moved the Gemini key to native secure storage and session-only browser storage, added safe key-state guidance, and made tarot interpretation respect upright or reversed orientation.
- Prevented pinned More rooms from flashing the hub color during their first frame.
- Added gated Play review prompts, replayable onboarding, richer Feedback categories, CI, and broader unit/regression coverage.

## 1.0.5

Previous finished Android production build and comparison baseline for 2.0.0.
