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
   - **Even Sync** is the Shortcut everyone installs. Its version is in `shortcuts/even-sync.cherri` and must change for each release, with one plain sentence for people in `shortcuts/release-notes.txt`.
   - **Even Release** is the developer helper, in `shortcuts/even-release.cherri`. It holds no credentials. Install it with **Set Up Release Helper** in **Settings** → **Developer tools**, which opens the link the helper last shared (`shortcuts/helper.json`). Change `helperVersion` with every change to its source: the next run downloads the new build (tap **Replace** and run it again), then shares its own new link. Even Release 1 can't update itself, so install the first Even Release 2 from `Even-Release.shortcut` in the `shortcut-latest` GitHub release.
   - **To release:** push to `main`, then tap **Run Release Helper** in **Settings** → **Developer tools**. It runs Even Sync and asks the Worker for the state. While **Build signed Even Sync** is still signing, it says to try again; that workflow signs through a service that sometimes times out, so rerun it if it fails. An older installed version downloads the latest (tap **Replace** and run it again). An unpublished version asks for confirmation, publishes, and waits until the app offers it. A newer installed build is never replaced with an older one. The Worker refuses any link not named Even Sync or Even Release. Only an iPhone can create the iCloud link.
   - The card appears for accounts listed in `even_release_emails`, and **Improve This Site with Claude** opens a new session on this repository that starts with this onboarding. See [RoutineHub releases](shortcuts/ROUTINEHUB_RELEASE.md).
6. **To test Sync:** sign in on Even → **Sync** with their own account. Device keys belong to one account, so never reuse someone else's.

### What to know before changing anything

- Pushes to `main` go straight to the live app, with no staging. Sign-in, data deletion, and database changes need extra care.
- D1 holds real personal Health and Calendar records. Query only what the task needs, and do not copy values into chats, commits, or issues. Never change or delete records without the owner's approval.
- Cherri rewrites nested dictionaries in custom action parameters into a format iOS ignores, and the action then silently falls back to its defaults. Pass nested values such as filters and folders as `#ref` values, and extend `scripts/check-shortcut-conditions.py` to check the compiled plist.
- Only an iPhone can prove Shortcut behavior. Open the action in the Shortcuts editor to confirm what iOS actually understood.
- The Shortcut's key file must stay in On My iPhone: the Shortcuts folder in iCloud Drive does not exist when iCloud Drive is off.
- The plan of record is #16. Read **Plans and decisions** below before starting work.

## Getting it right the first time

Only an iPhone proves iOS behavior, and each round trip costs the owner time. Before pushing, check the change against these known failures.

**Installed iPhone app**
- Native pickers report every wheel turn as `change`. Save time and date fields on `blur`, when the picker closes.
- Permission prompts need a direct tap. Never call `requestPermission` from a background or input event, and skip it when permission is already granted.
- A control that can't act should say why when tapped. Don't leave it silently disabled, and any control disabled during work must be enabled again in every path.
- A tap during momentum scrolling produces no `click`. Primary navigation handles `touchend`.
- `position: fixed` breaks inside a transformed parent. Keep fixed elements out of anything you transform.
- iOS can misplace `position: fixed` elements once the document scrolls (WebKit bug 297779), and correcting them from JavaScript visibly lags. Only `.page` scrolls, the document never does, and the tab bar is part of the layout. Scroll `.page`, not `window`, and keep this structure. Never reload while the app is hidden; wait until it's visible again.
- `env(safe-area-inset-top)` doesn't clear the Dynamic Island's blur. Leave extra room above the header.
- Installed apps resume without reloading. Bump the version in `app.js`, `sw.js`, `worker/index.js` and `index.html`, and a new script must be added to all of `index.html`, `sw.js`, `scripts/deploy.sh` and the Worker's type list. `tests/versions.test.cjs` checks this.
- An installed app shows same-site downloads as a blank page. Open them in Safari with an `x-safari-https://` link.
- Trace a feature from a fresh install, from an upgraded install with old saved state, signed out, and offline.
- Each page is cached under its own path (`pageKey` in `sw.js`). After adding or linking a page, confirm `scripts/smoke.cjs` still opens the app offline.
- Check the first launch on a 375×667 screen with the Home Screen step showing. All five mood buttons must be fully visible above the tab bar.
- First-run setup is one card on Check in, in `onboarding.js`: Home Screen, sign in, Even Sync, then notifications after the first check-in. Each step works out whether it's done from the app's real state, so an upgraded install skips what it already has. Keep the card, the invitation email and the Sync steps in the same words; `tests/onboarding.test.cjs` checks this.

**Push notifications**
- A notification can open the app, but only a tap inside the app is sure to launch a Shortcut. Anything opened from a notification needs a visible button as a fallback.
- `201` means Apple accepted a push, not that it appeared. Check `last_push_status` and `last_sent_day`, then the phone's Focus and notification settings.
- Send encrypted payloads with a declarative notification. iOS removes subscriptions after repeated pushes that show nothing, so every push must show one.
- A notification arrives up to one cron interval after its planned time, which is 15 minutes in `wrangler.jsonc` today. Plan around the interval, and never describe timing more precisely than it is delivered.
- The scheduled job must handle each subscription on its own, so one failure can't stop the rest, and a run sends each person at most one notification (#21).
- The account repeats the stored plan every day until the app is next opened. A time meant for one day only, such as a wind-down for tomorrow's alarm or a nudge before an event, repeats too until #25 sends dated schedules.

**Shortcuts**
- Find Health Samples ends the run when a type has no samples, and Shortcuts can't catch errors. Check `recentTypes` first and never query a type it doesn't list.
- Look up Shortcuts by exact name with Get My Shortcuts. Search results passed to Create iCloud Link can make iOS show a menu of every Shortcut.
- A Shortcut must never wait for an answer on a normal run, because automations can't respond. Use notifications, and stop with a clear alert only when it can't continue.
- A result limit applies before grouping, so read grouped values from the first group.
- Health data can't be read while the iPhone is locked.
- Clock alarm details exist only as variable properties, whose names can differ across iOS versions. Confirm in the Shortcuts editor and in Even → **Sources** that names, times and on/off state arrive. Keep alarms at the end of the run, because an error there can't be caught.
- Clients check an error's `code`, never its message. Even Sync 2.9.0 still matches the skipped-event message (`NO_VALID_RECORDS` in `worker/index.js`) word for word, so keep that message until 2.9.0 is out of use.
- Even Sync follows the settings the handshake returns: `sync…` values for each kind of data, and `calendarsOff`, a pattern of turned-off calendars. Older versions ignore them, so the Worker also applies them on arrival.
- A run makes five requests: the handshake, today's and tomorrow's events, all Health measures, alarms, and the final notification. Every request is a round trip from the phone, often on cellular or inside an automation, so add fields to one of these instead of adding requests.
- The Worker accepts both Even Sync 2.9.0's one-at-a-time uploads and 3.0.0's batches. Remove the old paths once 3.0.0 is the only version in use (#35).
- Sleep arrives as asleep intervals that the Worker merges per night, so two wearables count once. A batch that reached its sample limit leaves its oldest night alone, because that night may be cut off. Even Sync 2.9.0 still adds up the last 24 hours.

**Cloud and naming**
- Worker, repository and address renames need dashboard steps. Push only after they're done, because a mismatch can deploy to the wrong place.
- Change a live D1 schema before pushing code that needs it, with additive changes only, and record the change in `db/schema.sql` in the same commit. Numbered migrations arrive with #30.
- After someone adds a Worker secret, list the secret names and compare them with what the code reads. A misspelled name fails silently.
- Every page and asset is served with a strict content security policy, so inline styles and scripts are blocked, including `style="…"` attributes that JavaScript writes into `innerHTML`. Set dynamic values with `element.style` or a class, keep styles and scripts in separate files, and add each file to `scripts/deploy.sh` and the Worker's type list.
- Check the Workers Builds result for the exact commit, then the deployed code. When you can't test something on a device, say so plainly.
- Workers Builds runs `node --test tests/*.test.cjs` before each deploy, so a failing test stops it. Run the tests before pushing anyway, and check **Validate application and Shortcut** afterward, which also compiles and checks both Shortcuts.
- `scripts/deploy.sh` copies the files to KV before deploying the Worker, so a failed deploy leaves new pages running against the old Worker. Fix or revert at once (#30).

**Data and privacy**
- Demo records must never merge into personal ones, and every count must say which records it counts. Read personal data through `EvenApp.personalMoods()`, `personalHealth()` and `personalEvents()`. Until #20, `upsertHealth` can merge a demo day into a real one.
- A new table or column that holds an owner's data must be covered by erase, account deletion and the cross-account tests in the same change.
- Resting heart rate is synced, but no feature uses it yet; #37 makes it personal context. Average heart rate is no longer kept: the Worker ignores it and Even Sync 3 doesn't read it. Don't add another measure without a feature that uses it.
- When what Even collects, sends or stores changes, update the **Data inventory**, Sync → Help and privacy, Settings, the README's Privacy section and `whitepaper.html` in the same commit.

**Analysis and copy**
- Use a first name only where it adds care: messages that start or close the day, a hard moment, and invitations. Keep it out of routine check-ins, sync messages, insights and errors.
- Each comparison has one implementation: stress in `coach.js`, and mood in `app.js` until #32 merges them. Extend those rather than adding another.
- Give each comparison one minimum count and one threshold. Never show an average below the minimum, and use the same numbers in the interface and How Even Works.
- Write counts with the right singular or plural form: "1 entry", never "1 entries".
- Confirmations for destructive actions say whose data, which data, and whether it can be undone.
- When you change wording or replace a behavior, search the interface, the Shortcuts, the docs and the paper for the old version, and update every match.

## Product and quality bar

**Working mode:** iterate quickly. Commit directly to `main`, with no feature branches or approval steps. Don't wait on CI before pushing, but check the result afterward. The interface should still look and read like a finished App Store app.

Even is an iPhone-first, installable progressive web app for quick mood check-ins and useful context from calendars and selected health metrics. Hold the interface to the finish, consistency, speed, and restraint of a popular App Store app, while remaining truthful about web-platform capabilities.

- A check-in should take seconds. The interface must work while offline.
- Personal mood check-ins and notes stay on the device unless the person turns on check-in sync, which is off by default and belongs to their account.
- Cloud-synced Health and Calendar records are private to their verified owner.
- Correlations are exploratory. Show sample counts, time windows, missing-data limitations, and appropriate uncertainty; never suggest causation or provide medical diagnoses.
- Fictional demo data must be clearly marked, reproducible, and fully isolated from real data and personal summary statistics.

## Plans and decisions

- The plan of record is #16, with the Shortcut plan in #36 and the data-context plan in #37. Read them and the open issues before starting work, follow their order, and update the ticket when the scope changes.
- Write tickets with **Problem**, **Evidence** (permalinks to lines), **Proposed fix**, **Acceptance criteria**, **Tests** and **Rollout notes**. Start each title with P0 (wrong now, or a data or privacy risk), P1 (trust, accuracy or first impression) or P2 (foundations). Never copy personal values into a ticket: use code references and aggregate counts.
- The owner has decided the following. Don't reopen them without asking:
  - Even Sync reads the calendars and data kinds left on in the app, and skips the rest. Titles of synced events are stored. The Worker discards anything turned off that still arrives.
  - Check-ins and notes can sync through the account, as an opt-in that is off by default. Erasing synced data removes them and turns it off.
  - Removing a tester deletes their synced data. Planned in #22.
  - Sources and Sync become one **Data** tab, leaving four tabs. Planned in #27; until it ships, this guide's references to Even → **Sync** and **Sources** stay correct.
  - Resting heart rate becomes personal recovery context, compared with the person's own usual level (planned in #37). Average heart rate is no longer collected.
  - Even Sync also sends tomorrow's events, so the wind-down and morning brief can plan around the first commitment. Even Sync 3 sends them; coaching starts using them in #37.
- Where `README.md` disagrees with this guide, this guide is current. #34 brings the README up to date.

## Product language and code quality

- Write production-quality application code and documentation. Do not reference AI-generated code, a chat conversation, prompts, an assistant, or the circumstances in which a feature was requested in UI text, comments, commits, documentation, or runtime metadata.
- The interface must read as a finished product. Never expose development state or internals to users: no prototype, beta, candidate, corrected, unverified, or test-build language; no version history; no tool, vendor, or infrastructure names such as Cherri, Cloudflare, or GitHub; no HTTP, HTTPS, API, header, or handshake terminology. Say *connect* or *disconnect this iPhone*, never *generate*, *device key*, *token* or *server*; the only exception is the security note about the key file.
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
| First-run setup | onboarding.js | The one next step on Check in: Home Screen, sign in, Even Sync, then notifications |
| Notifications | reminders.js, intake.js, coach.js, sw.js | The notification questions, seeing and tuning the day's plan |
| Pull to refresh | refresh.js | Refresh gesture and running the Shortcut |
| Coaching | coach.js | Stress outlook, patterns, anticipated stress, next actions, alarm context, daily brief, reset exercise |
| Explainer | whitepaper.html, whitepaper.css | How Even works, written for clinicians. Keep it true when behavior changes. |
| Edge API | worker/index.js | Authentication boundaries, device credentials, ingestion and retrieval |
| Data model | db/schema.sql | D1 owner-scoped health, calendar, user, and device records |
| Cloud configuration | wrangler.jsonc | Worker, KV assets, and D1 bindings |
| Tests | tests/*.test.cjs | Domain logic and isolation/security regression tests |

A cloud device credential is an owner-scoped bearer token; do not mistake it for a signed-in browser session. Sign-in itself is described under **Owner steps**.

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
5. Treat calendar titles and Health metrics as sensitive personal data. Collect only what a feature uses, avoid third-party trackers, redact logs, and use HTTPS. Even Sync skips what people turn off in the app, titles of synced events are stored, and the privacy text must say so plainly.
6. Avoid claiming end-to-end encryption, clinical-grade reliability, automatic Apple Health permissions, or sync capabilities the product does not implement.
7. Provide explicit data deletion, safe export, and account-switching behavior. Do not silently combine local data from two accounts. Every way an account loses access must leave its synced data deleted or deletable.

## Data inventory

What Even holds and where it goes. Write every privacy statement from this table, and keep it current: when it changes, change Sync → Help and privacy, Settings, the README's Privacy section and `whitepaper.html` with it.

| Data | Comes from | On the iPhone | In the account | Used for |
| --- | --- | --- | --- | --- |
| Mood, optional stress, energy (saved as 3 when untouched), tags, notes | Check-ins | Yes | Only with check-in sync on, as readable text. A deleted check-in leaves only its ID, so other devices can remove it. | Insights, coaching and notification times. Notes are only displayed. |
| Weekly reflections and breathing sessions | The app | Yes | No | Insights. Breathing also feeds what tends to help. |
| Health days and events added by hand or imported | Sources | Yes | No | Insights and coaching |
| Steps, exercise minutes, sleep hours, HRV | Even Sync, from Apple Health. Sleep arrives as asleep intervals from recent nights, up to a month on the first sync | Yes | Yes | Insights and coaching. HRV: Insights only. |
| Bedtimes | Worked out from the sleep intervals | Yes | Yes | Bedtime estimate and wind-down |
| Resting heart rate | Even Sync, from Apple Health | Yes | Yes | Shown in Sources only (#37) |
| Average heart rate | Even Sync 2.9.0 only | No | No: discarded on arrival | Nothing |
| Today's and tomorrow's calendar events: title, start, end, calendar name | Even Sync reads calendars left on (2.9.0 reads today only, 3.0.0 reads all); the Worker adds a category | Yes, without the calendar name | Yes, except events from turned-off calendars, which are discarded on arrival | Insights, coaching and nudges before events |
| Calendar names and on/off state | Even Sync and the app | No | Yes | Calendar settings |
| What Even Sync sends, and whether check-ins sync | The app | Yes | Yes | Followed by Even Sync and the Worker |
| Alarms: time, repeat days, on/off, name | Even Sync, from Clock | Yes | Yes, plus each synced day's first morning alarm | Brief, wind-down, next steps and the early-alarm pattern |
| Notification settings and answers | The app | Yes, including each message's text | Times and their kinds, time zone, weekends, sync reminder time, times of expected harder moments, latest check-in time, push subscription and delivery status | Sending notifications |
| Account and devices | Sign-in and Even Sync | Account email, first name, device ID and credential | Email; the name from sign-in, if any, shown to developer accounts; each device's label, dates, last error and Shortcut version; only a hash of each credential | Sync status and access |
| Testers and release accounts | Developer tools and the owner | No | Email, who added them, display name, any name a person or developer set and who set it (erasing synced data removes it) | Who can sign in and publish. The first name also goes in some notifications, the Today brief, the hard-days note and invitations. |

Backups are unencrypted JSON files that people save themselves. Outside services: Cloudflare hosts the app and sends sign-in codes, Apple's push service carries encrypted notifications, Resend sends invitation emails, and releases send the public Shortcut link to GitHub and RoutineHub.

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
4. Add or update tests at the right layer. Run the existing Node test suite with: node --test tests/*.test.cjs. Add WebKit/browser end-to-end tests as the UI grows. `scripts/smoke.cjs` loads every screen with the Worker's `SECURITY` headers, signed out and with the demo month loaded, and fails on any uncaught error or security-policy violation. Run it before pushing screen changes; CI runs it in Chromium and WebKit.
5. For UI changes, review at iPhone widths and in installed standalone mode. Exercise safe areas, keyboard, scroll, offline, focus, reduced motion, light/dark appearance, and empty/error states. Check the first launch at 375×667 with the Home Screen step showing.
6. For API or D1 changes, test invalid credentials, unauthorized requests, multiuser isolation, malformed payloads, idempotency, and rollback behavior.
7. Update documentation, migration instructions, the PWA service-worker cache version, the **Data inventory**, and `whitepaper.html` in the same change. Any change to what Even collects, where data goes, how patterns or prompts are decided, what notifications do, or safety behavior must be reflected in the paper. `tests/whitepaper.test.cjs` catches the numeric rules; check the prose by reading it. If you edit the paper, keep its plain, clinician-facing language and its limits section.
8. Pushes to `main` deploy through Workers Builds using `scripts/deploy.sh`. Check that the build succeeded rather than assuming a commit is live.
9. Verify the **deployed** version and its functionality before describing it as live. There is no staging, so for changes involving auth or personal data, plan how to roll back before pushing.
10. Leave the branch, test suite, and docs coherent. Avoid stray test scripts, stale comments, or unresolved TODOs with no owner.

## Project hygiene

GitHub is the authoritative source repository. Large single-file UI modules are the main cleanup priority. Prefer one source-controlled deployment flow, small modules, automated regression checks, and signed versioned Shortcut releases.

## Design and platform references

See the references at the end of `.agents/skills/ios-pwa-frontend/SKILL.md`.
