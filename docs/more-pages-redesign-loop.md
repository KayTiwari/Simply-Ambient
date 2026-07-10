# More Pages Redesign Loop

Visual redesign pass over every More page (2026-07-10), building on the
UX/honesty loop documented in `more-section-ui-ux-loop.md`. Problem: pages
read as forms on one flat navy field. Goal: a layered, premium ambient
system where each page has atmosphere, hierarchy, and an emotional mode.

## The design system (MoreUI.tsx)

- **AmbientPageShell**: every sub-page sits on its accent color washing down
  from the top over a moonlit gradient base (added once to the slide-over
  container), with a faint violet depth layer at the bottom. Static, cheap,
  calm.
- **GlowCard**: the page's hero surface; hairline accent border over a quiet
  accent-tinted gradient. Used once or twice per page, never nested.
- **EmptyStateCard**: glyph + main line + quiet hint, so empty screens feel
  designed instead of abandoned.
- **ActionPill**: primary (filled accent) and ghost (outlined) actions with
  human sentence-case labels, composed in one row.
- **PromptChip**: starter prompts for writing surfaces.

Emotional modes used: Release (Rant), Reflect (Mood, Gratitude,
Manifestation, Insights), Restore (Grounding, Soundscapes, Routines,
Affirmations), Understand (Profile, Compatibility, Natal), Prepare
(Settings, Safety, Feedback, Support).

## Flagship: Rant becomes "Release the Noise" (commit 2e1fcd6)

Original issue: flat navy, a lone right-floating KEEP pill, a centered
orphan "Let it go", one orphan empty-state line, 80% dead space.
Redesign: rose accent wash; intro "A PRIVATE PLACE / Pour out what is
heavy. Keep it only if it helps."; the writing area is a GlowCard with a
borderless input; four PromptChips appear while the draft is empty ("I'm
frustrated because…", "I keep replaying…", "What I wish I could say is…",
"I can let go of…"); actions become a composed pair, ghost "Release it"
beside primary "Keep privately", both disabled until there is text; a
quiet privacy line sits under them; past entries live under KEPT
REFLECTIONS with a designed empty state ("Your mind is clear here for
now."). All release/keep/grounding logic from the UX loop is unchanged.

## Batch A: hub, journal, practice (commit 4b73b59)

- Hub: violet shell behind the greeting, pulse, and tiles.
- Mood: the TODAY check-in row becomes the page's GlowCard hero; designed
  history empty state.
- Gratitude: writing card with three starter chips and a single "Save
  privately" ActionPill; empty journal state "Nothing noted yet."
- Manifestation: "Call it in" ActionPill inside the writing GlowCard;
  empty state "Nothing called in yet."
- Affirmations: the daily card becomes a GlowCard, typography untouched.
- Routines: guide cards pick up the accent border.
- Soundscapes: the now-playing controls become a GlowCard.
- Grounding: each sense card tints with its own color at rest; the done
  state stays stronger.

## Batch B: cosmos, insights, app (this commit)

- Profile and Natal Chart: the shared sun-sign card and the MBTI result
  become GlowCards on the violet shell.
- Compatibility: the "HOW YOUR SIGNS MEET" result is the page's GlowCard.
- AI Insights: the value-first welcome hero glows over the blue shell; the
  candlelit example reflection reads as the payoff before setup.
- Support: the hero becomes a gold GlowCard.
- Feedback: subject and body compose into one writing card with a hairline
  divider; pills, app-info row, and SEND untouched.
- Settings and Safety: shell only, deliberately quiet.

## Files changed

`MoreUI.tsx` (new), `MoreView.tsx`, plus screenshots under
`docs/screenshots/more/` (06 flagship, 07 feedback, 08 insights,
09 support).

## Tests and builds

Every batch: `npx tsc --noEmit` exit 0, `npm test` 58/58. Web export
clean after each batch; Playwright drove the built app and captured the
redesigned pages (Rant, Feedback, Insights, Support verified by eye).

## Follow-up pass (shipped)

- AmbientPageShell washes now fade in over 600ms when a page opens; a
  transition rather than ambient motion, so the stillness rule holds.
- Grounding became the one-card-at-a-time stepper: STEP n OF 5 in a
  sense-tinted GlowCard with a per-sense guidance line, colored progress
  dots, "Done, next" in the sense color, "Begin again" as the ghost, and
  the completion breath at the end. State stays ephemeral.
- The dream reflection card keeps its candlelit paper shape and gains a
  faint top-lit gold glow inside its own frame (both the example and the
  live reflection).

## Remaining ideas

- Recapture all store screenshots on Android; the More set is web-draft
  quality. No Android tooling exists on this machine (no adb), so this
  needs a device or emulator.
