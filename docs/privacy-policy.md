# Privacy Policy — Simply Ambient

_Last updated: May 6, 2026_

Simply Ambient ("the app") is a meditation, breath-work, and wellness tool published by **Like Chess**.

This is a short, plain-language privacy policy. The summary: **we don't run a server, we don't have user accounts, and we don't track you.** Almost everything stays on your device.

## What stays on your device only

The following are stored locally on your device using the operating system's standard local storage. They never leave the device unless you explicitly choose to send something (e.g. press an "Analyse" or "Send report" button):

- Your custom frequency presets and which one is active
- Your background-music selection (only the file path / handle — we never upload the audio)
- Your selected zodiac sign
- Your **mood check-ins** (timestamps + 1–5 ratings)
- Your **gratitude journal** entries
- Your **birth profile** (name, date, time, location, MBTI result if you take the quiz)
- A second person's birth profile (only if you fill it in on the Compatibility page)
- Your streak count and last-activity date
- Your notification preference
- Your Gemini API key (only if you enter one)
- Whether you've completed the first-launch onboarding

You can delete all of this at any time by uninstalling the app.

## Network requests we make

The app contacts a small number of public, free APIs. None of these requests include personal information beyond what is required for the request itself.

| Service | What is sent | What it returns | When |
|---|---|---|---|
| `freehoroscopeapi.com` | Your selected zodiac sign and the period (daily / monthly) | Public horoscope text + a random tarot card | Each time you open the Horoscopes tab; cached for 6 h (horoscopes) / 24 h (tarot) |
| `affirmations.dev` | Nothing identifying — just a request | A single random affirmation | When you tap "Refresh" on the Daily Affirmation page |
| `generativelanguage.googleapis.com` (Google Gemini) | Your mood log and gratitude entries (or the current tarot card) and the API key you entered | A short AI reflection | **Only when you tap "Journal Themes" or "Interpret Tarot" on the AI Insights page** |
| `formsubmit.co` | Subject and body of your bug report | Forwards to the developer's inbox | Only when you submit a bug report |

If sending a bug report fails (e.g. you have no network), the app falls back to opening your **mail app** with a pre-filled message that you can choose to send. The destination address is the developer's email; nothing is sent without you pressing your mail app's Send button.

## What we do NOT do

- We do **not** run a backend or maintain a database of users.
- We do **not** require sign-up or accounts.
- We do **not** collect analytics, telemetry, crash reports, or device identifiers.
- We do **not** show advertising of any kind.
- We do **not** sell or share data with third parties.
- We do **not** track you across other apps or websites.

## Notifications

If you opt in to daily affirmation notifications, they are scheduled **locally on your device** by the operating system. No notification content is sent to a server. Disabling notifications cancels the schedule entirely.

## Background music

If you pick an audio file from your device for the background music feature, the file is read locally to play it back. No audio is uploaded.

## Children

Simply Ambient is intended for users 13 and older. We do not knowingly collect any data from children.

## Changes to this policy

If this policy changes, the "Last updated" date at the top will change and the new policy will be available at the same URL.

## Contact

For privacy questions, please contact the developer through the **Report a Bug** form inside the app, which routes to the developer's email.

---

**Like Chess · Simply Ambient**
