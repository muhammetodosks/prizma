#!/usr/bin/env bash
# Prizma filtre listeleri — EasyList + EasyPrivacy + uBO ekstra + AdGuard TR + Tracking
# Kullanım: scripts/download-lists.sh [-f|--force]
#   -f / --force  → mevcut dosyaları atlamaz, hepsini yeniden indirir.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LISTS="$ROOT/lists"
mkdir -p "$LISTS"

FORCE=0
for a in "$@"; do
  case "$a" in
    -f|--force) FORCE=1 ;;
  esac
done

fetch() {
  local name="$1" url="$2"
  if [ "$FORCE" = "1" ] || [ ! -s "$LISTS/$name" ]; then
    echo "İNDİRİYOR: $name ← $url"
    curl -fsSL --retry 3 --connect-timeout 20 -o "$LISTS/$name.tmp" "$url"
    mv "$LISTS/$name.tmp" "$LISTS/$name"
    echo "     $name tamam ($(wc -l < "$LISTS/$name") satır)"
  else
    echo "VAR  $name ($(wc -l < "$LISTS/$name") satır)"
  fi
}

# B11: adguard-turkish 8.txt'den indiriliyordu — 8.txt HOLLANDACA filtre!
#      Türkçe filtre 13.txt'tir (background.js LIST_SOURCES ile eşleşir).
fetch easylist.txt          "https://easylist.to/easylist/easylist.txt"
fetch easyprivacy.txt       "https://easylist.to/easylist/easyprivacy.txt"
fetch ublock-filters.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt"
fetch ublock-unbreak.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt"
fetch adguard-turkish.txt   "https://filters.adtidy.org/extension/ublock/filters/13.txt"
fetch adguard-tracking.txt  "https://filters.adtidy.org/extension/ublock/filters/3.txt"

echo
echo "Toplam: $(cat "$LISTS"/easylist.txt "$LISTS"/easyprivacy.txt "$LISTS"/ublock-filters.txt "$LISTS"/ublock-unbreak.txt "$LISTS"/adguard-turkish.txt "$LISTS"/adguard-tracking.txt 2>/dev/null | wc -l) satır"
