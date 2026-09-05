# Prizma AdBlocker - Installation Guide

## 🚀 Quick Install (Auto)

```bash
# Auto-detect browser and install
curl -fsSL https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash

# Or specify browser
curl -fsSL https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash -s -- firefox
curl -fsSL https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash -s -- chrome
curl -fsSL https://raw.githubusercontent.com/muhammetodosks/prizma/main/scripts/install.sh | bash -s -- edge
```

## 📥 Manual Installation

### Firefox (Recommended - Full MV2 Support)
1. Download latest: [prizma-firefox.xpi](https://github.com/muhammetodosks/prizma/releases/latest/download/prizma-firefox.xpi)
2. Open Firefox → `about:addons` → Gear icon → "Install Add-on From File"
3. Select `prizma-firefox.xpi` → Install

**Alternative (Developer Mode):**
1. `about:debugging` → "This Firefox" → "Load Temporary Add-on"
2. Select `extension/manifest.json` from source

### Chrome / Edge / Brave / Vivaldi / Opera (Manifest V3)

**Option 1: Chrome Web Store (Coming Soon)**
- Search "Prizma AdBlocker" in Chrome Web Store

**Option 2: Developer Mode (Current)**
1. Download: [prizma-chrome.zip](https://github.com/muhammetodosks/prizma/releases/latest/download/prizma-chrome.zip)
2. Unzip: `unzip prizma-chrome.zip -d prizma_extension`
2. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
3. Enable **"Developer mode"** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `prizma_extension` folder

**Edge Note:** Same process as Chrome - Edge uses the same Chromium engine.

### Safari (macOS/iOS)
1. Download from [GitHub Releases](https://github.com/muhammetodosks/prizma/releases)
2. Open `.xcodeproj` in Xcode
3. Build & sign with your Apple Developer certificate
4. Enable in Safari → Preferences → Extensions

### Firefox Android
1. Install Firefox Nightly or Firefox Beta
2. Go to `about:config` → `xpinstall.signatures.required` = `false`
3. Install XPI from GitHub releases

## 🧪 Verification

After installation, verify Prizma works:

1. **adblock-tester.com** → Should show **100/100**
2. **turtlecute.org** → 0 external resources loaded
3. **coveryourtracks.eff.org** → Only 1st-party resources
3. **d3ward.github.io** → 100% blocking

## 🔧 Troubleshooting

### "Extension not compatible"
- Firefox: Use Firefox 128+ (MV2 support)
- Chrome/Edge: Version 88+ required (Manifest V3)

### YouTube/TikTok/Twitter UI broken
- Ensure you're on v1.2.1+ (has platform exceptions)
- Check `prizma-hardcore.txt` has exception rules

### Low blocking score
1. Update filter lists: Popup → "Update Lists"
2. Enable "Aggressive Mode" in popup
3. Check `prizma-hardcore.txt` is enabled

## 🛠 Developer Installation

```bash
# Clone and build
git clone https://github.com/muhammetodosks/prizma.git
cd prizma
scripts/download-lists.sh -f
scripts/build-wasm.sh
./packaging/build-xpi.sh  # Firefox
./scripts/build-all.sh     # All platforms
```

## 📦 Release Artifacts

| Browser | Format | Download |
|---------|--------|----------|
| Firefox | `.xpi` (MV2) | [prizma-firefox.xpi](https://github.com/muhammetodosks/prizma/releases/latest/download/prizma-firefox.xpi) |
| Chrome/Edge | `.zip` (MV3 unpacked) | [prizma-chrome.zip](https://github.com/muhammetodosks/prizma/releases/latest/download/prizma-chrome.zip) |
| Safari | Xcode Project | [Source](https://github.com/muhammetodosks/prizma/releases/latest) |

## 🔗 Links
- **GitHub**: https://github.com/muhammetodosks/prizma
- **Releases**: https://github.com/muhammetodosks/prizma/releases
- **Issues**: https://github.com/muhammetodosks/prizma/issues
- **Discussions**: https://github.com/muhammetodosks/prizma/discussions
