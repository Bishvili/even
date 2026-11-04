# Even — Engineering Guide

This file is the operating guide for changes to the Even codebase. Follow it before editing the UI, Worker, database, tests, or deployment configuration.

## Onboarding a new developer

The first time someone points you at this repository, before starting other work, check which connections below this session has and help them add what's missing. Search the connector registry and offer each connector as a card when those tools are available; otherwise tell them where to add it in Claude's settings. When someone new starts working on this repository, or a tool, permission, or account below is missing, walk them through this section one step at a time. Check each step with a read-only call where you can, and say plainly which steps only the repository owner can do. Never ask anyone to paste a key or token into a chat, a commit, or an issue.

### What the project depends on

| Dependency | Needed for | Required? |
| --- | --- | --- |
| `.agents/skills/ios-pwa-frontend/SKILL.md` | All UI and copy changes. It ships with this repository, so there is nothing to install. Read it directly. | Yes |
| GitHub access to `Bishvili/even` with push rights | Code changes, running workflows, reading build results | Yes |
| Cloudflare connection with access to the Bishvili account | Checking the Worker and querying the D1 database | Recommended |
| RoutineHub connection | Reading the account's listings. It cannot add a version to an existing Shortcut, so releases use the GitHub workflow. | Optional |
| An iPhone with the Shortcuts app | Testing the Shortcut and creating iCloud links, which nothing else can do | For Shortcut work |

No other skill is required. Compiling and signing the Shortcut happens in GitHub Actions, so Cherri does not need to be installed locally.

### Owner steps

The repository owner grants these, using the new developer's own accounts:

1. **GitHub:** add them as a collaborator on `Bishvili/even` with write access.
2. **Cloudflare:** invite them to the Bishvili account with access to Workers, KV, and D1. Pushes deploy through Workers Builds, so this is not needed just to deploy.
3. **App sign-in:** add testers in Even → **Settings** → **Developer tools**, which stores them in the `even_approved_emails` D1 table. Accounts in `even_release_emails` can do this. Access verifies who someone is and allows any email, and the Worker decides who is approved using that table and the `APPROVED_SYNC_EMAILS` secret. Invitations are sent through Resend from `bishvili.org` with the `RESEND_API_KEY` Worker secret.
4. **Releases:** add their email to the `even_release_emails` D1 table. Set `display_name` to welcome them on first sign-in with a guide to improving the site.
5. **RoutineHub:** releases use the `ROUTINEHUB_API_KEY` repository secret, so they can publish through the workflow without their own key. Only share the listing's RoutineHub account deliberately.

### Developer steps

1. **Connect GitHub** in Claude, and confirm push access without writing anything: listing the repository's collaborators shows their role (`write`, `maintain`, or `admin`), and GitHub only returns that list to accounts with push access. Do not create or push a branch to test access. All work goes to `main`; if a session starts on another branch, switch to `main` before committing.
2. **Connect Cloudflare** in Claude and select the Bishvili account. It should list one Worker, `even`. The older Workers Bindings server is deprecated in favor of `https://mcp.cloudflare.com/mcp`.
3. **Optionally connect RoutineHub** using an API key from their own RoutineHub account, under **Settings → API**. It will only show listings that account owns. In cloud sessions, add it as a Claude connector, because `routinehub.co` is not on the default network allowlist.
4. **Run the tests:** `node --test tests/*.test.cjs`.
5. **To work on the Shortcuts:** nobody ever copies a key. Signing in on Even → **Sync** connects the iPhone automatically, and running Even Sync from the app passes the key to the Shortcut, which saves it in On My iPhone for later runs and automations.
   - **Even Sync** is the Shortcut everyone installs. Its version is in `shortcuts/even-sync.cherri` and must change for each release.
   - **Even Release** is the developer helper, in `shortcuts/even-release.cherri`. It holds no credentials. Install it with **Set Up Release Helper** in **Settings** → **Developer tools**; it is served as `/install/Even%20Release.shortcut` because iOS names a Shortcut after its file and release assets can't contain spaces.
   - **To release:** push to `main` and wait for **Build signed Even Sync**, which signs through a service that sometimes times out, so rerun it. In **Settings** → **Developer tools**, tap **Run Release Helper**. It runs Even Sync and asks the Worker for the state: an older installed version downloads the latest (tap **Replace** and run it again), an unpublished version asks for confirmation and publishes, and otherwise it reports that everything is current. The Worker refuses any link not named Even Sync. Only an iPhone can create the iCloud link.
   - The card appears for accounts listed in `even_release_emails`, and **Improve This Site with Claude** opens a new session on this repository that starts with this onboarding. See [RoutineHub releases](shortcuts/ROUTINEHUB_RELEASE.md).
6. **To test Sync:** sign in on Even → **Sync** with their own account. Device keys belong to one account, so never reuse someone else's.

### What to know before changing anything

- Pushes to `main` go straight to the live app, with no staging. Sign-in, data deletion, and database changes need extra care.
- D1 holds real personal Health and Calendar records. Query only what the task needs, and do not copy values into chats, commits, or issues. Never change or delete records without the owner's approval.
- Cherri rewrites nested dictionaries in custom action parameters into a format iOS ignores, and the action then silently falls back to its defaults. Pass nested values such as filters and folders as `#ref` values, and extend `scripts/check-shortcut-conditions.py` to check the compiled plist.
- Only an iPhone can prove Shortcut behavior. Open the action in the Shortcuts editor to confirm what iOS actually understood.
- The Shortcut's key file must stay in On My iPhone: the Shortcuts folder in iCloud Drive does not exist when iCloud Drive is off.

## Getting it right the first time

Only an iPhone proves iOS behavior, and each round trip costs the owner time. Before pushing, check the change against these known failures.

**Installed iPhone app**
- Native pickers report every wheel turn as `change`. Save time and date fields on `blur`, when the picker closes.
- Permission prompts need a direct tap. Never call `requestPermission` from a background or input event, and skip it when permission is already granted.
- A control that can't act should say why when tapped. Don't leave it silently disabled, and any control disabled during work must be enabled again in every path.
- A tap during momentum scrolling produces no `click`. Primary navigation handles `touchend`.
- `position: fixed` breaks inside a transformed parent. Keep fixed elements out of anything you transform.
- `env(safe-area-inset-top)` doesn't clear the Dynamic Island's blur. Leave extra room above the header.
- Installed apps resume without reloading. Bump the version in `app.js`, `sw.js`, `worker/index.js` and `index.html`, and a new script must be added to all of `index.html`, `sw.js`, `scripts/deploy.sh` and the Worker's type list. `tests/versions.test.cjs` checks this.
- An installed app shows same-site downloads as a blank page. Open them in Safari with an `x-safari-https://` link.
- Trace a feature from a fresh install, from an upgraded install with old saved state, signed out, and offline.

**Push notifications**
- `201` means Apple accepted a push, not that it appeared. Check `last_push_status` and `last_sent_day`, then the phone's Focus and notification settings.
- Send encrypted payloads with a declarative notification. iOS removes subscriptions after repeated pushes that show nothing, so every push must show one.

**Shortcuts**
- Find Health Samples ends the run when a type has no samples, and Shortcuts can't catch errors. Check `recentTypes` first and never query a type it doesn't list.
- Look up Shortcuts by exact name with Get My Shortcuts. Search results passed to Create iCloud Link can make iOS show a menu of every Shortcut.
- A Shortcut must never wait for an answer on a normal run, because automations can't respond. Use notifications, and stop with a clear alert only when it can't continue.
- A result limit applies before grouping, so read grouped values from the first group.
- Health data can't be read while the iPhone is locked.

**Cloud and naming**
- Worker, repository and address renames need dashboard steps. Push only after they're done, because a mismatch can deploy to the wrong place.
- Change a live D1 schema before pushing code that needs it, with additive changes only.
- Check the Workers Builds result for the exact commit, then the deployed code. When you can't test something on a device, say so plainly.

## Product and quality bar

**Working mode:** iterate quickly. Commit directly to `main`, without feature branches, waiting on CI, or approval steps. The interface should still look and read like a finished App Store app.

Even is an iPhone-first, installable progressive web app for quick mood check-ins and useful context from calendars and selected health metrics. Hold the interface to the finish, consistency, speed, and restraint of a popular App Store app, while remaining truthful about web-platform capabilities.

- A check-in should take seconds. The interface must work while offline.
- Personal mood check-ins and notes are local to the device unless a future feature explicitly changes this with consent.
- Cloud-synced Health and Calendar records are private to their verified owner.
- Correlations are exploratory. Show sample counts, time windows, missing-data limitations, and appropriate uncertainty; never suggest causation or provide medical diagnoses.
- Fictional demo data must be clearly marked, reproducible, and fully isolated from real data and personal summary statistics.

## Product language and code quality

- Write production-quality application code and documentation. Do not reference AI-generated code, a chat conversation, prompts, an assistant, or the circumstances in which a feature was requested in UI text, comments, commits, documentation, or runtime metadata.
- The interface must read as a finished product. Never expose development state or internals to users: no prototype, beta, candidate, corrected, unverified, or test-build language; no version history; no tool, vendor, or infrastructure names such as Cherri, Cloudflare, or GitHub; no HTTP, API, header, or handshake terminology.
- Keep copy short. Say what to do or what happened in a sentence, then stop. Do not explain how something works unless the person needs it to make a choice. Put necessary detail behind a disclosure.
- Stay honest in fewer words: required privacy and security facts remain visible, stated plainly.
- Use concise, user-facing language that describes actions and outcomes. Avoid placeholders, sales language, misleading success states, and filler.
- Prefer small, cohesive modules, direct names, clear data flow, and well-defined interfaces. Remove incidental complexity rather than documenting it.
- Do not leave dead branches, obsolete endpoints, unnecessary compatibility shims, commented-out replacements, redundant models, or unused dependencies in the finished change.
- Do not preserve broken abstractions. Make deliberate changes and keep the current state of the repository clean.

## Existing architecture

Read the relevant files before changing behavior:

| Area | Current location | Responsibility |
| --- | --- | --- |
| Application UI and analysis | index.html, app.js, styles.css | Check-ins, client-side state, calendar/health insights |
| Install and offline support | manifest.webmanifest, sw.js, icon assets | Home Screen integration, cache management |
| Testers and sharing | invites.js | Sharing the link and managing who can sign in |
| Install prompt and reminders | reminders.js, sw.js | Home Screen prompt, daily check-in reminders |
| Pull to refresh | refresh.js | Refresh gesture and running the Shortcut |
| Coaching | coach.js | Stress outlook, patterns, daily brief, reset exercise |
| Edge API | worker/index.js | Authentication boundaries, device credentials, ingestion and retrieval |
| Data model | db/schema.sql | D1 owner-scoped health, calendar, user, and device records |
| Cloud configuration | wrangler.jsonc | Worker, KV assets, and D1 bindings |
| Tests | tests/*.test.cjs | Domain logic and isolation/security regression tests |

Cloudflare Access handles approved-email sign-in. Access verifies identity. Approved addresses are the server-only APPROVED_SYNC_EMAILS secret and the even_approved_emails table. A cloud device credential is an owner-scoped bearer token; do not mistake it for a signed-in browser session.

Current UI is plain JavaScript and CSS. Do not rewrite it merely to adopt a framework. As screens, state, and flows become substantially more complex, prefer a deliberate migration to a maintained TypeScript + Vite application with a widely used UI framework such as React, reusable components, and typed domain modules. Complete migrations rather than running parallel implementations indefinitely.

## Frontend

**Read .agents/skills/ios-pwa-frontend/SKILL.md for every UI or interaction change.**

- Design for installed iPhone use first, then support Safari tabs, iPad, desktop, and narrower accessibility settings.
- Follow the platform's navigation, safe-area, typography, touch, keyboard, sheet, and focus conventions while retaining a distinct Even identity.
- Prefer system fonts and a small set of coherent design tokens. Use existing, accessible icon and component libraries where they reduce work, not to create dependency bloat.
- Make loading, success, failure, offline, empty, permission-denied, and disconnected states first-class.
- Preserve accessibility, reduced-motion settings, dark-mode legibility, Dynamic Type/text scaling, and comfortable minimum touch targets.
- Never pretend a PWA can directly use HealthKit/EventKit, install a Shortcut without user action, or perform unrestricted background sync on iOS.

## Backend and dependencies

- Prefer stable, popular, actively maintained libraries and APIs for solved problems. Use a well-supported validation library for nontrivial inputs; use a database abstraction only when it improves migrations and query safety. Do not recreate authentication, date/time parsing, accessibility components, or test infrastructure unnecessarily.
- Evaluate dependencies for maintenance, security, bundle size, Cloudflare Workers compatibility, licensing, and measurable value. Keep package manifests and lockfiles current when introducing packages.
- Favor strict TypeScript types for new modules and migrations when practical. Keep domain analysis, data validation, storage, authentication, and HTTP handling separated and testable.
- Parameterize D1 queries. Use explicit schemas and ownership predicates. Validate input shape and bounds, enforce API limits, and return predictable non-sensitive errors.
- Use one authoritative implementation for each behavior. Remove superseded implementations and dependent tests or docs when replacing them.
- Do not add speculative flags, backwards-compatible handlers, dual reads/writes, or duplicated database fields without a concrete rollout need and a removal plan.

## Privacy and security invariants

1. Authenticate via Cloudflare Access's validated runtime identity for browser account operations. Never trust a user-supplied email, arbitrary request header, or device ID as proof of identity.
2. Restrict issuance and revocation of device credentials to the verified owner. Use cryptographically random device tokens, store only hashes server-side, support revocation, and do not log or embed tokens.
3. Every read, write, export, and delete of cloud data must be scoped to the derived account owner on the server. Test cross-user isolation and revocation.
4. Keep the email allowlist in Cloudflare secrets or private D1 tables and all credentials in Cloudflare secrets, never checked into the public repository or served in production assets.
5. Treat calendar titles and Health metrics as sensitive personal data. Collect the minimum, allow omission of identifying calendar titles, avoid third-party trackers, redact logs, and use HTTPS.
6. Avoid claiming end-to-end encryption, clinical-grade reliability, automatic Apple Health permissions, or sync capabilities the product does not implement.
7. Provide explicit data deletion, safe export, and account-switching behavior. Do not silently combine local data from two accounts.

## Schema evolution and cleanup

- Treat the current source schema as the model for **new** installations. Migrations for existing installations must be explicit and independently reviewable.
- Before dropping or rewriting a table, check whether live records exist, whether code or external clients still use it, and whether a backup or data move is needed. Never delete real user records without a verified migration and appropriate approval.
- After a replacement has been deployed and verified, delete the obsolete schema, routes, fixtures, documentation, and tests rather than retaining an indefinite legacy pathway.
- Keep schema changes focused, idempotent where appropriate, and tested on representative data, including an empty database and an existing database.
- Keep timestamps and calendar event identities stable across imports, time zones, and daylight saving transitions. Use established libraries rather than handcrafted date parsing when reliability requires it.

## Development and verification workflow

1. Inspect the relevant code, tests, deployed architecture, and any existing instructions.
2. State the user-visible behavior and security invariants that must remain true. For visual work, create a compact design direction and review it for specificity before coding.
3. Make the smallest coherent change that **fully** addresses the request; refactor surrounding code when necessary to eliminate duplication and dead paths.
4. Add or update tests at the right layer. Run the existing Node test suite with: node --test tests/*.test.cjs. Add WebKit/browser end-to-end tests as the UI grows.
5. For UI changes, review at iPhone widths and in installed standalone mode. Exercise safe areas, keyboard, scroll, offline, focus, reduced motion, light/dark appearance, and empty/error states.
6. For API or D1 changes, test invalid credentials, unauthorized requests, multiuser isolation, malformed payloads, idempotency, and rollback behavior.
7. Update documentation, migration instructions, and the PWA service-worker cache version in the same change when necessary.
8. Pushes to `main` deploy through Workers Builds using `scripts/deploy.sh`. Check that the build succeeded rather than assuming a commit is live.
9. Verify the **deployed** version and its functionality before describing it as live. Prefer staging and a rollback path for changes involving auth or personal data.
10. Leave the branch, test suite, and docs coherent. Avoid stray test scripts, stale comments, or unresolved TODOs with no owner.

## Project hygiene and immediate technical debt

The shared-sync tables and pairing endpoint were removed after confirming the legacy tables were empty. A source archive is no longer served by the application; GitHub is the authoritative source repository. Remaining cleanup priorities are large single-file UI modules. Prefer one source-controlled deployment flow, small modules, automated regression checks, and signed versioned Shortcut releases.

## Design and platform references

- Frontend implementation guide: .agents/skills/ios-pwa-frontend/SKILL.md
- Original Frontend Design reference: https://agenticskills.io/skills/frontend-design
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple layout guidance: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple tab bar guidance: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- WebKit and Safari platform behavior: https://webkit.org/
