# Rage Tracker Sync

Rage Tracker Sync is the replaceable iPhone Shortcut that sends selected Calendar events and Apple Health Steps to the owner's private Rage Tracker account. **The installed Shortcut is always named `Rage Tracker Sync`**, with no version suffix. The current version is **v2.3.10**.

## Setup

Rage Tracker Sync is a single Shortcut. It has no import questions and holds no credential; the device key is kept in a file.

1. Install **Rage Tracker Sync**. Its signed file is named `Rage Tracker Sync.shortcut`. Choose to replace the older Sync Shortcut if Apple offers this option. The version is part of the Shortcut's authenticated handshake and update request, not its installed name.
2. In Rage Tracker → **Sync**, sign in with an approved email. Generate a revocable device key if necessary and copy the complete Authorization value, including `Bearer `.
3. Run Sync. On the first run it asks for the device key and, once Rage Tracker accepts it, saves it to `rage-tracker-device-key.txt` in a `Rage Tracker` folder in On My iPhone, which Sync creates if needed. This works with iCloud Drive turned off. Approve file access, Calendar, Health Steps and network permissions as needed. Apple may request those permissions again when a Shortcut is replaced.
4. Check **Sync → Test connection** and **Sync now** in the PWA. A successful handshake without accepted data is not sufficient to establish that uploads worked.

Later runs read the saved file and do not ask for the key. **Known issue:** installing a new version can ask for the key again. If the file is missing or the handshake does not succeed, Sync asks for the value. A value that is not accepted is never saved, so a failed attempt or a server outage cannot replace a working key.

### Credential storage and privacy

The device key is stored as plain text. **It is not encrypted by Rage Tracker or held in the iOS Keychain.**

- The file stays on the iPhone and does not sync through iCloud Drive. A new device needs its own key.
- Anyone with access to the Files app on the iPhone can read it, and any Shortcut granted access to the file can read it. Do not install untrusted Shortcuts.
- Do not share the file or put its contents in GitHub, Cherri Playground, RoutineHub links, public source or screenshots.
- Deleting the Shortcut does not delete the file. To disconnect a device, revoke its key in Rage Tracker and delete `rage-tracker-device-key.txt` in Files.

Treat the key as sensitive and revoke it in Rage Tracker if exposure is suspected. A revoked key cannot be used even if a copy of the file remains.

The Shortcut itself contains no private token, so a tested installed copy can be shared to create an iCloud link without exposing the key.

## Upload semantics

- The sync starts with `POST /api/shortcut/hello`, reporting `shortcutVersion=2.3.10` and recording a connected handshake only after an authenticated device key is accepted.
- Calendar events carry titles and start/end timestamps formatted as full ISO 8601 date-time strings with offsets. They contain no attendee, location, notes, or mood data. The Worker derives broad category labels.
- An event rejected with the Worker's **exact known invalid-record message** is counted as skipped. Valid events continue uploading. Authentication or unexpected server errors still stop the workflow.
- Apple Health Steps are read from native Health samples and summed. The total is converted to text, locale grouping separators (for example, in `12,345`) and any unit text are removed, and the number is posted as `steps` with the current local `date`. The Worker accepts values within configured numeric bounds. Sample overlap across devices may lead to differences from Apple's reconciled Step total.
- Steps, resting heart rate, heart rate variability and exercise minutes use Apple Health's own daily values. Sleep adds up time asleep in samples from the last day, in hours. A value of zero is left out, except steps.
- Find Health Samples ends the run when a type has no samples, so the Shortcut first reads the newest 1,000 samples of all five types and only queries types found there. Anything with no recent data is left out.
- After the calendar uploads, `calendar_complete` removes today's events on the server that this run did not send, so edited and deleted events do not linger.
- The final notification distinguishes accepted uploads from skipped invalid Calendar events. If an upload is rejected, the Shortcut displays the server error without the device key.
- The Shortcut checks `/api/shortcut/release?current=2.3.10` and offers a newer **verified** version only when available. It shows a notification rather than asking, so scheduled runs never wait for an answer; installing a replacement always requires the user's approval in the app.

## Automated checks and release process

GitHub Actions runs `node --test tests/*.test.cjs`, compiles pinned Cherri 2.3.0 without signing, inspects the generated plist for all typed `If` comparisons and timestamp tokens, then signs the Shortcut using Cherri HubSign. The ZIP artifact contains `Rage Tracker Sync.shortcut`.

Passing source tests, plist checks, and signing does not establish that Calendar, Health, file access or network requests work on an iPhone, so run a new build on a device before publishing. See [RoutineHub releases](ROUTINEHUB_RELEASE.md). Pushes to `main` deploy the app and Worker.

## References

- [Apple Shortcuts user guide](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Cherri documentation](https://cherrilang.org/language/standard/shortcuts.html)
