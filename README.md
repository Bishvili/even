# Even — mood patterns PWA

Live app: https://health.bishvili.org

## Developing

New to the project? Point Claude at this repository and it will guide you through setup, or follow [Onboarding a new developer](AGENTS.md#onboarding-a-new-developer).

## What works

Install from Safari > Share > Add to Home Screen, then sign in with an invited account. Mood check-ins, energy, tags and notes are kept on your device and, when you’re signed in, in your account. Explore time-of-day, activities, sleep and calendar context correlations. This is observational, not medical advice.

## Calendar-linked mood insights

In **Settings → Load 28-day calendar demo**, the app creates 28 days of fictional health context, 112 mood check-ins, and 47 calendar events. Categories include meetings, focus blocks, workouts, social time, commutes, and rest. The sample deliberately illustrates lower mood around meetings and commutes and higher mood after exercise. Use **Refresh the calendar demo** to regenerate the newest scenario.

The **Insights** screen separates **My data** from **Demo scenario**. Switching views never mixes fictional and personal mood or calendar records; personal dashboard statistics and recent check-ins exclude demo records. Refreshing/removing demo records leaves non-demo mood check-ins, calendar entries, and health entries intact.

**Calendar context** offers two descriptive comparisons:

- **Before → after:** For each event, find the nearest mood check-in within 90 minutes **before the event starts** and the earliest check-in within 90 minutes **after it ends**. Report the average paired change by category, only after at least three matched events.
- **Near events vs other check-ins:** Mood check-ins during the event or within 90 minutes afterward compared with check-ins **not** near any calendar event, restricted to similar broad time-of-day groups. Show a category only with at least three observations in both groups.

These are exploratory **associations, not causal effects**. Overlapping events may share check-ins and missing check-ins can bias results. The demo illustrates analysis behavior rather than predicting anyone's actual mood. Keep personal calendar data and health records private.

## Sign-in and owner-scoped sync

Even has its own sign-in, using Better Auth: an emailed one-time code, or Google. Only approved emails can get in, checked on every request. Codes are stored only as hashes, and Google's tokens aren't kept.

The PWA itself remains public and keeps anonymous/offline mood tracking. To sync, an approved email signs in, and the iPhone connects automatically with a revocable device key. This issues a random 256-bit bearer token, stored only as its SHA-256 hash in D1, associated with the verified email, and returned once to the device. Running Even Sync from the app passes it to the Shortcut, and the user can revoke it in the Data tab.

- Health and calendar data is owned by an email identity. Read/write/erase endpoints derive the owner from the authenticated device token, never from request body fields.
- Device management requires a signed-in session. Revocation is restricted to the authenticated owner.
- The shared pairing route and unscoped tables have been removed after confirming the legacy tables were empty. Cloud endpoints now require an authenticated, unrevoked, owner-specific device token.
- Existing local mood entries are not uploaded. The PWA requires explicit consent before assigning existing local records to a verified account, and rejects a different account using the same local profile.
- Even is not a clinical records system. HTTPS is used, but D1 records are not end-to-end encrypted. Device bearer tokens are sensitive.

## Apple Shortcuts sync

Even uses an Apple Shortcut to transmit selected Calendar and Health measurements from the owner's iPhone to the Cloudflare Worker. The PWA itself does not access HealthKit or EventKit.

Even Sync is a single Shortcut with no import questions, installed from the app. Running it from Even → **Data** passes the device key, and the Shortcut saves it for later runs and automations. Nobody copies a key.

Even Sync reads its Authorization value from the saved file and, if none has been accepted yet, shows a message pointing back to the app. It sends an authenticated `/api/shortcut/hello` handshake, then the next week's Calendar events in one upload, all Health measures in another, and alarms last, through `/api/ingest`; every upload is checked explicitly. The Data tab distinguishes a successful connection from actual accepted data and allows the user to revoke the device credential. Version checks only offer newer verified releases, and Apple requires approval before replacing an installed Shortcut.

The file `even-device-key.txt` in an `Even` folder in On My iPhone holds the private Authorization value as plain text. It is not encrypted by Even or held in the iOS Keychain, and Shortcuts granted access to it can read it; treat any untrusted Shortcuts on the device as a privacy risk. Do not share the file, and keep your private Authorization value out of public Shortcuts and source code. Deleting the Shortcut does not delete the file, so revoke the key and delete the file to disconnect a device. See [Shortcuts installation and diagnostics](shortcuts/README.md) and [Shortcut source](shortcuts/even-sync.cherri).

## Deployment configuration

- Worker secrets: `APPROVED_SYNC_EMAILS`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY` and `GITHUB_API_KEY`. Manage them in Cloudflare, not in GitHub. Testers are added in the app.
- Worker bindings: STATIC (the app's files), ASSETS (Workers KV, release records), DB (D1).
- Database: `db/migrations`, with `db/schema.sql` as the current model.
- Pushes to `main` deploy through Cloudflare Workers Builds, which runs `sh scripts/deploy.sh` to deploy the Worker and the app's files as one version.

## Structure

- index.html / styles.css / app.js and the other root scripts: UI and analysis
- sw.js / manifest.webmanifest / icons: installable offline PWA
- worker/index.js: API and file serving
- worker/signin.mjs: sign-in
- db/schema.sql: database creation
- wrangler.jsonc: bindings

## Hosting

The public files are the ones listed in `SHELL` in `sw.js`. `scripts/build-assets.cjs` copies them into `dist`, and the Worker adds its security headers to each one.

## Privacy

Your first name can appear in notifications, including on your Lock Screen.

Even Sync sends what you leave on in the app: steps, resting heart rate, heart rate variability, exercise minutes, sleep from recent nights (up to a month on the first sync), alarms, and the titles, times and calendar names of the next week's events. Your account also stores notification times and what each is for, your time zone, your latest check-in time, your settings and your device records. Check-ins and notes are stored in your account as readable text when you’re signed in, until you delete them or erase synced data.

No ads or external analytics scripts. Backups are JSON files, unencrypted unless you add a passphrase. If the PWA is removed or browser storage is cleared, local data can be lost. Apple Shortcut actions and automatic execution vary by iOS version. Calendar ICS timezone handling is approximate; verify imported event times.
