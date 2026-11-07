# Cloudflare setup

Everything the app runs on lives in one Cloudflare account. This guide covers setting it up from nothing, adding the first testers, and starting the data over. `wrangler.jsonc` is the source of truth for names, bindings and limits. If this guide and that file disagree, the file is right and this guide needs fixing.

## What runs where

| Piece | Name | Defined in |
| --- | --- | --- |
| Worker | `health` | `wrangler.jsonc` (`main: worker/index.js`) |
| App address | `health.bishvili.org`, a custom domain on the Worker | `routes`, `PUBLIC_ORIGIN`, `APP_ORIGINS` |
| Shortcut and Google sign-in address | `sync.bishvili.org`, a custom domain on the Worker | `routes`, `SHORTCUT_ORIGIN`, `GOOGLE_RELAY_ORIGIN` |
| App files | Workers Static Assets from `dist`, bound as `STATIC` | `assets` |
| Database | D1 `health-private`, bound as `DB` | `d1_databases`, `db/migrations`, `db/schema.sql` |
| Release records | Workers KV, bound as `ASSETS` | `kv_namespaces`, `scripts/deploy.sh` |
| Rate limits | `INVITE_LIMIT`, `DEVICE_LIMIT`, `SIGNIN_LIMIT`, `SEND_LIMIT`, `NETWORK_LIMIT` | `ratelimits` |
| Scheduled job | Every 5 minutes: notifications, stalled syncs, cleanup | `triggers.crons` |

The `workers.dev` address and preview URLs are off.

## Setting it up from nothing

You need Node 22 or later and `npx wrangler@4` signed in to the account (`npx wrangler login`).

1. **Database.** Create it with `npx wrangler d1 create health-private`, and put the new `database_id` in `wrangler.jsonc`. Then build every table with `npx wrangler d1 migrations apply health-private --remote`. The migrations in `db/migrations` are the only way the live schema changes. `db/schema.sql` is the same schema in one file, for reading, and `tests/migrations.test.cjs` checks that the two match.
2. **Release records.** Create the KV namespace with `npx wrangler kv namespace create health-assets`. Put its id in `wrangler.jsonc` under `kv_namespaces`, and in `NAMESPACE_ID` in `scripts/deploy.sh`. The deploy writes three keys: `config:shortcut:latest`, `config:helper:latest` and `config:shortcut:source`. They hold only public Shortcut links and versions.
3. **Domains.** Add `bishvili.org` to the account as a zone. The `routes` in `wrangler.jsonc` attach both custom domains on the first deploy.
4. **Secrets.** Add each one with `npx wrangler secret put NAME`, or in the dashboard under Workers & Pages → health → Settings → Variables and Secrets, choosing **Secret**. A deploy removes plain-text variables that aren't in `wrangler.jsonc`, so never store these as plain text.

   | Secret | What it is |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | A long random string that signs sign-in sessions, for example from `openssl rand -hex 32`. Changing it signs everyone out. |
   | `RESEND_API_KEY` | A Resend key with sending access for the verified `bishvili.org` domain. It sends sign-in codes and invitations. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | A Google OAuth web client whose redirect URI is `https://sync.bishvili.org/api/signin/callback/google`. Without them, Google sign-in is hidden and email codes still work. |
   | `VAPID_PRIVATE_KEY` | The push key as a JSON Web Key with `d`, `x` and `y`. For example, in Node: `crypto.generateKeyPairSync("ec",{namedCurve:"P-256"}).privateKey.export({format:"jwk"})`. Replacing it ends every existing notification subscription. |
   | `GITHUB_API_KEY` | A fine-grained GitHub token for `Bishvili/health` with Actions read and write. The Worker uses it to start the Shortcut signing and release workflows. |
   | `APPROVED_SYNC_EMAILS` | A JSON array of owner emails, such as `["owner@example.com"]`, that can always sign in even if the testers table is empty. |

   After adding secrets, list them with `npx wrangler secret list` and compare the names with this table. A misspelled name fails silently.
5. **Deploys.** In Workers & Pages → health → Settings → Build, connect `Bishvili/health` on branch `main`. Set the build command to `node --test tests/*.test.cjs` and the deploy command to `sh scripts/deploy.sh`, run from the repository root. The build token needs Workers Scripts, Workers KV and D1 edit permissions. Every push to `main` then runs the tests and deploys the Worker and its files as one version.
6. **First testers.** Sign in with an email from `APPROVED_SYNC_EMAILS`, then add testers in the app under **Settings** → **Developer tools**. To let someone publish releases and see Developer tools, add them in D1:
   ```sql
   INSERT INTO health_release_emails(email, display_name) VALUES ('person@example.com', 'Their first name');
   ```
7. **Check it.** `https://health.bishvili.org/api/status` should report the version in `app.js`, and the **Check the live site** workflow should pass.

## Starting the data over

This keeps the people who can sign in and publish, and removes everything else: records, devices, notification subscriptions, sign-in sessions and accounts. Everyone signs in again as if the app were new.

The tables kept are `health_approved_emails` (testers), `health_release_emails` (release accounts), `health_names` (names set for testers) and `d1_migrations`. KV release records aren't touched, so the published Health Sync link keeps working.

1. Save a restore point: `npx wrangler d1 time-travel info health-private`, and note the bookmark it prints.
2. Run:
   ```sql
   DELETE FROM health_alarms; DELETE FROM health_calendar_events; DELETE FROM health_calendars;
   DELETE FROM health_push_subscriptions; DELETE FROM health_devices; DELETE FROM health_hidden_days;
   DELETE FROM health_install_codes; DELETE FROM health_metrics; DELETE FROM health_moods;
   DELETE FROM health_reflections; DELETE FROM health_shared; DELETE FROM health_title_rules;
   DELETE FROM health_users; DELETE FROM health_signin_verifications; DELETE FROM health_signin_sessions;
   DELETE FROM health_signin_accounts; DELETE FROM health_signin_users;
   DELETE FROM health_service WHERE key <> 'last_cron';
   ```
   with `npx wrangler d1 execute health-private --remote --command "<the SQL>"`.
3. On each iPhone, erase the app's data under **Settings** (or delete the Home Screen app), and delete `device-key.txt` from the Health Sync folder in Files → On My iPhone.

A table added later that holds someone's data must be added to this list in the same change.

To undo a reset within 30 days, run `npx wrangler d1 time-travel restore health-private --bookmark=<bookmark>`. That returns the whole database to that moment, including anything added since.
