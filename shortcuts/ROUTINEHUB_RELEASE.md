# RoutineHub releases

Even Sync is listed at [#26978](https://routinehub.co/shortcut/26978/). A new version is public as soon as it is published, and published versions cannot be edited, so fixes ship as another version. A version number can only be used once.

## Setup

1. Save a RoutineHub developer API key as the `ROUTINEHUB_API_KEY` repository secret.
2. Save a fine-grained GitHub token limited to this repository, with **Actions: Read and write**, as the `GITHUB_API_KEY` Worker secret.
3. Add the publisher's email to the `even_release_emails` D1 table. Their account must also be approved for sign-in.
4. On that iPhone, sign in to Even → **Sync**, which connects it automatically. In **Settings** → **Developer tools**, tap **Set Up Release Helper**, install Even Sync, and tap **Run Even Sync** once so the key is saved. No key is ever copied, and the helper holds no credentials.

## Publish a version

1. Update the version in `shortcuts/even-sync.cherri` and push to `main`. **Build signed Even Sync** posts the signed files and the build's version to the `shortcut-latest` release.
2. Tap **Run Release Helper**. It runs Even Sync and asks the Worker to compare the installed, latest and published versions.
3. If the installed version is older, it downloads the latest. Tap **Replace** and run the helper again.
4. If the latest isn't published, confirm that Sync worked. The helper finds Even Sync by exact name, creates the iCloud link, and sends it to the Worker with the device key. The Worker checks that the link is named Even Sync, then starts **Publish Even Sync to RoutineHub**.

The workflow reads the version from the source, rejects a configured bearer token, confirms RoutineHub's response, and commits `shortcuts/release.json`. The next deploy then publishes that release to the app and Shortcut.

RoutineHub API: [official documentation](https://routinehub.co/docs/api/). The developer key is part of the API path, so the publishing script does not log request URLs.
