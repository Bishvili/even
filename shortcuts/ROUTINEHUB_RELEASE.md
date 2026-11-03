# RoutineHub releases

Rage Tracker Sync is listed at [#26978](https://routinehub.co/shortcut/26978/). A new version is public as soon as it is published, and published versions cannot be edited, so fixes ship as another version. A version number can only be used once.

## Setup

1. Save a RoutineHub developer API key as the `ROUTINEHUB_API_KEY` repository secret.
2. Save a fine-grained GitHub token limited to this repository, with **Actions: Read and write**, as the `GITHUB_API_KEY` Worker secret.
3. Add the part of the publisher's email before the @ to the `rt_release_accounts` D1 table. Their account must also be approved for sign-in.
4. On that iPhone, sign in to Rage Tracker → **Sync**, tap **Set Up Release Helper**, and run Rage Tracker Sync once so the device key is saved. The helper holds no credentials.

## Publish a version

1. Update the version in `shortcuts/rage-tracker-sync.cherri` and push to `main`. **Build signed Rage Tracker Sync** posts the signed files to the `shortcut-latest` release.
2. Tap **Run Release Helper**, choose **Install latest build**, and approve the replacement.
3. Run it again and choose **Publish installed build**. It runs Sync, asks whether it worked, creates the iCloud link, and sends it with the device key to the Worker, which starts **Publish Rage Tracker Sync to RoutineHub**.

The workflow reads the version from the source, rejects a configured bearer token, confirms RoutineHub's response, and commits `shortcuts/release.json`. The next deploy then publishes that release to the app and Shortcut.

RoutineHub API: [official documentation](https://routinehub.co/docs/api/). The developer key is part of the API path, so the publishing script does not log request URLs.
