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
# d3ward'ın kendi test listesi — d3ward.github.io/toolz/adblock %100 için gerekli
# (uBlock Origin'in önerdiği liste; ads.tiktok.com gibi test domainlerini kapsar)
fetch d3host.txt            "https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.adblock"
# uBlock Origin kaynak kodunun TÜM filtre listeleri (uAssets/filters/)
for y in 2020 2021 2022 2023 2024 2025 2026; do
  fetch "ublock-filters-$y.txt" "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-$y.txt"
done
fetch ublock-general.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-general.txt"
fetch ublock-mobile.txt     "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-mobile.txt"
fetch ublock-privacy.txt    "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt"
fetch ublock-quickfixes.txt "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt"
fetch ublock-resabuse.txt   "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt"
fetch ublock-legacy.txt     "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/legacy.txt"

# --- YENİ GÜÇLÜ LİSTELER (v1.2.0) ---
# OISD — Tüm büyük blocklist'leri birleştirilmiş, optimize edilmiş liste (hosts formatı)
fetch oisd.txt              "https://raw.githubusercontent.com/EagleOne42/oisd/main/hosts_full.txt"
# HaGeZi — Ultra kapsamlı, çok dilli, çok katmanlı blocklist (adblock formatı)
fetch hagezi.txt            "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/multi.txt"
# AdGuard DNS — AdGuard'ın kendi DNS blocklist'i (rules formatı)
fetch adguard-dns.txt       "https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/rules.txt"
# Peter Lowe — Eski ama güçlü, malware/phishing/tracking odaklı
fetch peterlowe.txt         "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext"
# URLhaus — Malware/phishing C2 domain'leri (abuse.ch)
fetch urlhaus.txt           "https://urlhaus.abuse.ch/downloads/hostfile/"

echo
echo "Toplam: $(cat "$LISTS"/easylist.txt "$LISTS"/easyprivacy.txt "$LISTS"/ublock-filters.txt "$LISTS"/ublock-unbreak.txt "$LISTS"/adguard-turkish.txt "$LISTS"/adguard-tracking.txt "$LISTS"/d3host.txt "$LISTS"/ublock-filters-*.txt "$LISTS"/ublock-general.txt "$LISTS"/ublock-mobile.txt "$LISTS"/ublock-privacy.txt "$LISTS"/ublock-quickfixes.txt "$LISTS"/ublock-resabuse.txt "$LISTS"/ublock-legacy.txt "$LISTS"/oisd.txt "$LISTS"/hagezi.txt "$LISTS"/adguard-dns.txt "$LISTS"/peterlowe.txt "$LISTS"/urlhaus.txt 2>/dev/null | wc -l) satır"
