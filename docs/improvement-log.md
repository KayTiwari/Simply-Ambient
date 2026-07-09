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
