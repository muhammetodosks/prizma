# Sürüm Geçmişi

## 1.1.0 (2026-08-18)

d3ward %100 hedefi tamamlandı — hardcore listesi tek başına 131/131 d3ward domainini kapsar.

### Filtre Listeleri

- **`prizma-hardcore.txt` B5 bölümü (93 domain)**: d3ward.github.io testinin tüm ad/tracker domainleri eklendi (mobil/OEM: tiktok, unityads, xiaomi, oppo, hicloud, samsung, apple, yandex + analitik/örn: adcolony, mouseflow, freshmarketer, luckyorange, bugsnag, sentry, facebook pixel, twitter ads, linkedin, pinterest, reddit events, wp.com)
- Hardcore listesi artık **tek başına** d3ward'ın 131 domaininin tamamını kapsar (d3host listesi olmasa bile %100)
- d3ward doğrulama: type=256/16/8/128 hepsinde **131/131 (%100)**

### Motor (WASM)

- **`prizma_last_rule()` çöp okuma düzeltildi (B15)**: `g_out` statik tamponu başlangıçta sıfırlanmıyordu → hiç eşleşme yokken bile rastgele bellek artığı dönebiliyordu. `prizma_new()` ve eşleşme-yok durumunda tampon temizlenir; background `extractRemoveParam` artık kural metni yerine çöp görüp ana sayfayı gereksiz engelleyemez
- `g_out` temizleme kodunda gereksiz dallanma kaldırıldı (hacky kod temizliği)

### Doğrulama

- Regresyon harness (v3): **30/30 geçti** — d3ward 4×131, adblock-tester kritik 27/27, google.com pas (uBlock uyumlu), CYC 21/21 (18 blok + 3 bilinçli pas), mainframe 10/10 (prune ≠ cancel), exception, B15 temizlik
- "19040" gizemi çözüldü: kural metni değil, `g_out` tamponunun bellekteki adresiydi (0x4A60). Harness'ler artık `readCStr` ile pointer'ı string'e çevirir

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
- **`$badfilter` option eşleşmesi düzeltildi (B12)**: `is_badfilter_match` yalnızca pattern+anchor karşılaştırıyordu; option'lar (type_bits, party, domains, match_case, is_exception) yok sayılıyordu. Bu yüzden `||optimizely.com^$badfilter` gibi ublock-unbreak kuralları, prizma-hardcore'daki `||chartbeat.com^$third-party` gibi FARKLI option'lı kuralları da iptal ediyordu → test sitelerinde 7 domain engellenemiyordu. Artık badfilter yalnızca birebir aynı option kümesini iptal eder (uBO uyumlu). 5 senaryoluk harness ile doğrulandı: `$3p`+plain-bf→engellenir, plain+plain-bf→iptal, farklı tip→engellenir, aynı option→iptal.

### Filtre Listeleri (ek, P6 logger analizi)

- `||one.plus.one^` (Google çerez eşleme), `||adsense.google.com^`, `||adservice.google.com.tr^`, `||google.com/adsense/static/^$third-party` (path kısıtlı)
- `||ddiem.com^`, `||kuik.com^`, `||licdn.com^` (Cover Your Tracks tracker'ları)
- `||log.optimizely.com^` / `||cdn.optimizely.com^` / `||rum.optimizely.com^` / `||logx.optimizely.com^` (badfilter ile çakışmayan subdomain formu)
- `lists/prizma-hardcore.txt` artık git'te tutulur (elle bakılan özel liste; .gitignore'dan çıkarıldı)

### Doğrulama

- Node/WASM harness: 16/16 eşleşme testi, 26 sitenin ana sayfası açılıyor, kosmetik cap OK
- adblock-tester.com ağları tamamı engellendi; d3ward/turtlecute 16/16; Cover Your Tracks 25/26 (tek istisna `js.stripe.com` — ödeme işlemcisi, bilinçli engellenmez)
- Badfilter fix sonrası tam listede 5/12 → **12/12** domain engelleniyor
- `node --check` tüm JS, `bash -n` scripts, `make test` (144 test)
- Canlı Firefox (web-ext run) + `release/prizma-1.0.0.xpi`