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
- The shared pairing route and unscoped tables have been removed after confirming the legacy tables were empty. Cloud endpoints now require an authenticated, unrevoked, owner-specific device token.
- Existing local mood entries are not uploaded. The PWA requires explicit consent before assigning existing local records to a verified account, and rejects a different account using the same local profile.
- This is a prototype rather than an audited clinical records system. HTTPS is used, but D1 records and downloaded JSON backups are not end-to-end encrypted. Device bearer tokens are sensitive.

## Apple Shortcuts sync

Rage Tracker uses an Apple Shortcut to transmit selected Calendar and Health measurements from the owner's iPhone to the Cloudflare Worker. The PWA itself does not access HealthKit or EventKit.

**Shortcut v2.3.0** fixes Apple Shortcuts **If** actions that previously had missing comparison values. The API returns explicit text states (`connected`, `accepted`, and `new_release`/`current`) so the workflow no longer compares generic Boolean dictionary values. The generated Shortcut plist is checked in GitHub CI to ensure that all six If conditions have real, correctly typed comparison operands.

The corrected source is available through **Sync → Open corrected Shortcut builder**. Cherri Playground compiles and signs the generic workflow, then Apple Shortcuts requests the private device key during **Customize Shortcut**. The previously signed v2.2 binary was retired because it contains malformed If actions. **A signed v2.3 build and its iCloud installation link are not yet published.** A successfully compiled Shortcut must still be imported and tested on an iPhone before a release is marked verified.

The Shortcut sends an authenticated `/api/shortcut/hello` handshake, then today's Calendar events and Health Steps through `/api/ingest`; every accepted upload is checked explicitly. The Sync screen distinguishes a successful connection from actual accepted data and allows the user to revoke the device credential. Version checks only offer newer verified iCloud releases, and Apple requires approval before replacing an installed Shortcut.

The installed workflow has no credential-file or folder operations. Keep your private Authorization value out of public Shortcuts and source code. See [Shortcuts installation and diagnostics](shortcuts/README.md) and [Shortcut source](shortcuts/rage-tracker-sync.cherri).

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

Static files currently live in Cloudflare Workers KV with keys of the form asset:index.html, asset:app.js, etc. PNG assets are stored Base64 encoded; textual assets are UTF-8. The Worker binds KV as ASSETS and owner-scoped D1 storage as DB. To redeploy source changes, update KV assets and the Worker script. Adding files to GitHub alone will not update the running deployment until a CI workflow is configured. Do not commit a device authorization token or any other credential.

## Privacy

No ads or external analytics scripts. Backups are unencrypted JSON. Cloudflare stores only the fields sent through Shortcuts. If the PWA is removed or browser storage is cleared, local data can be lost. Apple Shortcut actions and automatic execution vary by iOS version. Calendar ICS timezone handling is approximate; verify imported event times.
