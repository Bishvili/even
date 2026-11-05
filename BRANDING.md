# Changing the name, colors or logo

- **Name:** edit `brand/brand.json`: the name, the Home Screen label (12 characters at most), the tagline, the invitation pitch, and the support and sender addresses. Sender addresses must be on a domain verified for sending.
- **Colors:** edit `brand/palette.json`. Each role has a light and a dark value. The `paper` group is How It Works.
- **Logo:** edit `brand/logo.svg`. It may use `{{color.role.light}}` values. Every icon and launch image is drawn from it at build.

Bump the version with `node scripts/bump-version.cjs x.y.z` so installed copies pick up the change, run the tests, and push. A bad value stops the build. `tests/brand.test.cjs` rebuilds under a made-up name, and fails if the old name is left anywhere that ships.

On a phone, the Home Screen label and icon update only when the app is added again.

`brand/stable.json` is different: those names are installed on phones inside the Shortcuts. Only change them together with the Shortcut sources, as a new release.
