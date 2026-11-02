# Rage Tracker Sync

Rage Tracker Sync is the replaceable iPhone Shortcut that sends selected Calendar events and Apple Health Steps to the owner's private Rage Tracker account. **The installed Shortcut is always named `Rage Tracker Sync`**, with no version suffix. The current candidate is **v2.3.3** and is not yet a verified public release.

## Set up once, update without re-entering your key

This release separates the private device credential from the replaceable sync logic.

1. In Rage Tracker → **Sync**, sign in with an approved email. Generate a revocable device key if necessary and copy the complete Authorization value, including `Bearer `.
2. Download and install the **Rage Tracker Connection** helper before installing Sync. Use the generic, credential-free helper source at [rage-tracker-connection.cherri](rage-tracker-connection.cherri) or the private GitHub Actions test artifact. During Apple's **Customize Shortcut** step, enter the Authorization value **only in this helper**.
3. Install **Rage Tracker Sync** from [rage-tracker-sync.cherri](rage-tracker-sync.cherri) (or the signed test artifact). Its signed file is named `Rage Tracker Sync.shortcut`. Choose to replace the older Sync Shortcut if Apple offers this option. The version is part of the Shortcut's authenticated handshake and update request, not its installed name.
4. Run Sync. It calls the separately installed `Rage Tracker Connection` to retrieve the device credential and does **not** ask for it during Sync updates. Approve Calendar, Health Steps, and network permissions as needed. Apple may request those permissions again when a Shortcut is replaced.
5. Check **Sync → Test connection** and **Sync now** in the PWA. A successful handshake without accepted data is not sufficient to establish that uploads worked.

**Keep `Rage Tracker Connection` installed across all Sync upgrades.** If its configured authorization is lost, the device key is revoked, or the account changes, install/configure the helper again. Do not put credentials in GitHub, Cherri Playground, RoutineHub links, public source, or screenshots.

### Credential storage and privacy

The credential is saved in a configured Text action inside the separately installed connection helper. **It is not encrypted by Rage Tracker or held in the iOS Keychain.** Apple Shortcuts may sync installed configurations through iCloud. Any Shortcut permitted to invoke `Rage Tracker Connection` can receive the bearer token; do not install untrusted Shortcuts or share a configured helper. This design avoids writing an additional plaintext token file to Files, but it is a usability compromise, **not** a new security boundary. Treat the token as sensitive and revoke it in Rage Tracker if exposure is suspected.

The generic helper file and the replaceable Sync file distributed by GitHub Actions contain no private token.

## Upload semantics

- The sync starts with `POST /api/shortcut/hello`, reporting `shortcutVersion=2.3.3` and recording a connected handshake only after an authenticated device key is accepted.
- Calendar events carry titles and start/end timestamps formatted as full ISO 8601 date-time strings with offsets. They contain no attendee, location, notes, or mood data. The Worker derives broad category labels.
- An event rejected with the Worker's **exact known invalid-record message** is counted as skipped. Valid events continue uploading. Authentication or unexpected server errors still stop the workflow.
- Apple Health Steps are read from native Health samples and summed. The total is converted to text and locale grouping separators (for example, in `12,345`) are removed before posting it as `steps` with the current local `date`. The Worker accepts values within configured numeric bounds. Sample overlap across devices may lead to differences from Apple's reconciled Step total.
- The final notification distinguishes accepted uploads from skipped invalid Calendar events. If the Health upload is rejected, the Shortcut displays the server error without exposing the private value or token.
- The Shortcut checks `/api/shortcut/release?current=2.3.3` and offers a newer **verified** version only when available. Installing a replacement always requires the user's approval.

## Automated checks and release process

GitHub Actions runs `node --test tests/*.test.cjs`, compiles pinned Cherri 2.3.0 without signing, inspects the generated plist for all typed `If` comparisons and timestamp tokens, then signs both unconfigured Shortcuts using Cherri HubSign. It checks that installed names and credential configuration are separated. The ZIP artifact contains:

- `Rage Tracker Connection.shortcut` — install/configure once
- `Rage Tracker Sync.shortcut` — replace on each update

Passing source tests, plist checks, and signing **does not** establish that Calendar, HealthKit, Apple permissions or network requests work on an actual iPhone. The release must pass live acceptance tests, including accepted Health and Calendar records, and be shared as a fresh **unconfigured** iCloud master before publishing the verified update on [RoutineHub](https://routinehub.co/shortcut/26975/).

The historical iCloud v1.0 link is not the verified new release. GitHub `main` does not automatically deploy to the live Cloudflare Worker or KV namespace yet. See [the application README](../README.md) for deployment requirements.

## References

- [Apple Shortcuts user guide](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Apple Shortcuts import questions](https://support.apple.com/guide/shortcuts/apdf330fd3a0/ios)
- [Cherri documentation](https://cherrilang.org/language/standard/shortcuts.html)
