#!/bin/sh
# Publishes the app's files to KV, then deploys the Worker.
set -eu

NAMESPACE_ID=df672457613b47759360416439d0c7f1
WRANGLER="npx --yes wrangler@4"

for file in index.html styles.css app.js reminders.js sw.js manifest.webmanifest icon.svg; do
  $WRANGLER kv key put "asset:$file" --path "$file" --namespace-id "$NAMESPACE_ID" --remote
done

# The Worker decodes PNG assets from base64.
for file in icon-192.png icon-512.png; do
  encoded="$(mktemp)"
  base64 < "$file" | tr -d '\n' > "$encoded"
  $WRANGLER kv key put "asset:$file" --path "$encoded" --namespace-id "$NAMESPACE_ID" --remote
  rm -f "$encoded"
done

# Removes source files the app no longer serves.
for key in asset:shortcut.cherri asset:connection.cherri; do
  $WRANGLER kv key delete "$key" --namespace-id "$NAMESPACE_ID" --remote || true
done

# Tells the Shortcut and the app which release is current.
$WRANGLER kv key put "config:shortcut:latest" --path shortcuts/release.json --namespace-id "$NAMESPACE_ID" --remote

$WRANGLER deploy
