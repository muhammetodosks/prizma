#!/usr/bin/env bash
# Prizma filtre listeleri — EasyList + EasyPrivacy + uBO ekstra + Türkçe
# Kullanım: scripts/download-lists.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTS="$ROOT/lists"
mkdir -p "$LISTS"

fetch() {
  local name="$1" url="$2"
  if [ -s "$LISTS/$name" ]; then
    echo "VAR  $name ($(wc -l < "$LISTS/$name") satır)"
  else
    echo "İNDİRİYOR: $name ← $url"
    curl -fsSL --retry 3 --connect-timeout 20 -o "$LISTS/$name.tmp" "$url"
    mv "$LISTS/$name.tmp" "$LISTS/$name"
    echo "     $name tamam ($(wc -l < "$LISTS/$name") satır)"
  fi
}

fetch easylist.txt          "https://easylist.to/easylist/easylist.txt"
fetch easyprivacy.txt       "https://easylist.to/easylist/easyprivacy.txt"
fetch ublock-filters.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt"
fetch ublock-unbreak.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt"
fetch adguard-turkish.txt   "https://filters.adtidy.org/extension/ublock/filters/8.txt"

echo
echo "Toplam: $(cat "$LISTS"/easylist.txt "$LISTS"/easyprivacy.txt "$LISTS"/ublock-filters.txt "$LISTS"/ublock-unbreak.txt "$LISTS"/adguard-turkish.txt 2>/dev/null | wc -l) satır"
