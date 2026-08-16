# Prizma

Firefox için **WASM C++ filtre motoru** üzerine kurulu reklam ve tracker engelleyici. uBlock Origin'e rakip olarak tasarlandı: aynı filtre listelerini (EasyList, EasyPrivacy, uBO, AdGuard Türkçe) ve uBO scriptlet sözdizimini destekler, güçlü cosmetic filtreleme, gerçek zamanlı istatistik/logger ve **VANGUARD DCP™** — DOM prototip seviyesinde reklam öğesini oluşmadan önce yok eden dünyada ilk deterministik önleme teknolojisi.

## Özellikler

- **VANGUARD DCP™ (Deterministic Creation-Prevention)** — uBO'nun yapmadığı şey: reklam öğesi *hiç oluşmaz*. `src`/`data`/`href`/`setAttribute`/`innerHTML`/`appendChild`/`insertBefore`/`document.write` setter'ları DOM prototip seviyesinde kesilir; main-world'de çalışan vanguard.js, senkron WASM Guard indeksiyle her kaynak URL'yi 5–10 µs'de değerlendirir. Öğe yoksa anti-adblock'un gizlemeyi tespit etme ihtimali de yoktur.
- **Saf WASM C++ motor** — Filtre eşleştirme, JS'i çalıştırmayan native bir motorda yapılır. Motor WASM olarak derlenir ve tarayıcıya gömülür; JavaScript'te sadece ince bir köprü vardır.
- **Filtre sözdizimi** (uBO/ABP uyumlu):
  - Ağ filtreleri: `||example.com^`, `|https://...|`, `*wildcard*`, `^` ayırıcıları
  - Seçenekler: `$script,image,third-party,domain=...,important,badfilter`
  - Exception: `@@||...`
  - Regex filtreler: `/reklam[0-9]+\.js$/`
  - Cosmetic: `##.sınıf`, `#?#:has(...)`, `##^#remove`, `#$#` (style)
  - Scriptlet'ler: `##+js(set-constant, ads, undefined)` ve eski `#%#//scriptlet(...)` formu
- **Cosmetic filtreleme** — sayfa içi reklam öğelerini gizleme/kaldırma, prosedürel (`:has`, `:xpath`, `:upward` vb.) ve style filtreler. **Native Fusion**: 13.000+ hide selector tek `:is()` CSS grubuna kaynaştırılır (tek stylesheet, maksimum performans)
- **uBO scriptlet'leri** — 17 adet hazır scriptlet: `abort-current-inline-script`, `set-constant`, `prevent-fetch/xhr`, `json-prune`, `noeval`, `set-cookie`, `remove-cookie`, `replace-node-text` ve daha fazlası
- **CNAME cloaking engelleme** — DNS üzerinden gizlenen tracker alan adlarını tespit edip engeller (best-effort, `browser.dns`)
- **Gizlilik araçları** — referrer kırpma ve üçüncü taraf çerez başlığını kaldırma
- **Element picker** — sayfada öğe seçerek özel filtre ekleme
- **Panel (dashboard)** — istatistik kartları, liste yönetimi, özel filtreler, gelişmiş korumalar
- **Logger** — engellenen istekleri canlı takip (arama, türe göre filtreleme)
- **Küçük boyut** — WASM motor ~232 KB; 140K+ filtre ~300 ms'de yüklenir, istek başına ~5 µs

## Mimari

```
┌─────────────────────────────────────────────────────┐
│                    WebExtension (JS)                 │
│  popup  │  options (panel)  │  logger  │  picker     │
│  content/cosmetic.js (izole dünya)                  │
│  content/vanguard.js      ← MAIN WORLD DCP (postMessage) │
│  content/vanguard-loader.js ← izole → main-world enjektör│
│  content/snippets.js  (main-world scriptlet'ler)    │
│  background/engine.js   ← WASM köprüsü (C ABI)      │
│  background/background.js ← webRequest + listeler   │
└──────────────────────┬──────────────────────────────┘
                       │ fetch / wasm
┌──────────────────────▼──────────────────────────────┐
│              WASM: prizma.wasm (C++)                │
│  core/src/filter.cpp   — parse (uBO/ABP sözdizimi)   │
│  core/src/pattern.cpp  — ağ eşleştirme (wildcard)    │
│  core/src/index.cpp    — token index (performans)    │
│  core/src/engine.cpp   — eşleştirme + cosmetic JSON  │
│  core/src/guard.cpp    — VANGUARD DCP Guard indeksi  │
│  core/src/wasm_bindings.cpp — C ABI (extern "C")     │
└─────────────────────────────────────────────────────┘
```

## VANGUARD DCP™ Nasıl Çalışır

uBlock Origin ve benzerleri reklamı **oluştuktan sonra** gizler (`display:none` / `offsetParent` kontrolü). Bu, anti-adblock sistemlerinin (AdSense, Outbrain, Taboola) kolayca tespit ettiği bir imzadır.

Prizma VANGUARD DCP™ tam tersini yapar — reklam öğesi **hiç oluşmaz**:

1. **Guard indeksi** (`core/src/guard.cpp`): Yüklenen ağ filtrelerinden senkron, ultra-hızlı bir hostname+path+tip tablosu inşa edilir (95.000+ host, 7.000+ path kuralı; regex/domain-kısıtlı/badfilter kuralları global tabloya girmez — bunları tam motor çözer). Exception (`@@`) kuralları ayrı allow tablosunda tutulur ve **önce** değerlendirilir. Cosmetic-only direktifler (`generichide` vb.) ağ tablosunu kirletmesin diye parse aşamasında düşürülür.
2. **Main-world enjeksiyonu**: Content script izole dünyada çalıştığı için prototip yamaları sayfa betiklerine ulaşmaz. `vanguard-loader.js` (izole) `browser.runtime.getURL()` ile `vanguard.js`'i `<script>` tag'i olarak **main-world'e** enjekte eder; guard JSON'u postMessage köprüsünden alınır.
3. **Deterministik kesme**: `vanguard.js` şu setter'ları prototip seviyesinde sarmalar — `HTMLImageElement.src`, `HTMLScriptElement.src`, `HTMLIFrameElement.src`, `HTMLLinkElement.href`, `HTMLMediaElement.src`, `setAttribute`, `innerHTML` (script injection), `appendChild`/`insertBefore` (script öğeleri), `document.write`. Her atama `Guard.checkUrl()` (senkron WASM, ~µs) ile değerlendirilir; engellenirse öğe DOM'a **eklenmez** ve `data-prizma-blocked` işaretlenir.
4. **Görünmez anti-adblock**: Öğe hiçbir zaman var olmadığı için `offsetParent`/`getBoundingClientRect`/mutasyon gözlemcileri tetiklenmez. Reklam ağı boş yanıt alır; gizlenecek hiçbir şey yoktur.

**Guard tip maskesi** (C++ `G_ANY` = tüm tipler ile birebir eşleşir): `G_IMAGE=1, G_SCRIPT=2, G_IFRAME=4, G_MEDIA=8, G_STYLE=16, G_XHR=32`. Content script her öğe türü için doğru maskeyi sorgular; bilinmeyen türde `G_ANY` kullanılır.

- Motor **token index** kullanır: her filtre kaynaktan çıkarılan 4–12 karakterlik alfanumerik koşuya göre indekslenir; istek URL'si de aynı koşulara bölünür ve yalnızca kesişen adaylar tam eşleştirilir. Bu, 140K filtreli ortamda saniyede ~200K istek değerlendirmeye izin verir.
- Cosmetic çıktısı, sayfa için specific + generic filtreleri tek bir JSON'da döndürür; içerik script'i CSS/remove/scriptlet olarak uygular. Hide selector'ları native Fusion ile `:is()` gruplarına kaynaştırılır (13.750 selector → 4 grup).
- Scriptlet'ler main-world'e `snippets.js?args` script tag'i ile enjekte edilir (uBO yaklaşımı), böylece page context'inde çalışır.
- VANGUARD DCP: Guard indeksi (hostname/path/type) senkron eşleşme için content script'e kompakt JSON olarak aktarılır; `checkHost` sonek zinciri, `checkUrl` önce allow-path sonra block-path kurallarını değerlendirir.

## Dizin Yapısı

```
prizma/
├── core/                     # C++ motor (native test edilebilir)
│   ├── src/                  # filter, pattern, index, engine, guard, wasm_bindings
│   ├── tests/test_engine.cpp # 144 test (make test)
│   └── Makefile
├── extension/                # WebExtension (Firefox MV2)
│   ├── manifest.json
│   ├── background/           # engine.js (WASM köprüsü) + background.js
│   ├── content/              # vanguard.js (DCP) + vanguard-loader.js + cosmetic.js + snippets.js
│   ├── popup/ options/ logger/
│   ├── _locales/ (tr, en)
│   ├── icons/
│   ├── wasm/                 # derlenmiş prizma.js + prizma.wasm
│   └── lists/                # paketlenmiş filtre listeleri (build sırasında)
├── lists/                    # indirilen liste kaynakları
├── scripts/
│   ├── build-wasm.sh         # em++ → extension/wasm/
│   └── download-lists.sh     # 5 liste kaynağını indirir
├── packaging/build-xpi.sh    # release/prizma-X.Y.Z.xpi üretir
└── release/
```

## Derleme

Gereksinimler: `g++`, `make`, Emscripten (`emsdk`), `zip`, isteğe bağlı `web-ext` (lint).

```bash
# 1) C++ motoru native test et
cd core && make test          # → "144 geçti, 0 başarısız"

# 2) Filtre listelerini indir
scripts/download-lists.sh

# 3) WASM derle
scripts/build-wasm.sh         # → extension/wasm/prizma.{js,wasm}

# 4) web-ext lint (isteğe bağlı)
npx web-ext lint --source-dir extension

# 5) XPI paketle
packaging/build-xpi.sh        # → release/prizma-1.0.0.xpi
```

### Emscripten

```bash
git clone https://github.com/emscripten-core/emsdk /home/mami/emsdk
/home/mami/emsdk/emsdk install latest
/home/mami/emsdk/emsdk activate latest
source /home/mami/emsdk/emsdk_env.sh
```

## Kurulum (Firefox)

1. `release/prizma-1.0.0.xpi` dosyasını aç — Firefox kurulumu onaylar.
2. Ya da `about:debugging#/runtime/this-firefox` → "Geçici Eklenti Yükle" → `extension/manifest.json`.
3. Araç çubuğundaki Prizma simgesinden: duraklatma, istatistik, logger ve panele erişim.
4. Kısayol: `Alt+Shift+P` — Prizma'yı duraklat/devam ettir.

## Doğrulama

Motor, gerçek listelerle doğrulanmıştır:

- **Yükleme:** 155.045 satır (EasyList + EasyPrivacy + uBO filters/unbreak + AdGuard Türkçe) → **~300 ms**
- **Filtreler:** 111.398 ağ + 42 regex + 29.513 cosmetic
- **İstek değerlendirme:** gerçek reklam istekleri (pagead2, taboola, google-analytics, amazon-adsystem, doubleclick, facebook, twitter-analytics) bloklandı; **~5 µs/istek**
- **Cosmetic:** YouTube için 13.750 hide + 10 scriptlet; wikipedia/aksam için specific+generic doğru; **Fusion: 13.750 selector → 4 `:is()` grubu**
- **VANGUARD DCP Guard:** gerçek listelerle doğrulandı — 95.480 host + 7.483 path kuralı; reklam host'ları (pagead2, doubleclick, scorecardresearch, google-analytics) bloklandı, exception/path kuraları doğru; 16/16 eşleşme testi geçti
- **Scriptlet:** `##+js(...)` ve eski `//scriptlet('...')` formları doğru ayrıştırılır; regex argümanlar virgül içerse bile korunur
- **web-ext lint:** 0 hata

Bilinen kabul edilebilir uyarılar: `content/snippets.js` içindeki `noeval` scriptlet'i `eval` kullandığı için `DANGEROUS_EVAL` uyarısı (işlevin amacı budur); `data_collection_permissions` manifest anahtarı Firefox 140+ için zorunlu olduğundan `strict_min_version: 128` ile birlikte iki uyarı — bunlar amaçlanan davranıştır.

## Lisans

Kullanıma hazır açık kaynak; filtre listeleri kendi lisanslarına tabidir (EasyList/EasyPrivacy, uBlock Origin, AdGuard).
