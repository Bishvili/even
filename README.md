# Rage Tracker — mood patterns PWA

Live app: https://rage-tracker.bishvili.workers.dev

## What works

Install from Safari > Share > Add to Home Screen. Mood check-ins, energy, tags and notes stay on your iPhone. Explore time-of-day, activities, sleep and calendar context correlations. This is observational, not medical advice.

## Calendar-linked mood insights (v1.2.0)

In **Settings → Load 28-day calendar demo**, the app creates 28 days of fictional health context, 112 mood check-ins, and 47 calendar events. Categories include meetings, focus blocks, workouts, social time, commutes, and rest. The sample deliberately illustrates lower mood around meetings and commutes and higher mood after exercise. Use **Refresh the calendar demo** to regenerate the newest scenario.

The **Insights** screen separates **My data** from **Demo scenario**. Switching views never mixes fictional and personal mood or calendar records; personal dashboard statistics and recent check-ins exclude demo records. Refreshing/removing demo records leaves non-demo mood check-ins, calendar entries, and health entries intact.

**Calendar context** offers two descriptive comparisons:

- **Before → after:** For each event, find the nearest mood check-in within 90 minutes **before the event starts** and the earliest check-in within 90 minutes **after it ends**. Report the average paired change by category, only after at least three matched events.
- **Near events vs other check-ins:** Mood check-ins during the event or within 90 minutes afterward compared with check-ins **not** near any calendar event, restricted to similar broad time-of-day groups. Show a category only with at least three observations in both groups.

These are exploratory **associations, not causal effects**. Overlapping events may share check-ins and missing check-ins can bias results. The demo illustrates analysis behavior rather than predicting anyone's actual mood. Keep personal calendar data and health records private.

## Passwordless login and owner-scoped sync (v1.3.0)

Cloudflare Zero Trust Access protects **rage-tracker.bishvili.workers.dev/api/auth/** (including child paths), using Email One-time PIN login. An exact-address Cloudflare Access policy controls eligibility. In the Worker, identities are accepted only from validated Access runtime context and the matching Access audience, then checked against a server-side **APPROVED_SYNC_EMAILS** secret (JSON array). Do not commit this allowlist to the public GitHub repository.

The PWA itself remains public and keeps anonymous/offline mood tracking. To sync, an approved email signs in, then clicks **Generate my device key**. This issues a random 256-bit bearer token, stored only as its SHA-256 hash in D1, associated with the verified email, and returned once to the device. The user can copy its Authorization header into Apple Shortcuts and revoke it in the Sync tab.

- Health and calendar data is owned by an email identity. Read/write/erase endpoints derive the owner from the authenticated device token, never from request body fields.
- Device management requires an Access-authenticated session. Revocation is restricted to the authenticated owner.
- The old shared pairing code and endpoint are retired (HTTP 410). The old shared database tables are preserved but unused by the new sync endpoints.
- Existing local mood entries are not uploaded. The PWA requires explicit consent before assigning existing local records to a verified account, and rejects a different account using the same local profile.
- This is a prototype rather than an audited clinical records system. HTTPS is used, but D1 records and downloaded JSON backups are not end-to-end encrypted. Device bearer tokens are sensitive.

## Apple Shortcuts sync

Rage Tracker uses an Apple Shortcut to transmit selected Calendar and Health information from the iPhone to the owner's Cloudflare database. PWAs cannot directly access HealthKit or EventKit.

**Shortcut source v2.1.0** uses an Apple **Customize Shortcut** import question for its private Authorization value. It contains no filesystem operations or credential file. The signed unconfigured Shortcut asks for a token when added; the configured copy then verifies that token through `GET /api/profile` on each run.

The Cherri 2.3.0 compiler was checked to ensure the native import question is actually present in the generated Shortcut's Setup tab. The first public `GET /api/status` action is required to work around Cherri's import-question action-index mapping; it transmits no private information. The compiled Shortcut has no Create Folder, Get File or Save File actions.

The Shortcut syncs today's Calendar events and Health step samples through authenticated `POST /api/ingest` requests, checking the server's `ok` response before reporting accepted data. Calendar activities are categorized on the backend. It can offer a newer verified Shortcut iCloud link when published, but Apple requires user approval of replacement and the new copy's setup question must be answered again.

The older iCloud v1.0.0 link is unverified. Source v2.1.0 is ready to compile and still needs a signed iPhone import and successful live sync before a verified iCloud link can be published.

See [Shortcut source](shortcuts/rage-tracker-sync.cherri) and [installation, privacy, and diagnostic instructions](shortcuts/README.md).

## Deployment configuration

- Access application name: Rage Tracker – Authorized Sync, with email One-time PIN provider and exact-address Allow policy.
- Cloudflare Worker secret APPROVED_SYNC_EMAILS: JSON array of the two allowed email addresses; manage in Cloudflare, not in GitHub.
- Worker bindings: ASSETS (Workers KV), DB (D1).
- Database migration: db/schema.sql.
- GitHub pushes do not yet automatically deploy to Cloudflare. Asset changes must be published to the KV namespace and Worker changes uploaded with its existing bindings and secret preserved.

## Structure

- index.html / styles.css / app.js: UI and analysis
- sw.js / manifest.webmanifest / icons: installable offline PWA
- worker/index.js: Cloudflare API and asset serving
- db/schema.sql: database creation
- wrangler.jsonc: bindings

## Hosting

Static files currently live in Cloudflare Workers KV with keys of the form asset:index.html, asset:app.js, etc. PNG assets are stored Base64 encoded; textual assets are UTF-8. The Worker binds KV as ASSETS and D1 as DB. To redeploy source changes, update KV assets and the Worker script. Adding files to GitHub alone will not update the running deployment until a CI workflow is configured. Do not commit the private pairing code or a device authorization token.

## Privacy

No ads or external analytics scripts. Backups are unencrypted JSON. Cloudflare stores only the fields sent through Shortcuts. If the PWA is removed or browser storage is cleared, local data can be lost. Apple Shortcut actions and automatic execution vary by iOS version. Calendar ICS timezone handling is approximate; verify imported event times.
