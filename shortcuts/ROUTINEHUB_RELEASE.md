# RoutineHub releases

Rage Tracker Sync is listed at [#26978](https://routinehub.co/shortcut/26978/). A new version is public as soon as it is published, and published versions cannot be edited, so fixes ship as another version. A version number can only be used once.

## Setup

1. Save a RoutineHub developer API key as the `ROUTINEHUB_API_KEY` repository secret.
2. Create a fine-grained GitHub token limited to this repository, with **Actions: Read and write**.
3. Install [Rage Tracker Release](https://github.com/Bishvili/rage-tracker/releases/download/shortcut-latest/Rage-Tracker-Release.shortcut) on an iPhone and paste the token when asked. The configured copy holds the token, so never share it.

## Publish a version

1. Update the version in `shortcuts/rage-tracker-sync.cherri` and push to `main`. **Build signed Rage Tracker Sync** posts the signed files to the `shortcut-latest` release.
2. Run **Rage Tracker Release**, choose **Install latest build**, and approve the replacement.
3. Run it again and choose **Publish installed build**. It runs Sync, asks whether it worked, creates the iCloud link and starts **Publish Rage Tracker Sync to RoutineHub**.

The workflow reads the version from the source, rejects a configured bearer token, confirms RoutineHub's response, and commits `shortcuts/release.json`. The next deploy then publishes that release to the app and Shortcut.

RoutineHub API: [official documentation](https://routinehub.co/docs/api/). The developer key is part of the API path, so the publishing script does not log request URLs.
