# Rage Tracker Sync

Rage Tracker Sync is the replaceable iPhone Shortcut that sends selected Calendar events and Apple Health Steps to the owner's private Rage Tracker account. **The installed Shortcut is always named `Rage Tracker Sync`**, with no version suffix. The current candidate is **v2.3.3** and is not yet a verified public release.

## Set up once, update without re-entering your key

Rage Tracker Sync is a single Shortcut. It has no import questions and holds no credential; it keeps the device key in a file, so replacing the Shortcut does not affect the connection.

1. Install **Rage Tracker Sync**. Its signed file is named `Rage Tracker Sync.shortcut`. Choose to replace the older Sync Shortcut if Apple offers this option. The version is part of the Shortcut's authenticated handshake and update request, not its installed name.
2. In Rage Tracker → **Sync**, sign in with an approved email. Generate a revocable device key if necessary and copy the complete Authorization value, including `Bearer `.
3. Run Sync. On the first run it asks for the Authorization value and, once Rage Tracker accepts it, saves it to `rage-tracker-device-key.txt` in the Shortcuts folder of iCloud Drive. Approve file access, Calendar, Health Steps and network permissions as needed. Apple may request those permissions again when a Shortcut is replaced.
4. Check **Sync → Test connection** and **Sync now** in the PWA. A successful handshake without accepted data is not sufficient to establish that uploads worked.

Later updates read the saved file and do not ask for the key. If the file is missing or the handshake does not succeed, Sync asks for the value. A value that is not accepted is never saved, so a failed attempt or a server outage cannot replace a working key.

### Credential storage and privacy

The device key is stored as plain text. **It is not encrypted by Rage Tracker or held in the iOS Keychain.**

- iCloud Drive syncs the file to the owner's other devices signed in to the same Apple Account.
- Anyone with access to the Files app on those devices can read it, and any Shortcut granted access to the file can read it. Do not install untrusted Shortcuts.
- Do not share the file or put its contents in GitHub, Cherri Playground, RoutineHub links, public source or screenshots.
- Deleting the Shortcut does not delete the file. To disconnect a device, revoke its key in Rage Tracker and delete `rage-tracker-device-key.txt` in Files.

Treat the key as sensitive and revoke it in Rage Tracker if exposure is suspected. A revoked key cannot be used even if a copy of the file remains.

The Shortcut itself contains no private token, so a tested installed copy can be shared to create an iCloud link without exposing the key.

## Upload semantics

- The sync starts with `POST /api/shortcut/hello`, reporting `shortcutVersion=2.3.3` and recording a connected handshake only after an authenticated device key is accepted.
- Calendar events carry titles and start/end timestamps formatted as full ISO 8601 date-time strings with offsets. They contain no attendee, location, notes, or mood data. The Worker derives broad category labels.
- An event rejected with the Worker's **exact known invalid-record message** is counted as skipped. Valid events continue uploading. Authentication or unexpected server errors still stop the workflow.
- Apple Health Steps are read from native Health samples and summed. The total is converted to text, locale grouping separators (for example, in `12,345`) and any unit text are removed, and the number is posted as `steps` with the current local `date`. The Worker accepts values within configured numeric bounds. Sample overlap across devices may lead to differences from Apple's reconciled Step total.
- The final notification distinguishes accepted uploads from skipped invalid Calendar events. If the Health upload is rejected, the Shortcut displays the server error with the step value and date it sent, on the device only and without the device key.
- The Shortcut checks `/api/shortcut/release?current=2.3.3` and offers a newer **verified** version only when available. Installing a replacement always requires the user's approval.

## Automated checks and release process

GitHub Actions runs `node --test tests/*.test.cjs`, compiles pinned Cherri 2.3.0 without signing, inspects the generated plist for all typed `If` comparisons and timestamp tokens, then signs the Shortcut using Cherri HubSign. The ZIP artifact contains `Rage Tracker Sync.shortcut`.

Passing source tests, plist checks, and signing **does not** establish that Calendar, HealthKit, file access, Apple permissions or network requests work on an actual iPhone. The release must pass live acceptance tests, including first-run key entry, reuse of the saved key after replacing the Shortcut, and accepted Health and Calendar records, before an iCloud link is shared and the verified update is published on [RoutineHub](https://routinehub.co/shortcut/26975/).

The historical iCloud v1.0 link is not the verified new release. GitHub `main` does not automatically deploy to the live Cloudflare Worker or KV namespace yet. See [the application README](../README.md) for deployment requirements.

## References

- [Apple Shortcuts user guide](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Cherri documentation](https://cherrilang.org/language/standard/shortcuts.html)
