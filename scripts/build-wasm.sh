#!/usr/bin/env bash
# Prizma WASM build — C++ motoru Emscripten ile WebAssembly'e derler.
# Çıktı: extension/wasm/prizma.js + prizma.wasm
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK="${EMSDK:-$HOME/emsdk}"
CORE="$ROOT/core/src"
OUT="$ROOT/extension/wasm"

if [ ! -f "$EMSDK/emsdk_env.sh" ]; then
  echo "HATA: Emscripten SDK bulunamadı ($EMSDK/emsdk_env.sh). Önce kurun:" >&2
  echo "  $EMSDK/emsdk install latest && $EMSDK/emsdk activate latest" >&2
  exit 1
fi
if [ ! -x "$EMSDK/upstream/emscripten/emcc" ]; then
  echo "HATA: emcc bulunamadı. SDK'yı kurun/aktifleştirin." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$EMSDK/emsdk_env.sh" >/dev/null

mkdir -p "$OUT"

em++ -O2 -std=c++17 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createPrizmaModule \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s NO_EXIT_RUNTIME=1 \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -s EXPORTED_RUNTIME_METHODS="["HEAPU8","HEAP8"]" \
  -s EXPORTED_FUNCTIONS='["_prizma_new","_prizma_free","_prizma_load_list","_prizma_clear","_prizma_match","_prizma_match_priority","_prizma_last_rule","_prizma_regex_export","_prizma_cosmetic","_prizma_stats","_prizma_net_filter_count","_prizma_regex_filter_count","_prizma_cosmetic_filter_count","_prizma_guard_check_host","_prizma_guard_check_url","_prizma_guard_export","_prizma_guard_host_count","_prizma_guard_allow_count","_malloc","_free"]' \
  -o "$OUT/prizma.js" \
  "$CORE/filter.cpp" "$CORE/pattern.cpp" "$CORE/index.cpp" "$CORE/engine.cpp" "$CORE/guard.cpp" "$CORE/wasm_bindings.cpp"

echo "WASM build tamam: $OUT/prizma.js ($(du -h "$OUT/prizma.js" | cut -f1)), $OUT/prizma.wasm ($(du -h "$OUT/prizma.wasm" | cut -f1))"
