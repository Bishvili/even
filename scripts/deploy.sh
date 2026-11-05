#!/bin/sh
# Deploys the Worker and the app's files as one version, then records the current releases.
# A failed deploy stops here and changes nothing.
set -eu

NAMESPACE_ID=22aa6c748a8c436cafef2e87b8522c19
WRANGLER="npx --yes wrangler@4"

node scripts/build-assets.cjs
$WRANGLER deploy

# Tells the Shortcut and the app which release is current, and Developer tools which helper link to install.
$WRANGLER kv key put "config:shortcut:latest" --path shortcuts/release.json --namespace-id "$NAMESPACE_ID" --remote
$WRANGLER kv key put "config:helper:latest" --path shortcuts/helper.json --namespace-id "$NAMESPACE_ID" --remote

# The versions in the source let the release helper tell a build that's still being signed from a current one.
sync_version="$(grep -oE '"shortcutVersion": "[0-9]+\.[0-9]+\.[0-9]+"' shortcuts/even-sync.cherri | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
helper_version="$(grep -oE 'const helperVersion = "[0-9]+\.[0-9]+\.[0-9]+"' shortcuts/even-release.cherri | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
$WRANGLER kv key put "config:shortcut:source" "{\"sync\":\"$sync_version\",\"release\":\"$helper_version\"}" --namespace-id "$NAMESPACE_ID" --remote
