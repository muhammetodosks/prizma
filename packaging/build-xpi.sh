#!/usr/bin/env bash
# Prizma XPI paketleme
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/release"
mkdir -p "$OUT"
VERSION="$(grep -oP '"version":\s*"\K[0-9.]+' "$ROOT/extension/manifest.json")"
XPI="$OUT/prizma-$VERSION.xpi"
rm -f "$XPI"
# WASM önce üretilmeli
if [ ! -f "$ROOT/extension/wasm/prizma.wasm" ]; then
  "$ROOT/scripts/build-wasm.sh"
fi
# Lists'i pakete dahil et (boşsa script çalıştır)
if [ ! -s "$ROOT/lists/easylist.txt" ]; then
  "$ROOT/scripts/download-lists.sh"
fi
mkdir -p "$ROOT/extension/lists"
cp -rn "$ROOT"/lists/*.txt "$ROOT/extension/lists/" 2>/dev/null | true
cd "$ROOT/extension"
zip -qr "$XPI" . -x "*.DS_Store"
echo "XPI: $XPI ($(du -h "$XPI" | cut -f1))"
