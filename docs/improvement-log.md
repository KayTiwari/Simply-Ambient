# Improvement Log

Running log of the structured improvement cycles driven by the tester report
(polish, trust, discoverability, retention). Each cycle: inspect, plan,
implement, test, review, document.

---

## Cycle 1: Rate App feature

- **Date:** 2026-07-08
- **Goal:** Backlog priority 1. A manual "Rate Simply Ambient" affordance plus a
  respectful, meaningful-use-gated in-app review prompt.

### What was implemented

- `lib/rateGate.ts` (new): pure decision logic, no React Native imports so it
  runs under plain Node in jest (same pattern as `lib/binauralMath.ts`).
  The gate requires ALL of: 5+ app opens, 3+ days since first open, 1+
  completed session, never prompted before. The prompt fires at most once ever.
- `lib/rateApp.ts` (new): AsyncStorage persistence under
  `@simply_ambient_rate_v1` (covered by WIPE ALL DATA via prefix), the official
  `expo-store-review` in-app review call, and Play Store deep links
  (`market://` with an https fallback).
- `App.tsx`: `recordAppOpen()` on cold start; a sleep timer that runs to its
  end while the tone is playing counts as a completed session (never prompts
  there; the user may be asleep).
- `BreathworkView.tsx`: finishing a breath session or completing a 108 mala
  counts as a completed session. The only prompt site is 1.5s after a breath
  session completes, the calmest good moment in the app. Mala completion never
  prompts so the celebration buzz stays undisturbed.
- `MoreView.tsx` Support page: "LEAVE A REVIEW" section with a
  "Rate Simply Ambient" row that opens the Play listing directly. Per Google
  guidance the button does NOT use the quota-limited in-app review dialog.

### Files changed

- `lib/rateGate.ts` (new), `lib/rateApp.ts` (new),
  `__tests__/rateGate.test.ts` (new)
- `App.tsx`, `BreathworkView.tsx`, `MoreView.tsx`
- `package.json` / `package-lock.json` (adds `expo-store-review@~9.0.9`, the
  official Expo module, justified as the only correct way to use Play in-app
  review)

### Tests run

- `npx tsc --noEmit`: pass (strict).
- `npm test`: 3 suites, 35 tests, all pass (12 new tests covering the gate:
  new-install never prompts, each threshold individually required, never
  prompts twice, heavy-first-day still waits for elapsed days).

### Manual QA instructions

1. Fresh install (or More > Safety > WIPE ALL DATA, then restart).
2. More > Support > "Rate Simply Ambient" opens the Play Store listing on
   Android, and the web listing elsewhere. Works regardless of any gate.
3. Automatic prompt: needs a real device with Play services and the app
   installed from a Play track. To simulate the gate quickly in dev, reduce
   `MIN_OPENS`/`MIN_DAYS_SINCE_FIRST_OPEN` in `lib/rateGate.ts`, then open the
   app 5 times and finish one breath session (e.g. Box Breathing, 1 cycle
   target). The Play dialog should appear ~1.5s after "Complete".
4. Confirm the dialog never appears a second time (state survives restarts).
5. Confirm WIPE ALL DATA resets the counters (prefix delete covers
   `@simply_ambient_rate_v1`).

### Known risks

- Play may silently skip the dialog (its own quota); by design we mark the
  state as prompted anyway and never retry.
- `recordSessionCompleted()` inside the mala `setCount` updater follows the
  existing side-effect-in-updater idiom of that function; a double invocation
  in dev StrictMode would only overcount sessions, which cannot cause a second
  prompt.

### Suggested next cycle

Feedback mechanism (backlog priority 2): generalize the existing Bug Report
pipeline (formsubmit + mailto fallback) into Feedback & Bug Report with a
message-type choice and opt-in app/device info line.

---

## Cycle 2: Send Feedback

- **Date:** 2026-07-08
- **Goal:** Backlog priority 2. A calm, general feedback channel that reuses
  the proven bug-report pipeline instead of adding a new service.

### What was implemented

- The "Report a Bug" sub-page in More is now "Feedback": a message-kind
  chip row (Feedback / Idea / Bug) that adapts the email subject line and the
  placeholder copy, on top of the existing FormSubmit AJAX + mailto fallback.
- "Attach app info" toggle (default on) that appends exactly one line, shown
  verbatim in the UI before sending: app version (from `expo-constants`,
  already bundled with Expo, no new dependency) plus platform and OS version.
  A hint under the toggle states that journals and profile data are never
  attached. Turning it off sends nothing extra.
- Hub tile renamed to "Feedback" with a chat icon (phosphor `ChatCircleText`
  replacing `Bug`); sub-line invites ideas and kind words as well as reports.

### Files changed

- `MoreView.tsx` only.

### Tests run

- `npx tsc --noEmit`: pass. `npm test`: 35/35 pass.

### Manual QA instructions

1. More > Feedback. Switch between Feedback / Idea / Bug chips; the body
   placeholder changes for Bug.
2. Send with a subject only; on a device with mail configured the silent
   FormSubmit path fires first, then mailto fallback. Confirm the subject
   arrives as "[Simply Ambient] Feedback: ..." (or Idea/Bug).
3. Toggle "Attach app info" off and confirm the sent body has no version line.
4. Empty subject AND body shows the "Empty message" toast and sends nothing.

### Known risks

- FormSubmit remains a third-party relay (unchanged from before); the
  fallback path keeps working if it ever lapses.
- `docs/privacy-policy.md` wording says "bug reports"; it should say
  "feedback and bug reports". Scheduled for the privacy cycle.

### Suggested next cycle

Onboarding walkthrough (backlog priority 3): add the missing teaching beats
(soundscapes, sleep timer, settings), step indicator dots, and a replay
entry point in Settings.

---

## Cycle 3: Onboarding walkthrough upgrade

- **Date:** 2026-07-08
- **Goal:** Backlog priority 3. Close the teaching gaps in the existing 5-step
  flow, make progress visible, and make the walkthrough replayable.

### What was implemented

- New final "Good to know" step with four tips the old flow never taught:
  soundscape layering (the app's ambient sounds), the sleep timer, tuning and
  saving custom presets, and Settings (single app color) plus where to replay
  the walkthrough. Rendered with the existing recommendation-card styling.
- Step indicator dots (top center, replay-aware count), so the flow reads as
  a finite walkthrough instead of an unknown number of gates.
- Replay support: More > Settings gains a WALKTHROUGH section with a
  "Replay the intro" row. Replay mode (`isReplay` prop) skips the legal step
  (already agreed once) and the profile step (already stored), so a replay is
  purely welcome, intent, recommendations, tips. The onboarded flag is never
  cleared; a replay that is closed mid-way changes nothing.
- Step transitions now walk a declared sequence (`FIRST_RUN_STEPS` /
  `REPLAY_STEPS`) instead of hardcoded targets.
- Fixed the grammatically broken outro sentence on the recommendations step.

### Files changed

- `OnboardingView.tsx`, `App.tsx`, `MoreView.tsx`.

### Tests run

- `npx tsc --noEmit`: pass. `npm test`: 35/35 pass.

### Manual QA instructions

1. Fresh install: 6 dots, flow = welcome, safety, intent, profile, recs, tips.
   "Skip the rest" on the intent step still exits immediately (skippable).
2. Profile step Skip lands on recommendations, then tips, then ENTER.
3. More > Settings > "Replay the intro": 4 dots, no legal step, no profile
   step. Finishing returns to Settings exactly as it was.
4. Replay with an existing profile, type nothing: profile is unchanged.

### Known risks

- The tips copy names real UI ("below Play", "More → Settings"); if those
  move, the copy must follow. Content-registry cycle will note this coupling.

### Suggested next cycle

Privacy reassurance (backlog priority 4): a verified at-a-glance privacy
summary in Settings with the hosted policy link, plus a wording fix in the
policy for the feedback rename.

---

## Cycle 4: Privacy reassurance

- **Date:** 2026-07-08
- **Goal:** Backlog priority 4. Surface verified privacy facts where users
  look for them, and keep every claim in sync with what the code does.

### What was implemented

- Settings gains a YOUR PRIVACY section: a card of five at-a-glance facts
  (each verified against the implementation: local-first storage, no
  accounts/ads/tracking, horoscope requests send only sign + period, crash
  reports never carry journal content, AI Insights is opt-in per source),
  a "Read the privacy policy" row that opens the hosted policy behind the
  existing confirm-before-browser modal, and a pointer to WIPE ALL DATA.
- Extracted `LinkConfirmModal` as a shared component (was inline in
  SafetyPage) so Settings and Safety use one implementation.
- Accuracy fix: the "YOUR DATA" copy in both onboarding and Safety claimed
  nothing leaves the device except AI Insights; that omitted Sentry crash
  diagnostics and the horoscope fetch. Both now state the full truth.
- `docs/privacy-policy.md` (the source of the hosted GitHub Pages policy):
  bumped last-updated, added the rate-prompt counters to the on-device list,
  and renamed bug-report references to the new Feedback form, including the
  attached app-info line.

### Files changed

- `MoreView.tsx`, `OnboardingView.tsx`, `docs/privacy-policy.md`.

### Tests run

- `npx tsc --noEmit`: pass. `npm test`: 35/35 pass.

### Manual QA instructions

1. More > Settings: YOUR PRIVACY card renders under WALKTHROUGH; the policy
   row opens the confirm modal, Open launches the browser, Cancel stays.
2. More > Safety: privacy policy and terms links still work through the same
   modal (shared component now).
3. Onboarding step 2 (Before you begin): YOUR DATA section mentions
   horoscopes and crash reports.

### Known risks

- The hosted policy only updates when docs/ is pushed to GitHub Pages;
  until then the app links to the May 15 version. Noted in the Play Store
  update checklist.
- PRIVACY_FACTS is a hand-maintained list; any new network call must update
  it (comment in code says so).

### Suggested next cycle

Content registry (backlog priority 5): move the hardcoded content arrays
into lib/content/ modules with invariant tests and an adding-content guide.

---
