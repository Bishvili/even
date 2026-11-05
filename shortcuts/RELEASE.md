# Even Sync releases

A new version is public as soon as it is published, so fixes ship as another version. A version number can only be used once.

## Setup

1. Save a fine-grained GitHub token limited to this repository, with **Actions: Read and write**, as the `GITHUB_API_KEY` Worker secret. The Worker uses it to start the publishing and helper-link workflows.
2. Add the publisher's email to the `even_release_emails` D1 table. Their account must also be approved for sign-in.
3. On that iPhone, sign in to Even → **Data**, which connects it automatically. In **Settings** → **Developer tools**, tap **Set Up Release Helper**, install Even Sync, and tap **Run Even Sync** once so the key is saved. No key is ever copied, and the helper holds no credentials.

## Publish a version

1. Change the version in `shortcuts/even-sync.cherri`, write one plain sentence for people in `shortcuts/release-notes.txt` (180 characters at most), and push to `main`. **Build signed Even Sync** posts the signed files and their versions to the `shortcut-latest` release.
2. Tap **Run Release Helper**. It first updates itself if a newer helper has been built, then runs Even Sync and asks the Worker to compare the installed, latest and published versions.
3. While the new build is still being signed, the helper says to try again in a few minutes. If **Build signed Even Sync** failed, rerun it.
4. If the installed version is older, the helper downloads the latest. Tap **Replace** and run the helper again. An iPhone with a newer build than the latest is never offered an older one.
5. If the latest isn't published, confirm that Sync worked. The helper finds Even Sync by exact name, creates the iCloud link, and sends it to the Worker with the device key. The Worker checks that the link is named Even Sync, then starts **Publish Even Sync**. The helper waits, for up to four minutes, until the app offers the new version.

The workflow reads the version from the source, rejects a configured bearer token, uses the committed release notes, and commits `shortcuts/release.json`. The next deploy then publishes that release to the app and Shortcut.

## Update the release helper

Change `helperVersion` in `shortcuts/even-release.cherri` with every change to the helper, and push to `main`. On its next run, the helper downloads its new build: tap **Replace** and run it again. The updated helper then shares its own iCloud link once. The Worker checks that the link is named Even Release and starts **Share Even Release link**, which commits `shortcuts/helper.json`, so **Set Up Release Helper** installs the new version for everyone.

Even Release 1 can't update itself. Install the first Even Release 2 on the publishing iPhone from `Even-Release.shortcut` in the [`shortcut-latest`](https://github.com/Bishvili/health/releases/tag/shortcut-latest) release.
