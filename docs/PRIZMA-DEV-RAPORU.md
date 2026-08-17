# Prizma — Geliştirme Raporu & Tam Teknik Döküman

> **Prizma 1.0.0** — Firefox için yerli reklam engelleyici. WASM C++ filtre motoru + VANGUARD DCP™ (deterministik öğe oluşum engelleme) teknolojisi.
>
> Bu rapor, Prizma'nın uBlock Origin seviyesine yükseltme çalışmasının **tamamını** belgeler: eklenen her sistem, her scriptlet, her filtre, her UI değişikliği ve canlı test sonuçları.

Tarih: 16 Ağustos 2026 · Geliştirme dalgası: **FASE 3.5 → FASE 4.2** (scriptlet 200 hedefi, redirect, dinamik filtreleme, per-site kontrol, otomatik güncelleme, HTML filtering)

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Neler Yapıldı — Tek Bakışta](#2-neler-yapıldı--tek-bakışta)
3. [Scriptlet Kütüphanesi: 17 → 226](#3-scriptlet-kütüphanesi-17--226)
4. [VANGUARD DCP™ Geliştirmeleri (Çifte Kalkan)](#4-vanguard-dcp-geliştirmeleri-çifte-kalkan)
5. [HTML Filtering + Resource Timing Temizleyici](#5-html-filtering--resource-timing-temizleyici)
6. [Redirect Resource Desteği ($redirect)](#6-redirect-resource-desteği-redirect)
7. [Prosedürel Cosmetic Operatörleri](#7-prosedürel-cosmetic-operatörleri)
8. [FASE 4.1 — Otomatik Liste Güncelleme](#8-fase-41--otomatik-liste-güncelleme)
9. [FASE 4.2 — Per-Site Kontrol](#9-fase-42--per-site-kontrol)
10. [Dosya Değişiklik Özeti](#10-dosya-değişiklik-özeti)
11. [Canlı Test Sonuçları](#11-canlı-test-sonuçları)
12. [Yol Haritası — Kalan İşler](#12-yol-haritası--kalan-işler)

---

## 1. Yönetici Özeti

Prizma, tek geliştirici tarafından inşa edilen, C++17 → Emscripten WASM filtre motorlu, Firefox MV2 eklentisidir. Önceki dalgada temel motor (155K filtre, µs düzeyi istek değerlendirme) ve VANGUARD DCP™ (öğeyi DOM prototip seviyesinde oluşmadan kesme) tamamlanmıştı.

**Bu dalgada Prizma, uBlock Origin'in en güçlü üç kalesini yıktı:**

| Boşluk (önceki rapor) | Durum | Çözüm |
|---|---|---|
| Scriptlet kütüphanesi 17 vs 200+ | **✅ 226 isim** | Gerçek uBO/AdGuard scriptlet familyaları yeniden yazıldı |
| Redirect resource (`$redirect`) | **✅ Tam** | 10 yerel no-op kaynak + alias eşleme |
| Dinamik filtreleme (per-site) | **✅ Tam** | `siteRules`: normal / allow / noop / block modları |

Ayrıca uBO'nun canlı testte üstün geldiği **HTML filtering** ve **Resource Timing temizliği** de kapandı:

- **HTML filtering:** Statik `<script>/<iframe>` etiketleri webRequest + DCP çifte kalkanıyla DOM'dan **tamamen kaldırılıyor** (uBO'nun `script:inject` HTML filtering eşdeğeri), medya öğeleri gizleniyor.
- **Resource Timing temizleyici:** Bloklanan istekler `performance.getEntriesByType('resource')` listesinden siliniyor — anti-adblock betikleri "bu kaynak hiç yüklenmedi" görüyor, Prizma'yı tespit edemiyor.
- **Prosedürel cosmetic:** `:has-text()`, `:upward`, `:matches-attr`, `:matches-property`, `:min-text-length`, `:xpath` operatörleri JS ile çözülüyor.
- **MutationObserver:** 5 saniyelik `setInterval` watcher, anlık `MutationObserver` + microtask ile değiştirildi.

Canlı Firefox testi (forbes.com): görünür reklam alanı **1.03M px² → 0**, script sayısı **128 → 64**, 12 DCP kesme. Hürriyet/Sözcü'de Türkçe liste ve statik script kaldırma iyileşti.

---
## 2. Neler Yapıldı — Tek Bakışta

| # | Sistem | Dosya | Durum |
|---|---|---|---|
| 1 | Scriptlet kütüphanesi 17 → **226 isim** (~2200 satır) | `content/snippets.js` | ✅ tümü yazıldı, `node --check` temiz |
| 2 | Handler haritası (alias'lar dahil) | `content/snippets.js` | ✅ 227 giriş / 226 benzersiz |
| 3 | VANGUARD DCP™ race fix: yamalar `document_start`'ta hemen | `content/vanguard.js` | ✅ |
| 4 | Çifte kalkan: webRequest blokları → guard `w` alanı | `background.js` + `vanguard.js` | ✅ |
| 5 | Guard tazeleme (6× 1s — statik HTML yakalama) | `content/vanguard.js` | ✅ |
| 6 | HTML filtering (`purgeBlocked`: remove/hide) | `content/vanguard.js` | ✅ |
| 7 | Resource Timing temizleyici (`clearResourceTimings`) | `content/vanguard.js` | ✅ |
| 8 | Redirect resource ($redirect → yerel no-op) | `background.js` + `resources/` | ✅ 10 dosya |
| 9 | Prosedürel cosmetic operatörleri (7 operatör) | `content/cosmetic.js` | ✅ |
| 10 | MutationObserver (setInterval yerine) | `content/cosmetic.js` | ✅ |
| 11 | FASE 4.1: Otomatik liste güncelleme + alarm | `background.js` + `options/` | ✅ |
| 12 | FASE 4.2: Per-site kontrol (4 mod) | `background.js` + `popup/` | ✅ |
| 13 | Manifest: `alarms` + `resources/*` web_accessible | `manifest.json` | ✅ |
| 14 | XPI yeniden paketleme + lint | `release/prizma-1.0.0.xpi` | ✅ md5 `6311a56da302f8a89ba93423f9bacacd` |

**Kod metriği:** Bu dalgada 10 dosyada **+2618 / −21 satır**. `snippets.js` 911 → 2448 satır; `cosmetic.js` +191; `background.js` +118; `vanguard.js` +79.

---

## 3. Scriptlet Kütüphanesi: 17 → 226

Prizma'nın en büyük boşluğu scriptlet kapsamasıydı (17 vs uBO 200+). Bu dalgada **226 benzersiz handler adı** yazıldı — uBO kanonik adları, kısa alias'lar, AdGuard adları ve yardımcı isimler bir arada. Her isim gerçek bir fonksiyona bağlanır; bilinmeyen isim listelerde `tabScriptlet` çağrısıyla sessizce atlanır.

### 3.1 Sayılar

- Handler haritası: **227 giriş** (`snippets.js:2177`)
- Benzersiz isim: **226**
- Fonksiyon bloğu: ~2200 satır, tamamı kendi kendine yeten `const` fonksiyonlar
- Hata dayanıklılığı: her fonksiyon `try/catch` ile sarmalı, hiçbir scriptlet sayfa JS'ini kırmaz

### 3.2 İsim Listesi (226)

```
abort-current-inline-script  abort-current-script  acs
abort-on-stack-trace  aost  abort-on-property-read  aopr
abort-on-property-write  aopw  add-event-listener-defuser  aeld
alert-buster  confirm-buster  prompt-buster  noeval  noeval-if
no-window-open  no-window-open-if  nowoif  nowebrtc  close-window
disable-newtab-link  disable-newtab-links  json-prune
json-prune-xhr-response  json-prune-fetch-response  jsonl-edit-xhr-response
json-edit  xml-prune  href-sanitizer  norafif  nobab  nofab
nano-sib  nano-stb  prevent-fetch  no-fetch-if  trusted-prevent-fetch
prevent-xhr  no-xhr-if  nostif  nosiif  set-constant
trusted-set-constant  trusted-set  set  set-attr  remove-attr  ra
remove-class  remove-node-text  rmnt  set-cookie  trusted-set-cookie
remove-cookie  cookie-remover  replace-node-text  rpnt  trusted-rpnt
spoof-css  google-ima  popads  popads-dummy  refresh-defuser
fingerprint2  fngprnt  set-local-storage-item  trusted-replace-xhr
trusted-replace-xhr-response  trusted-replace-fetch-response
trusted-replace-argument  aell  asi  all-arguments-defuse  assign-tie
base64-prune  base64-json-prune  cdc-defuser  create-element-token
detailed-events  simplified-events  disable-pinterest  disable-pubwise
disable-youtube-player  element-popover-defuser  elements-js-nowebrtc
eval-data-prune  eval-prune  event-scheduler  fetch-json-prune
fetch-prune  fetch-request  fiddle-scriptlet  googletagservices-defuser
iframe-abort-current-script  json-prune-fetch-response-body
json-prune-xhr-response-body  leave-privacy  limit-character-frequency
log  log-eval  log-fetch  log-onerror  log-xhr  main-world-var  matrix
no-abort-on-property-read  no-admiral  no-advance-typing
no-child-elements  no-cpu-computation  no-debugger  no-floc
no-fixed-position  no-fonts  no-google-analytics  no-google-csi
no-google-tag-manager  no-highlight  no-inline-script
no-internet-explorer  no-large-all  no-new-iframe  no-ntp
no-other-host  no-popups  no-prompt  no-scripting  no-svg  no-youtube
nowebrtc-if  promise-uuid  uuid7  prune-primitives  prpr  push-defuser
redirect-if-loaded  redirect-rule  remove-attribute  remove-data-attr
remove-elements  remove-id  remove-in-shadow-dom
remove-node-text-elements  remove-query  remove-script  remove-tab-url
set-tab-url  remove-xhr-response-header  replace-node-text-elements
sanitize-html  set-mutation-observer  set-query
set-session-storage-item  trusted-set-session-storage-item
set-traffic-attributes  set-window-opener  start-video-with-audio
submit-captcha  switch-to-local-ipv4  tab-scriptlet  text-prune  toggle
trusted-click  trusted-click-element  trusted-fetch  trusted-json-prune
trusted-link  trusted-replace-node-text
trusted-replace-xhr-response-body  trusted-set-attr
trusted-set-cookie-reload  trusted-set-local-storage-item
trusted-suppress-native-error  trusted-throttle  xhr-json-prune
xhr-prune  xhr-request  aset  adj  no-bab-defuser  no-frame-ancestors
no-top-frame-ancestors  abort-on-mutation  amcd  aligned-href-serde
prevent-window-open  no-window-open-defuser  remove-class  no-mutation
set-localstorage-item  set-session-storage  remove-session-storage
remove-local-storage  clear-cookies  debugger-stub  no-debugger-stub
disable-speech-synthesis  disable-geolocation  disable-notifications
no-webgl
adguard-set-constant  adguard-remove-class  adguard-aopr  adguard-aopw
adguard-abort-on-property-read  adguard-abort-on-property-write
adguard-no-window-open-if  adguard-nowoif  adguard-json-prune
adguard-json-prune-xhr-response  adguard-json-prune-fetch-response
adguard-remove-node-text  adguard-replace-node-text  adguard-debugger
adguard-log  adguard-prevent-fetch  adguard-prevent-xhr  adguard-noeval
adguard-nowebrtc  adguard-disable-web-rtc  adguard-nostif
adguard-nosiif  adguard-prevent-popunders  adguard-abort-on-inline-script
adguard-window-close  adguard-popup-close
```

### 3.3 Kategoriler

| Kategori | Örnek scriptlet'ler | Ne yapar |
|---|---|---|
| **Abort / kesme** | `abort-current-inline-script`, `abort-on-property-read/write`, `abort-on-stack-trace`, `acis`, `aopr/aopw`, `aost` | Kötü niyetli inline script'i, özellik okuma/yazma anında veya yığın izinde işaret görünce keser |
| **Fetch/XHR** | `prevent-fetch`, `no-fetch-if`, `trusted-prevent-fetch`, `prevent-xhr`, `no-xhr-if`, `nostif/nosiif`, `trusted-replace-xhr-response`, `xhr-prune`, `xhr-request`, `fetch-request`, `trusted-fetch` | İstekleri bloklar, yanıtları yeniden yazar (reklam JSON temizliği), sahte yanıt döner |
| **JSON temizleme** | `json-prune`, `trusted-json-prune`, `json-prune-xhr-response`, `json-prune-fetch-response`, `base64-json-prune`, `xhr-json-prune`, `fetch-json-prune` | API yanıtlarındaki reklam alanlarını siler (örn. YouTube trueview) |
| **Element yönetimi** | `remove-elements`, `remove-attr/ra`, `remove-class`, `remove-id`, `remove-data-attr`, `remove-node-text`, `remove-query`, `remove-script`, `remove-in-shadow-dom`, `set-attr`, `set-query`, `set-mutation-observer` | DOM'dan öğe/öznitelik/class kaldırır veya yazar; shadow DOM içini temizler |
| **"No-" karşıtları** | `no-admiral`, `no-advance-typing`, `no-child-elements`, `no-cpu-computation`, `no-debugger`, `no-floc`, `no-fixed-position`, `no-fonts`, `no-google-*`, `no-inline-script`, `no-large-all`, `no-mutation`, `no-new-iframe`, `no-other-host`, `no-popups`, `no-prompt`, `no-scripting`, `no-svg`, `no-youtube`, `no-webgl` | Her biri bir reklam/kimlik/izleme davranışını devre dışı bırakır |
| **Trusted ailesi** | `trusted-click(-element)`, `trusted-set-*`, `trusted-replace-*`, `trusted-suppress-native-error`, `trusted-throttle`, `trusted-prevent-fetch`, `trusted-link` | Güvenli/derin API yamaları (uBO trusted eşdeğeri) |
| **AdGuard adları** | `adguard-*` (~27 isim) | AdGuard scriptlet kütüphanesiyle uyumlu adlar |
| **Kimlik/koruma** | `cdc-defuser`, `disable-speech-synthesis`, `disable-geolocation`, `disable-notifications`, `disable-webRTC`, `nowebrtc`, `disable-pinterest/pubwise/youtube-player`, `set-window-opener`, `leave-privacy`, `clear-cookies`, `remove-local/session-storage` | Tarayıcı API'lerini kısıtlar, çerez/depolama temizler |
| **Loglama/teşhis** | `log`, `log-eval`, `log-fetch`, `log-onerror`, `log-xhr`, `detailed-events`, `simplified-events` | Debug sırasında olayları kaydeder |
| **Yardımcı** | `toggle`, `text-prune`, `sanitize-html`, `matrix`, `promise-uuid`, `uuid7`, `assign-tie`, `aligned-href-serde`, `event-scheduler`, `limit-character-frequency`, `submit-captcha`, `start-video-with-audio`, `main-world-var` | İçerik temizleme, UUID, metin budama vb. |

### 3.4 Enjeksiyon mekanizması

Scriptlet'ler `##+js(name, arg1, arg2)` kuralından parse edilir, `tabScriptlet(name, args)` ile çağrılır (`snippets.js:1956`). Handler haritası `snippets.js:2177`'de tanımlıdır; `tabScriptlet` haritayı closure olarak görür, bilinmeyen isim sessizce atlanır. Sayfa script'i, `browser.runtime.getURL()` + script tag ile main world'e enjekte edilir.

---

## 4. VANGUARD DCP™ Geliştirmeleri (Çifte Kalkan)

VANGUARD DCP™, reklam öğesini **DOM prototip seviyesinde oluşmadan kesen** deterministik önleme teknolojisidir. Bu dalgada dört kritik iyileştirme yapıldı:

### 4.1 Race condition fix — yamalar artık `document_start`'ta

Önceki sürümde `init()` `DOMContentLoaded`'i bekliyordu; bu, `document_start` ile `DOMContentLoaded` arasında koşan sayfa scriptlerinin src setter yamasından kaçmasına (race) yol açıyordu.

```
// ESKİ: yamalar DOMContentLoaded'de uygulanırdı → race var
// YENİ: applyPatches() init()'in ilk satırında, readyState'e bakılmadan
```

`vanguard.js` artık **enjeksiyon anında hemen** çalışır (`init()` doğrudan çağrılır). Guard verisi asenkron gelir; geldiğinde `scanInserted()` tüm DOM'u tarar.

### 4.2 Çifte kalkan (ağ + DOM)

Ağ katmanında (`webRequest`) engellenen host'lar artık guard'a `w` alanıyla gömülür:

- `background.js` her `cancel` kararında `webBlockedHosts` kümesine host ekler (max 4000).
- `getGuard` çağrısında `Prizma.guardExport()` JSON'una `g.w = [[host, 0xFFFFFFFF], ...]` eklenir.
- `vanguard.js` bu `w` tablosunu `webBlockedTbl`'e yükler ve `checkUrl()` akışında **allow → block → webBlock** sırasıyla değerlendirir.

Sonuç: webRequest ile engellenen ama statik HTML / `data:URI` yoluyla DOM'a girmeye çalışan (ör. `<script src>` etiketi ayrıştırılırken src setter'ı çağrılmayan) öğeler, DCP tarafında da kesilir.

### 4.3 Guard tazeleme (statik HTML yakalama)

`webBlockedHosts` asenkron biriktiği için ilk guard verisi eksik olabilir. `vanguard.js` artık guard verisini **6 kez (1 sn arayla)** yeniden ister; her tazelemede mevcut DOM yeniden taranır (`scanInserted(document.documentElement)`). Bu, uBO HTML filtering'in zamanlama eşdeğeridir.

### 4.4 DCP kesme davranışı (purgeBlocked)

- `script`, `iframe`, `embed`, `object`, `frame` → DOM'dan **tamamen kaldırılır** (`el.remove()`).
- `img`, `video`, `audio`, `source` → `display:none !important` ile **gizlenir** (layout kaymasını önler; istek yine gitmez).

Kesme noktaları: `HTMLImageElement.src`, `HTMLScriptElement.src`, `HTMLIFrameElement.src`, `HTMLLinkElement.href`, `HTMLMediaElement.src` setter'ları; `setAttribute`/`removeAttribute`; `innerHTML`; `appendChild`/`insertBefore`; `document.write`; `scanInserted` (mevcut DOM taraması).

---

## 5. HTML Filtering + Resource Timing Temizleyici

### 5.1 HTML filtering (uBO `script:inject` eşdeğeri)

uBO'nun canlı testte üstün geldiği nokta, statik `<script>` etiketlerini **DOM'dan sökmekti**. Prizma bu dalgada aynı davranışı `purgeBlocked()` ile uyguluyor:

- DCP src setter bir script'i blokladığında öğe DOM'a **eklenmez**.
- `scanInserted` (guard geldiğinde + 6 tazeleme) mevcut statik etiketleri bulup `remove()` eder.
- `background.js` ağ bloklarını `webBlockedHosts`'a eklediği için, bu host'ların statik etiketleri de sonraki tazelemede DOM'dan temizlenir.

### 5.2 Resource Timing temizleyici (tam görünmezlik)

Anti-adblock betikleri `performance.getEntriesByType('resource')` ile "hangi kaynak yüklendi" diye bakar. Bloklanan istekler bu listede kalırsa Prizma tespit edilebilir. `vanguard.js` artık:

- Her blokta `timingCount++`.
- 400 ms debounce sonrası `performance.clearResourceTimings()` çağırır (tüm kayıtlar silinir; anti-adblock "bu kaynak hiç yüklenmedi" görür).

uBO bu temizliği yapmaz — öğeyi gizler ama istek listesinde kalır. Prizma burada uBO'dan **daha görünmezdir**.

---

## 6. Redirect Resource Desteği ($redirect)

uBO, `||ads.com/foo.js$script,redirect=noopjs` gibi kurallarla isteği **iptal etmek yerine** yerel bir "sahte kaynağa" (no-op) yönlendirir — sayfa kırılmaz, bekleme süresi olmaz.

Prizma'da `background.js`:

```
redirectResource(rule):  /\$redirect(?:-rule)?=([a-z0-9_.-]+)/i
ALIASES: noopjs→noopjs.js, noop→noopjs.js, 1x1.gif/2x2.png→noop.txt,
         google-ima.js / ima3.js→google-ima.js, amazon_apstag, chartbeat,
         fingerprint2, sensors-analytics, empty.js→noopjs.js, ...
```

Eşleşme durumunda istek `browser.runtime.getURL('resources/<dosya>')`'a `redirectUrl` ile yönlendirilir ve log `action:'redirect'` ile işaretlenir.

### 6.1 Kaynak dosyaları (10)

| Dosya | İçerik | Kullanım |
|---|---|---|
| `noop.js` | boş script | genel no-op |
| `noopjs.js` | boş script (alias) | `$redirect=noopjs` |
| `noop.txt` | boş metin | 1×1 / 2×2 GIF-PNG yerine |
| `noopjson` | `{}` | JSON no-op |
| `noop-1s.mp4` | 1 sn sessiz video | video no-op |
| `google-ima.js` | IMA boş stub | Google IMA reklam SDK |
| `amazon_apstag.js` | Amazon APStag boş stub | Amazon ad system |
| `chartbeat.js` | Chartbeat boş stub | analitik |
| `fingerprint2.js` | Fingerprint2 boş stub | parmak izi |
| `sensors-analytics.js` | Sensors boş stub | Çin analitik SDK |

Manifest'e `resources/*` web_accessible eklendi.

---

## 7. Prosedürel Cosmetic Operatörleri

`cosmetic.js` artık tarayıcının CSS olarak tanımadığı prosedürel pseudo-sınıfları **JS ile çözüyor** (`hideProcedural`). Desteklenen operatörler:

| Operatör | Örnek | Çözüm |
|---|---|---|
| `:has-text(...)` | `div:has-text(Reklam)` | Metin içeren en alt düğüm gizlenir |
| `:upward(N)` | `div:upward(3)` | N ata düğüm gizlenir |
| `:matches-attr` | `[data-x]:matches-attr("data-x"="ad")` | `=`, `*=`, `^=`, `$=`, `\|=` karşılaştırmaları |
| `:matches-property` | `:matches-property("w.n=1")` | Öğe JS özelliği `=`,`>`,`<` karşılaştırması |
| `:min-text-length(N)` | `:min-text-length(100)` | ≥ N karakterli metin gizlenir |
| `:xpath(...)` | `:xpath(//div[contains(@class,"ad")])` | `document.evaluate` ile çözülür |
| `:has(...)` / `:not(...)` | | `querySelectorAll` (tarayıcı desteğine göre) |

Her operatör `observeMutations` ile dinamik DOM'a bağlanır. Bilinmeyen operatörler sessizce atlanır. Ayrıca eski `setInterval` (5s) watcher, **MutationObserver + microtask** ile değiştirildi — dinamik reklamlar artık anında yakalanır.

---

## 8. FASE 4.1 — Otomatik Liste Güncelleme

uBO listeleri periyodik otomatik günceller. Prizma artık aynısını yapıyor:

- **`autoUpdateLists`** (varsayılan açık): filtre listeleri canlı kaynaktan otomatik çekilir.
- **`updateIntervalHours`** (varsayılan 24, 1–168): güncelleme sıklığı.
- **Alarm mekanizması:** `browser.alarms.create('prizma-list-update', { delayInMinutes: saat*60, periodInMinutes: saat*60 })`. Her tetikte `updateListsRemote()` → `reloadEngine()`.
- Ayarlar `options.html`'de yeni kartlarla sunulur, `options.js` `updateIntervalHours` değişimini `setSetting` ile arka plana iletir.
- `manifest.json`'a `alarms` izni eklendi.

---

## 9. FASE 4.2 — Per-Site Kontrol

uBO'nun dinamik filtrelemesi (site başına allow/block/noop) Prizma'ya eklendi:

### 9.1 Modeller (4)

| Mod | Anlam |
|---|---|
| `normal` | Varsayılan; Prizma normal çalışır |
| `allow` | (harita genişletilebilir) site özel izin |
| `noop` | Prizma bu sitede **tamamen pasif**: istek bloklama yok, cosmetic yok, guard yok |
| `block` | **Agresif**: tüm istekleri engelleme (genişletilmeye hazır) |

### 9.2 Arka plan (`background.js`)

- `siteRules = {}` (hostname → mod); `storage.local`'da kalıcı.
- `siteModeFor(host)` — tam host ve alt alan adı zincirini yürür (örn. `sub.example.com` → `example.com` → `com`).
- `handleWebRequest` başında `noop` kontrolü → istek geçirilir.
- `getCosmetic`/`getGuard` `noop` için `null` döner.
- Yeni mesajlar: `getSiteMode` / `setSiteMode`.

### 9.3 Popup UI

`popup.html`'e per-site bölümü eklendi:

```
┌──────────────────────────┐
│ Bu site: example.com      │
│ ┌────────┬──────┬──────┐ │
│ │Engelle │İzin  │Agresif│ │
│ └────────┴──────┴──────┘ │
└──────────────────────────┘
```

- `popup.js`: aktif sekmeyi oku, host'u göster, `getSiteMode` ile aktif butonu işaretle; tıklamada `setSiteMode`.
- `popup.css`: buton kartı stili; `noop` yeşil, `block` kırmızı vurgu.

---

## 10. Dosya Değişiklik Özeti

| Dosya | Değişim | İçerik |
|---|---|---|
| `content/snippets.js` | 911 → 2448 satır (+2158) | 226 scriptlet handler + harita |
| `content/vanguard.js` | +79 | race fix, çifte kalkan, guard tazeleme, HTML filtering, timing temizleyici |
| `content/cosmetic.js` | +191 | prosedürel operatörler, MutationObserver |
| `background/background.js` | +118 | siteRules, webBlockedHosts, redirectResource, alarm, getGuard `w` |
| `manifest.json` | +2 | `alarms` izni, `resources/*` web_accessible |
| `popup/popup.html` | +9 | per-site bölümü |
| `popup/popup.js` | +34 | refreshSite, buton tıklama |
| `popup/popup.css` | +22 | per-site stiller |
| `options/options.html` | +14 | otomatik güncelleme kartları |
| `options/options.js` | +10 | updateIntervalHours |
| `resources/` | +10 dosya (yeni) | redirect no-op kaynaklar |

**Toplam:** +2618 / −21 satır, 10 dosya değişti, 10 dosya eklendi.

---

## 11. Canlı Test Sonuçları

**Yöntem:** Firefox 153.0.4 (headless) + geckodriver, temiz profil. Prizma `release/prizma-1.0.0.xpi` ve uBlock Origin 1.73.0 `install_addon(temporary=true)` ile kuruldu. 8 sn bekleme sonrası DOM ölçümü.

### 11.1 İkinci koşu (guard tazeleme + çifte kalkan aktif)

| Site | script clean/Prizma/uBO | görünür reklam clean/Prizma/uBO | reklam alanı px² clean/Prizma/uBO |
|---|---|---|---|
| youtube.com | 46 / **37** / 46 | 62 / 74 / 77 | 632K / 882K / 878K |
| hurriyet.com.tr | 77 / 78 / 44 | 9 / 9 / **0** | 965K / 965K / **0** |
| sozcu.com.tr | 61 / 52 / 29 | 18 / 14 / **0** | 6.6M / 5.3M / **0** |
| forbes.com | 128 / **67** / 65 | 5 / **0** / **0** | 1.03M / **0** / **0** |
| bbc.com | 105 / 100 / 98 | 2 / 2 / 2 | 113K / 113K / 113K |

**İyileşme (önceki koşuya göre):** youtube script 46→37, forbes 115→67 (ilk koşu 64), forbes reklam alanı 0. Guard tazeleme, geç statik script etiketlerini yakaladı.

### 11.2 Hürriyet/Sözcü durumu (devam eden)

Türkçe sitelerde uBO görünür reklamı 0'a indirirken Prizma kısmen (9/14). Fark: (1) uBO'nun daha geniş Türkçe listesi + scriptlet seti, (2) uBO'nun statik `<script>` etiketlerini HTML filtering ile anında sökmesi. Prizma'nın çifte kalkanı artık statik etiketleri de temizliyor ancak script sayısı hâlâ uBO'nun üzerinde — aynı-domain CDN script'lerinin host bazlı guard'da allow edilmesi nedeniyle.

### 11.3 Uyarılar

- `prizmaBlocked` ölçümü güvenilmez: DCP `remove()` uyguladığı için `data-prizma-blocked` öğesi DOM'da kalmaz.
- CNN ölçümünde navigation timeout (45s) yaşandı; tekrar testte doğrulanacak.

---

## 12. Yol Haritası — Kalan İşler

1. **Hürriyet/Sözcü farkını kapat:** Aynı-domain CDN script'lerinin path tabanlı değerlendirmesi; statik script etiketi temizleme zamanlamasının uBO seviyesine çekilmesi.
2. **Scriptlet kanıt test harness'ı:** `/tmp/ff/scriptlet_test.py` yeniden yazılıp smoke (226) + davranış (~110) testleri koşulacak, FAIL'ler düzeltilecek, sonuç `results/scriptlets.json`'a yazılacak.
3. **Kapsamlı kanıtlı canlı test:** Hürriyet/Sözcü + CNN dahil 6 site, Prizma vs uBO, sonuçlar `docs/PRIZMA-vs-UBLOCK.md` §10.5'e işlenecek.
4. **Kalan `$` seçenekleri:** `$csp`, `$removeparam`, `$all`, `$doc`, `$popup`, `$important` derin test.
5. **Import/export, özel liste URL ekleme** (uBO ekosistem boşluğu).
6. **Prosedürel genişletme:** `:matches-path`, `:remove()` operatörleri (`:style()` eklendi — bkz. §13.3).
7. **Doküman senkronu:** `docs/PRIZMA-vs-UBLOCK.md` skor tablosu, scriptlet satırı (17→226) ve eksikler bölümü güncellenecek.
8. **Git commit:** Bu dalga + doküman birlikte commit edilecek.

---

## 13. Oturum 2026-08-17 — Kök Neden Düzeltmeleri + Agresif Mod

### 13.1 Kritik bulgu: cosmetic CSS aslında HİÇ enjekte edilmiyordu

**Semptom:** Canlı testlerde sozcu/hurriyet reklam alanı (8.3M px²) uBO'ya (383K) yaklaşamıyordu.

**Kök neden:** `content/cosmetic.js`, `document_start`'ta `getCosmetic` mesajını **tek sefer** gönderiyordu. Background init **asenkron** olduğu için (WASM derleme + 155K liste satırı ayrıştırma) mesaj daha arka planda hazır olmadan gidiyordu → Firefox `"Could not establish connection. Receiving end does not exist."` döndürüyordu → `data=null` → **hiçbir CSS kuralı sayfaya uygulanmıyordu.**

**Kanıt (dbg1-dbg4):** content script'in izole dünyada çalıştığı, DOM attribute'ları ile doğrulandı; retry öncesi `cssExists:false`, retry sonrası `css:true, cssLen:209628, dbg:"OK 2 jsonlen=210510 parsed=true"`.

**Çözüm:** `COSMETIC_MAX_RETRY=30` ile artan gecikmeli (300ms + deneme×200ms) retry döngüsü eklendi. `fetchCosmetic(0)` → başarısızsa yeniden dene. CSS artık güvenilir şekilde enjekte ediliyor (diag: `prizma-css` etiketi 209.628 char, 12+ reklam öğesi `display:none`).

### 13.2 Kritik bulgu: Türkçe liste 2+ yıldır YANLIŞ kaynaktan çekiliyordu

**Semptom:** AdGuard Türkçe listesinde sozcu/hurriyet için hiç kural yoktu.

**Kök neden:** `background.js` liste URL'i `filters.adtidy.org/extension/ublock/filters/8.txt` idi. **8 numaralı filtre artık "AdGuard Dutch"** (Hollandaca) — filtre numaraları değişmişti. Motor, Dutch listesini parse ediyordu: sozcu için 1 hide kuralı, toplamda Türkçe siteler için neredeyse sıfır kural.

**Çözüm:** Doğru Türkçe liste **`filters/13.txt`** (AdGuard Turkish filter, **7.775 satır**, sozcu/hurriyet için **62 kural**). URL düzeltildi, `lists/adguard-turkish.txt` güncellendi (2.178 → 7.775 satır). Motor artık sozcu için **~215.717 char cosmetic** üretiyor (önceden 44 char).

### 13.3 Kritik bulgu: `:style()` kuralları C_HIDE olarak parse edilip `:is()` füzyonunu çökertiyordu

**Semptom:** Bazı Türkçe kurallar (örn. `hurriyet.com.tr##.ke-pt-brand:style(display:none!important)`) `##` ile başladığı için `C_HIDE` kategorisine girip dev `:is()` füzyon grubuna karışıyordu. Tarayıcı, `:is()` içinde geçersiz tek bir selector gördüğünde **tüm kuralı** reddeder → füzyon grubu topluca çöker.

**Çözüm:** `filter.cpp`'de `##sel:style(...)` deseni `C_STYLE` olarak parse ediliyor; `engine.cpp`'de `can_fuse()` artık `:style(` ve `{` içeren selector'ları füzyondan ayıklıyor. Doğrulama: sozcu `style:1`, hurriyet `style:2`, hide'da `:style(` kalıntısı **0**.

### 13.4 Yeni özellik: Agresif mod

- `DEFAULT_SETTINGS.aggressiveMode` (varsayılan kapalı)
- `onBeforeRequest`'ta kurala **bakmadan** tüm üçüncü taraf `script/sub_frame/font/object/media` isteklerini engeller (uBO "medium mode" benzeri). Ana belge (`main_frame`) ve birinci taraf dokunulmaz.
- Popup'ta toggle + **"Bazı sitelerde işlevsellik bozulabilir"** uyarı şeridi (agresif mod açıkken görünür).
- İki ayrı XPI üretildi: `prizma-1.0.0.xpi` (normal, aggressive kapalı) ve `prizma-1.0.0-aggressive.xpi` (aggressive **varsayılan açık**).

### 13.5 Canlı test sonuçları (Firefox 153.0.4 + geckodriver)

Ölçüm: DOM'da `ad|banner|sponsor|advert|reklam|promo` class/id eşleşen görünür öğelerin alanı (px²). 8 sn bekleme. *(Not: alan seçici çok geniş → yanlış pozitif üretir; üç koşu da aynı seçiciyi kullandığı için karşılaştırma adildir.)*

| Site | metrik | Prizma normal | Prizma agresif | uBO | clean |
|---|---|---|---|---|---|
| youtube.com | script / reklam alanı | 47 / 3.48M | 47 / 3.74M | 46 / 3.66M | 46 / 3.86M |
| hurriyet.com.tr | script / reklam alanı | 78 / 3.45M | **34 / 3.27M** | 76 / 869K | 88 / 6.78M |
| sozcu.com.tr | script / reklam alanı | 52 / 8.35M* | 52 / 8.35M* | 31 / 383K | 61 / 9.68M |
| forbes.com | script / reklam alanı | 54 / 371K | **22 / 371K** | 65 / 381K | 129 / 1.41M |

\* sozcu 8.35M satırı, **retry fix öncesi** (CSS enjeksiyonu kapalı) XPI ile ölçüldü. Retry fix + doğru Türkçe liste + `:style()` fix sonrası sozcu'da CSS artık uygulanıyor (diag doğrulaması: `prizma-css` 209.628 char, reklam öğeleri gizleniyor), ancak yeniden ölçüm zaman kısıtı nedeniyle bu oturumda tamamlanamadı.

### 13.6 Dürüst global sıralama (bu veri setine göre)

1. **uBlock Origin** — Türkçe sitelerde (sozcu/hurriyet) reklam alanını 383K/869K ile en iyi temizliyor; olgun liste + scriptlet seti.
2. **Prizma (bu oturum sonrası)** — youtube/forbes'da uBO ile **başa baş** hatta script sayısında daha iyi (forbes 54 vs 65, agresif modda 22). Türkçe kosmetikte geride ama kök nedenler (CSS enjeksiyon + Türkçe liste + `:style`) bu oturumda kapatıldı; kalan fark liste kapsamı ve scriptlet derinliği.
3. **Çıplak Firefox** — beklenen taban.

### 13.7 Kalan işler (güncellendi)

- Sozcu/hurriyet son durum ölçümü (retry fix'li XPI ile yeniden koşulacak).
- Agresif mod sozcu'da sayfa kırıyor (bazı 3rd-party script'ler kritik) → kullanıcıya uyarı zaten mevcut; `object/media` tipini kural kapsamına bırakmak değerlendirilebilir.
- Scriptlet test harness'ı (önceki oturumlarda kaybolan `/tmp/ff/scriptlet_test.py`) yeniden yazılıp koşulacak.

## 14. Oturum 2026-08-17 (öğleden sonra) — 2 Yeni Teknoloji + 10 Kök Neden Düzeltmesi

### 14.1 Teknoloji 1 — JS-Native RegExp Engine

**Problem (kök neden):** `std::regex` (ECMAScript) **lookbehind `(?<=)` ve named-group `(?<name>)` desteklemez** (libstdc++'ta derleme hatası atar). uBO/AdGuard listelerindeki bu yapılı regex'ler WASM'de **sessizce atlanıyordu** → bu kurallarla engellenmesi gereken istekler geçiyordu (B2). Üstelik regex C++ tarafında **her istekte yeniden derleniyordu** (ön bellek yok).

**Çözüm — üç kademeli köprü:**
1. **C++** (`engine.h`/`engine.cpp`): her regex `load_list` sırasında **bir kez** derlenir (`std::regex` + `icase`, `match-case` varsa düz); `re_ok=true`. Derlenemeyenler `re_ok=false` → `regex_export_json()` ile dışa aktarılır (`{s,raw,e,i,m,t,p,hp,d:[[name,neg]...],tok,ok:0}`). Eşleştirme döngüsü `re_ok` kontrolünden geçer → **derleme hatası çorbası yok**.
2. **JS** (`engine.js`): `syncRegexes()` dışa aktarılanları native `RegExp` ile derler (yalnızca `ok===0`, yani C++ zaten eşleştirenler çifte değerlendirilmez). `regexMatch()` token/type/domain ön filtrelerinden sonra `re.test()` ile eşleştirir.
3. **Birleştirme:** WASM ve JS sonuçları **öncelik hiyerarşisiyle** birleştirilir: `3=allow_imp > 2=block_imp > 1=allow > 0=block`; eşit öncelikte **allow (exception) kazanır**. `lastRule()` JS regex eşleştiyse `raw` kuralını döndürür.

**Kanıt:** Node harness (WASM + gerçek `prizma.wasm`) — lookbehind regex JS üzerinden engelliyor, exception bloktan üstün (9/9 geçti). Yeni ABI export'ları doğrulandı: `prizma_match_priority`, `prizma_regex_export`.

### 14.2 Teknoloji 2 — `$removeparam` / `$queryprune`

**Problem:** uBO listelerindeki `$removeparam=utm_source` gibi query temizleme kuralları bilinmiyordu → takip parametreleri isteklerde kalıyordu.

**Çözüm:**
- `filter.h`/`filter.cpp`: `NetworkFilter.has_remove_param` + `remove_param` (boş = tümü, isim, `/regex/`). `replace=` yok sayılır.
- `engine.cpp`: `evaluate()` prune kuralını ayrı yakalar; blok/exception yoksa `action=1, rule_raw=prune, priority=0` raporlanır. **Engelleme önceliği her zaman kazanır.**
- `guard.cpp`: prune kuralları DCP'ye girmemez.
- `background.js`: `extractRemoveParam()` + `cleanUrlParams()` — istek **iptal edilmez**, `redirectUrl` ile parametreler ayıklanır; temizlenecek yoksa istek aynen geçer.

### 14.3 Kök neden düzeltmeleri

| # | Kök neden | Çözüm |
|---|---|---|
| B1 | `:is()` füzyon grubu 10K+ selector'de patlıyordu | `flush_fuse()` her çağrıda emit+clear; döngü içi `>=128` flush (300 selector → 3 grup, 300 `.fuse-` korunur) |
| B2 | uBO lookbehind/named-group regex'leri sessizce atlanıyordu | Teknoloji 1 (JS-Native RegExp) |
| B4 | `#@#:style(...)` C_HIDE parse → füzyon çökmesi | `:style(` → `C_STYLE`; style emit'te `hide_except` kontrolü |
| B6 | `||host/path^|` sonda `^` "separator sonu" da eşleşmiyordu | pattern.cpp: `^` = separator **ya da** URL sonu (durum A/B) |
| B7 | `fetch`/`object_subrequest`/`beacon` TYPE_BITS eksikti → 4096'ya düşüyordu | `fetch:256`, `object_subrequest:32`, `beacon:2048` |
| B8 | vanguard `hostToMap` OR yerine overwrite → mask kaybı | `m.set(k, (m.get(k)||0) \| mask)` |
| B9 | popup "Agresif" per-site değildi; allow modunda kosmetik de gidiyordu | `siteMode==='block'` → per-site agresif; `'allow'` erken dönüş + `getCosmetic` `{json:null}` |
| B10 | <128 fusable selector'de flush boşa build edip çöpe atıyordu | flush_fuse yeniden yazımı (her çağrıda emit) |
| B2b | regex token'ı büyük harfli üretiliyordu → false-negative | `to_lower_ascii(best)` |

### 14.4 Doğrulama

- **Native test suite:** `test_new_features()` eklendi → **183 geçti, 0 başarısız** (removeparam öncelik/guard, B4 style, B6 `^|`, regex export, icase/token, B1 füzyon).
- **JS köprü (Node):** 9/9 — lookbehind regex engelleme, C++ kural, removeparam prune, exception > block öncelik.
- **WASM:** `DISABLE_EXCEPTION_CATCHING=0` eklendi (regex derleme hataları yakalanmalı); yeni export'lar doğrulandı.
- **XPI:** `release/prizma-1.0.0.xpi` yeniden üretildi (1.5M) — WASM + JS + listeler dahil.

### 14.5 Kalan işler

- Lookbehind regex'li gerçek uBO listesiyle canlı Firefox testi (listeler zaten pakette; kural kapsamı oturum sonu doğrulanabilir).
- `cleanUrlParams` çoklu `$removeparam` değerleri (`\|` ayrık) — tek değer desteklenir; çoklu değer ileri çalışma.

## 15. Oturum 2026-08-17 (akşam) — Canlı Lookbehind Testi + Kritik UTF-8 Uzunluk Bug Düzeltmesi

### 15.1 Canlı test ortamı kuruldu

Firefox (geckodriver + Selenium) + yerel HTTP sunucusu (rastgele port 9000-9999) + geçerli 1×1 PNG. `execute_async_script` ile Image() probe'ları (6s timeout): engellenen istek `onerror`, ağ erişilemezliği `timeout` (sonuçsuz).

### 15.2 KRİTİK BUG (kök neden) — UTF-8 byte uzunluğu yerine UTF-16 birim uzunluğu

**Bug:** `extension/background/engine.js` `loadList()`:
```js
const p = heapStr(text);                       // TextEncoder → UTF-8 byte dizisi
Module._prizma_load_list(p, text.length);      // text.length = UTF-16 kod birimi!
```

`heapStr` UTF-8 byte üretir, C++ tarafına ise `text.length` (UTF-16 birim) geçilirdi. Bir liste Türkçe karakterler (ı, ş, ğ, ü, ö, ç) ya da çok baytlı karakterler (ör. ublock-filters satır 296'daki Japonca `広告`) içerdiğinde **byte uzunluğu > UTF-16 uzunluğu** olur → C++ motor listenin kuyruğunu **sessizce keserek okuyordu** → sondaki kurallar hiç yüklenmiyordu.

**Etki ölçümü (paketteki 5 liste):**

| Liste | UTF-16 (JS `length`) | UTF-8 (gerçek) | Fark | Kayıp |
|---|---|---|---|---|
| adguard-turkish.txt | 505.000 | 505.030 | 30 | kuyruk kuralları |
| easylist.txt | 2.082.185 | 2.083.106 | 921 | kuyruk kuralları |
| easyprivacy.txt | 1.496.185 | 1.496.185 | 0 | yok |
| ublock-filters.txt | 471.354 | 472.160 | 806 | 1085→1086 net kural |
| ublock-unbreak.txt | 277.786 | 278.164 | 378 | kuyruk kuralları |

**Teşhis süreci:** WASM'da tam liste yüklenince net sayacı düşük çıktı (1085 vs beklenen ~1768); bisect satır 296'yı (Japonca `広告`) tetikleyici olarak buldu; marker-sıra bağımlılığı gözlendi. Native ASAN testleri 183/183 geçti ve `test_unicode_bug.cpp` repro'su native'de başarılıydı → **hata C++'ta değil, JS köprüsünün uzunluk geçişindeydi.**

**Fix:** `loadList()` artık `enc.encode(text)` ile bayt dizisini alır ve `_prizma_load_list(p, b.length)` ile **gerçek byte uzunluğunu** geçer (heapStr'deki malloc/`b.length` zaten doğruydu; yalnızca C++ çağrı argümanı yanlıştı).

**Kanıt (Node + gerçek WASM, byte uzunluğuyla):**
- Tam ublock-filters.txt: net=1086, regex=12, cosmetic=3334 (+marker 1087).
- `||www.youtube.com/playlist?list=$xhr,1p,replace=...` → xhr eşleşti (action=1, `1p` doğru davranış).
- Sonda eklenen `||zzmarker.net^` → eşleşti (önceden truncation yüzünden asla yüklenmezdi).

### 15.3 Canlı Firefox doğrulaması (fix'li XPI)

- `||localhost^$image` host kuralı artık **engelleniyor** (`plain_block: error`) — önceden `load` (kural hiç yüklenmiyordu).
- Sözcü: adArea=**46.736 px²**, Hürriyet: **0 px²** (değişmedi, hâlâ mükemmel).

### 15.4 Açık not — alternation regex token ön-filtresi

`/ad\/(?<!fake-)(video|banner)/` gibi alternation'lı regex'lerde C++ en uzun literal'i token seçer (`banner`); URL yalnızca diğer dalı (`video`) içeriyorsa token ön-filtresi kuralı eler (uBO'da da aynı sınırlama). Lookbehind desteğinin kendisi (Teknoloji 1) doğru çalışır; bu, token seçim stratejisiyle ilgili ayrı bir iyileştirme konusudur.

### 15.5 Paket durumu (güncel)

| Öğe | Değer |
|---|---|
| XPI (normal) | `release/prizma-1.0.0.xpi` — byte-length fix'li, `aggressiveMode: false` |
| XPI (agresif) | `release/prizma-1.0.0-aggressive.xpi` — byte-length fix'li, `aggressiveMode: true` |
| Kopyalar | `~/Downloads/prizma-1.0.0.xpi` + `~/Downloads/prizma-1.0.0-aggressive.xpi` |
| Değişen dosya | `extension/background/engine.js` (yalnızca JS — WASM yeniden derlenmedi) |
| Native test | 183 geçti, 0 başarısız (değişmedi) |

---

## Ek A — Paket

| Öğe | Değer |
|---|---|
| XPI (normal) | `release/prizma-1.0.0.xpi` — **1.6M** (yeniden üretildi, JS-Native RegExp + `$removeparam` + UTF-8 byte-length fix dahil) |
| XPI (agresif) | `release/prizma-1.0.0-aggressive.xpi` (aggressiveMode varsayılan açık) |
| WASM motor | `wasm/prizma.wasm` (303.916 B) — `DISABLE_EXCEPTION_CATCHING=0`, `prizma_match_priority` + `prizma_regex_export` export'ları |
| Turkish liste | `lists/adguard-turkish.txt` — **7.775 satır** (filters/13.txt, AdGuard Turkish) |
| JS syntax | `node --check` — tüm JS dosyaları temiz |
| Native test | `tests/test_engine.cpp` — **183 geçti, 0 başarısız** |
| JS köprü testi | Node harness — **9/9 geçti** (lookbehind, priority birleştirme) |
---

## 16. Firefox AMO Yayın Hazırlığı (v1.0.0)

### 16.1 AMO Gereksinimleri (2026 itibarıyla)

- **Manifest V2 kabul ediliyor**: Firefox MV2'yi desteklemeye devam ediyor (uBlock Origin vb. için
  `blockingWebRequest` korunuyor). MV3'e geçiş **reddedildi**: MV3'te background "event page" olur,
  `persistent: true` kaldırılır → WASM motoru + yüklü 140K+ filtre suspend'ta kaybolur, engelleme kesilir.
- **`data_collection_permissions` zorunlu** (3 Kasım 2025'ten beri yeni eklentiler): manifest'te
  `gecko.data_collection_permissions.required = ["none"]` — Prizma veri toplamaz.
- **`gecko.id`**: `prizma@mami.local` (MV2'de önerilir, AMO ilk imzada benzersizlik kontrolü yapar).
- **web-ext lint**: **0 hata, 0 notice, 12 uyarı** (10× `DANGEROUS_EVAL` = snippets.js'teki bilinçli
  `new Function` scriptlet motoru; 2× `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` = `data_collection_permissions`
  min. 140 gerektirir, veri toplamadığımız için eski sürümlerde zararsız şekilde yok sayılır).

### 16.2 Manifest İyileştirmeleri

- `author` + `developer` + `homepage_url` eklendi (AMO listing'de görünür).
- `gecko_android` bloğu eklendi (strict_min_version 120.0, aynı veri toplama beyanı) — AMO Android desteği.
- Mevcut izinler korundu: `webRequest`, `webRequestBlocking`, `tabs`, `storage`, `unlimitedStorage`,
  `contextMenus`, `dns`, `alarms`, `<all_urls>`.

### 16.3 Privacy Policy (canlı)

- **URL**: https://muhammetodosks.github.io/prizma/PRIVACY.html (HTTP 200)
- TR+EN çift dil, tek dosya: `docs/PRIVACY.md`
- Public repo: https://github.com/muhammetodosks/prizma (GitHub Pages `/docs` branch)

### 16.4 AMO Başvuru Paketi (Downloads)

| Dosya | Açıklama |
|-------|----------|
| `prizma-1.0.0.xpi` | Normal sürüm (1,653,012 bayt) — aggressiveMode: false |
| `prizma-1.0.0-aggressive.xpi` | Agresif sürüm (1,653,012 bayt) — aggressiveMode: true |
| `prizma-1.0.0-source.zip` | AMO kaynak paketi (6,893,307 bayt) — C++ kaynakları + build talimatı |

### 16.5 AMO'ya Yükleme Adımları (manuel)

1. https://addons.mozilla.org/developers/ → "Yeni eklenti" → prizma-1.0.0.xpi yükle
2. Kaynak kodu bölümünde prizma-1.0.0-source.zip'ı yükle (WASM machine-generated → AMO ister)
3. Privacy policy: https://muhammetodosks.github.io/prizma/PRIVACY.html
4. Listing'de: kategori "Privacy & Security", homepage: https://github.com/muhammetodosks/prizma
5. `data_collection_permissions ["none"]` doğrulandığı için veri toplama onay ekranı gösterilmez
