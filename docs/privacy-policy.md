# Privacy Policy — Simply Ambient

_Last updated: May 15, 2026_

Simply Ambient ("the app") is a meditation, breath-work, and wellness tool published by **Like Chess**.

This is a short, plain-language privacy policy. The summary: **we don't run user accounts and almost everything stays on your device.** The two exceptions are crash diagnostics (sent automatically to Sentry) and the AI Insights feature (sends only the journal sources you opt in to share, only when you press the analyse button).

## What stays on your device only

The following are stored locally on your device using the operating system's standard local storage. They never leave the device unless you explicitly choose to share them via the AI Insights feature (see below):

- Your custom frequency presets and which one is active
- Your background-music selection (only the file path / handle — we never upload the audio)
- Your selected zodiac sign
- Your **mood check-ins** (timestamps + 1–5 ratings)
- Your **gratitude journal** entries
- Your **rant** entries (off by default for AI Insights)
- Your **manifestation** entries
- Your **birth profile** (name, date, time, location, MBTI result if you take the quiz)
- A second person's birth profile (only if you fill it in on the Compatibility page)
- Your AI Insights per-source toggles
- Your streak count and last-activity date
- Your notification preference
- Your Gemini API key (only if you enter one)
- Whether you've completed the first-launch onboarding
- The current tarot card draw

## Network requests we make

The app contacts a small number of services. None of these requests include personal information beyond what is required for the request itself.

| Service | What is sent | What it returns | When |
|---|---|---|---|
| `freehoroscopeapi.com` | Your selected zodiac sign and the period (daily / monthly) | Public horoscope text | Each time you open the Horoscopes tab; cached for 6 h |
| Developer's proxy (Vercel) | Your selected zodiac sign and, as with any web server, the IP address of the request | Relays the horoscope or tarot response | **Web version only.** Horoscope and tarot requests route through it. It stores nothing and no logs are kept beyond standard hosting. |
| `generativelanguage.googleapis.com` (Google Gemini) | The journal sources you have toggled ON for AI Insights (any of: mood log, gratitude entries, manifestations, rants) + the API key you entered | A short AI reflection | **Only when you tap "Journal Themes" or "Interpret Tarot" on the AI Insights page.** Rant sharing is OFF by default; the user must explicitly enable it. |
| `formsubmit.co` | Subject and body of your bug report | Forwards to the developer's inbox | Only when you submit a bug report |
| `sentry.io` (Sentry) | Crash diagnostics (stack trace, device model, OS version, app version) | Nothing visible to you | Automatically when the app crashes or encounters an unexpected error. No journal data is attached. |

If sending a bug report fails (e.g. you have no network), the app falls back to opening your **mail app** with a pre-filled message that you can choose to send. The destination address is the developer's email; nothing is sent without you pressing your mail app's Send button.

## What we do NOT do

- We do **not** run user accounts or maintain a database of users.
- We do **not** require sign-up or login.
- We do **not** show advertising of any kind.
- We do **not** sell user data.
- We do **not** track you across other apps or websites.
- We do **not** include the contents of your journal, mood log, profile, rants, or manifestations in crash reports.

## Data deletion {#data-deletion}

You have two ways to delete data the app has stored on your device:

1. **In-app, instantly:** open **More → Safety & Disclaimer**, scroll to **WIPE ALL DATA**, and confirm. This removes every entry stored locally: profile, mood log, gratitude, rants, manifestations, presets, the tarot cache, your Gemini API key, and all settings.
2. **By uninstalling the app**, which also removes everything the app stored.

Crash diagnostics that have already been sent to Sentry are retained per Sentry's standard retention policy and are tied to anonymous installation IDs, not to a user account. If you would like a Sentry record removed, contact the developer using the **Report a Bug** form inside the app or by email (below) with a brief description; we will request deletion from Sentry on your behalf.

## Notifications

If you opt in to daily affirmation notifications, they are scheduled **locally on your device** by the operating system. No notification content is sent to a server. Disabling notifications cancels the schedule entirely.

## Background music

If you pick an audio file from your device for the background music feature, the file is read locally to play it back. No audio is uploaded.

## Children

Simply Ambient is intended for users **18 and older**. We do not knowingly collect any data from children.

## Changes to this policy

If this policy changes, the "Last updated" date at the top will change and the new policy will be available at the same URL.

## Contact

For privacy questions, please contact the developer through the **Report a Bug** form inside the app, which routes to the developer's email.

---

**Like Chess · Simply Ambient**
