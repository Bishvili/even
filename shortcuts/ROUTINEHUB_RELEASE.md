# RoutineHub release workflow

Rage Tracker Sync's RoutineHub listing is [#26975](https://routinehub.co/shortcut/26975/), presently **unpublished**. It was initialized with the historical iCloud share link `https://www.icloud.com/shortcuts/82109f53491f4d95a0a8b8437c4090f2` as version `1.0.0`. That old file is **not** an approved current release. Do not relabel or republish it as a corrected v2.3.x build.

## One-time GitHub setup

1. Sign in to the RoutineHub account that owns listing #26975 (the connected RoutineHub account currently shows `Gallant-Ghoul-2611`).
2. In RoutineHub, open **Settings → API** and generate a developer API key. Do not use the separate HubSign key or a buyer's proof-of-purchase key.
3. Open [GitHub Actions repository secrets](https://github.com/Bishvili/rage-tracker/settings/secrets/actions), select **New repository secret**, and save it with the exact name `ROUTINEHUB_API_KEY`. Never commit it, paste it in a PR, or expose it as a workflow input.
4. Create a GitHub Actions environment named `routinehub-release` in **Settings → Environments**. Configure required reviewers to approve publishing and restrict deployment branches to `main`.
5. Merge the workflow PR after review. The workflow uses manual `workflow_dispatch` rather than publishing automatically on every push.

## Release a new verified version

1. Update `shortcuts/rage-tracker-sync.cherri` and related tests, docs, and the PWA version gate on a PR; merge to `main` after all CI jobs pass.
2. Compile, inspect and sign a **credential-free** master; install a separate configured copy on an iPhone. Confirm the private authorization import question, permissions, handshake, accepted calendar uploads, accepted Health Steps (when present), skipped-record behavior, and Cloudflare status reporting. Do not share the configured copy.
3. In Apple Shortcuts, share a **fresh unconfigured master** to obtain a new `https://www.icloud.com/shortcuts/<32-character-id>` URL. GitHub Actions cannot mint Apple's iCloud sharing link on its own.
4. Open **GitHub → Actions → Publish verified Rage Tracker Sync to RoutineHub → Run workflow** on `main`. Provide the exact version, the new iCloud URL and plain-text release notes. Check the two verification boxes. Keep **Publish listing** off unless the RoutineHub listing is ready for public distribution.
5. The workflow runs the Node regression suite; verifies the version matches the committed Shortcut source in all three places; rejects reuse of the historical v1.0 link or a configured bearer token; posts the version using RoutineHub's official API; and verifies `result: success` (HTTP 200 alone does not imply success).
6. Review RoutineHub listing #26975. For a single-step version release and publication, check **Publish listing** during the initial workflow run, and only after verifying the tested link. If the version was created with this option off, publish the existing approved listing in RoutineHub's website; do not rerun the create-version workflow with the same version, because the API rejects duplicates.

For production use, don't mark a version verified in Cloudflare KV until the iPhone acceptance checklist succeeds and the listing is reachable. The Worker currently validates only iCloud links in release metadata, so accepting RoutineHub page links in the PWA update flow is a separate code change.

RoutineHub API: [official documentation](https://routinehub.co/docs/api/). The private developer key is embedded in the API path, so the publishing script deliberately does not log request URLs.
