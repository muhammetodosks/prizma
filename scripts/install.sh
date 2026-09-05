#!/bin/bash
set -euo pipefail

# Prizma Auto-Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash
# Or: wget -qO- https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash

REPO="muhammetodosks/prizma"
RELEASE_URL="https://github.com/$REPO/releases/latest"

detect_browser() {
  if command -v google-chrome &>/dev/null || command -v chromium &>/dev/null; then
    echo "chrome"
  elif command -v microsoft-edge &>/dev/null; then
    echo "edge"
  elif command -v firefox &>/dev/null; then
    echo "firefox"
  elif command -v safari &>/dev/null; then
    echo "safari"
  else
    echo "unknown"
  fi
}

download_latest() {
  local browser=$1
  local url=""
  local filename=""

  case $browser in
    firefox)
      url=$(curl -sL "$RELEASE_URL" | grep -oE 'href="[^"]*firefox[^"]*\.xpi"' | head -1 | cut -d'"' -f2)
      filename="prizma-firefox.xpi"
      ;;
    chrome|edge)
      url=$(curl -sL "$RELEASE_URL" | grep -oE 'href="[^"]*chrome[^"]*\.zip"' | head -1 | cut -d'"' -f2)
      filename="prizma-chrome.zip"
      ;;
    safari)
      echo "Safari: Please install manually from GitHub releases"
      return 1
      ;;
    *)
      echo "Unknown browser: $browser"
      return 1
      ;;
  esac

  if [[ -z "$url" ]]; then
    echo "Could not find download URL for $browser"
    return 1
  fi

  echo "Downloading from $url..."
  curl -fSL "$url" -o "$filename"
  echo "Downloaded: $filename"
}

install_firefox() {
  local xpi="$1"
  echo "Installing on Firefox..."
  firefox --install-global-extension "$(pwd)/$1" 2>/dev/null || \
  firefox --install-extension "$(pwd)/$1" 2>/dev/null || \
  echo "Please install manually: Open Firefox -> Add-ons -> Install Add-on from File -> Select $1"
}

install_chrome_edge() {
  local zip="$1"
  echo "Installing on Chrome/Edge..."
  unzip -o "$zip" -d prizma_extension
  echo "Unpacked to prizma_extension/"
  echo "To install:"
  echo "  1. Open chrome://extensions/ or edge://extensions/"
  echo "  2. Enable 'Developer mode'"
  echo "  3. Click 'Load unpacked' and select the 'prizma_extension' folder"
}

main() {
  echo "=== Prizma AdBlocker Auto-Installer ==="
  echo "Repository: https://github.com/muhammetodosks/prizma"
  echo ""

  local browser=$(detect_browser)
  echo "Detected browser: $browser"

  if [[ "$browser" == "unknown" ]]; then
    echo "Could not detect browser. Please specify: firefox, chrome, edge, or safari"
    read -p "Enter browser (firefox/chrome/edge/safari): " browser
  fi

  echo "Downloading latest release for $browser..."
  download_latest "$browser" || exit 1

  case $browser in
    firefox) install_firefox "prizma-firefox.xpi" ;;
    chrome|edge) install_chrome_edge "prizma-chrome.zip" ;;
    safari) echo "Please install manually from: https://github.com/muhammetodosks/prizma/releases" ;;
    *) echo "Unsupported browser: $browser" ;;
  esac

  echo ""
  echo "=== Installation Complete ==="
  echo "Prizma AdBlocker is now installed!"
  echo "Check the extension icon in your browser toolbar."
  echo "Visit https://adblock-tester.com/ to verify 100/100 score."
}

main "$@"
