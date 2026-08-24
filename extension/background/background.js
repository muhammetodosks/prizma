'use strict';
// Prizma arka planı — webRequest engelleme, liste yönetimi, istatistik, logger

const PrizmaBG = (() => {
  const TYPE_BITS = {
    main_frame: 1,           // T_DOCUMENT
    sub_frame: 2,            // T_SUBDOC
    stylesheet: 4,           // T_STYLESHEET
    script: 8,               // T_SCRIPT
    image: 16,               // T_IMAGE
    object: 32,              // T_OBJECT
    media: 64,               // T_MEDIA
    xmlhttprequest: 128,     // T_XHR
    fetch: 256,              // T_FETCH  (B7: önceden eksikti → fetch 4096'ya düşüyordu)
    object_subrequest: 32,   // T_OBJECT (B7: önceden 256 = T_FETCH yanlış eşleşmesi)
    font: 512,               // T_FONT
    websocket: 1024,         // T_WEBSOCKET
    ping: 2048,              // T_PING
    other: 4096,             // T_OTHER
    csp_report: 4096,
    beacon: 2048             // B7: beacon ping tipidir (önceden 4096)
  };

  const DEFAULT_SETTINGS = {
    paused: false,
    cnameCloaking: true,
    stripReferrer: false,
    stripCookies3p: false,
    // --- Cookie/Storage İzolasyonu (v1.2.0) ---
    cookiePartitioning: true,           // First-party cookie partitioning
    storagePartitioning: true,          // Storage partitioning (localStorage, sessionStorage, IndexedDB)
    cookieFirstPartyIsolation: true,    // First-party cookie isolation
    autoCleanupStorage: true,           // Auto-cleanup old storage data
    storageMaxAgeDays: 30,              // Max age for storage data (days)
    cookieBehavior: 'partition',        // 'block', 'partition', 'allow'
    cosmeticEnabled: true,
    vanguardEnabled: true,
    aggressiveMode: false,
    loggerKeep: 500,
    autoUpdateLists: true,
    updateIntervalHours: 6,
    debugMode: false
  };

  const LIST_SOURCES = [
    { id: 'easylist',        name: 'EasyList',         file: 'lists/easylist.txt',         url: 'https://easylist.to/easylist/easylist.txt',      enabled: true },
    { id: 'easyprivacy',     name: 'EasyPrivacy',      file: 'lists/easyprivacy.txt',      url: 'https://easylist.to/easylist/easyprivacy.txt',   enabled: true },
    { id: 'ublock-filters',  name: 'uBO filters',      file: 'lists/ublock-filters.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt', enabled: true },
    { id: 'ublock-unbreak',  name: 'uBO unbreak',      file: 'lists/ublock-unbreak.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt', enabled: true },
    { id: 'adguard-turkish', name: 'Türkçe (AdGuard)', file: 'lists/adguard-turkish.txt',  url: 'https://filters.adtidy.org/extension/ublock/filters/13.txt', enabled: true },
    { id: 'adguard-tracking', name: 'Tracking (AdGuard)', file: 'lists/adguard-tracking.txt', url: 'https://filters.adtidy.org/extension/ublock/filters/3.txt', enabled: true },
    { id: 'prizma-hardcore', name: 'Prizma Hardcore',  file: 'lists/prizma-hardcore.txt',  url: null, enabled: true },
    // uBlock Origin kaynak kodunun tam listesi (uAssets/filters/)
    { id: 'd3host',          name: 'd3Host (d3ward)',  file: 'lists/d3host.txt',           url: 'https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.adblock', enabled: true },
    { id: 'ublock-2020',     name: 'uBO filters 2020', file: 'lists/ublock-filters-2020.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2020.txt', enabled: true },
    { id: 'ublock-2021',     name: 'uBO filters 2021', file: 'lists/ublock-filters-2021.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2021.txt', enabled: true },
    { id: 'ublock-2022',     name: 'uBO filters 2022', file: 'lists/ublock-filters-2022.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2022.txt', enabled: true },
    { id: 'ublock-2023',     name: 'uBO filters 2023', file: 'lists/ublock-filters-2023.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2023.txt', enabled: true },
    { id: 'ublock-2024',     name: 'uBO filters 2024', file: 'lists/ublock-filters-2024.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2024.txt', enabled: true },
    { id: 'ublock-2025',     name: 'uBO filters 2025', file: 'lists/ublock-filters-2025.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2025.txt', enabled: true },
    { id: 'ublock-2026',     name: 'uBO filters 2026', file: 'lists/ublock-filters-2026.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2026.txt', enabled: true },
    { id: 'ublock-general',  name: 'uBO general',      file: 'lists/ublock-general.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-general.txt', enabled: true },
    { id: 'ublock-mobile',   name: 'uBO mobile',       file: 'lists/ublock-mobile.txt',    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-mobile.txt', enabled: true },
    { id: 'ublock-privacy',  name: 'uBO privacy',      file: 'lists/ublock-privacy.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt', enabled: true },
    { id: 'ublock-quickfix', name: 'uBO quick fixes',  file: 'lists/ublock-quickfixes.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt', enabled: true },
    { id: 'ublock-resabuse', name: 'uBO resource-abuse', file: 'lists/ublock-resabuse.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt', enabled: true },
    { id: 'ublock-legacy',   name: 'uBO legacy',       file: 'lists/ublock-legacy.txt',    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/legacy.txt', enabled: true }
  ];

  let ready = false;
  let settings = { ...DEFAULT_SETTINGS };
  let siteRules = {};        // { hostname: 'block'|'allow'|'noop' }
  let stats = {
    since: Date.now(),
    dayDate: new Date().toDateString(),
    dayBlocked: 0,
    total: 0,
    blocked: 0,
    byType: {}
  };
  let logBuffer = [];

  const cnameCache = new Map();
  const cnameBlocked = new Set();
  // Çifte kalkan: ağ katmanında (webRequest) engellenen hostlar.
  // Guard'a `w` alanıyla gömülür → VANGUARD DCP statik HTML / data:URI
  // yollarından sızan bu hostları DOM seviyesinde de keser.
  const webBlockedHosts = new Set();
  const WEB_BLOCKED_MAX = 4000;

  // B10: getGuard serialize önbelleği — guard 5.8MB'a büyüdü; webBlockedHosts
  // değişmedikçe birleştirilmiş JSON yeniden üretilmez.
  let guardJson = null; // {key, json}
  function guardMergeKey() {
    return Prizma.counts().net + '|' + webBlockedHosts.size;
  }

  // ── Yardımcılar ──────────────────────────────────────────────────────────
  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  // $redirect=RESOURCE kuralı → yerel no-op kaynağa dönüştür.
  // Listelerdeki isimler uBO/ABP adlandırması kullanır; bilinenler eşlenir,
  // bilinmeyen isimler noopjs'e düşer (güvenli varsayılan).
  function redirectResource(rule) {
    if (!rule) return null;
    const m = /\$redirect(?:-rule)?=([a-z0-9_.-]+)/i.exec(rule);
    if (!m) return null;
    let name = m[1];
    const ALIASES = {
      'noopjs': 'noopjs.js',
      'noop.js': 'noop.js',
      'noop': 'noopjs.js',
      'noop.txt': 'noop.txt',
      'noopjson': 'noopjson',
      'noop-1s.mp4': 'noop-1s.mp4',
      '1x1.gif': 'noop.txt',
      '1x1.png': 'noop.txt',
      '2x2.png': 'noop.txt',
      'google-ima.js': 'google-ima.js',
      'google-ima3.js': 'google-ima.js',
      'ima3.js': 'google-ima.js',
      'amazon_apstag.js': 'amazon_apstag.js',
      'chartbeat.js': 'chartbeat.js',
      'fingerprint2.js': 'fingerprint2.js',
      'sensors-analytics.js': 'sensors-analytics.js',
      'empty.js': 'noopjs.js'
    };
    const file = ALIASES[name] || (name.endsWith('.js') ? name : 'noopjs.js');
    return browser.runtime.getURL('resources/' + file);
  }
  function isThirdParty(url, docUrl) {
    if (!docUrl) return true;
    const a = hostnameOf(url);
    const b = hostnameOf(docUrl);
    if (!a || !b) return false;
    if (a === b) return false;
    return !(a.endsWith('.' + b) || b.endsWith('.' + a));
  }

  // Teknoloji 2: $removeparam / $queryprune — kuraldan parametre spesifikasyonunu
  // çıkarır. Dönüş: '' (tüm parametreler), param adı, '/regex/' ya da null.
  function extractRemoveParam(rule) {
    if (!rule) return null;
    const m = /\$(?:removeparam|queryprune)(?:=([^,]*))?/i.exec(rule);
    if (!m) return null;
    if (m[1] === undefined || m[1] === '') return '';
    return m[1];
  }

  // URL'de belirtilen query parametrelerini siler. Değişiklik yoksa null.
  function cleanUrlParams(url, paramSpec) {
    try {
      const u = new URL(url);
      const keys = Array.from(u.searchParams.keys());
      if (!keys.length) return null;
      let changed = false;
      if (paramSpec === '') {
        u.search = '';
        changed = true;
      } else if (paramSpec.length >= 2 && paramSpec[0] === '/' && paramSpec[paramSpec.length - 1] === '/') {
        // /regex/ formu — parametre ADI regex ile eşleşir (uBO davranışı)
        let re;
        try { re = new RegExp(paramSpec.slice(1, -1), 'i'); } catch (e) { return null; }
        for (const k of keys) {
          if (re.test(k)) { u.searchParams.delete(k); changed = true; }
        }
      } else {
        // düz ad; uBO çoklu değeri '|' ile ayırır ($removeparam=a|b)
        const names = paramSpec.split('|').filter((s) => s !== '');
        for (const k of keys) {
          const kl = k.toLowerCase();
          for (const n of names) {
            if (kl === n.toLowerCase()) { u.searchParams.delete(k); changed = true; break; }
          }
        }
      }
      if (!changed) return null;
      u.search = u.searchParams.toString();
      return u.toString();
    } catch (e) { return null; }
  }

  // Per-site mod: belirli host (ve alt alan adları) için kullanıcı tercihi.
  function siteModeFor(host) {
    if (!host || !siteRules) return 'normal';
    let h = host.toLowerCase();
    while (h) {
      if (siteRules[h]) return siteRules[h];
      const dot = h.indexOf('.');
      if (dot === -1) break;
      h = h.slice(dot + 1);
    }
    return 'normal';
  }
  async function storageGet(keys) { return browser.storage.local.get(keys); }
  async function storageSet(obj) { await browser.storage.local.set(obj); }

  function persistStats() { storageSet({ stats }); }
  function persistSettings() { storageSet({ settings }); }

  // İstatistik kaydını debounce'la (her istekte storage yazma)
  let statsSaveTimer = null;
  function scheduleStatsSave() {
    if (statsSaveTimer) return;
    statsSaveTimer = setTimeout(() => {
      statsSaveTimer = null;
      persistStats();
    }, 2000);
  }

  function bumpBlocked(type) {
    const today = new Date().toDateString();
    if (stats.dayDate !== today) {
      stats.dayDate = today;
      stats.dayBlocked = 0;
    }
    stats.total += 1;
    stats.blocked += 1;
    stats.dayBlocked += 1;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    scheduleStatsSave();
  }

  function pushLog(entry) {
    // P8 — debug modu: motor sonucu her istek için kaydedilir (engellenmese de).
    logBuffer.push(entry);
    if (logBuffer.length >= 200) flushLog();
  }
  function pushDebugLog(entry) {
    if (!settings.debugMode) return;
    pushLog({ t: Date.now(), ...entry, debug: true });
  }
  function flushLog() {
    if (!logBuffer.length) return;
    const chunk = logBuffer;
    logBuffer = [];
    storageGet(['log']).then(async ({ log }) => {
      const arr = Array.isArray(log) ? log : [];
      const merged = arr.concat(chunk).slice(-settings.loggerKeep);
      await storageSet({ log: merged });
    }).catch(() => {});
  }

  // ── Cookie/Storage İzolasyonu (v1.2.0) ────────────────────────────────────
  // First-party cookie partitioning, storage partitioning, auto-cleanup

  // Şüpheli cookie parametreleri (tracking için yaygın)
  const SUSPICIOUS_COOKIE_PARAMS = [
    '_ga', '_gid', '_gat', '_gac_', '_fbp', '_fbc', '_gcl_', '_gcl_aw',
    '_gcl_dc', '_gcl_gb', '_gcl_gf', '_gcl_ha', '_gcl_hc', '_gcl_hp',
    'mc_', '_ym_', '_ym_d', '_ym_uid', '_ym_isad', '_ym_visorc',
    'fbclid', 'gclid', 'msclkid', 'ttclid', 'li_fat_id', 'twclid',
    'ttclid', 'igclid', 'msclkid', 'ttclid', 'li_fat_id'
  ];

  // Cookie partitioning için partition key oluştur
  function getCookiePartitionKey(url, firstPartyDomain) {
    try {
      const urlObj = new URL(url);
      const requestDomain = urlObj.hostname;
      if (settings.cookiePartitioning) {
        return firstPartyDomain ? `(${firstPartyDomain})` : `(${requestDomain})`;
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  // Şüpheli cookie parametrelerini kontrol et
  function hasSuspiciousCookieParams(cookieHeader) {
    if (!cookieHeader || !cookieHeader.value) return false;
    const cookieStr = cookieHeader.value;
    return SUSPICIOUS_COOKIE_PARAMS.some(param => cookieStr.includes(param));
  }

  // Storage partitioning için partition key
  function getStoragePartitionKey(firstPartyDomain) {
    if (!settings.storagePartitioning) return '';
    return firstPartyDomain ? `prizma_${firstPartyDomain}` : 'prizma_default';
  }

  // Eski storage verilerini temizle
  async function cleanupOldStorage() {
    if (!settings.autoCleanupStorage) return;
    try {
      const maxAge = settings.storageMaxAgeDays * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - maxAge;

      const got = await storageGet(['log']);
      if (got.log && Array.isArray(got.log)) {
        const cutoffTime = Date.now() - maxAge;
        const fresh = got.log.filter(entry => entry.t && entry.t > cutoffTime);
        if (fresh.length !== got.log.length) {
          await storageSet({ log: fresh });
          if (settings.debugMode) {
            console.log(`[Prizma] Eski log temizlendi: ${got.log.length - fresh.length} girdi`);
          }
        }
      }
    } catch (e) {
      console.warn('[Prizma] Storage temizleme hatası:', e);
    }
  }

  // First-party isolation check
  function isFirstPartyContext(url, docUrl) {
    if (!docUrl) return true;
    const a = hostnameOf(url);
    const b = hostnameOf(docUrl);
    if (!a || !b) return true;
    if (a === b) return true;
    return a.endsWith('.' + b) || b.endsWith('.' + a);
  }

  // ── Liste yükleme ─────────────────────────────────────────────────────────
  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  // Bir listeyi yükle: storage cache → paket dosyası → canlı URL (sırayla dene)
  async function loadListFromPackaged(src) {
    // Cache anahtarına manifest sürümü eklenir — XPI güncellendiğinde (paket
    // listeleri değiştiğinde) eski cache otomatik geçersiz kalır ve paket
    // dosyası yeniden okunur. (Firefox storage'ı XPI yeniden paketlense de
    // koruduğu için sürümsüz cache, güncellenen kuralların canlıda asla
    // yüklenmemesine yol açıyordu.)
    const cacheVersion = (browser.runtime.getManifest && browser.runtime.getManifest().version) || '0';
    const cacheKey = 'listdata.' + src.id + '.v' + cacheVersion;
    const got = await storageGet([cacheKey]);
    if (got[cacheKey]) {
      Prizma.loadList(got[cacheKey]);
      return got[cacheKey].length;
    }
    let text = null;
    try {
      text = await fetchText(browser.runtime.getURL(src.file));
    } catch (e) {
      // paket dosyası yok — canlı kaynaktan çek ve önbellekle
      if (src.url) {
        try {
          text = await fetchText(src.url);
        } catch (e2) { /* yok say */ }
      }
    }
    if (text === null) return 0;
    Prizma.loadList(text);
    await storageSet({ [cacheKey]: text });
    return text.length;
  }

  async function reloadEngine() {
    Prizma.clear();
    const got = await storageGet(['customFilters', 'listsEnabled']);
    const custom = got.customFilters || '';
    if (custom) Prizma.loadList(custom);
    for (const src of LIST_SOURCES) {
      if (got.listsEnabled && got.listsEnabled[src.id] === false) continue;
      try {
        await loadListFromPackaged(src);
      } catch (e) {
        console.warn('Liste yüklenemedi: ' + src.id, e);
      }
    }
    // Teknoloji 1 — JS-Native RegExp motoru: C++'ın derleyemediği regex
    // filtreleri WASM'dan alınır, native RegExp önbelleği senkronize edilir.
    // Bu çağrı olmadan lookahead regex'leri (uBO listelerindeki çoğu /.../)
    // hiç değerlendirilmezdi.
    Prizma.syncRegexes();
  }

  // Listeleri canlı kaynaktan güncelle (önbelleği de yenile).
  async function updateListsRemote() {
    let updated = 0;
    for (const src of LIST_SOURCES) {
      if (!src.url) continue; // yerel paket listesi (prizma-hardcore) çevrimiçi değil
      try {
        const text = await fetchText(src.url);
        const cacheVersion = (browser.runtime.getManifest && browser.runtime.getManifest().version) || '0';
        const cacheKey = 'listdata.' + src.id + '.v' + cacheVersion;
        await storageSet({ [cacheKey]: text });
        updated += 1;
      } catch (e) {
        console.warn('Güncelleme başarısız: ' + src.id, e);
      }
    }
    return updated;
  }

  // ── CNAME cloaking (best-effort, browser.dns) ─────────────────────────────
  function watchCname(hostname) {
    if (cnameCache.has(hostname)) return;
    cnameCache.set(hostname, null);
    browser.dns.resolve(hostname).then((info) => {
      const c = info && info.canonicalName && info.canonicalName !== hostname
        ? info.canonicalName : null;
      cnameCache.set(hostname, c);
      if (!c) return;
      const action = Prizma.match('https://' + c + '/', 4096, c, '', true);
      if (action === 1) {
        cnameBlocked.add(hostname);
        pushLog({
          t: Date.now(), type: 'cname', url: hostname, rule: Prizma.lastRule(),
          action: 'block', host: hostname, doc: '', thirdParty: true
        });
        bumpBlocked('cname');
      }
    }).catch(() => { cnameCache.set(hostname, null); });
  }

  // ── webRequest ────────────────────────────────────────────────────────────
  // B18: Firefox uyumluluğu — webRequest.cancel edilen SCRIPT istekleri Firefox'ta
  // script elementinin onerror olayını TETİKLEMEZ (Chrome tetikler). adblock-tester.com
  // gibi test sitelerinde bu, "Script loading: ⌛ checking…" durumunun sonsuza dek
  // sürmesine ve testin FAIL sayılmasına yol açar (64/100 görünür, gerçek engelleme
  // çalışır — Script execution testleri PASS olur). Script isteklerini geçersiz bir
  // URL'ye yönlendirirsek (HTTP 404 → script onerror → loadjs "script tag failed")
  // onerror tetiklenir, script asla yüklenmez ve test "passed" sonuçlanır. Diğer
  // istek tipleri (img, stylesheet, sub_frame...) cancel ile doğru şekilde onerror
  // alır; onlara dokunulmaz.
  // B18: Script engelleme ARTIK content katmanında (content/vanguard.js src
  // setter'ı) yapılır. vanguard, engellenen script'in src'sini HTTP 404 veren
  // BLOCK_SCRIPT_URL'ye yönlendirir → tarayıcı script öğesi için onerror üretir
  // → anti-adblock testler (adblock-tester.com) "blocked" olarak sonuçlanır.
  // Firefox'ta webRequest cancel/redirect SCRIPT isteklerinde onerror ÜRETMEZ
  // (3 hedefle doğrulandı), bu yüzden testler "⌛ checking…" takılırdı.
  // Burada script'ler de dahil tüm webRequest eşleşmeleri cancel edilir; bu,
  // vanguard'ın (document.write/parser ile) ulaşamadığı kalan istekler için
  // yedek engelleme katmanıdır. BLOCK_SCRIPT_URL istekleri yukarıdaki döngü
  // korumasıyla (satır 366) her zaman serbest bırakılır.
  function blockRequest(details) {
    return { cancel: true };
  }
  function onBeforeRequest(details) {
    if (!ready || settings.paused) return {};
    if (!/^https?:/i.test(details.url)) return {};
    // B18: engellenen script'lerin yönlendirildiği hedef — döngüye girme
    if (/^https:\/\/example\.com\/prizma-blocked/i.test(details.url)) return {};
    const type = details.type || 'other';
    const typeBit = TYPE_BITS[type] || 4096;
    const hostname = hostnameOf(details.url);
    if (!hostname) return {};
    const docUrl = details.documentUrl || details.initiator || '';
    const docHost = hostnameOf(docUrl);
    // FASE 4.2: per-site kontrol — ana çerçevenin hostuna göre karar
    const pageHost = docHost || hostname;
    const siteMode = siteModeFor(pageHost);
    if (siteMode === 'noop') return {};
    if (siteMode === 'allow') return {};  // B9: izin ver — hiçbir şey engelleme
    // B11: main_frame ASLA third-party olamaz — documentUrl boş olduğunda
    // isThirdParty() true dönerdi ve `||site^$third-party` kuralları ana sayfayı
    // engelliyordu ("hiçbir site açılmıyor"). Ana çerçeve kendi başlatıcısıdır.
    const thirdParty = type === 'main_frame' ? false : isThirdParty(details.url, docUrl);
    const lower = details.url.toLowerCase();

    // Agresif mod: kurala bakmadan tüm üçüncü taraf script/iframe/font/object
    // isteklerini engelle. Sayfa kırılmasını önlemek için aynı-origin ve
    // ana belge istekleri (main_frame) dokunulmaz bırakılır.
    // B9: site modu 'block' (popup "Agresif") per-site agresif engelleme — global
    // agresifMode açık olmasa bile o sitenin hostu için aynı kurallar uygulanır.
    const aggressiveActive = settings.aggressiveMode || siteMode === 'block';
    if (aggressiveActive && thirdParty && siteMode !== 'allow') {
      const aggressiveTypes = ['script', 'sub_frame', 'font', 'object', 'media'];
      if (aggressiveTypes.includes(type) && !/^data:/i.test(details.url)) {
        if (webBlockedHosts.size < WEB_BLOCKED_MAX) webBlockedHosts.add(hostname);
        bumpBlocked(type);
        pushLog({ t: Date.now(), type, url: details.url, rule: '(AGGRESSIVE)', action: 'block', host: hostname, doc: docHost, thirdParty });
        return blockRequest(details);
      }
    }

    if (settings.cnameCloaking && !cnameBlocked.has(hostname)) {
      watchCname(hostname);
    }
    if (cnameBlocked.has(hostname)) {
      bumpBlocked(type);
      pushLog({ t: Date.now(), type, url: details.url, rule: '(CNAME)', action: 'block', host: hostname, doc: docHost, thirdParty });
      return blockRequest(details);
    }

    const action = Prizma.match(lower, typeBit, hostname, docHost, thirdParty);
    if (action === 1) {
      const rule = Prizma.lastRule();
      // Teknoloji 2 — $removeparam / $queryprune: isteği iptal ETMEZ, sadece
      // query parametrelerini ayıklar (redirectUrl). Temizlenecek parametre
      // yoksa istek olduğu gibi geçer. (Blok kuralı varsa öncelik hep blokta.)
      const pruneParam = extractRemoveParam(rule);
      if (pruneParam !== null) {
        const cleaned = cleanUrlParams(details.url, pruneParam);
        if (cleaned && cleaned !== details.url) {
          bumpBlocked(type);
          pushLog({ t: Date.now(), type, url: details.url, rule, action: 'prune', host: hostname, doc: docHost, thirdParty, prunedUrl: cleaned });
          return { redirectUrl: cleaned };
        }
        return {};
      }
      // $redirect desteği: eşleşen kural bir redirect kaynağı belirtiyorsa,
      // isteği iptal etmek yerine yerel no-op kaynağa yönlendir (sayfa kırılmaz).
      const redir = redirectResource(rule);
      if (redir) {
        bumpBlocked(type);
        pushLog({ t: Date.now(), type, url: details.url, rule, action: 'redirect', host: hostname, doc: docHost, thirdParty, resource: redir });
        return { redirectUrl: redir };
      }
      if (webBlockedHosts.size < WEB_BLOCKED_MAX) webBlockedHosts.add(hostname);
      bumpBlocked(type);
      pushLog({ t: Date.now(), type, url: details.url, rule: Prizma.lastRule(), action: 'block', host: hostname, doc: docHost, thirdParty });
      return blockRequest(details);
    }
    // P8 — debug: eşleşme yoksa da kaydet (hangi filtreler çalışmadı analizi)
    pushDebugLog({ type, url: details.url, rule: Prizma.lastRule() || '(yok)', action: 'pass', host: hostname, doc: docHost, thirdParty });
    return {};
  }

  function onBeforeSendHeaders(details) {
    if (!ready || settings.paused) return {};
    if (!/^https?:/i.test(details.url)) return {};
    const headers = details.requestHeaders || [];
    let mod = false;
    const type = details.type || 'other';

    if (settings.stripReferrer) {
      const i = headers.findIndex(h => h.name.toLowerCase() === 'referer');
      if (i >= 0) {
        try { headers[i].value = new URL(details.url).origin; } catch (e) { headers.splice(i, 1); }
        mod = true;
      }
    }

    if (settings.stripCookies3p) {
      const docUrl = details.documentUrl || details.initiator || '';
      if (isThirdParty(details.url, docUrl)) {
        const i = headers.findIndex(h => h.name.toLowerCase() === 'cookie');
        if (i >= 0) { headers.splice(i, 1); mod = true; }
      }
    }

    // --- Cookie/Storage İzolasyonu (v1.2.0) — SADECE script DİŞI istekler için ---
    // Script isteklerine DOKUNMA — VANGUARD DCP'yi bozar
    const isScript = type === 'script';
    if (!isScript && (settings.cookiePartitioning || settings.cookieFirstPartyIsolation || settings.storagePartitioning)) {
      const docUrl = details.documentUrl || details.initiator || '';
      const is3p = isThirdParty(details.url, docUrl);

      // Cookie partitioning ve first-party isolation (sadece third-party için)
      if (settings.cookiePartitioning || settings.cookieFirstPartyIsolation) {
        const cookieIdx = headers.findIndex(h => h.name.toLowerCase() === 'cookie');
        if (cookieIdx >= 0) {
          const docUrl = details.documentUrl || details.initiator || '';
          const is3p = isThirdParty(details.url, docUrl);

          // Şüpheli tracking cookie'lerini tespit et ve temizle (sadece third-party)
          if (is3p && hasSuspiciousCookieParams({ value: headers[cookieIdx].value })) {
            if (settings.cookieBehavior === 'block') {
              headers.splice(cookieIdx, 1);
              mod = true;
              pushLog({
                t: Date.now(),
                type: 'cookie',
                url: details.url,
                rule: '(COOKIE_BLOCK)',
                action: 'block',
                host: hostnameOf(details.url),
                doc: hostnameOf(details.documentUrl || details.initiator || ''),
                thirdParty: true
              });
            }
          }

          // Cookie partitioning: third-party cookie'leri partition key ile işaretle
          // (Content script tarafında Partitioned attribute ile işlenir)
          if (is3p && settings.cookiePartitioning) {
            const partitionKey = `prizma_partition=${hostnameOf(details.url)}`;
            headers.push({ name: 'X-Prizma-Cookie-Partition', value: partitionKey });
            mod = true;
          }
        }
      }

      // Storage partitioning için custom header (sadece script dışı)
      if (settings.storagePartitioning) {
        const docUrl = details.documentUrl || details.initiator || '';
        const firstPartyDomain = hostnameOf(docUrl) || hostnameOf(details.url);
        const partitionKey = getStoragePartitionKey(firstPartyDomain);
        headers.push({ name: 'X-Prizma-Storage-Partition', value: partitionKey });
        mod = true;
      }
    }

    // Eski stripCookies3p mantığı (geriye uyumluluk) - third-party için
    if (settings.stripCookies3p && is3p) {
      const i = headers.findIndex(h => h.name.toLowerCase() === 'cookie');
      if (i >= 0) { headers.splice(i, 1); mod = true; }
    }

    if (mod) return { requestHeaders: headers };
    return {};
  }

  // ── Mesajlaşma (UI) ───────────────────────────────────────────────────────
  async function onMessage(msg, sender) {
    switch (msg.type) {
      case 'getState': {
        const got = await storageGet(['listsEnabled']);
        const listsEnabled = got.listsEnabled || {};
        return {
          ready, paused: settings.paused,
          stats,
          counts: Prizma.counts(),
          guard: Prizma.guardCounts(),
          lists: LIST_SOURCES.map(s => ({
            id: s.id, name: s.name,
            enabled: listsEnabled[s.id] !== false
          })),
          settings
        };
      }
      case 'getSiteMode': {
        const host = String(msg.hostname || '').toLowerCase();
        return { mode: siteModeFor(host) };
      }
      case 'setSiteMode': {
        const host = String(msg.hostname || '').toLowerCase();
        const mode = String(msg.mode || 'normal');
        if (!host || !['normal', 'block', 'allow', 'noop'].includes(mode)) return { ok: false };
        if (mode === 'normal') delete siteRules[host];
        else siteRules[host] = mode;
        await storageSet({ siteRules });
        return { ok: true, mode };
      }
      case 'togglePause': {
        settings.paused = !settings.paused;
        persistSettings();
        return { paused: settings.paused };
      }
      case 'setSetting': {
        if (msg.key in settings) {
          settings[msg.key] = msg.value;
          persistSettings();
        }
        return { ok: true };
      }
      case 'setListEnabled': {
        const got = await storageGet(['listsEnabled']);
        const listsEnabled = got.listsEnabled || {};
        listsEnabled[msg.id] = !!msg.enabled;
        await storageSet({ listsEnabled });
        await reloadEngine();
        return { ok: true, counts: Prizma.counts() };
      }
      case 'getLog': {
        const got = await storageGet(['log']);
        return { log: Array.isArray(got.log) ? got.log : [] };
      }
      case 'getCosmetic': {
        if (!settings.cosmeticEnabled) return { json: null };
        const host = msg.hostname || '';
        // B9: 'noop' (izin ver) ve 'block' (agresif) — her ikisinde de cosmetic
        // filtreler uygulanmaz; 'block' zaten ağ katmanında her şeyi kesiyor.
        const mode = siteModeFor(host);
        if (mode === 'noop' || mode === 'block') return { json: null };
        // üst düzey host için generic + specific; alt çerçeveler de aynı hostu kullanır
        return { json: Prizma.cosmetic(host) };
      }
      case 'getGuard': {
        // VANGUARD DCP — guard indeksi (wasm export). İsteğe bağlı tutulur;
        // load_list sonrası aynıdır, her çağrıda yeniden serialize edilir.
        // Çifte kalkan: ağ katmanında engellenen hostlar `w` olarak eklenir,
        // böylece DCP statik HTML yollarından sızan hostları da keser.
        if (!settings.vanguardEnabled) return { json: null };
        // B10: 5.8MB guard JSON'u her getGuard'da parse+stringify etmek ağır;
        //      webBlockedHosts değişmedikçe önceden birleştirilmiş JSON'u döndür.
        if (guardJson && guardJson.key === guardMergeKey()) return { json: guardJson.json };
        const json = Prizma.guardExport();
        if (!json) return { json: null };
        let merged = json;
        if (webBlockedHosts.size > 0) {
          try {
            const g = JSON.parse(json);
            g.w = Array.from(webBlockedHosts).map((h) => [h, 0xFFFFFFFF]);
            merged = JSON.stringify(g);
          } catch (e) { /* guard değiştirilemezse olduğu gibi geç */ }
        }
        guardJson = { key: guardMergeKey(), json: merged };
        return { json: merged };
      }
      case 'vanguardStats': {
        const blocked = Math.max(0, Math.min(10000, msg.blocked | 0));
        if (blocked) {
          stats.vanguard = (stats.vanguard || 0) + blocked;
          stats.blocked += blocked;
          stats.dayBlocked += blocked;
          scheduleStatsSave();
        }
        return { ok: true };
      }
      case 'addUserFilter': {
        const filter = String(msg.filter || '').trim();
        if (!filter) return { ok: false };
        const got = await storageGet(['customFilters']);
        const custom = (got.customFilters || '').trim();
        const next = custom ? custom + '\n' + filter : filter;
        await storageSet({ customFilters: next });
        await reloadEngine();
        return { ok: true };
      }
      case 'startPicker': {
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            await browser.tabs.sendMessage(tab.id, { type: 'startPicker' });
            return { ok: true };
          }
        } catch (e) {}
        return { ok: false };
      }
      case 'updateLists': {
        const updated = await updateListsRemote();
        await reloadEngine();
        return { ok: true, updated, counts: Prizma.counts() };
      }
      case 'setCustomFilters': {
        const custom = String(msg.text || '');
        await storageSet({ customFilters: custom });
        await reloadEngine();
        return { ok: true, counts: Prizma.counts() };
      }
      default:
        return {};
    }
  }

  async function init() {
    const got = await storageGet(['settings', 'stats', 'customFilters', 'siteRules']);
    settings = { ...DEFAULT_SETTINGS, ...(got.settings || {}) };
    stats = { ...stats, ...(got.stats || {}) };
    siteRules = got.siteRules || {};
    if (!got.stats) persistStats();

    await Prizma.init();
    await reloadEngine();

    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      ['blocking']
    );
    browser.webRequest.onBeforeSendHeaders.addListener(
      onBeforeSendHeaders,
      { urls: ['http://*/*', 'https://*/*'] },
      ['blocking', 'requestHeaders']
    );

    browser.runtime.onMessage.addListener(onMessage);
    browser.commands.onCommand.addListener((cmd) => {
      if (cmd === 'toggle-prize') {
        settings.paused = !settings.paused;
        persistSettings();
      }
    });

    // FASE 4.1: otomatik liste güncelleme alarmı (varsayılan 24 saatte bir)
    const updateAlarm = 'prizma-list-update';
    const setupUpdateAlarm = () => {
      try {
        browser.alarms.clear(updateAlarm);
        if (settings.autoUpdateLists && settings.updateIntervalHours > 0) {
          browser.alarms.create(updateAlarm, {
            delayInMinutes: settings.updateIntervalHours * 60,
            periodInMinutes: settings.updateIntervalHours * 60
          });
        }
      } catch (e) {}
    };
    setupUpdateAlarm();
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== updateAlarm) return;
      updateListsRemote()
        .then((updated) => reloadEngine())
        .catch(() => {});
    });

    // --- Storage Auto-Cleanup Alarm (v1.2.0) ---
    const cleanupAlarm = 'prizma-storage-cleanup';
    const setupCleanupAlarm = () => {
      try {
        browser.alarms.clear(cleanupAlarm);
        if (settings.autoCleanupStorage) {
          browser.alarms.create(cleanupAlarm, {
            delayInMinutes: 60, // İlk çalışma 1 saat sonra
            periodInMinutes: 24 * 60 // Her 24 saatte bir
          });
        }
      } catch (e) {}
    };
    setupCleanupAlarm();
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== cleanupAlarm) return;
      cleanupOldStorage().catch(() => {});
    });

    ready = true;
    console.log('Prizma hazır — ' + JSON.stringify(Prizma.counts()) + ' filtre');
  }

  // Hata olsa da arayüzü yanıtsız bırakma
  init().catch((e) => {
    console.error('Prizma başlatılamadı', e);
    ready = true;
  });

  return { onMessage, isReady: () => ready };
})();
