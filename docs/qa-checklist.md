# Manual QA Checklist

Run before every release. Automated coverage (`npx tsc --noEmit`, `npm test`)
catches types and content invariants; everything below needs eyes and ears.

## Devices

- Small phone (5.x", e.g. Pixel 4a class)
- Current phone (6.x")
- 10" Android tablet or the largest emulator (Pixel Tablet image)
- Web build (`npm run build:web`, or `npm run web` for a dev server)

## Core audio

- [ ] Play a binaural preset with wired or Bluetooth stereo headphones; left
      and right ears carry different tones.
- [ ] Drag a slider while playing; the tone follows without stutter or overlap.
- [ ] Set tone volume below 100%; it changes live without changing the
      soundscape or imported-audio lanes.
- [ ] Frequency orbits keep moving for several cycles while audio plays, then
      fade smoothly back to their resting position after pause.
- [ ] Layer a soundscape and imported background music; three lanes play
      together, each volume slider works.
- [ ] Compare all 13 soundscapes at the same app/system volume. White and Pink
      Noise never jump in level, and Night Breeze, Summer Night, Airplane Cabin,
      and Night Train remain audible without a sudden boost.
- [ ] Set a 5-minute sleep timer, background the app, screen off; audio fades
      out on schedule (Doze reconciliation on return to foreground).
- [ ] Audio-safety volume reminder appears before the first Play of each cold
      start, and only then.
- [ ] On first play and later plays, the miniplayer has the same opacity and
      blurs cards or controls moving behind it.

## Routines

- [ ] Start Morning Focus, Evening Wind-down, and Deep Sleep from their cards.
      Each begins at step 1 and applies the advertised frequency.
- [ ] The miniplayer names the path and current frequency, colors the active
      step, shows a live countdown, and keeps upcoming steps muted.
- [ ] Let a short test path cross a step boundary and background/resume the app;
      it advances once, stays in order, and ends cleanly.

## First run and walkthrough

- [ ] Fresh install (or WIPE ALL DATA + restart): walkthrough appears with 6
      progress dots; "Skip the rest" on the intent step exits immediately.
- [ ] Finish the flow: recommendations match the picked intent; the final
      Good to know step lists soundscapes, sleep timer, presets, settings.
- [ ] More > Settings > Replay the intro: 4 dots, no legal or profile step;
      finishing lands back on Settings unchanged.

## Rate and feedback

- [ ] More > Support > Rate Simply Ambient opens the Play listing (Android)
      or the web listing elsewhere.
- [ ] More > Feedback: kind chips switch subject prefixes; "Attach app info"
      previews the exact line; empty form shows a toast and sends nothing.
- [ ] Gated review prompt: see the QA steps in docs/improvement-log.md
      Cycle 1 (requires a Play-installed build).

## Privacy

- [ ] More > Settings > YOUR PRIVACY card renders; policy link opens the
      browser only after the confirm modal.
- [ ] More > Safety: policy and terms links work; WIPE ALL DATA clears
      journals, presets, rate counters, and walkthrough flag.

## Tablet / wide screens (>= 700 dp)

- [ ] Every tab renders as a centered column (max 600) over a full-bleed
      gradient; nothing stretches edge to edge.
- [ ] Walkthrough overlay is centered the same way.
- [ ] Tab bar and mini player sit inside the column and stay tappable.
- [ ] Breath session: circle and mandala visuals stay centered and fully visible.
- [ ] Tap the Ready visual to start, enable phase cues, and verify inhale/hold/
      exhale cues plus Endless and fixed-cycle controls.
- [ ] Tarot spread (7 cards) fits without horizontal overflow.
- [ ] Chakras and Horoscopes scroll to the very bottom without the last card
      hiding behind the tab bar (insets-aware padding).

## Phones with gesture navigation / notches

- [ ] Bottom of every scrolling tab clears the tab bar and gesture area.
- [ ] Sticky glass headers render with their final room color on the first frame;
      no hub-color flash appears when entering from a pinned navbar shortcut.
- [ ] Pin several eligible More rooms. The navbar scrolls horizontally and its
      edge treatment makes the extra shortcuts discoverable.

## Web specifics

- [ ] Tones play through the Web Audio engine (no WAV looping seams).
- [ ] Notifications and haptics silently no-op.
- [ ] Horoscope and tarot go through the /api proxies (check the network tab).
- [ ] AI Insights distinguishes invalid, blocked/revoked, quota, permission,
      timeout, and network failures without displaying a raw API payload.

## Regression sweep

- [ ] Mood check-in, gratitude entry, streak badge still update.
- [ ] Affirmation notifications schedule (standalone build only, gated off in
      Expo Go).
- [ ] Chakra tap tunes the tone and re-themes the app; dosha tap applies its
      frequency and breath suggestion.
- [ ] Stars fetches Daily, Weekly, and Monthly for a changed sign; the palette
      transitions smoothly and Lunar Weather counts toward the correct next
      Full or New Moon.
- [ ] Natal Chart and Compatibility are visibly disabled as Coming Soon.
- [ ] Custom gratitude reminder time and every still-background color survive
      a restart.
