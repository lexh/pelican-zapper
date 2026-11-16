#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$root/build"
mkdir -p "$out"

firefox_zip="$out/pelican-zapper-firefox.zip"
chrome_zip="$out/pelican-zapper-chrome.zip"
rm -f "$firefox_zip" "$chrome_zip"

(
  cd "$root/extension"
  zip -q -X "$firefox_zip" \
    manifest.json \
    content.js \
    content.css \
    icons/icon-16.png \
    icons/icon-32.png \
    icons/icon-48.png \
    icons/icon-96.png \
    icons/icon-128.png \
    icons/icon-256.png \
    icons/icon-512.png
)

stage=$(mktemp -d "${TMPDIR:-/tmp}/pelican-zapper-chrome.XXXXXX")
trap 'rm -rf "$stage"' EXIT INT TERM

mkdir -p "$stage/icons"
cp "$root/extension/content.js" "$root/extension/content.css" "$stage/"
cp "$root/extension/icons/icon-16.png" \
  "$root/extension/icons/icon-32.png" \
  "$root/extension/icons/icon-48.png" \
  "$root/extension/icons/icon-128.png" \
  "$stage/icons/"

node - "$root/extension/manifest.json" "$stage/manifest.json" << 'EOF'
const fs = require("node:fs");
const [src, dst] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(src, "utf8"));
delete manifest.browser_specific_settings;
manifest.icons = {
  "16": "icons/icon-16.png",
  "32": "icons/icon-32.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};
fs.writeFileSync(dst, JSON.stringify(manifest, null, 2) + "\n");
EOF

(
  cd "$stage"
  zip -q -X "$chrome_zip" \
    manifest.json \
    content.js \
    content.css \
    icons/icon-16.png \
    icons/icon-32.png \
    icons/icon-48.png \
    icons/icon-128.png
)

printf 'Built %s\nBuilt %s\n' "$firefox_zip" "$chrome_zip"
