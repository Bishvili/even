# Rage Tracker Sync

The current Shortcut source is **v2.1.0** at [rage-tracker-sync.cherri](rage-tracker-sync.cherri). It connects an approved user's Apple Calendar and selected Health data to Rage Tracker through owner-scoped HTTPS requests.

## Install and configure

1. In Rage Tracker's **Sync** tab, confirm your email login and active device, then **Copy** the complete Authorization header value. It begins with `Bearer `.
2. Tap **Download test Shortcut**. The signed, unconfigured `.shortcut` file downloads from Rage Tracker into Safari/Files. Open the downloaded file in the Apple Shortcuts app. You do not need to compile anything yourself.
3. During **Customize Shortcut**, enter the full Authorization value copied from Rage Tracker. If Apple does not show the question, inspect the Shortcut's **Details → Setup** panel before running it. The public Cherri editor remains available for source inspection, but it is not required for installation.
4. Run Rage Tracker Sync. It makes a public connectivity check, verifies the configured credential through `GET /api/profile`, and stops if it cannot authenticate.
5. Approve Apple Calendar, Health, and network permissions when prompted. In iOS Settings → Apps → Shortcuts → Advanced, enable **Allow Sharing Large Amounts of Data** if iOS requests it.
6. Return to Rage Tracker → **Test connection**. Only an accepted-data timestamp and record counts establish that Health or Calendar data actually reached the server. Tap **Sync now** to retrieve those records locally.

The Shortcut has **no Create Folder, Get File, Save File or Get Folder Contents actions**. Its Authorization value is stored in the configured Shortcut's Text action after the Apple setup question is answered. It does not read or write a credentials file.

### Why the first public request is necessary

Cherri 2.3.0 has an import-question action-index mapping issue. The source begins with a public, unauthenticated `GET /api/status` connectivity check, followed immediately by `const credential = text(authorization)`. This ensures the **Setup** tab in Cherri's compiled preview actually displays the Authorization question on the Text action. The request has no Authorization header and sends no personal data.

The required Setup question was verified in Cherri Playground 2.3.0. A signed unconfigured v2.1.0 build is available from `/rage-tracker-sync-v2.1.shortcut` and was signed through the Cherri Playground signing flow. Its iPhone import, setup and Health/Calendar synchronization have not yet been verified.

## Data synchronized

- **Calendar:** up to 30 events beginning today, with title, ISO 8601 start/end timestamps. No event notes, locations, attendees or account identifiers are sent. The backend derives meeting, exercise, social and commute categories from the title where an explicit category is absent.
- **Health:** today's step samples summed to a daily count. This may differ from the Health app's consolidated count if multiple devices produce overlapping samples.
- **Version:** `shortcutVersion=2.1.0` accompanies accepted uploads.
- **Mood entries and journal notes:** never sent by this Shortcut.

Each authenticated `POST /api/ingest` response is checked for an explicit `ok` value. A rejected record stops the run instead of claiming success. The final notification reports the number of accepted API updates, including zero.

## Updating

After synchronization, the Shortcut requests `GET /api/shortcut/release?current=2.1.0`. If a newer release is available, it can offer to open the verified iCloud installation link. Apple still requires the user to approve installing the replacement.

Because the credential is intentionally **not persisted to an external file**, an updated Shortcut requires answering the setup question again. This avoids fragile filesystem permissions and prevents an update from silently assuming a shared credential. The older v1.0.0 iCloud share link is not a verified release of the rebuilt Shortcut. The signed v2.1.0 preview is downloadable directly, while the iCloud release metadata remains unverified until an iPhone test succeeds.

**Do not share a configured, personalized Shortcut.** Its configured Text action contains a sensitive bearer credential. Share only a fresh, unconfigured master with the setup question intact. Revoke and reissue the device credential if it is exposed.

## Release checks

- Run `node --test tests/*.test.cjs`.
- Compile the source with **Cherri 2.3.0**. Its compiled **Setup** preview must display exactly one Authorization question bound to the Text action.
- Inspect generated actions: no filesystem actions, no embedded credentials, no missing or invalid variable references.
- Import the signed Shortcut on iPhone and run it with valid/invalid credentials and with Health and Calendar permissions allowed/denied.
- Confirm at least one accepted upload and one authorized data fetch in Rage Tracker.
- Only then share the **unconfigured** Shortcut to obtain a new iCloud link and mark its Cloudflare release as verified.

Cherri inserts some `Nothing` actions automatically around control-flow blocks to avoid forwarding output between actions. Those are compiler-generated, not explicit statements in the source; they should not be stripped without functional verification.

## References

- [Apple: Add import questions](https://support.apple.com/guide/shortcuts/apdf330fd3a0/ios)
- [Cherri: Import questions](https://cherrilang.org/language/import-questions.html)
- [Apple: Use Shortcuts on iPhone](https://support.apple.com/guide/shortcuts/welcome/ios)
