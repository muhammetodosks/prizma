#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/release"
mkdir -p "$OUT"

VERSION="$(grep -oP '"version":\s*"\K[0-9.]+' "$ROOT/extension/manifest.json")"
echo "Building Prizma v$VERSION for all platforms..."

# --- Build Firefox (MV2) ---
echo "Building Firefox (MV2)..."
cd "$ROOT"
./packaging/build-xpi.sh
mv "$OUT/prizma-$VERSION.xpi" "$OUT/prizma-$VERSION-firefox.xpi"

# --- Build Chrome/Edge (MV3) ---
echo "Building Chrome/Edge (MV3)..."
cd "$ROOT/extension_chrome"

# Copy WASM files
cp -r ../extension/wasm .

# Build Chrome CRX (using web-ext or manual)
# For now, create a zip that can be loaded as unpacked extension
cd "$ROOT"
zip -r "$OUT/prizma-$VERSION-chrome.zip" extension_chrome -x "*.DS_Store"

# --- Build Edge (same as Chrome) ---
cp "$OUT/prizma-$VERSION-chrome.zip" "$OUT/prizma-$VERSION-edge.zip"

# --- Build Safari (Web Extension) ---
# Safari uses .xcodeproj, we'll create the structure
mkdir -p extension_safari
cp -r extension/* extension_safari/
# Safari needs .xcodeproj, we'll provide instructions

echo "Build complete!"
echo "Firefox: $OUT/prizma-$VERSION-firefox.xpi"
echo "Chrome: $OUT/prizma-$VERSION-chrome.zip"
echo "Edge: $OUT/prizma-$VERSION-edge.zip"
ls -la "$OUT"/prizma-$VERSION*
