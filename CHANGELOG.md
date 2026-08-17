# Sürüm Geçmişi

## 1.0.0 (2026-08-17)

İlk kararlı sürüm — uBO/AdGuard uyumlu filtre motoru + VANGUARD DCP.

### Filtre Listeleri

- EasyList + EasyPrivacy + uBO filters/unbreak + AdGuard Türkçe (13.txt) + **AdGuard Tracking Protection (3.txt)** eklendi
- `lists/prizma-hardcore.txt`: 37+ ad/tracker domain + toplu test listesi + generic kosmetik (##.ad, ##.banner, ##.sponsored)
- Toplam: 357.136 satır → 303.468 ağ + 71 regex + 33.255 kosmetik filtre
- `download-lists.sh`: 13.txt (AdGuard Türkçe, 8 değil) ve 3.txt (Tracking) düzeltildi, `--force` ile bayat önbellek kırıldı

### VANGUARD DCP

- Guard indeksi: 151.729 host + 13.285 path kuralı + 145 exception
- Guard export cap 4 MB → **32 MB** (AdGuard Tracking guard'ı 5,8 MB'a şişiriyordu, 4 MB JSON'u kesiyordu)
- Guard JSON background'da serialize önbelleği (webBlockedHosts değişene kadar aynı JSON döner)
- Content script: guard artık 6 kez değil **2 kez** tazelenir (6,1 MB JSON'u 6× parse etmek ana thread'i donduruyordu)
- Path kuralları host bazlı indekslendi (13.285 lineer tarama → Map lookup)
- URL öznitelikleri genişletildi: src/data/data-src/data-srcset/href/data-original/data-lazy-src/data-lazy/data-srcs/data-url/data-href/poster/data-poster/xlink:href/data-bg/data-background/background/imagesrcset/srcset (19 adet)
- `checkSrcset()` + `patchSrcsetSetter()` eklendi (srcset="url 1x, url 2x" listeleri)
- `scanInserted()` appendChild/insertBefore sonrası DOM taraması

### Motor (WASM)

- Eşleşme LRU cache (4.096 giriş, `matchCacheKey` ile çürütme)
- `main_frame` **asla third-party sayılmaz** (B11): `documentUrl` boşken `||site^$third-party` kuralları ana sayfayı engelliyordu → "hiçbir site açılmıyor" bug'ı kalıcı düzeltildi
- `syncRegexes()`: lookahead/lookbehind regex'leri native RegExp'e devredilir (71 regex)
- CNAME cloaking: `browser.dns` ile best-effort takip

### UI / Popup

- Manuel liste güncelleme butonu (`btnUpdateLists`, URL'si olmayan yerel liste atlanır)
- Debug modu toggle — eşleşmeyen istekler de log'a yazılır (`debug: true`)
- Güncelleme sıklığı 24 saat → **6 saat**

### Hata Düzeltmeleri

- engine.js: `\u{...}` → `\U...` unicode escape (kalıcı)
- engine.js: matchCacheKey / guardCache TDZ çift tanım
- vanguard.js: `m.get(k) | mask` iki dalda da aynıydı (B8)
- popup: null URL'li update liste isteği atlanır
- fetch type T_FETCH (256) eklendi (önceden 4096'ya düşüyordu); object_subrequest T_OBJECT (32)

### Doğrulama

- Node/WASM harness: 16/16 eşleşme testi, 26 sitenin ana sayfası açılıyor, kosmetik cap OK
- `node --check` tüm JS, `bash -n` scripts, `make test` (144 test)
- Canlı Firefox (web-ext run) + `release/prizma-1.0.0.xpi`