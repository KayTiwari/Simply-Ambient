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
