#!/bin/sh
set -eu

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [reverse.dns.bundle-id]\n' "$0" >&2
  exit 2
fi

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output="$root/build/safari"
if [ -e "$output" ]; then
  printf 'Refusing to replace %s. Reuse the generated project in Xcode.\n' "$output" >&2
  exit 1
fi

# Xcode renamed the converter to packager; older Xcode uses the same options.
if xcrun --find safari-web-extension-packager > /dev/null 2>&1; then
  tool=safari-web-extension-packager
else
  tool=safari-web-extension-converter
fi

mkdir -p "$root/build"
exec xcrun "$tool" "$root/extension" \
  --project-location "$output" \
  --app-name "Pelican Zapper" \
  --bundle-identifier "${1:-com.lexh.PelicanZapper}" \
  --swift --no-open --no-prompt
