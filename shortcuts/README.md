# Rage Tracker Sync

The current Apple Shortcut source is **v2.3.0** at [rage-tracker-sync.cherri](rage-tracker-sync.cherri). It synchronizes the owner's selected Apple Health and Calendar context to Rage Tracker. The source is compiled and its six conditional comparison values are verified in CI, but the v2.3 Shortcut has **not** completed an on-device acceptance test.

## Installation

1. In Rage Tracker → **Sync**, confirm email login and the connected device. Copy the complete Authorization value, including the `Bearer ` prefix.
2. Select **Open corrected Shortcut builder**. Cherri Playground opens the generic, credential-free v2.3 source in a new tab.
3. Click the hammer icon to compile, choose **Export**, then **Sign Shortcut** and download the signed result.
4. Open the file in Apple Shortcuts, remove the earlier broken **Rage Tracker Sync** if necessary, and answer the **Customize Shortcut** question with your complete Authorization value. Do not paste the credential into the public Cherri editor or share a configured Shortcut.
5. Run it and approve Calendar, Health and network permissions. In iOS Settings → Apps → Shortcuts → Advanced, enable **Allow Sharing Large Amounts of Data** if asked. The Shortcut does not require script-running or deletion permissions.
6. Return to Rage Tracker → **Test connection**. Check that the server reports a successful v2.3 handshake, then distinguish that from accepted Health and Calendar data. Use **Sync now** to download accepted records into the local PWA.

The previous v2.2 signed build had incomplete **If** comparison values and must not be installed. The current download path is the corrected builder, not the obsolete binary. A direct signed v2.3 file and a new verified iCloud link will only be offered after signing and successful iPhone validation.

## Exactly what happens

- A public GET to `/api/status` keeps the native Apple **Customize Shortcut** question bound to its Text action in Cherri 2.3.0.
- `POST /api/shortcut/hello` sends `shortcutVersion=2.3.0` with the device credential. The Worker derives the account owner and returns `state: "connected"` only for an authorized device.
- Calendar requests send up to 30 events beginning today, including title and ISO 8601 start/end times; the backend derives broad event categories. Notes, attendees, locations and mood entries are not sent.
- Health requests send the daily sum of today's Step samples, which can differ from Apple's consolidated step total when samples from multiple devices overlap.
- Successful data ingestion returns `state: "accepted"`, which the Shortcut checks before incrementing the successful-upload count. A rejected record stops the workflow.
- The Shortcut checks `/api/shortcut/release?current=2.3.0` after syncing; only a newer **verified** release is offered. Apple requires explicit approval before installing replacements.
- If no data was available, a valid handshake still appears as connected, while accepted record counts remain unchanged.

## Why the If conditions are checked separately

Cherri can compile code that produces a visually incomplete **If [variable] is** action on iOS. The v2.3 workflow uses explicit text values for every API outcome rather than comparing generic dictionary results as Booleans.

The CI workflow runs the Node regression suite, compiles Cherri 2.3.0 using `--debug --skip-sign`, then inspects the **generated plist** using [check-shortcut-conditions.py](../scripts/check-shortcut-conditions.py). It fails if any If condition has a missing comparison, or if the six expected values differ: `connected`, `accepted` (twice), numeric `1`, `new_release`, and `Install update`.

This is a compile-time structure check. It does not certify that HealthKit permissions, live calendars, network operations or Apple Shortcuts automation work on every device.

## Privacy and release process

- Each user controls a revocable device key issued after email authentication. Do not embed device keys, real calendar titles, or Health data into source, screenshots, public links or logs.
- No credential file or folder is created; the Authorization value is configured in the installed Shortcut itself and will need to be re-entered for a replacement.
- Share only a fresh unconfigured signed master to create an iCloud installation link; personalized Shortcuts may expose the credential.
- Versioned source, matching Worker/API responses, tests and docs must be committed together. A verified public iCloud release needs an on-device import, valid/invalid key handling, permission checks, and an accepted data upload.
- Do not mark a release verified based only on Cherri compilation or signing.

## References

- [Apple Shortcuts user guide](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Apple: Add import questions](https://support.apple.com/guide/shortcuts/apdf330fd3a0/ios)
- [Cherri: Import questions](https://cherrilang.org/language/import-questions.html)
