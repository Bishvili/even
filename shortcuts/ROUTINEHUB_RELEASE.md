# RoutineHub releases

Rage Tracker Sync is listed at [#26978](https://routinehub.co/shortcut/26978/). A new version is public as soon as it is published, and published versions cannot be edited, so fixes ship as another version.

## Setup

Save a RoutineHub developer API key as the `ROUTINEHUB_API_KEY` repository secret. Do not use the HubSign key or a buyer's key, and never commit it. **Verify RoutineHub GitHub secret** checks that it works and owns the listing.

## Publish a version

1. Update `shortcuts/rage-tracker-sync.cherri` and its version in all four places, then push to `main`.
2. **Build signed Rage Tracker Sync** runs when Shortcut source changes on `main`. Download `Rage-Tracker-Sync-iPhone-Installer`.
3. Install it on an iPhone and run it. The Shortcut holds no device key, so choose **Copy iCloud Link** from its share menu. GitHub Actions cannot create this link.
4. Run **Publish verified Rage Tracker Sync to RoutineHub** on `main` with the version, the new iCloud link and short plain-text notes. It checks the version against the source, rejects a configured bearer token, and confirms RoutineHub's response. A version number can only be used once.
5. Update `shortcuts/release.json` with the new version and link, then push to `main`. The deploy publishes it, and the Shortcut then offers the update.

RoutineHub API: [official documentation](https://routinehub.co/docs/api/). The developer key is part of the API path, so the publishing script does not log request URLs.
