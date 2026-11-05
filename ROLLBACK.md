# Rolling back

A deploy is one version of the Worker and its files, so going back restores both.

1. Find the version: `npx wrangler versions list`, or Workers & Pages > even > Deployments in the dashboard.
2. Go back: `npx wrangler rollback <version-id>`, or **Rollback** beside that version in the dashboard.
3. Confirm: `https://even.bishvili.org/api/status` reports the old version.
4. Fix forward with a new commit to `main`. The next push deploys over the rollback.

What a rollback does not undo:

- **Database changes.** Migrations stay applied, and only additive changes are safe to roll back across. After migration 0009 dropped the old notification columns, versions before 2.33.0 can't save notifications.
- **Secrets and KV release records.** These are separate from versions. The published Even Sync link stays as it is.
- **Installed apps.** They pick up the older files the next time they check for an update.

The steps were tried on 5 November 2026 by redeploying the current version at 100%, which changed nothing and confirmed the call works. Going back to an older version hasn't been tried on production.
