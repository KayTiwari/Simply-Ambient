# Privacy Policy: Simply Ambient

_Last updated: July 13, 2026_

Simply Ambient ("the app") is a meditation, breath-work, and wellness tool published by **Like Chess**.

This is a short, plain-language privacy policy. The summary: **we don't run user accounts, show ads, or maintain a journal database.** Your entries and preferences stay on your device unless you deliberately use an online feature described below. The app also sends filtered anonymous crash diagnostics to Sentry.

## What stays on your device only

The following are stored locally on your device. Most items use the operating system's standard app storage. On native builds, a Gemini key is kept in the operating system's secure credential store. In the web build, it lasts only for the current browser-tab session. Journal sources leave the device only when they are shown as enabled and you tap Journal Themes. A selected zodiac sign is sent only when the app requests a live horoscope, as described below.

- Your custom frequency presets and which one is active
- Your background-music selection. The file picker may create a local playback copy in the app cache; the app never uploads the audio.
- Your selected zodiac sign and cached horoscope readings
- Your **mood check-ins** (timestamps + 1–5 ratings)
- Your **gratitude journal** entries
- Your **rant** entries (off by default for AI Insights)
- Your **manifestation** entries
- Your **birth profile** (name, date, time, location, MBTI result if you take the quiz)
- A second person's previously entered birth profile, if one exists from an earlier version. Compatibility is currently disabled, but a prior local entry remains until you wipe app data.
- Your AI Insights per-source toggles
- Your streak count and last-activity date
- Your notification preference and custom reminder time
- Your pinned More-page shortcuts and selected still-background color
- Your breath-cue, mala-haptic, tarot-deck, and other practice preferences
- Your Gemini API key (only if you enter one)
- Whether you've completed the first-launch onboarding
- The current tarot card draw, spread/deck preference, and last saved AI reflection
- Rate-prompt counters (number of app opens, completed sessions, and whether the one-time review prompt has already been shown). These decide when the app may ask, once ever, for a Play Store rating. They contain no dates of birth, journal content, or identifiers, and they never leave the device; the rating dialog itself is drawn by Google Play.

## Network requests we make

The app contacts a small number of services. None of these requests include personal information beyond what is required for the request itself.

| Service | What is sent | What it returns | When |
|---|---|---|---|
| `freehoroscopeapi.com` | Your selected zodiac sign and the period (daily / weekly / monthly), or the requested number of random tarot cards | Public horoscope or tarot text | When you open Stars, change a reading period, or draw cards; horoscope responses are cached for 6 h |
| Developer's proxy (Vercel) | The same horoscope or tarot request and, as with any web server, the IP address of the request | Relays the public response | **Web version only.** It maintains no application database; standard hosting logs may apply. |
| `generativelanguage.googleapis.com` (Google Gemini) | For Journal Themes: the sources shown as enabled (mood, gratitude, manifestations, or rants). For Interpret Tarot: the drawn card name, orientation, matching meaning, and description. The request also carries the API key you entered in a header. | A short AI reflection | **Only when you tap "Journal Themes" or "Interpret Tarot" on the AI Insights page.** Mood, gratitude, and manifestations begin enabled; rant sharing begins OFF and must be enabled by you. |
| `formsubmit.co` | Subject and body of your feedback or bug report, plus (only if you leave "Attach app info" on) one line with the app version, platform, and OS version | Forwards to the developer's inbox | Only when you submit the Feedback form |
| `sentry.io` (Sentry) | Filtered crash diagnostics that may include event time, stack trace, and basic device, OS, and app context | Nothing visible to you | Automatically when the app crashes or encounters an unexpected error. Free-form messages, request data, breadcrumbs, journal content, and saved keys are stripped before sending. |

If sending feedback fails (e.g. you have no network), the app falls back to opening your **mail app** with a pre-filled message that you can choose to send. The destination address is the developer's email; nothing is sent without you pressing your mail app's Send button.

## What we do NOT do

- We do **not** run user accounts or maintain a database of users.
- We do **not** require sign-up or login.
- We do **not** show advertising of any kind.
- We do **not** sell user data.
- We do **not** track you across other apps or websites.
- We do **not** include the contents of your journal, mood log, profile, rants, or manifestations in crash reports.

## Data deletion {#data-deletion}

You have two ways to delete data the app has stored on your device:

1. **In-app:** open **More → Safety & Disclaimer**, scroll to **WIPE ALL DATA**, and confirm. The app removes profiles, mood log, gratitude, release entries, intentions, presets, cached readings, your Gemini API key, saved AI reflection, pinned pages, settings, and any imported-audio cache copy. It reports success only after the deletion completes.
2. **By uninstalling the Android app**, which removes its local app storage and cache. For any future iOS build, use Wipe All Data or Remove key first because operating-system credential storage can survive an uninstall. In the web build, closing the tab removes the session-only Gemini key; browser site-data controls remove other local data.

Crash diagnostics that have already been sent to Sentry are retained according to Sentry's retention policy and are not tied to a Simply Ambient account because the app has no accounts. If you have a privacy question about a diagnostic, contact the developer using the **Feedback** form inside the app.

## Notifications

If you opt in to affirmation or gratitude reminders, they are scheduled **locally on your device** by the operating system. No notification content is sent to a server. Disabling notifications cancels the schedule entirely.

## Background music

If you pick an audio file for background music, the platform file picker may copy it into the app's private cache for local playback. No audio is uploaded. Clearing the selection releases it; Wipe All Data and uninstall remove the app-managed cache copy.

## Children

Simply Ambient is intended for users **18 and older**. We do not knowingly collect any data from children.

## Changes to this policy

If this policy changes, the "Last updated" date at the top will change and the new policy will be available at the same URL.

## Contact

For privacy questions, please contact the developer through the **Feedback** form inside the app, which routes to the developer's email.

---

**Like Chess · Simply Ambient**
