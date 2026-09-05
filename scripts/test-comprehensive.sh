#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
XPI="$ROOT/release/prizma-1.2.1-firefox.xpi"
LOG="$ROOT/test-results.log"

echo "=== Prizma Comprehensive Test Suite ===" | tee "$LOG"
echo "Date: $(date)" | tee -a "$LOG"
echo "XPI: $XPI" | tee -a "$LOG"
echo "" | tee -a "$LOG"

run_test() {
  local name="$1"
  local cmd="$2"
  echo "Testing: $name" | tee -a "$LOG"
  if eval "$cmd" 2>&1 | tee -a "$LOG"; then
    echo "✅ PASS: $name" | tee -a "$LOG"
    return 0
  else
    echo "❌ FAIL: $name" | tee -a "$LOG"
    return 1
  fi
}

# 1. Unit tests
run_test "Core Engine Unit Tests" "cd $ROOT/core && ./test_engine"
run_test "Unicode Bug Test" "cd $ROOT/core && ./test_unicode"

# 2. Build verification
run_test "WASM Build" "cd $ROOT && ./scripts/build-wasm.sh"
run_test "XPI Build" "cd $ROOT && ./packaging/build-xpi.sh"

# 3. Adblock-tester.com test (requires Firefox headless)
run_test "adblock-tester.com 100/100" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-b18.py 2>&1 | tail -20 | grep -q 'SKOR: 100/100'
"

# 4. Site compatibility tests
run_test "YouTube UI Test" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-site-test.py 2>&1 | grep -q 'YouTube.*engellenen.*0'
"

run_test "TikTok UI Test" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-site-test.py 2>&1 | grep -q 'TikTok.*engellenen.*0'
"

run_test "Twitter/X UI Test" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-site-test.py 2>&1 | grep -q 'Twitter.*engellenen.*0'
"

# 5. Other test sites
run_test "turtlecute.org" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-other-tests.py 2>&1 | grep -q 'turtlecute.org.*0'
"

run_test "d3ward.github.io" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-other-tests.py 2>&1 | grep -q 'd3ward.github.io.*0'
"

run_test "coveryourtracks.eff.org" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-other-tests.py 2>&1 | grep -q 'coveryourtracks.eff.org.*3'
"

# 6. Real site tests
run_test "CNN.com" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-real-test.py 2>&1 | grep -q 'CNN.*pagead.*0'
"

run_test "NY Times" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-real-test.py 2>&1 | grep -q 'NY Times.*pagead.*0'
"

run_test "BBC" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-real-test.py 2>&1 | grep -q 'BBC.*pagead.*0'
"

run_test "Sözcü" "
  cd /tmp/opencode
  timeout 180 xvfb-run -a -s '-screen 0 1366x900x24' python3 firefox-real-test.py 2>&1 | grep -q 'Sözcü.*pagead.*0'
"

echo "" | tee -a "$LOG"
echo "=== Test Summary ===" | tee -a "$LOG"
grep -c "✅ PASS" "$LOG" | xargs -I {} echo "Passed: {}" | tee -a "$LOG"
grep -c "❌ FAIL" "$LOG" | xargs -I {} echo "Failed: {}" | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "Full log: $LOG"
