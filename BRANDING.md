# Rebranding

Written for Claude, working with someone who wants a new name or look. A rebrand takes one name, three colors and one SVG. Nothing else in the code should need to change. If it seems to, stop and say so, because it's a bug in this setup.

## What to ask for

| | Where | Notes |
| --- | --- | --- |
| Name | `name` in `brand/brand.json` | Replaces it everywhere: pages, emails, notifications, the paper |
| Home Screen label | `installName` in the same file | 12 characters at most, often the same as the name |
| Three colors | `colors` in the same file | `primary` for buttons and links, `highlight` for sparse warm emphasis and the logo's accent, `ground` for dark surfaces and text |
| Logo | `brand/logo.svg` | One square SVG, described below |

Only if they want: `tagline`, `pitch` (it follows "Try Name, ", so start lowercase), `support`, `inviteFrom` and `codeFrom`. Sender addresses must be on a domain already verified for sending, so leave those two alone unless the owner has set one up.

Don't ask for anything else, and don't edit `brand/palette.json`. It holds about 50 roles, and the build works them out from the three colors: each role keeps its own lightness and follows its family's change in hue and saturation. Red warnings, ambers and status colors deliberately stay as they are.

## Starting from the catalogue

`brand/catalog/` holds nine names, nine icons and nine palettes that can be mixed. When someone has chosen, for example "Gloaming, the Stones icon and the Harbor palette":

1. Copy that name's `name`, `installName`, `tagline` and `pitch` from `names.json` into `brand/brand.json`.
2. Copy the palette's three colors from `palettes.json` into `colors` there.
3. Copy the icon's file from `brand/catalog/icons/` over `brand/logo.svg`.

Then follow the steps below. The catalogue itself stays as it is, so the look being replaced is still one of the nine.

## The logo

- Square, with a `viewBox`. Plain shapes only, with no scripts, text or linked images.
- Its first `<rect>` is treated as the background, and is dropped where the logo sits on its own tile (the header and sign-in sheet). A logo with no `<rect>` is used whole.
- Colors can be written directly, or as `{{color.highlight.light}}`, `{{color.contrast.light}}` and `{{color.on-contrast.light}}` to follow the palette. In the on-its-own version, the highlight color takes on the color of the tile, and `on-contrast` strokes stay light or dark as the tile needs.
- Keep it simple enough to read at 43 points. Check it in the previews.
- App icons sit on the `contrast` color, filling the square, because iOS shows transparency as black.
- Today's pull-to-refresh animates the current logo's sun and horizon. Any other logo shows still while pulling, and that's fine. A matching animation is optional: `brand/pull-mark.svg` holds it, with `pull-sun` and `pull-line` as the moving parts.

## Steps

1. **Try it first.** Add the candidate to `brand/looks.json` (a `name`, optionally `colors` and `logo`, where a catalogue icon's path goes), and run `node scripts/preview-looks.cjs previews "Name"`. Or run the **Preview looks** workflow, which saves the screenshots as a download. Look at every screen, light and dark, and show them to the person. Nothing here reaches the live app.
2. **Apply it.** Edit `brand/brand.json` and `brand/logo.svg`.
3. **Check it.** `node --test tests/*.test.cjs`, `node scripts/smoke.cjs` and `node scripts/signed-in.cjs`.
4. **Ship it.** Run `node scripts/bump-version.cjs x.y.z`, commit to `main` and push. A push goes straight to the live app, with no staging, so get the person's go-ahead first. Then confirm the Workers Builds result and **Check the live site**.

**If the build stops**, read the message. "text on page is too faint in dark (3.1:1, needs 4.5:1)" means that color can't be read. Usually `primary` is too light for white text, or `ground` is too pale. Suggest a darker shade rather than working around the check. Other messages name a bad value: quotes, `<`, `>`, `&` and backslashes aren't allowed in names.

**To go back**, revert the commit and push.

## Outside the code

These don't follow the files. Tell the person, and say which only the owner can do.

- **Google's consent screen** shows its own app name and logo. The owner changes these in Google's console. Trying a look never touches them.
- **Home Screen:** the icon and label on a phone only change when the app is added again.
- **Claude's copy of the paper**, if one has been published, needs publishing again from `dist/whitepaper.html`.
- **New web address:** a separate job, because it means everyone reinstalls and signs in again. Follow "Changing the web address" in #69.

## Never change for a rebrand

- `brand/stable.json` and the Shortcut sources. **Health Sync** and **Release Helper** are installed on phones, and a rebrand mustn't make anyone reinstall.
- `sync.bishvili.org`, which the Shortcuts call.
- Tables, the sign-in cookie, storage keys, the `health` Worker and database names, and the `app` marker inside backups, or old data stops being found.

## Rules that keep this working

- Never type the name in shipped files. Use `{{name}}` in pages and scripts, and `BRAND.name` in the Worker. `tests/brand.test.cjs` rebuilds under a made-up name and fails on anything left over.
- Never type a color outside `brand/palette.json`.

## Going further

To change the palette's design rather than recolor it, such as a warmer dark mode, edit the roles in `brand/palette.json` and set `main` to the three colors they were written for.
