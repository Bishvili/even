# Rage Tracker Sync — Apple Shortcut

The source file `rage-tracker-sync.cherri` defines the iPhone workflow for synchronizing today's Apple Health steps and Calendar events.

## Data collected

- Health: today's Steps samples are summed into one daily value. Raw Health samples may overlap between devices; verify the result against the Health app.
- Calendar: up to 50 events starting today, with title, start and end times, and a conservatively inferred category. The Shortcut does not read notes, location, or attendees.
- It sends one request per event and one for daily steps. This first implementation deliberately prioritizes a readable and testable action sequence over batching.
- Sleep and HRV are not included yet; interpreting raw sleep samples safely requires a separate implementation and validation.
- Personal mood entries and notes remain on the phone.

## Install on an iPhone

1. Open Rage Tracker → Sync. Sign in, generate a device credential, and copy its Authorization header value including the `Bearer ` prefix.
2. Tap **Open Shortcut builder**. It opens [Cherri Playground](https://playground.cherrilang.org/) with the published source prefilled. Cherri is a third-party tool that compiles and exports shortcuts.
3. Compile and inspect the actions, then export the signed Shortcut. Do not paste the private credential into the public source or playground.
4. Import the signed Shortcut into Apple's Shortcuts app. At the **Authorization** setup question, paste the value copied from Rage Tracker.
5. Run once, grant the Health and Calendar permissions, and review what is transmitted. Compare Steps with the Health app.
6. Back in Rage Tracker, select **Check last upload**, then **Sync now** to download new records for insights.
7. Optionally add a Shortcuts Automation → Time of Day trigger with **Run Immediately**. Permission prompts and automatic execution depend on iOS.

Only a signed shortcut can be imported on current iOS. The Shortcut must be shared from the Apple Shortcuts app to create a verified iCloud installation link. This file has not yet undergone an on-device acceptance test; the link in Rage Tracker is a **builder preview**, not a verified one-tap installer.

## Optional Mac signing

Compile the `.cherri` source using Cherri on macOS. To sign an exported Shortcut file using Apple's Shortcuts CLI:

```bash
shortcuts sign --mode anyone --input 'Rage Tracker Sync.shortcut' --output 'Rage Tracker Sync signed.shortcut'
```

## Request schema

Calendar: `POST /api/ingest` with form fields `kind=calendar`, `title`, `start`, `end`, `category`.
Health: `POST /api/ingest` with form fields `kind=health`, `date=YYYY-MM-DD`, `steps`.
Both require the `Authorization: Bearer <private-device-token>` header.
Successful requests update the device's `last_used_at` field, visible in Sync after refreshing.

## Security and limitations

- Never include a real credential, personal Health sample, calendar title, or approved email address in public Shortcut source, builder links, committed files, or shared iCloud shortcuts.
- The authorization question is answered only during import into Apple's Shortcuts app.
- The Calendar category heuristics are fallible. They should not be presented as verified classifications.
- A published iCloud installation link should be added to the app only after a signed iPhone import and end-to-end run have succeeded.
- No Apple Developer Program membership or App Store review is required for Shortcuts.

## References

- [Apple: Share shortcuts](https://support.apple.com/guide/shortcuts/share-shortcuts-apdf01f8c054/ios)
- [Apple: Run and sign shortcuts on Mac](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac)
- [Cherri: Import questions](https://cherrilang.org/language/import-questions.html)
