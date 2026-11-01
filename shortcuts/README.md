# Rage Tracker Sync — Apple Shortcut

The Shortcut source is `rage-tracker-sync.cherri`. The current source version is **1.1.0**, which adds first-run authentication and automatic version checks. The previously shared v1.0.0 iCloud link does not reliably prompt for credentials and is not marked as a verified installation.

## First-run setup

1. Open Rage Tracker → Sync and verify that the account and device are connected.
2. Copy the **entire Authorization value** from the app, starting with `Bearer `.
3. Open **Prepare updated Shortcut**. It opens the public Cherri builder in a new tab. Build a signed Shortcut and import it on the iPhone.
4. **Run the Shortcut once.** A native **Ask for Input** prompt will ask for the Authorization value; this is deliberately a first-run prompt, not an import question. Paste the value. The Shortcut calls `GET /api/profile` to verify it and only then saves the credential.
5. The credential is stored in `iCloud Drive/Shortcuts/RageTracker/device-key.txt` so reinstalling a newer Shortcut does not prompt again. Anyone able to read this file can use your device credential; keep your iCloud account protected and do not share it.
6. The Shortcut calls `POST /api/shortcut/hello` to confirm a valid connection. This **does not** indicate successful Health or Calendar ingestion.
7. It then attempts today's calendar event and step uploads. Return to Rage Tracker → **Test connection**. Only a **Last accepted data upload** timestamp and nonzero records confirm data reached the server. Never treat the Shortcut's final message alone as confirmation.

## Automatic update checks

Version 1.1.0 checks `GET /api/shortcut/release?current=1.1.0` with its device credential. The server compares semantic versions and returns the latest iCloud link. When a newer verified release is available, the Shortcut offers **Install update** or **Continue syncing**. Choosing Install opens the official iCloud link; Apple always asks the user to approve replacing an installed Shortcut. **Silent replacement is not possible.** Since the credential is in an external Shortcuts file, it survives replacement of the workflow.

This uses Rage Tracker's own Cloudflare release endpoint rather than a RoutineHub API dependency. RoutineHub's Updater follows the same core pattern: detect a newer version, display an update, open a download link, and require one tap to add it.

A new iCloud link must be published from Apple's Shortcuts app after compiling and validating each release. Until then, source v1.1.0 is a **builder preview**, not the current signed iCloud installer. Never point `config:shortcut:latest` to an untested release.

## Data sent

The initial workflow reads today's Apple Health **Steps** samples and Calendar events (up to 50) and sends selected values to the authenticated `POST /api/ingest` endpoint using form requests. Calendar data consists of event title, start and end times, and an inferred category. It doesn't send notes, attendees, locations, or mood check-ins. The server can accept `sleepHours`, `hrv`, `restingHR`, and `workoutMin`, but their collection is not enabled until sample units and aggregation are verified on an iPhone.

Shortcuts may require **Settings → Apps → Shortcuts → Advanced → Allow Sharing Large Amounts of Data**. You do not need **Allow Running Scripts** for this Shortcut. Keep deletion-without-confirmation options off.

For automatic scheduling, set an Apple Shortcuts Time of Day automation on the iPhone and choose Run Immediately where permitted. iOS may still ask for permissions.

## Troubleshooting

- **No key prompt:** You are probably running the older v1.0 Shortcut, which used an import question. The newer 1.1 version asks on first run.
- **Key rejected:** Copy the full Authorization value, including `Bearer `, from Rage Tracker. The token may have been revoked. Clear `iCloud Drive/Shortcuts/RageTracker/device-key.txt` only when you intend to reconfigure the Shortcut.
- **Connection verified, no uploads:** Apple permissions or input formats may be missing. Inspect the individual Get Contents of URL responses. A connection handshake cannot establish ingestion.
- **Last error:** The app's Test connection screen distinguishes invalid request payloads from accepted uploads.
- **Shared Shortcut risk:** Never publish a personalized copy that contains your Authorization value or a link to your credential file. If you inadvertently share a real credential, revoke its device token and issue a new one.
- **Updates:** The Shortcut can offer to open the latest published link but cannot replace itself unattended. The installed version must run before it can check for an update.

## Release process

1. Update the generic Cherri source and its version number.
2. Compile, sign, and test on an iPhone, including first run, permission denial, a successful upload, and a follow-up run.
3. Share an **unconfigured** signed master from Apple Shortcuts and copy the new iCloud URL.
4. Update the Cloudflare KV release metadata with the new URL, semver, and `verified: true`.
5. Confirm the PWA's **Get Shortcut** action and Shortcut update prompt both point to the tested release.

## References

- [Apple: Ask for Input](https://support.apple.com/guide/shortcuts/apd68b5c9161/ios)
- [Cherri: Ask for Input](https://cherrilang.org/language/standard/basic.html)
- [Cherri: Files](https://cherrilang.org/language/standard/documents.html)
- [RoutineHub: Updater](https://routinehub.co/docs/updater/)
