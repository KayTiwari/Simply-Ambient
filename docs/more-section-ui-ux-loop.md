# More Section UI/UX Loop

A page-by-page product pass over the More tab: purpose, honesty of what each
page measures, emotional tone, layout, and copy. Driven by a four-agent audit
of every sub-page (2026-07-09), then implemented in batches. Design lens:
calm premium wellness companion; track only what local data supports; human
language; no shame, no medical claims, no gamification stress.

## Audit summary (all 17 surfaces)

| Page | Biggest problem found | Risk |
|---|---|---|
| Hub | No greeting despite stored name; "DAY STREAK" chip mislabels a gratitude-only streak; mood tile says "keep the streak" though mood cannot affect it; fake-precision "AVG MOOD · 5D" from n=1 | low |
| Mood | Same-day check-ins append duplicates (visible in user screenshot); no delete; graph renders empty grid with no message; backfilling today before noon silently no-ops | medium |
| Gratitude | Reminder copy promises a conditional nudge the code does not have (fires daily regardless); page never acknowledges today's entry; Expo Go shows reminders as active that never fire | low |
| Rant | Save is the only exit for venting text; full rants render forever in scroll distance; instant delete with no confirmation of intent | low |
| Manifestation | "Manifested" toggle records no date; creation dates never shown; strikethrough mourns what should celebrate | low |
| Affirmations | "Daily" affirmation rerolls on every app mount, so the daily framing is false; reroll button fights the "one intention" copy | low |
| Routines | Non-functional page framed as a feature; descriptions duplicate step lists; roadmap repeated verbatim from Support | low |
| Soundscapes | Empty state claims "Paused" before anything played; control card shows state but has no play/pause | low |
| Grounding | Static poster for an in-distress ritual; "1 things you can taste" plural bug | low |
| Profile | Quiz answers reset each visit while the result persists; one binary question per MBTI axis rendered as 36pt certainty; no retake | low |
| Compatibility | Tile promises matching; page delivers only a coming-soon card after collecting partner data | medium |
| Natal Chart | Button gated on fields the external site does not require; page shows zero placements though sun sign is computable locally | low |
| AI Insights | Setup demanded before value is shown; source counts count toggles rather than entries; raw API errors render as candlelit "reflections"; tarot send not covered by the consent footnote | medium |
| Support | Ask stacking (donation then review before content); roadmap lists shipped items as upcoming | low |
| Safety | Contraindications buried in a 60-word paragraph; wipe enumeration drifts across three surfaces; Terms link text is the bare word "here" | medium |
| Settings | Rate ask interrupts utility flow; swatch names invisible; "Google Play" hardcoded; no pointer to reminder settings | low |
| Feedback | "Straight to the developer's inbox" hides the formsubmit.co relay; mailto fallback wipes the draft before the user sends | low |

Cross-cutting: the formsubmit.co relay is absent from PRIVACY_FACTS, the
Safety data paragraph, and the Feedback page's own copy, though all three
present exhaustive egress lists. The section grammar (sectionLabel +
sectionSub + one control) is strong and is the design system for this pass.

## Decision calls

- The streak stays gratitude-only; surfaces relabel it honestly instead of
  wiring mood into it.
- The Settings rate row stays (the tester report asks for Settings
  placement) but moves below YOUR PRIVACY so utility and privacy lead.
- Mood becomes day-scoped end to end: same-day saves replace, history is one
  row per day, delete removes the day.
- No new tracking on Grounding or Rant; distress tools stay unmeasured.
- Glyph tiles (ensō, flower, sparkle) stay; the code documents them as
  deliberate spiritual symbols.

## Batches

1. Journal: Mood, Gratitude, Rant, Manifestation (+ parent handlers).
2. Hub greeting/pulse honesty/regrouping + practice pages (Affirmations
   incl. date-keyed persistence in App.tsx, Routines, Soundscapes,
   Grounding).
3. App pages: Settings, Support, Safety, Feedback + relay disclosure.
4. Cosmos + AI: Profile, Compatibility, Natal, Insights.

Per-batch entries follow as they land.

## Batch 1: Journal (commit 45306e2)

Mood is day-scoped end to end: same-day taps replace today's entry, the
backfill accepts today before noon and replaces rather than duplicates,
history is one deletable row per day with friendly dates and no clock
times, the graph gains empty ("Your first check-in starts this chart.")
and sparse ("A few more days and a shape appears.") states, and the past-day
calendar folds behind a "Missed a day?" disclosure. Gratitude stops
promising a conditional reminder, acknowledges today's entry, disables
reminder pills in Expo Go with an honest line, blocks empty saves, and
rotates its prompt daily. Rant gains "Let it go" (release without keeping),
KEEP wording, two-line expandable previews, and a post-save hand-off to
Grounding. Manifestations record `manifestedAt`, show ages ("Since May 3"),
celebrate arrivals ("Arrived Jul 9") in the renamed ARRIVED section, and
tally "n arrived so far" from 2 up.

## Batch 2: Hub + Practice (commit b283290)

Hub greets by time of day and stored first name; pulse chips are honest
(GRATITUDE STREAK named as such, both windows 7 days, averages and trends
only with 3+ logged days, zero chips hidden); JOURNAL became REFLECT with
Grounding moved beside Rant; tile subs rewritten (no more "keep the
streak", "rewire", or "anxiety reset"). The daily affirmation persists per
local day in App.tsx so the daily framing is true; the reroll is "CHOOSE
ANOTHER" and sticks. Routines reframes as SESSION GUIDES with total-time
chips and one quiet roadmap line. Soundscapes gets an honest empty state,
a play/pause pill on the control card, NATURE and STEADY NOISE groups, and
slider accessibility. Grounding becomes a tappable five-step ritual with a
completion line and the "1 thing" plural fix.

## Batch 3: App pages (commit 1fdbc30)

The formsubmit relay is disclosed in PRIVACY_FACTS, the Safety data
paragraph, and the Feedback page itself. Safety's contraindications and
stop-now symptoms became scannable bullet lists, the Terms link got real
text and both links a link role, the wipe enumeration now matches across
section copy, confirm modal, and post-wipe alert, and SafetyContent closes
warmly. Settings: "Still background" naming, visible swatch names, a
REMINDERS pointer row into Affirmations, the rate ask demoted below
privacy, and a platform-aware store name. Support reordered to hero,
roadmap, ask; dots grade confidence by tier; a SHIPPED group turns
staleness into credibility. Feedback keeps drafts through the mailto
fallback, confirms sends inline, colors the ON state, and counts
characters near the limit.

## Batch 4: Cosmos + AI (this commit)

Profile persists quiz answers, recomputes on any change, offers Retake,
quiets the result type to 24pt, and shows the locally computable sun sign
under the birth fields. Compatibility finally pays off with an
element-pairing reflection card once both birth dates parse, reorders
fields so the needed one leads, and offers "Clear this person". Natal
Chart shows the local sun card, gates the external calculator on birth
date alone, and routes it through the confirm modal. AI Insights leads
with value (welcome card and a labeled example reflection before any
setup), collapses a saved key into a row with explicit removal, counts
real entries on source chips and dims empty ones, keeps API errors out of
the candlelit card, remembers the last reflection with its date, and the
consent footnote now covers the tarot send.

## Verification

- Every batch: `npx tsc --noEmit` exit 0, `npm test` 58/58.
- Final: `npm run build:web` exports clean; a Playwright run drove the
  rebuilt app end to end (walkthrough with a name, hub greeting, mood
  check-in, Insights, Grounding, Support) and captured
  `docs/screenshots/more/01-05`.

## Remaining recommendations

- Persist last active soundscape + volume for a "resume your usual layer"
  control-card state.
- Tappable routine steps that open Frequencies with the preset selected
  (needs an App.tsx callback).
- An honest item count in the wipe confirmation.
- InsightsPage model id is hardcoded (gemini-2.0-flash); surface a clean
  error path when Google retires it (partially covered by the new error
  line).
- Recapture all store screenshots on Android after this pass; the More
  set here is web-build draft quality.

