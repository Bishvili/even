# Rage Tracker Sync

The current Shortcut source is **v2.0.0** at [rage-tracker-sync.cherri](rage-tracker-sync.cherri). It collects today's Calendar events and Apple Health step samples, then sends the permitted details over HTTPS to the authenticated Rage Tracker account.

## First run

1. In Rage Tracker, open **Sync** and copy the full **Authorization** value. It starts with `Bearer `.
2. Open **Prepare updated Shortcut** on the same screen. The Cherri builder opens in a new tab with generic source and no user credential.
3. Compile, export a signed Shortcut, and install it using Apple's Shortcuts app.
4. Run **Rage Tracker Sync**. It first ensures the `iCloud Drive/Shortcuts/RageTracker` folder exists, lists its contents, and only opens `device-key.txt` when it finds that file.
5. If there is no key file, the Shortcut asks for the Authorization value, verifies it against `GET /api/profile`, and saves it **only after successful verification**.
6. Approve the requested Calendar, Health and network permissions.
7. Return to Rage Tracker → **Test connection**. A valid device key confirms authentication, while an accepted-data timestamp and nonzero record counts confirm successful ingestion. `Sync now` downloads the context to the PWA.

A missing key file must not cause an error or file-picker prompt. An invalid token is not saved, and a failed upload must not produce a success notification.

## Subsequent runs

The Shortcut lists its own folder, reads the previously saved `device-key.txt`, and verifies that the key remains authorized. It sends today's Calendar events and Health step total, checks the `ok` field of every API response, and notifies the user of the number of accepted updates. When no records exist, it explicitly says that there is nothing to synchronize.

It sends `shortcutVersion=2.0.0` with accepted uploads. The app uses the reported version to show update availability.

**Data included:**
- Calendar: event title, start/end timestamps (ISO 8601), with a limit of 30 events beginning today.
- Health: daily Steps samples summed for the current day. Multiple recording devices may produce overlapping samples; compare with the Health app before interpreting step totals.
- The backend derives broad meeting, exercise, social and commute categories from event titles when the category is not provided, while preserving explicit categories supplied by other clients.
- Mood check-ins, calendar locations, notes and attendees are **not** sent.

## Automatic update checks

After syncing, the Shortcut calls `GET /api/shortcut/release?current=2.0.0`. If a newer **verified** release is available, it offers to open that iCloud link. Installing or replacing the Shortcut requires user approval; no silent replacement happens.

The key file survives replacing the Shortcut. It is **unencrypted in iCloud Drive** and could be accessible to anyone who can read that account's files. Do not share a personalized Shortcut or the key file. Revoke the associated device key in Rage Tracker if it is exposed.

**Release status:** v2.0.0 has passed Cherri 2.3.0 compilation but still requires a signed, on-device import and first successful upload. The previously shared v1.0.0 iCloud link remains unverified. Do not mark the new release verified until tested on an iPhone.

## Apple permissions

Shortcuts may require **Settings → Apps → Shortcuts → Advanced → Allow Sharing Large Amounts of Data**. The workflow never needs **Allow Running Scripts** or the options for deleting data without confirmation. An automation can be added through Shortcuts → Automation → Time of Day; background execution depends on iOS permissions.

## Engineering notes

The implementation uses Cherri only to generate native Apple Shortcuts actions. Cherri automatically inserts `Nothing` actions after control-flow constructs to clear their intermediate outputs; the source does not declare any explicit `nothing()` calls. This is compiler behavior, not a placeholder for missing application logic. The v2 source has fewer branches than its predecessor.

Cherri's `getFile("RageTracker")` call is deliberately **after** `createFolder("RageTracker")`. It retrieves the directory, not the credential file. The actual key is read only from an entry returned by `getFolderContents`. This ensures fresh installation does not attempt to open a nonexistent credential file.

Before distributing a replacement: compile with Cherri 2.3.0, confirm signing, inspect the generated Shortcut on iPhone, grant permissions, confirm one successful calendar or health request, and publish the new **unconfigured** iCloud link. Keep the Cloudflare `config:shortcut:latest` version and verification status consistent.

## Useful links

- [Apple Shortcuts](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Cherri language](https://cherrilang.org/)
- [Cherri control flow](https://cherrilang.org/language/control-flow.html)
