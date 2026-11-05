# Health Sync

Health Sync is the replaceable iPhone Shortcut that sends Health measures, today's and tomorrow's calendar events, and alarms to the owner's private Even account. **The installed Shortcut is always named `Health Sync`**, with no version suffix. Its version is the `shortcutVersion` in [even-sync.cherri](even-sync.cherri).

## Setup

Health Sync is a single Shortcut. It has no import questions and holds no credential; the device key is kept in a file.

1. Install **Health Sync**. Its signed file is named `Health Sync.shortcut`. Choose to replace the older Sync Shortcut if Apple offers this option.
2. In Even → **Data**, sign in with an approved email. The iPhone connects automatically.
3. Tap **Run Health Sync**. The app passes the device key, and once Even accepts it the Shortcut saves it to `device-key.txt` in an `Even` folder in On My iPhone, so later runs and automations need nothing else. Running it with no saved key shows a message pointing back to the app.
4. Check **Data → Test connection** and **Bring in data** in the app. A successful handshake without accepted data doesn't show that uploads worked.

A key that isn't accepted is never saved, so a failed attempt or a server outage can't replace a working key.

### Credential storage and privacy

The device key is stored as plain text. **It is not encrypted by Even or held in the iOS Keychain.**

- The file stays on the iPhone and does not sync through iCloud Drive. A new device needs its own key.
- Anyone with access to the Files app on the iPhone can read it, and any Shortcut granted access to the file can read it. Do not install untrusted Shortcuts.
- Do not share the file or put its contents in GitHub, Cherri Playground, public source or screenshots.
- Deleting the Shortcut does not delete the file. To disconnect a device, revoke its key in Even and delete `device-key.txt` in Files.

Treat the key as sensitive and revoke it in Even if exposure is suspected. A revoked key can't be used even if a copy of the file remains. The Shortcut itself contains no private token, so a tested installed copy can be shared to create an iCloud link without exposing the key.

## What a run sends

A run makes five requests, each carrying the device key:

1. `POST /api/shortcut/hello` reports the Shortcut's version. The reply says whether the key was accepted, whether sleep history is still needed, and, as `updateStatus`, whether a newer verified version is ready. A newer version is offered with a notification; installing it always needs the person's approval.
2. `POST /api/ingest` with `kind=calendar_days` sends every event that starts today or in the next two days, from every calendar, as records of start, end, calendar and title. Records are separated by `␞` and fields by `␟`. Times are ISO 8601 with offsets. The Worker keeps today's and tomorrow's events, counts each event once, discards events from calendars turned off in the app, derives each category, and removes stored events from those two days that the run didn't send. No attendee, location, notes or mood data is sent.
3. `POST /api/ingest` with `kind=health` sends steps, resting heart rate, heart rate variability and exercise minutes, each with the date of its latest daily total, and the start and end of each asleep sample. A measure with no data is sent empty and left out, never as zero. The step total is converted to a plain number first, with grouping separators and unit text removed.
4. `POST /api/ingest` with `kind=alarms` sends each alarm's time, repeat days, on/off state and name. It comes last, because Shortcuts can't catch an error while reading alarm details.
5. `POST /api/push/synced` sends a notification that opens Even. Without notifications on, the Shortcut shows its own.

Failures show a notification instead of asking, so scheduled runs never wait for an answer.

### Health details

- Find Health Samples ends the run when a type has no samples, so the Shortcut first reads the newest 1,000 samples of all five types and only queries types found there.
- Steps, resting heart rate, heart rate variability and exercise minutes use Apple Health's own daily values.
- Sleep is read as up to 100 recent samples, or 300 on the first sync so the bedtime estimate works straight away. Only asleep samples are sent. The Worker merges overlapping samples from more than one device, files each night under the morning it ends, and ignores naps that start between 10 AM and 6 PM. When the run reached its sample limit, the oldest night may be cut off, so the Worker leaves it as it was.

## Automated checks and release process

On every push, GitHub Actions runs `node --test tests/*.test.cjs`, compiles both Shortcuts with pinned Cherri 2.3.0, and runs `scripts/check-shortcut-conditions.py` on the compiled property lists. The checks confirm every `If` comparison keeps its value, timestamps keep their time zone, the records and the single Health upload refer to the right values, and no average heart rate is read. Pushes to `main` then sign both Shortcuts with Cherri HubSign and post them, with their versions, to the `shortcut-latest` release.

Passing these checks doesn't show that Calendar, Health, file access or network requests work on an iPhone, so run each new build on a device before publishing. See [Health Sync releases](RELEASE.md). Pushes to `main` deploy the app and Worker.

## References

- [Apple Shortcuts user guide](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Cherri documentation](https://cherrilang.org/language/standard/shortcuts.html)
