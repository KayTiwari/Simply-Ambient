# More Pages Composition Redesign Loop

Date: 2026-07-10

This document describes the composition-level redesign implemented in
`App.tsx`, `MoreUI.tsx`, and `MoreView.tsx`: the More hub plus all 16
destinations. It supersedes the earlier account of a mostly surface-level
ambient pass.

## Why this pass exists

The previous pass established accent washes, `GlowCard`, action pills, prompt
chips, and designed empty states. Those changes improved finish, but many pages
still had the same basic composition: a flat navy field, a centered title, a
stack of generic rectangles, and large stretches of unused space. Changing the
wash color did not give each tool its own emotional or visual purpose.

This pass therefore changes hierarchy, grouping, page headers, hero regions,
writing surfaces, and content rhythm. It does not add dependencies, storage
keys, sensitive data, wellness scores, navigation routes, network calls, or
new product claims. Existing save/delete, reminder, audio, privacy, AI,
external-link, and wipe behavior remains in place unless a page note below
explicitly says otherwise.

## Shared design system

### `MoreUI.tsx`

- `AmbientPageShell` now owns a moonlit three-stop base, a larger accent
  aurora, violet side aura, two faint orbits, three static stars, and bottom
  depth. The atmosphere fades in once over 700 ms with cubic easing and then
  stays still.
- `GlowCard` now has a stronger diagonal surface gradient, accent aura,
  hairline top highlight, larger radius, shadow/elevation, and a `quiet`
  variant for supporting rather than primary surfaces.
- `EmptyStateCard` now uses an accent-tinted gradient and a framed glyph, with
  stronger title/hint hierarchy.
- `ActionPill` now has a 48-point minimum height, contained rounded shape,
  primary sheen, arrow affordance, shadow, and clearer disabled state.
- `PromptChip` now has a 44-point minimum height, tactile rounded-rectangle
  shape, and accent dot. Reminder choices also meet a 44-point target.
- New `MoreSectionGroup` provides the hub's numbered eyebrow, editorial title,
  descriptive subtitle, and section spacing.

### `App.tsx`

- The compact five-tab label style is reduced from 9 px with 0.4 tracking to
  8 px with no added tracking. This keeps the longest labels, `Frequencies`
  and `Horoscopes`, inside their columns at 320-point widths.

### `MoreView.tsx`

- The former back-arrow/title bar is now an editorial sub-page header. Every
  destination receives a mode, user-facing title, purpose subtitle, accent
  marker, Simply Ambient brand line, and orbit glyph. Route keys and the
  internal `SubHeader` call sites remain unchanged. Support uses a text-only
  growth marker rather than an emoji in this shared header.
- The editorial header collapses to a compact back/mode/title row while the
  keyboard is open or the viewport is shorter than 480 points, leaving room
  for the field or content being edited.
- Input pages use keyboard-adjusting scroll insets and explicit accessibility
  labels. New message, soundscape, support, destructive, modal, and MBTI
  controls expose their roles, states, and actions to assistive technology.
- Feature tiles may wrap their title across two lines, preventing Release and
  `5-4-3-2-1 Grounding` from being clipped on narrow screens.
- Scroll bodies now flex-grow. Affirmation, Grounding, and Intentions use a
  quiet bottom closing mark so short content feels deliberately anchored on a
  tall screen instead of stranded at the top.
- More-to-More links now push the current destination onto a local page
  history. Back returns from Grounding to Release and from Affirmations to
  Settings before closing to the hub. Android hardware Back consumes that
  same history while a More destination is open and falls through normally at
  the hub.
- Serif display type is reserved for page purpose and payoff. Small uppercase
  labels organize supporting information; normal sentence case is used for
  human actions.
- Page-specific compositions use only the existing React Native, gradient,
  icon, and SVG capabilities.

## Shared verification and artifacts

- `npx tsc --noEmit`: pass on the final tree.
- `npm test -- --runInBand`: pass, 4 suites and 58/58 tests.
- `npm run build:web`: pass; Expo exports 22 assets to `dist`.
- `scripts/capture-more-pages.mjs` now exports to
  `docs/screenshots/more-v2/`, uses a 360 x 800 web viewport at 3x density,
  completes onboarding as River with the Calm intention, and walks all 17
  surfaces. It waits for the Mood slide to settle before selecting Good, waits
  for Soundscapes to report `Playing now`, and stops all audio before moving to
  later screenshots.
- The capture set contains 17 PNGs at 1080 x 2400: one hub and one image for
  every destination. The script selects Good, advances Grounding to step
  three, starts Soft Rain, stops audio before continuing, and seeds Profile
  birth details. The refreshed Mood image is settled at full width; the
  Soundscapes image shows Soft Rain, `Playing now`, volume, and STOP; later
  images are clear of the audio mini-player.
- A focused Playwright regression passes at 320 points: the Grounding feature
  title wraps without ellipsis (`clientWidth = scrollWidth = 143`), both long
  bottom-tab labels fit, and Release actions stay on-canvas on one line with a
  10-point gap. At a simulated 320 x 308 keyboard viewport the header is 44
  points; Gratitude, Profile, and Feedback fields reveal fully after scroll,
  while 195/200 points of Release remain visible with its caret and typed line.
- Nested Back returns Settings <- Affirmation and Release <- Grounding. Tall
  closings remain above the tab bar at 430 x 932 and 768 x 1024, with no
  horizontal overflow or runtime errors.
- These are web review artifacts, not evidence of native iOS/Android keyboard
  behavior, large text, screen-reader flow, Android hardware Back, or
  release-build performance. The Android handler is source-verified but still
  requires a device or emulator.

## 1. More hub — editorial wellness hub

- **Original issue:** The hub was a long launcher made from equal two-column
  tiles. A greeting and optional statistics sat above it, but all 16
  destinations carried almost the same visual weight and the page offered
  little guidance about what to do now.
- **Design goal / emotional purpose:** Orient without overwhelming. The user
  should understand within three seconds that this is a private, personal
  space and see one useful next action.
- **UI and UX changes:** The header now reads “A quiet corner, made for you.” A
  large inner-weather hero combines the time/name greeting, current mood,
  onboarding intention copy, a direct mood-check-in action, and either earned
  local metrics or a `LOCAL ONLY · NO ACCOUNT · YOURS` strip. Destinations are
  grouped as Reflect, Restore, Understand, and The App, with editorial section
  copy and feature, wide, and half-card rhythms. Release and Grounding receive
  two-line-capable feature scale; Insights, Soundscapes, and Compatibility
  receive wide scale. The streak metric now honestly reads `GRATITUDE STREAK`,
  matching the activity that increments it. Existing route targets remain the
  same. The onboarding `intent` is now read by the hero instead of being
  loaded and discarded. Editing the profile name updates the mounted hub
  immediately; wiping data clears both the live greeting name and intention.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/01-editorial-hub.png`.
- **Verification:** The capture script enters More after named onboarding and
  records the personalized River/Calm state. TypeScript and Jest pass.
- **Remaining ideas:** Add recent-practice or favorite-sound context only when
  real local usage data supports it. Verify the long hub at tablet widths,
  large text sizes, and with every optional metric visible.

## 2. Mood — mood horizon

- **Original issue:** Five numbered controls made the check-in feel clinical,
  while the graph and history gave the page the tone of an analytics form.
  The selected emotion was not the visual center.
- **Design goal / emotional purpose:** Reflect. Make a five-second check-in
  feel like noticing inner weather rather than scoring performance.
- **UI and UX changes:** The today card is now a `TODAY'S WEATHER` hero with a
  contextual question or selected-mood sentence, a five-second/checked-in
  status, a horizon line, and an outer halo around the selected mood. The
  existing values, labels, color scale, save notification, 14-day chart,
  backfill calendar, history, and delete behavior are unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/02-mood-horizon.png`.
- **Verification:** The script waits for the page transition, records Good,
  waits for the toast to clear, and captures the full-width checked-in state.
  TypeScript, Jest, and web export pass.
- **Remaining ideas:** The graph, backfill control, and history rows still use
  the older dashboard language. A later pass could make the chart sparser and
  the history a color-thread timeline without changing the underlying data.

## 3. Release the Noise — private release ritual

- **Original issue:** The first redesign improved the copy and actions, but the
  page still read as a textarea in a generic card followed by two pills and
  generic saved rows. Release and keep did not yet have much visual meaning.
- **Design goal / emotional purpose:** Release. Create enough ceremony to make
  writing feel safe and intentional, without dramatizing distress or changing
  the local-only behavior.
- **UI and UX changes:** The composer is now a taller editorial release sheet
  with dissolving cloud marks, an `UNFILTERED · PRIVATE` label, live character
  count with stable right alignment, divider, serif writing type, and a clearer
  starter-thread label.
  Privacy is a dedicated shield bar. Kept entries are rose-tinted folded-note
  surfaces rather than generic rows. Prompt insertion, release-without-saving,
  private save, expand/collapse, and delete behavior remain unchanged. The
  post-save Grounding link still opens the same practice, but Back now returns
  to Release rather than dropping directly to the hub.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/03-release-ritual.png`.
- **Verification:** The blank ritual and all four prompt chips are visible in
  the capture. Existing save/release logic compiles and the Jest suite passes;
  the new capture does not submit a private entry.
- **Remaining ideas:** Test the composer with the native keyboard, a near-limit
  draft, expanded history, and large text. The two actions could eventually
  gain more distinct release/seal imagery if that remains calm and accessible.

## 4. 5-4-3-2-1 Grounding — sensory compass

- **Original issue:** The one-step-at-a-time flow was already the strongest
  page in the earlier pass, but the active sense still floated in a generic
  card with unused space and little spatial focus.
- **Design goal / emotional purpose:** Restore. Hold the user's attention on
  one sense and one next action, at an intentionally slow pace.
- **UI and UX changes:** Three sense-colored concentric rings now sit behind
  the active number, turning the existing step card into a compass. The
  completion card keeps a quieter two-ring form. The five colored progress
  dots, sense guidance, `Done, next`, `Finish`, `Begin again`, and ephemeral
  reset-on-leave behavior are unchanged. A quiet `INHALE · EXHALE · HERE`
  closing anchors the short ritual on tall screens.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/04-grounding-compass.png`.
- **Verification:** The capture script presses `Done, next` twice and records
  the third-sense state, proving the step transition remains reachable.
  TypeScript and Jest pass.
- **Remaining ideas:** Consider an anchored bottom action dock or perimeter
  progress nodes after native-device testing. Keep the current no-timer,
  no-score, ephemeral model.

## 5. Gratitude — dated daybook

- **Original issue:** A textarea, prompt chips, reminder controls, and plain
  saved rows made the page feel like a form and database output. The warm
  emotional payoff was weaker than the controls.
- **Design goal / emotional purpose:** Reflect. Make one ordinary good moment
  feel worth keeping while preserving a quick, private workflow.
- **UI and UX changes:** The composer is now a dated daybook sheet with an
  `A NOTE FROM TODAY` eyebrow, floral mark, rule, and larger serif writing
  surface. Saved entries use warm quote-slip styling and a quotation mark.
  Rotating placeholder, prompt chips, save gating, reminder scheduling,
  date grouping, empty state, and delete behavior remain unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/05-gratitude-daybook.png`.
- **Verification:** The capture records the empty daybook, prompts, reminder
  options, and empty journal state. TypeScript and Jest pass; it does not
  create or delete an entry.
- **Remaining ideas:** Move the reminder controls below the journal so the
  writing payoff leads the page, and verify native scheduling states plus
  dense multi-day journals.

## 6. Soundscapes — ambient scene and library

- **Original issue:** The active player was a conventional media card and the
  library was a repeated vertical settings list. The available environments
  were named but not visually evoked.
- **Design goal / emotional purpose:** Wind down. Let the user feel the room's
  atmosphere before choosing or adjusting a layer.
- **UI and UX changes:** The active player is now a taller scene hero with a
  code-drawn moon and wave horizon above current state, play/pause, and volume.
  Nature and steady-noise options are now two-column gradient tiles with
  individual colors, framed icons, and explicit play/stop badges. Intro copy
  now accurately says the layers are built in and available offline. Audio
  IDs, bundled/offline behavior, mini-player continuity, toggle logic, and
  volume slider behavior are unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/06-soundscape-scene.png`.
- **Verification:** The script starts Soft Rain, waits until `Playing now` is
  visible, and captures the current layer, 42% volume, pause control, and STOP
  tile state. It then invokes `Stop all audio` before later pages. TypeScript,
  Jest, and web export pass.
- **Remaining ideas:** Consider a lightweight scene per environment after
  measuring performance, and verify two-column labels on narrow devices, with
  large text, and across every bundled sound ID.

## 7. Profile — identity atlas

- **Original issue:** Four plain fields followed by four MBTI question cards
  made the page feel like a long onboarding/settings form. Personal payoff
  appeared only after data entry.
- **Design goal / emotional purpose:** Understand and personalize. Lead with a
  private portrait assembled only from data the user already chose to enter.
- **UI and UX changes:** A new identity-atlas hero shows a local initial (or
  Sun glyph fallback), name prompt, Sun token, and personality-type token.
  Name, birth date, time, and location are consolidated into one quiet
  coordinates sheet; date and time share a row and a local-only line closes
  the sheet. Existing live persistence, date validation, Sun-sign payoff,
  four-question MBTI sketch, result, and retake behavior remain unchanged.
  Zodiac glyphs explicitly request text presentation and use the serif display
  face so platforms do not substitute colorful emoji.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/07-profile-atlas.png`.
- **Verification:** The capture script fills date, time, and location before
  recording the atlas and coordinates state. The name is already River from
  onboarding. TypeScript and Jest pass.
- **Remaining ideas:** The personality sketch still uses four stacked generic
  question cards; compact paired rails could reduce form fatigue. Test native
  date/time keyboard behavior and never present the four-question result as a
  clinical assessment.

## 8. Natal Chart — honest natal wheel

- **Original issue:** A page named Natal Chart showed a Sun-sign card, birth
  details, explanatory copy, and a coming-soon redirect, but no chart-like
  visual. The apology outweighed the known information.
- **Design goal / emotional purpose:** Understand. Show an evocative chart
  composition while being explicit that the app currently knows only the Sun
  sign from the local birth date.
- **UI and UX changes:** New `NatalWheel` uses existing SVG primitives for
  three concentric circles, 12 ticks, four axes, and a centered Sun glyph/sign.
  Only one known point is highlighted; caption copy explicitly says planets
  and houses require a full calculation. Birth details and the external chart
  calculator remain below, and the calculator is still disabled until a valid
  local birth date yields a Sun sign. The centered zodiac symbol is forced to
  text rather than emoji presentation.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/08-natal-wheel.png`.
- **Verification:** The profile seeded in the previous capture step supplies a
  valid Sun sign, so the wheel and enabled calculator state are recorded.
  TypeScript and Jest pass.
- **Remaining ideas:** A true in-app natal chart requires a real ephemeris,
  time-zone/location handling, and explicit accuracy tests. Do not fill the
  decorative wheel with invented planets, houses, or aspects.

## 9. Settings — live atmosphere preview

- **Original issue:** The most personal visual setting was represented only by
  a toggle and swatches, followed by a generic list of walkthrough, reminder,
  privacy, policy, and rating controls.
- **Design goal / emotional purpose:** Prepare and personalize. Show the
  consequence of the background choice before asking the user to configure it.
- **UI and UX changes:** A new ambient-window hero previews either the selected
  still color or the live frequency-responsive palette, with orbit details,
  descriptive name, mode hint, and `STILL`/`LIVE` status. Existing toggle,
  swatches, onboarding replay, reminder deep link, privacy facts, policy
  confirmation, wipe pointer, and store-rating behavior are unchanged. The
  reminder deep link still opens Affirmations, and Back now returns to Settings
  before the hub.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/09-settings-preview.png`.
- **Verification:** The capture records the default live preview and the
  controls beneath it. TypeScript and Jest pass; the capture does not toggle
  every still-color choice.
- **Remaining ideas:** Group the remaining rows into clearer Experience and
  Trust panels, and verify the hero against every color, tablet widths, and
  reduced-motion/accessibility preferences.

## 10. Safety & Disclaimer — scannable safety guide

- **Original issue:** Immediate listening guidance, medical context, data
  handling, warranty text, links, and destructive wipe action appeared as one
  long legal wall with nearly equal visual weight.
- **Design goal / emotional purpose:** Understand and feel protected. Put the
  three urgent rules first, then make the complete guidance scannable without
  softening its meaning.
- **UI and UX changes:** A shield hero leads with low volume, stopping if
  uncomfortable, staying present, and never listening while driving. New
  numbered `SafetyPanel` sections group Listen gently, Know your body, Your
  data plainly, and Terms of use with distinct accents and hierarchy. Existing
  policy/terms confirmations and the isolated destructive wipe flow remain at
  the bottom. The core listening, medical, symptom, privacy, and warranty
  topics are retained with condensed wording and a more compact structure.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/10-safety-guide.png`.
- **Verification:** The capture records the hero and beginning of the numbered
  guide. TypeScript and Jest pass; external links and wipe confirmation were
  not activated by the capture script.
- **Remaining ideas:** Review the condensed wording with release/legal QA,
  verify all panels and destructive controls with large text and a screen
  reader, and keep urgent guidance visible rather than hiding it in accordions.

## 11. Feedback — message postcard

- **Original issue:** Message-type pills, two inputs, an app-info toggle, and a
  send button formed a standard contact form and left the emotional purpose of
  contacting the maker visually unexpressed.
- **Design goal / emotional purpose:** Support. Make sending a note feel direct,
  human, and low-pressure while retaining transparent delivery behavior.
- **UI and UX changes:** Feedback, Idea, and Bug are now three stamp-like radio
  selectors with distinct marks. Subject and body live on a rose postcard with
  maker line and `SA` postmark. The primary action now reads `Send this note →`
  and uses a grounded rectangular seal shape. Validation, FormSubmit attempt,
  15-second timeout, mail-app fallback, app-info opt-in, character limit, and
  inline success state are unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/11-feedback-postcard.png`.
- **Verification:** The capture records the default Feedback stamp, blank
  postcard, app-info disclosure, and send action. TypeScript and Jest pass; no
  external message is sent during capture.
- **Remaining ideas:** Treat attached app info as a visually detachable footer
  strip and verify native keyboard avoidance, long copy, offline fallback, and
  screen-reader names for the stamp selectors.

## 12. Support — maker letter and roadmap chapters

- **Original issue:** A large coffee emoji and donation button dominated the
  page, while roadmap items read like a dense project tracker rather than a
  transparent invitation into a one-person product.
- **Design goal / emotional purpose:** Support. Establish the maker relationship
  first, then make optional support and future plans feel clear rather than
  transactional.
- **UI and UX changes:** The hero now uses a framed duotone coffee seal,
  `A NOTE FROM THE MAKER`, serif headline, revised note, and sentence-case
  `Support the next chapter` action; the shared page header uses a non-emoji
  growth marker. Every roadmap phase is now a bordered chapter with an item
  count; existing confidence opacity and shipped checks remain. Donation URL,
  store-rating action, roadmap content, and optionality are unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/12-support-maker-letter.png`.
- **Verification:** The capture records the maker letter and first roadmap
  chapter. TypeScript and Jest pass; donation and rating links are not opened.
- **Remaining ideas:** A vertical night-sky route could make roadmap sequence
  and confidence more visual. Verify very long roadmap content and ensure the
  optional donation action never obscures shipped/current value.

## 13. AI Insights — reading room and ingredient tray

- **Original issue:** Example manuscript, API-key setup, source switches, two
  analysis actions, and generated output used competing visual languages. The
  valuable reading was surrounded by developer-console-like configuration.
- **Design goal / emotional purpose:** Reflect. Demonstrate the payoff first,
  then make consent and data ingredients explicit and contained.
- **UI and UX changes:** The no-key welcome and candlelit example remain first.
  Key management, source consent chips, entry counts, and both analysis actions
  are now composed inside one quiet `INGREDIENTS FOR A READING` tray with an
  editorial heading. The live dream-page output now receives the same faint
  gold top light as the example. API endpoint/model, own-key storage, opt-in
  defaults, source gating, timeouts, prompts, saved reflection, and error
  behavior are unchanged.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/13-insights-reading-room.png`.
- **Verification:** The capture records the honest no-key state, example
  reading, empty source counts, and disabled analysis actions. TypeScript and
  Jest pass; capture makes no Gemini request and exposes no journal data.
- **Remaining ideas:** For keyed returning users, keep the latest manuscript
  visually dominant above setup, with the ingredient tray secondary. Test
  loading, API error, saved reflection, enabled-source, Tarot, and long-output
  states without weakening the explicit consent copy.

## 14. Routines — themed session paths

- **Original issue:** Three identical instructional cards looked like inactive
  feature cards and did little to communicate sequence, duration, or the
  distinct tone of morning, evening, and sleep.
- **Design goal / emotional purpose:** Restore and focus. Make each static guide
  read as a path through a session without implying automatic sequencing.
- **UI and UX changes:** Each routine is now a quiet accent card with oversized
  background triangle, `SESSION PATH` eyebrow, larger serif name, duration
  badge, connected path line, and numbered frequency nodes. The same three
  routines, frequencies, minutes, explanatory copy, and roadmap disclaimer
  remain; cards are still instructional and not presented as start buttons.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/14-routine-paths.png`.
- **Verification:** The capture records all path styling reachable from the
  Routines route. TypeScript and Jest pass; there is no sequencer interaction
  to test in this page.
- **Remaining ideas:** Add proportional minute segments or a small duration arc
  if it improves scanability. Custom routines and automatic transitions should
  appear only when the underlying feature and tests exist.

## 15. Compatibility — dual orbits

- **Original issue:** Self data, four partner fields, a conditional result, and
  a dashed roadmap panel made data entry visually outweigh the payoff. The two
  people had no shared visual before the form.
- **Design goal / emotional purpose:** Understand. Establish two equal people
  and the limited, grounded nature of the element reflection at a glance.
- **UI and UX changes:** A dual-orbit hero now places self and partner signs in
  overlapping circles around a conjunction mark, with a ready/missing-data
  explanation. Partner inputs are consolidated into one quiet coordinates
  sheet; birth date leads, and time/location share a row. Self summary,
  partner persistence/clear, conditional element reflection, disclaimer, and
  full-chart roadmap note remain unchanged. Orbit and result zodiac symbols
  use explicit text presentation for consistent monochrome rendering.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/15-compatibility-orbits.png`.
- **Verification:** The profile seeded earlier supplies the self orbit; the
  capture records the honest partner placeholder and input sheet. TypeScript
  and Jest pass; the capture does not persist a partner or generate a pair.
- **Remaining ideas:** Test every sign/element pairing and populated long-name
  state. A full synastry composition must wait for a real natal-chart pipeline
  rather than inferring precision from Sun signs.

## 16. Daily Affirmation — dated talisman

- **Original issue:** A quote inside a generic card with an embedded button
  read like content inside a notification-settings form, not a thought meant
  to frame the day.
- **Design goal / emotional purpose:** Restore. Give one sentence the stillness
  and visual importance of a daily object while keeping choice lightweight.
- **UI and UX changes:** The quote is now a 310-point talisman with subtle
  concentric sun rings, full date, divider, larger serif italic text, a
  sentence-case `Choose another` action, and a quiet “keep only what feels
  true” line. Notification copy is reframed as `CARRY IT WITH YOU`; reminder
  preferences, permission checks, Expo Go warning, and refresh behavior remain
  unchanged. A quiet `ONE THOUGHT · ONE DAY` closing uses remaining tall-screen
  space without adding another control.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/16-affirmation-talisman.png`.
- **Verification:** The capture records a loaded daily affirmation and the
  reminder controls. TypeScript and Jest pass; notification permission and
  delivery states require native QA.
- **Remaining ideas:** Verify unusually long affirmations, large text, loading,
  blocked permission, and all reminder selections. Keep refresh quiet rather
  than turning the page into a swipeable content feed.

## 17. Manifestation / Intentions — seed and orbit archive

- **Original issue:** The composer and pending/arrived rows used task-list and
  checkbox semantics, making intentions feel administrative and giving arrived
  items little sense of distinction.
- **Design goal / emotional purpose:** Prepare and reflect. Frame an intention
  as a direction planted now and revisited later, without promising outcomes.
- **UI and UX changes:** The hub label is now `Intentions`, while the existing
  route and `Manifestation` internal title remain. The page header presents
  `Name the Direction`. The composer gains a seed-star medallion, planting
  language, and supporting microcopy. Pending rows gain a violet orbit line;
  arrived rows gain a warmer gold surface and line. Save, mark arrived/unarrived,
  timestamps, counts, empty state, and delete behavior are unchanged. A quiet
  `HELD HERE · UNTIL IT ARRIVES` closing anchors short/empty states.
- **Files / artifacts:** `MoreView.tsx`; shared `MoreUI.tsx`;
  `scripts/capture-more-pages.mjs`;
  `docs/screenshots/more-v2/17-intention-seed.png`.
- **Verification:** The capture records the empty seed composer and designed
  empty archive. TypeScript and Jest pass; populated pending/arrived states are
  not covered by the capture script.
- **Remaining ideas:** Replace the remaining checkbox feel with a clearer orbit
  transition and give arrived items a restrained celebratory archive. Test
  mixed pending/arrived histories, long copy, toggling, and deletion.

## Files changed in this composition pass

- `App.tsx`: narrower compact tab-label typography for 320-point screens.
- `MoreUI.tsx`: expanded ambient primitives and new `MoreSectionGroup`.
- `MoreView.tsx`: hub hierarchy, responsive editorial headers, nested page
  history/back behavior, page closings, and all 16 destination compositions.
- `scripts/capture-more-pages.mjs`: deterministic 17-surface walkthrough and
  `more-v2` output path.
- `docs/screenshots/more-v2/`: 17 new review images.
- `docs/more-pages-redesign-loop.md`: this audit and implementation record.

## Next suggested loop

Use the 17 `more-v2` images as the web small-phone baseline, then review on one
small iPhone, one larger iPhone, one Android device, and one tablet. Prioritize
input/keyboard pages (Release, Gratitude, Profile, Compatibility, Feedback),
large-text wrapping, screen-reader order, loaded/empty/error states, and long
saved histories. Any next visual pass should target the explicitly listed
remaining generic areas rather than adding another global wash.
