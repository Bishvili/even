---
name: ios-pwa-frontend
description: Design and implement polished, accessible, iPhone-first interfaces for Rage Tracker, an installable mood and context PWA.
---

# Rage Tracker — iOS PWA Frontend Design

Use this guide whenever changing screens, components, typography, navigation, motion, onboarding, PWA integration, graphs, or user-facing copy. This is a product-specific design system inspired by https://agenticskills.io/skills/frontend-design and informed by Apple's Human Interface Guidelines. It is tailored to a WebKit-installed iPhone app, not a marketing website or a generic dashboard.

## Product character

Rage Tracker helps someone record a feeling quickly and later understand what might correlate with it. The tone is thoughtful, private, gentle, and precise; avoid clinical coldness, productivity-game scoreboards, exaggerated cheerfulness, or judgment.

The experience should feel:
- **Calm:** a clear primary action and limited visual noise.
- **Personal:** mood, events, and routines are understandable without analytics jargon.
- **Trustworthy:** explicit privacy boundaries, honest uncertainty, and visible data controls.
- **Native-familiar:** fluid iOS navigation, system typography, tactile spacing, and readable controls.
- **Distinctive:** a recognizable, quietly confident identity without trying to clone an Apple app.

Aim for the standard of a polished consumer app someone would expect to install from the iOS App Store. This is an installable web app, so use web-native semantics and do not imply it has native permissions it lacks.

## Design before implementation

For every substantial UI change, complete a compact design pass before writing code:

1. Identify the screen's primary user intention, critical content, and states: first run, empty, populated, loading, offline, permission denied, sync failed, and success.
2. Select a concrete visual direction appropriate to the mood/data task, including 4–6 named colors, typographic roles, spacing and layout, and a brief rationale.
3. Sketch the hierarchy, even as an ASCII wireframe, with the main touch action clearly located.
4. Challenge generic defaults. Do not automatically use an oversized hero, repetitive cards, tracked-uppercase eyebrow labels, emphasized random headline words, generic pastel gradients, or ornamental iconography.
5. Implement, inspect screenshots, critique the design on a small iPhone first, then refine the least convincing visual and interaction details.
6. Verify with realistic copy, long calendar titles, missing data, and accessibility settings.

When a design needs a distinctive moment, spend the visual emphasis once: an exceptionally clear mood picker, an excellent timeline, or an intuitive correlation detail view. Keep the rest quiet.

## Current visual direction and tokens

Retain the existing Sage/Ink direction unless a deliberate product redesign is approved. Consolidate values into CSS custom properties or typed theme tokens rather than continuing to sprinkle magic hex literals.

| Role | Starting value | Use |
| --- | --- | --- |
| Ink | #173536 | Primary text, navigation, stable visual anchor |
| Canvas | #F5F6F2 | Calm app background |
| Pine | #28685B | Primary interactive elements and selected controls |
| Mist | #E7F2EB | Soft surfaces and relevant selected states |
| Warm signal | #F4D798 | Sparse emphasis on a meaningful highlight |
| Quiet text | #62786F | Secondary information with verified contrast |

White elevated surfaces are allowed when necessary; dark appearance requires a complete alternative palette, not simply inverting the canvas. Contrast must be tested. A warm accent should encode relevant emphasis, not decorate every card.

Typography:
- Use the native system stack: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif. On iOS this follows the system face without loading remote font assets.
- Define semantic type roles instead of arbitrary font sizes: large navigation title, section title, body, secondary detail, caption, metric.
- Start with a readable 16–17px body size on iPhone, 16px or larger form inputs to avoid focus zoom, and restrained headings that fit narrow widths.
- Respect larger system text settings and wrapping; do not hard-code short heights for text-bearing controls.
- Use tabular numerals for time, dates, mood averages, and chart labels.
- Prefer sentence case for interface copy. Use uppercase only when it genuinely helps distinguish a limited number of tiny informational labels.

Spacing and shape:
- Use a consistent 4pt/8pt spacing scale; let content density follow the user's task rather than repeating identical cards.
- Minimum practical hit area: 44 x 44 CSS px, with adequate separation.
- Use consistent radius roles for controls, grouped sections, and modal surfaces, not one heavy radius everywhere.
- Dividers, borders, and backgrounds must communicate grouping or interaction, not be decorative filler.

## iOS navigation and interaction conventions

- Use a persistent bottom tab bar for a small number of truly top-level destinations; tabs navigate, they do not perform destructive actions.
- Maintain the active tab and sensible scroll behavior. Within a tab, use a clear title, back behavior where needed, and contextual actions.
- Put the main check-in action within thumb reach. Avoid full-screen forms for a 10-second entry.
- Prefer grouped settings lists, bottom sheets, segmented controls, date/time pickers, and contextual confirmations where they meaningfully reduce complexity.
- Use the native browser controls where their accessibility, text selection, date behavior, or keyboard interaction is superior to custom imitations.
- Respect env(safe-area-inset-top), env(safe-area-inset-bottom), the notch/Dynamic Island, iOS keyboard, and the standalone web-app viewport. Account for bottom navigation when content scrolls.
- Do not disable pinch zoom, text selection, long-press, or scrolling to force an app-like appearance.
- Use descriptive labels, stable navigation, and predictable back/forward behavior. Do not hide an essential feature behind gestures.

## Installable PWA considerations

- Keep the Web App Manifest, icon sizes, apple-touch-icon, theme colors, service worker, cache versioning, and standalone launch path correct.
- Provide an accurate Safari Add to Home Screen guide when installation matters. Never imply an iOS web app can invoke a guaranteed native install prompt.
- Support complete local check-ins while offline, show an honest sync status, and reconcile when connectivity returns. Do not rely on unsupported iOS Periodic Background Sync.
- Apple HealthKit and EventKit are not directly available to this PWA. Use explicitly authorized Shortcuts workflows and show what information will leave the device.
- Keep authentication transitions robust across Safari and the Home Screen app; account for cookies/session boundaries and the fact that external links may switch app contexts.
- Request notifications only after clear user value and consent, and only where the installed app and platform support them.
- Rehearse update behavior: a service worker must not strand users with stale code or wipe local check-ins.

## Screen-level direction

### Check-in
- Open on the mood selection, not an onboarding wall.
- One prominent mood control, optional energy and context tags, then an obvious Save action.
- Confirm success without blocking the next action. Prevent accidental duplicate saves and clarify when data is stored locally.
- Avoid guilt-creating streak language or rewarding a user for reporting a certain mood.

### Insights
- Lead with one question or pattern at a time, then supporting sample counts, baseline, timeframe, and comparison details.
- Charts must have labeled units, meaningful axes, accessible text equivalents, and readable contrast; never encode positive/negative using color alone.
- Calendar comparisons require transparent before/after windows and enough observations. Show overlap and missing-data caveats when relevant.
- Use "associated with", "averaged", or "in this sample", never "caused by" or medical assertions.
- Fictional demo data must remain visibly separate from personal data in every chart, metric, and summary.

### Sources and sync
- Distinguish device-local information from Cloudflare-synced records.
- Explain precisely what Apple permissions are requested and how the Shortcut operates.
- Make login, connection, device-key creation, revoke, sync freshness, and error recovery easy to find.
- Do not show a device as linked before the server confirms it. Never show a token again after it has been lost or revoked.
- Do not display an actionable install link until a real, verified iCloud Shortcut link exists.

### Settings and privacy
- Present export, restore, clear local data, erase synced data, and device revoke as clearly different actions.
- Confirm destructive operations with explicit scope and a recoverability note.
- Keep privacy explanations brief, accurate, and accessible from the action that needs them.

## Copywriting

Write natural product copy for a thoughtful wellness tool.

- Buttons state verbs and outcomes: "Save check-in", "Connect calendar", "Generate device key", "Remove device".
- Error messages explain what failed, what remains safe, and the next step.
- Empty states guide action without making someone feel judged.
- Use specific facts, not broad reassurance. Do not claim that storing health data on Cloudflare is equivalent to on-device storage or end-to-end encryption.
- Avoid artificially enthusiastic praise, generic status badges, marketing superlatives, and patterned "label / tagline / adjective" layouts.

## Motion and feedback

- Motion should confirm state changes, reveal hierarchy, or provide continuity. Keep it brief and quiet.
- Respect prefers-reduced-motion. Avoid auto-running ornamental animations, scroll-jacking, attention-grabbing gradients, or staggered entrance effects on every card.
- Provide distinct focus, pressed, selected, loading, disabled, success, and error states.
- Use actual app state for feedback, not optimistic success copy before a network operation finishes.

## Accessibility and testing

- Target WCAG 2.2 AA. Verify contrast, semantics, focus order, keyboard operation, screen-reader labels, error descriptions, chart alternatives, and minimum touch targets.
- Test on small and large iPhone widths, dynamic text scaling, landscape where practical, light and dark appearance, VoiceOver, reduced motion, a slow connection, and airplane mode.
- Use Playwright/WebKit and accessibility checks for repeatable browser coverage; manually test the installed iPhone PWA because desktop WebKit is not a substitute for iOS.
- Test system permission failures, signed-out sessions, an invalid/revoked device token, a previously installed service worker, and safe local data preservation across updates.
- Be careful with time zones, DST transitions, short and long locale strings, and events that cross midnight.

## Frameworks and component discipline

- Prefer mature components and libraries for standard interactions when they substantially improve quality, but customize them to the product's system and iOS conventions.
- The existing frontend is vanilla JS/CSS. Improve its organization before adding features that deepen the monolith. When a migration is justified, use TypeScript and a supported, mainstream application framework with clear module boundaries.
- Keep tokens, components, data selectors, and calendar/mood analysis separate. Do not let UI rendering logic determine data ownership.
- Avoid massive dependency trees, unlicensed font/icon assets, third-party trackers, and libraries selected solely for aesthetic novelty.

## Visual sign-off checklist

Before treating a UI feature as ready:
- Is the primary action obvious, comfortable to tap, and quick to complete?
- Does the layout look intentional rather than assembled from identical cards?
- Are typography, colors, spacing, corner radii, and icons cohesive?
- Does the screen remain usable at 320–375px widths, with large text and an open keyboard?
- Are empty, offline, loading, permission, and error states as carefully considered as the successful state?
- Does it function as an installed standalone iOS app, not just a desktop browser preview?
- Are charts truthful and personal data protected?
- Did the review remove at least one unnecessary piece of visual or textual clutter?

## References

- Frontend Design: https://agenticskills.io/skills/frontend-design
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/
- Apple layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Apple web app push and service worker guidance: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
