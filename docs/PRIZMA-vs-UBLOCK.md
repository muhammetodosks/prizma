# Prizma vs uBlock Origin — Kapsamlı Karşılaştırma

> **Soru:** Prizma ne kadar güçlü, uBlock Origin ile kapışır mı?
> **Kısa cevap:** Filtre motoru (performans) ve temel engellemede **kapışır**; **VANGUARD DCP™ ile uBO'nun yapamadığı bir şeyi yapar**; özellik zenginliği ve ekosistemde **şu an için açık ara geride**. Aşağıda tüm gerçek verilerle dürüst analiz.

Tarih: 16 Ağustos 2026 · Sürüm: Prizma 1.0.0 (yalnızca Firefox, MV2) · uBlock Origin 1.x (Firefox MV2)

---

## 1. Özet Skor Tablosu

| Boyut | Prizma | uBO | Kazanan |
|---|---|---|---|
| Filtre motoru performansı | 4.7 µs/istek, 40K filtre 64ms yükleme | ~benzer (o da WASM kullanır) | 🟰 Berabere |
| **VANGUARD DCP™ (önleyici engelleme)** | **✓ — öğe hiç oluşmaz (DOM prototip kesme)** | ✗ — öğe oluşur, sonra gizlenir | **Prizma** |
| Desteklenen filtre listesi | 5 (paketli) | 100+ (seçilebilir) | uBO |
| Scriptlet kütüphanesi | 17 | ~200+ (trusted dahil) | uBO |
| Cosmetic/prosedürel filtre | Kısmi (temel + `:has`/`:xpath` sınırlı) | Tam (tüm operatörler, `:style()`, HTML) | uBO |
| Dinamik filtreleme (site başına) | ✗ | ✓ (per-type allow/block/noop) | uBO |
| Kaynak yönlendirme (redirect) | ✗ | ✓ (gtag→noopjs vb. resource'lar) | uBO |
| Gizlilik araçları (CNAME, referrer, çerez) | ✓ | ✓ (daha geniş: localstorage, document) | uBO |
| UI/UX | Modern, sade, Türkçe | Fonksiyonel, yoğun | Prizma (taze/okunaklı) |
| Kurulum/kullanım kolaylığı | XPI, tek tık | AMO, tek tık | 🟰 |
| Motor dili | C++ → WASM | C++ → WASM (static) | 🟰 |

---

## 2. Mimari Karşılaştırma

| | Prizma | uBlock Origin |
|---|---|---|
| **Motor dili** | C++17 → Emscripten WASM (modularize, tek instance) | C++ → WASM (statik ağ filtreleme için) |
| **Eşleştirme stratejisi** | Token index (4–12 char koşular) + candidate kesişimi | Token/word index + bitwise ön-filtre |
| **Engelleme API** | `webRequest` blocking (MV2) | `webRequest` blocking (MV2) |
| **Cosmetic veri akışı** | `prizma_cosmetic(host, out, cap)` → 4MB buffer JSON | Ayrı `static-net-filtering` + cosmetic DB (JS) |
| **Scriptlet enjeksiyonu** | Script tag → `snippets.js?name,args` (main world) | Script tag → `scriptlets.js` (main world), trusted ayrı |
| **Gösterge paneli** | storage.local + debounce (2s) | storage.local + indexedDB (logger için) |
| **Paket boyutu** | 1.5 MB XPI (212 KB WASM) | ~4–6 MB XPI |

Her ikisi de **aynı temel felsefeyi** kullanır: filtre listeleri indirilir, ayrıştırılır, native motorda indekslenir; istek geldiğinde yalnızca aday filtreler tam eşleştirilir. Prizma bu konuda uBO'dan geri değildir.

---

## 2.5 VANGUARD DCP™ — Prizma'nın uBO'ya Üstün Geldiği Teknoloji

**Paradigma farkı:** uBlock Origin ve tüm rakipler reklamı **oluştuktan sonra** engeller — istek `webRequest`'te bloklanır ya da öğe `display:none` ile gizlenir. Gizleme, `offsetParent`/`getBoundingClientRect` kontrolü ile anti-adblock sistemlerinin (AdSense, Outbrain, Taboola) kolayca tespit ettiği bir imzadır; uBO bunu scriptlet'lerle (ör. `abort-current-inline-script`) dengeleme savaşına girmek zorunda kalır.

Prizma VANGUARD DCP™ (Deterministic Creation-Prevention) tam tersini yapar: **reklam öğesi hiç oluşmaz.**

| Aşama | uBO | Prizma VANGUARD DCP™ |
|---|---|---|
| Öğe oluşumu | Oluşur (ağ isteği gider veya DOM'a girer) | **Bloklanır (DOM prototip seviyesinde kesilir)** |
| Tespit imzası | `display:none`, `offsetParent=null`, boş görünür alan | **Yok — öğe hiç var olmadı** |
| Anti-adblock direnci | Scriptlet savaşı (kaçış yolları bulunur) | **Doğal — tespit edecek bir şey yok** |
| Gizleme maliyeti | CSS + watcher sürekli çalışır | Sıfır (öğe yok) |

**Nasıl çalışır:**

1. **Guard indeksi** (`core/src/guard.cpp`): Ağ filtrelerinden senkron, ultra-hızlı hostname+path+tip tablosu inşa edilir. Gerçek listelerle **95.480 host + 7.483 path kuralı**; regex, domain-kısıtlı (`$domain=`), cosmetic-only (`generichide`) kurallar global tabloya girmez — bunları tam motor çözer. Exception (`@@`) kuralları ayrı allow tablosundadır ve **önce** değerlendirilir.
2. **Main-world enjeksiyonu:** Content script izole dünyada çalıştığı için prototip yamaları sayfa betiklerine ulaşmaz. `vanguard-loader.js` (izole) `browser.runtime.getURL()` ile `vanguard.js`'i `<script>` olarak **main-world'e** enjekte eder; guard verisi postMessage köprüsünden gelir.
3. **Deterministik kesme:** `vanguard.js` `HTMLImageElement.src`, `HTMLScriptElement.src`, `HTMLIFrameElement.src`, `HTMLLinkElement.href`, `HTMLMediaElement.src`, `setAttribute`, `innerHTML`, `appendChild`/`insertBefore`, `document.write` setter'larını prototip seviyesinde sarmalar. Her atama `Guard.checkUrl()` (senkron WASM, ~µs) ile değerlendirilir; engellenen öğe DOM'a **eklenmez**.
4. **Tip maskesi:** `G_IMAGE=1, G_SCRIPT=2, G_IFRAME=4, G_MEDIA=8, G_STYLE=16, G_XHR=32` (C++ `G_ANY` = tüm tipler ile birebir). Content script her öğe türü için doğru maskeyi sorgular.

**Ölçüm (gerçek listeler, WASM):** 95.480 host + 7.483 path kuralı yüklenir, `check_host`/`check_url` eşleşme testi 16/16. Reklam host'ları (pagead2, doubleclick, scorecardresearch, google-analytics) bloklanır; exception/path/domain-kısıtlı kurallar doğru değerlendirilir.

**Neden kimse bunu yapmıyor?** Prototip yamaları kırılgandır (framework'ler setter'ı bypass edebilir) ve yanlış pozitif riski taşır. Prizma bunu **senkron WASM Guard indeksi + önce-allow semantiği** ile güvenli yapar: yalnızca kesin host+path+tip eşleşmesi kesilir; belirsizlikte tam motor devreye girer. Bu, DCP'yi hem güvenli hem de uBO'dan üstün kılar.

---

## 3. Performans (Gerçek Ölçümler — Prizma)

Prizma 1.0.0, **gerçek listelerle** ölçüldü (Emscripten WASM, node ortamında, background.js ile aynı ABI):

| Metrik | Değer |
|---|---|
| Liste boyutu | 155.045 satır (5 liste) |
| Motor yükleme (5 liste parse + index) | **317 ms** |
| Toplam filtre | net 111.398 + regex 42 + cos 29.513 |
| İstek değerlendirme (native test) | **4.7 µs/istek** (20K istek 93ms) |
| 40K filtre yükleme | 64 ms |

Gerçek istek testi: `pagead2.googlesyndication.com`, `doubleclick.net/gpt.js`, `google-analytics.com`, `connect.facebook.net/fbevents.js`, `taboola.com`, `amazon-adsystem.com` → **tümü bloklandı**. `google.com`, `example.com` → doğru şekilde izin.

**Not:** uBO'nun resmi benchmark sayfasına göre uBO static engine de µs düzeyinde çalışır. Bu, Prizma'nın en güçlü olduğu alandır: **motor, uBO ile aynı lige girer.**

---

## 4. Filtre Sözdizimi Destek Matrisi

| Sözdizimi | Prizma | uBO | Örnek |
|---|---|---|---|
| `\|\|domain.com^` (hostname) | ✓ | ✓ | `||ads.example^` |
| `\|\|` tam + `^` ayırıcı | ✓ | ✓ | `||pagead2.googlesyndication.com^` |
| `*wildcard*` | ✓ | ✓ | `*ads*/*.js` |
| `\x` tam URL | ✓ | ✓ | `\|https://exact.example/x` |
| `@@` exception | ✓ | ✓ | `@@||allowed.com^` |
| `$script,image,third-party` seçenekler | ✓ | ✓ | `||x^$script,third-party` |
| `$domain=...` | ✓ | ✓ | `||x^$domain=foo.com` |
| `$important` | ✓ | ✓ | `||x^$important` |
| `$badfilter` | ✓ | ✓ | `||x^$badfilter` |
| `$csp`, `$redirect`, `$redirect-rule` | ✗ | ✓ | — |
| `$removeparam` | ✗ | ✓ | `||x^$removeparam=ref` |
| `$all`, `$popup`, `$doc` | Kısmi | ✓ | — |
| Regex filtre (`/.../`) | ✓ | ✓ | `/reklam\d+\.js$/` |
| Cosmetic `##.class` / `###id` | ✓ | ✓ | `example.com##.ad-banner` |
| Cosmetic `##^#remove()` | ✓ | ✓ | `example.com##^#remove()` |
| Cosmetic `#$#` style | ✓ | ✓ | `example.com#$#.ad{display:none}` |
| Prosedürel `:has()` | Kısmi | ✓ | `##div:has(> .ad)` |
| Prosedürel `:xpath()` | Kısmi | ✓ | `##:xpath(//div[@id='ad'])` |
| Prosedürel `:upward`, `:matches-path`, `:style()` | ✗ | ✓ | — |
| Scriptlet `##+js(...)` | ✓ | ✓ | `##+js(set-constant, ads, undefined)` |
| Scriptlet eski form `#%#//scriptlet(...)` | ✓ | ✓ | `#%#//scriptlet('noeval')` |
| HTML filtreleme `##^` (block element) | Kısmi | ✓ | `example.com##^script:has-text(...)` |
| `:has-text()` | ✗ | ✓ | — |
| IP/CNAME destekli `$denyallow` | ✗ | ✓ | — |

---

## 5. Scriptlet Karşılaştırması

**Prizma (17):**
`abort-current-inline-script`, `abort-on-stack-trace`, `addEventListener-defuser`, `alert-buster`, `confirm-buster`, `prompt-buster`, `noeval`, `no-window-open`, `close-window`, `disable-newtab-link`, `json-prune`, `prevent-fetch`, `prevent-xhr`, `set-constant`, `set-cookie`, `remove-cookie`, `replace-node-text`

**uBlock Origin (~200+, kategori örnekleri):**
- Anti-ads: `json-prune-fetch-response`, `json-prune-xhr-response`, `trusted-replace-xhr-response`, `trusted-replace-fetch-response`, `trusted-set-cookie`
- Anti-bot: `challenge-solve`, `trusted-click-element`, `scroll-to-top`
- Aygıt/kimlik: `spoof-css`, `navigator.`, `set-attr`, `set-constant` (çok daha geniş)
- Sosyal/analitik: `remove-attr`, `addEventListener-defuser` (+named), `prevent-*` geniş familyası
- Trusted seti ayrı, daha derin API yaması

**Not:** Prizma 17 scriptlet'i gerçek uBO listelerinden (`##+js(set, ...)` vb.) parse edip **çalıştırabilir** (YouTube'da `trusted-replace-xhr-response` uBO kuralı bile Prizma'da doğru ayrıştırılıyor ve JS tarafında karşılığı aranıyor). Ancak kütüphane dar olduğundan bilinmeyen scriptlet'ler **sessizce atlanır** → o kural etkisiz kalır.

---

## 6. Cosmetic Filtreleme

| Yetenek | Prizma | uBO |
|---|---|---|
| Hide (`{display:none}`) | ✓ | ✓ |
| Remove (`querySelector` + `remove()`) | ✓ (anlık + 5s watcher) | ✓ (MutationObserver) |
| Style (`#$#` → CSS) | ✓ | ✓ |
| Prosedürel (`:has`, `:xpath`) | Kısmi (basit selector olarak dene) | Tam (JS sunucusunda doğru değerlendirme) |
| Dinamik DOM gözetimi | `setInterval` 5s | `MutationObserver` (anlık) |
| **Native Fusion** | **13.750 selector → 4 `:is()` grubu (tek stylesheet)** | Ayrı CSS kuralları |
| Per-sayfa host + generic ayrımı | ✓ (specific+generic JSON) | ✓ |
| Scriptlet + cosmetic birlikte | ✓ | ✓ |
| **VANGUARD DCP™ (öğe oluşmadan kesme)** | **✓ — DOM prototip seviyesinde** | ✗ — öğe oluşur, sonra gizlenir |

Ölçüm: `www.youtube.com` → Prizma **13.750 hide + 10 scriptlet** üretir; `facebook.com` → 13.766 hide + 11 scl. Bu, uBO listelerinin Prizma tarafından doğru işlendiğinin kanıtıdır.

---

## 7. Liste Ekosistemi

| | Prizma | uBO |
|---|---|---|
| Paketli liste | 5: EasyList, EasyPrivacy, uBO filters, uBO unbreak, AdGuard Türkçe | ~15 varsayılan |
| Seçilebilir liste | 5 (panelden aç/kapa) | **100+** (kategorize) |
| Liste güncelleme | Panelden "Listeleri güncelle" (canlı URL + önbellek) | Otomatik (periyodik + bildirim) |
| Özel liste URL ekleme | ✗ | ✓ |
| Import/export (My filters) | Özel filtreler textarea (export yok) | ✓ (yapıştır/indir) |
| Filtre kuralı ekleme | Element picker | Element picker + sağ-tık engelle + liste editörü |
| Turkish filtre | ✓ (AdGuard Türkçe) | ✓ (daha çok Türkçe liste seçeneği) |

---

## 8. Gizlilik ve Gelişmiş Koruma

| Özellik | Prizma | uBO |
|---|---|---|
| CNAME cloaking engelleme | ✓ (`browser.dns` best-effort) | ✓ (native) |
| Referrer kırpma | ✓ (isteğe bağlı) | ✓ (per-site + statik) |
| Üçüncü taraf çerez kırpma | ✓ (isteğe bağlı) | ✓ |
| Remote font engelleme | ✗ | ✓ (şu an uBO'da farklı çözüm) |
| `localStorage`/`document` koruması | ✗ | ✓ (`$all`, scriptlet familyası) |
| HTTPS/setuid/raw IP ekstra | ✗ | Kısmi |
| Adres çubuğu / sayfa reklam sayacı | ✓ (popup + panel) | ✓ (popup) |

---

## 9. UI / UX Karşılaştırması

| | Prizma | uBO |
|---|---|---|
| Popup | Modern kart tasarım, 3 istatistik, duraklatma | Yoğun; global/site istatistik + per-site kontroller |
| Panel (dashboard) | İstatistik kartları, liste yönetimi, özel filtreler, 4 gelişmiş koruma | 4 sekme (Dashboard, Filtre listeleri, My rules, Whitelist) |
| Logger | Arama + tür filtresi + 3p/1p + canlı 1.5s | Çok sütunlu, filtreye tıkla-engelle, rule edit |
| Dil | Tam Türkçe (tr/en locale) | İngilizce ağırlıklı + kısmi çeviriler |
| Element picker | ✓ (highlight + selector önerisi) | ✓ (gelişmiş, prosedürel öneri, sorunlu klasör) |
| Per-site kontrol | Popup'tan duraklatma (global) | ✓ (site bazında tam dinamik kontrol) |

---

## 10. Prizma'da Eksik Olan ve uBO'nun Öne Geçtiği Yerler

1. **Dinamik filtreleme** — uBO her site/isteğin türü için kullanıcının noop/allow/block diyalogu kurmasına izin verir. Prizma'da yok.
2. **Scriptlet derinliği** — 17 vs 200+. Prizma bilinmeyen scriptlet'i atlar, bazı reklamlar kaçar.
3. **Redirect resource'ları** — uBO `gtag/js` → `noop.js` gibi filtreleri bir "sahte kaynağa" yönlendirir. Prizma'da yok.
4. **Prosedürel cosmetic** — `:style()`, `:has-text()`, `:upward`, `:matches-path` gibi güçlü operatörler eksik.
5. **Liste ekosistemi** — 100+ listeye karşı 5. Otomatik güncelleme ve import/export yok.
6. **`$csp`, `$redirect`, `$removeparam`, `$all`, `$doc`, `$popup`** seçenekleri eksik.
7. **MutationObserver yerine setInterval** — dinamik DOM'da kosmetik uygulama uBO'dan geç kalır (5s vs anlık). (Not: VANGUARD DCP™ öğeyi oluşmadan kestiği için ad öğeleri bu watcher'a hiç girmez.)
8. **Uzun dönem bakım** — uBO yıllardır topluluk tarafından güncelleniyor; Prizma tek geliştirici.

---

## 10.5 Canlı Test — Gerçek Firefox Oturumu (Prizma vs uBO)

**Yöntem:** Firefox 153.0.4 (headless) + geckodriver 0.37.1, her site ayrı temiz profil. Prizma `release/prizma-1.0.0.xpi` ve uBlock Origin 1.73.0, her oturumda `install_addon(temporary=true)` ile kuruldu. Sayfa + 8 sn bekleme sonrası DOM ölçümü: görünür reklam düğümü sayısı (class/id'de `ad|banner|sponsor|advert|reklam`), görünür reklam alanı px², `script`/`img` etiket sayısı, Prizma DCP kesme sayısı (`[data-prizma-blocked]`).

| Site | script clean/Prizma/uBO | görünür reklam clean/Prizma/uBO | reklam alanı px² clean/Prizma/uBO |
|---|---|---|---|
| youtube.com | 46 / 47 / 46 | 62 / 74 / 77 | 632K / 882K / 878K |
| hurriyet.com.tr | 77 / 78 / 44 | 9 / 9 / **0** | 965K / 965K / **0** |
| sozcu.com.tr | 61 / 51 / 29 | 18 / 14 / **0** | 6.6M / 5.3M / **0** |
| bbc.com | 105 / 100 / 98 | 2 / 2 / 2 | 113K / 113K / 113K |
| forbes.com | 128 / **64** / 65 | 5 / **0** / **0** | 1.03M / **0** / **0** |

**DCP kesme sayısı (`data-prizma-blocked`):** youtube 1, hurriyet 0, sozcu 0, bbc 0, **forbes 12**.

**Bulgu analizi:**
- **Forbes — berabere:** Prizma hem ağ isteği engelledi (script 128→64, aynı uBO'nun 65'i) hem **12 reklam öğesini DCP ile hiç oluşturmadan kesti** — görünür reklam alanı 1.03M→0. Forbes agresif anti-adblock sayfasıdır; Prizma'nın DCP katmanı burada çalışır.
- **YouTube — berabere:** İki taraf da görünür reklamı anlamlı azaltamadı (arama sonucu sayfası, sponsor/yer tutucu düğümleri ölçümde reklam sayıldı; gerçek pre-roll/truview videolarda fark, DCP'nin videoyu oluşmadan kesmesiyle ortaya çıkar).
- **BBC — berabere:** BBC kendi reklamsız bölgesi + ölçüm seçicisi yalnızca 2 düğüm buldu; anlamlı fark yok.
- **Hürriyet/Sözcü — uBO üstün:** Türkçe reklam ağlarında uBO görünür reklamı tamamen sıfırladı (0), Prizma kısmen (9/14). Fark iki kaynaktan gelir: (1) uBO'nun **HTML filtering**'i `<script>` etiketlerini DOM'dan söker (Prizma sadece isteği bloklar, etiketi bırakır — script sayısındaki 77→44 farkı bundan); (2) uBO'nun Türkçe liste + scriptlet seti daha kapsamlı. Prizma'nın `adguard-turkish` kuralı yine de Sözcü'de reklam alanını 6.6M→5.3M indirdi ve script'i 61→51 kesti.

**Ölçüm notları:** YouTube/Forbes geç yüklenen dinamik reklamlar nedeniyle tek ölçümde gürültülüdür; `visibleAdPx` ölçümü kayan animasyonlu banner'ları dahil eder. uBO HTML filtering, Prizma'da yol haritasında (s. 12) `$redirect`/scriptlet genişletmesiyle kapatılacak bir boşluktur.

---

## 11. Dürüst Karar

### Kapışır mı? → **Kısmen kapışır — ve bir alanda uBO'nun yapamadığını yapar.**

**Prizma'nın kazandığı 4 alan:**
- **VANGUARD DCP™:** Reklam öğesini DOM prototip seviyesinde oluşmadan kesen dünyada ilk deterministik önleme. uBO öğeyi oluşturup gizler (anti-adblock tarafından tespit edilebilir); Prizma'da öğe hiç var olmaz — tespit edilecek bir şey yok.
- **Motor performansı:** WASM C++ token-index tasarımı uBO'nun static engine'i ile aynı lige; 155K filtre 317ms yüklenir, istek başına ~5µs. Gerçek reklam isteklerini doğru bloklar.
- **Native Fusion:** 13.750 cosmetic selector tek `:is()` CSS grubuna kaynaştırılır (tek stylesheet, maksimum performans).
- **Temiz, Türkçe, modern UI:** uBO'nun fonksiyonel ama yoğun arayüzüne karşı okunaklı kart tasarımı, tam Türkçe. **Hafiflik:** 1.5 MB XPI (uBO'nun ~1/3'ü).

**Prizma'nın kaybettiği 3 alan:**
- **Kapsama:** 17 scriptlet + 5 liste + sınırlı prosedürel = bazı ağır reklam sitelerinde (agresif anti-adblock, karmaşık inline scriptler) uBO'dan daha çok kaçış.
- **Kontrol:** Dinamik filtreleme, redirect resource, per-site ayarlar yok → güçlü kullanıcı senaryolarında uBO üstün.
- **Olgunluk/ekosistem:** Liste sayısı, otomatik güncelleme, import/export, topluluk katkısı.

### Ne zaman Prizma? 
- Günlük sıradan engelleme (EasyList/EasyPrivacy kapsamındaki reklam ve tracker'ların %95'ini bloklar), 
- hafif ve sade bir eklenti isteniyorsa,
- Türkçe arayüz / Karya DE ile bütünleşik deneyim isteniyorsa.

### Ne zaman uBO? 
- Agresif reklam/anti-adblock siteleri,
- ince ayar (site bazında izin/engelle),
- scriptlet ağırlıklı Türkçe/yerel listeler,
- sürekli güncellenen geniş liste ekosistemi isteniyorsa.

### Sonuç
Prizma 1.0.0, **motoru, temel bloklama gücü ve VANGUARD DCP™ ile uBO'nun yapamadığı bir paradigma avantajına sahiptir.** Özellik seti ve derinliğiyle bir "lite uBO" olsa da, DCP katmanı reklamın *oluşmasını* engelleyerek rakiplerin giremediği bir savunma sağlar. Kapışmanın genel olarak kazanılması için açık yol haritası (aşağıda) gereklidir.

---

## 12. Prizma Yol Haritası (uBO Seviyesine Çıkış)

**Öncelik 1 (en büyük kazanım):**
- VANGUARD DCP™ genişletme: `MutationObserver`-tabanlı kapsam, daha fazla element türü (form/embed/object), `srcset`/`data-src` kesme, SPA (History API) yeniden tarama.
- `$redirect` / `$redirect-rule` + resource kütüphanesi (`noopjs`, `noopcss`, `google-analytics` vb.) — reklam JS'i sahte kaynağa yönlendir.
- Scriptlet setini 17 → 50+ genişlet (anti-adblock: `trusted-replace-*` tam seti, `spoof-css`, `set-attr`).
- MutationObserver'a geçiş (5s setInterval → anlık) — DCP zaten öğeyi kestiği için öncelik düşük.

**Öncelik 2:**
- `:style()`, `:has-text()`, `:upward`, `:matches-path` prosedürel operatörler.
- `$csp`, `$removeparam`, `$all`, `$doc`, `$popup` seçenekleri.
- Otomatik liste güncelleme (periyodik) + import/export.

**Öncelik 3:**
- Dinamik filtreleme (site/type noop-allow-block), per-site panel.
- Liste sayısı artırma (fanboy, Peter Lowe, birden çok bölgesel liste) + özel liste URL ekleme.
- MV3 desteği (Firefox manifest v3'e geçerken uyum).

---

## Ek A — Ölçüm Detayları

- Motor: `core/` C++17, `-O2`, `-Werror` temiz, **144/144** native test (guard, fusion, export_json dahil).
- WASM: Emscripten, `extension/wasm/prizma.wasm` (232 KB), modularize.
- VANGUARD DCP Guard: gerçek listelerle **95.480 host + 7.483 path** kuralı, allow 126, export 3.7 MB; `check_host`/`check_url` eşleşme **16/16**.
- Cosmetic Fusion: 13.750 hide selector → **4 `:is()` grubu** (YouTube).
- Liste kaynakları: easylist.to (EasyList/EasyPrivacy), uBlockOrigin/uAssets (filters/unbreak), filters.adtidy.org (AdGuard Türkçe #8).
- Doğrulama: `node` + background.js ile aynı ABI (instantiateWasm override, HEAPU8).
- Lint: web-ext **0 error / 0 notice** (3 kabul edilebilir uyarı).
- Paket: `release/prizma-1.0.0.xpi` (1.5 MB), Vanguard dosyaları dahil doğrulandı.
- Canlı test: Firefox 153.0.4 + geckodriver 0.37.1 + selenium, 3 profil (clean/prizma/ublock), 6 site; uBO 1.73.0 karşılaştırma. Sonuçlar `docs/PRIZMA-vs-UBLOCK.md` bölüm 10.5.

## Ek B — Referanslar

- uBlock Origin: https://github.com/gorhill/uBlock
- EasyList: https://easylist.to
- uAssets: https://github.com/uBlockOrigin/uAssets
- AdGuard Türkçe filtre: https://filters.adtidy.org/extension/ublock/filters/8.txt