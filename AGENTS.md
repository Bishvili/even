# Rage Tracker — Engineering Guide

This file is the operating guide for changes to the Rage Tracker codebase. Follow it before editing the UI, Worker, database, tests, or deployment configuration.

## Product and quality bar

**Working mode:** iterate quickly. Commit directly to `main`, without feature branches, waiting on CI, or approval steps. The interface should still look and read like a finished App Store app.

Rage Tracker is an iPhone-first, installable progressive web app for quick mood check-ins and useful context from calendars and selected health metrics. Hold the interface to the finish, consistency, speed, and restraint of a popular App Store app, while remaining truthful about web-platform capabilities.

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
| Edge API | worker/index.js | Authentication boundaries, device credentials, ingestion and retrieval |
| Data model | db/schema.sql | D1 owner-scoped health, calendar, user, and device records |
| Cloud configuration | wrangler.jsonc | Worker, KV assets, and D1 bindings |
| Tests | tests/*.test.cjs | Domain logic and isolation/security regression tests |

Cloudflare Access handles approved-email sign-in. Approved addresses are managed in Access and the server-only APPROVED_SYNC_EMAILS secret. A cloud device credential is an owner-scoped bearer token; do not mistake it for a signed-in browser session.

Current UI is plain JavaScript and CSS. Do not rewrite it merely to adopt a framework. As screens, state, and flows become substantially more complex, prefer a deliberate migration to a maintained TypeScript + Vite application with a widely used UI framework such as React, reusable components, and typed domain modules. Complete migrations rather than running parallel implementations indefinitely.

## Frontend

**Read .agents/skills/ios-pwa-frontend/SKILL.md for every UI or interaction change.**

- Design for installed iPhone use first, then support Safari tabs, iPad, desktop, and narrower accessibility settings.
- Follow the platform's navigation, safe-area, typography, touch, keyboard, sheet, and focus conventions while retaining a distinct Rage Tracker identity.
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
4. Keep the email allowlist and all credentials in Cloudflare secrets / Access policy configuration, never checked into the public repository or served in production assets.
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
