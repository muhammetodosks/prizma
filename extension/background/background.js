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
    object_subrequest: 256,  // T_OBJECT_SUBREQ
    font: 512,               // T_FONT
    websocket: 1024,         // T_WEBSOCKET
    ping: 2048,              // T_PING
    other: 4096,             // T_OTHER
    csp_report: 4096,
    beacon: 4096
  };

  const DEFAULT_SETTINGS = {
    paused: false,
    cnameCloaking: true,
    stripReferrer: false,
    stripCookies3p: false,
    cosmeticEnabled: true,
    vanguardEnabled: true,
    loggerKeep: 500
  };

  const LIST_SOURCES = [
    { id: 'easylist',        name: 'EasyList',         file: 'lists/easylist.txt',         url: 'https://easylist.to/easylist/easylist.txt',      enabled: true },
    { id: 'easyprivacy',     name: 'EasyPrivacy',      file: 'lists/easyprivacy.txt',      url: 'https://easylist.to/easylist/easyprivacy.txt',   enabled: true },
    { id: 'ublock-filters',  name: 'uBO filters',      file: 'lists/ublock-filters.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt', enabled: true },
    { id: 'ublock-unbreak',  name: 'uBO unbreak',      file: 'lists/ublock-unbreak.txt',   url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt', enabled: true },
    { id: 'adguard-turkish', name: 'Türkçe (AdGuard)', file: 'lists/adguard-turkish.txt',  url: 'https://filters.adtidy.org/extension/ublock/filters/8.txt', enabled: true }
  ];

  let ready = false;
  let settings = { ...DEFAULT_SETTINGS };
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

  // ── Yardımcılar ──────────────────────────────────────────────────────────
  function hostnameOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }
  function isThirdParty(url, docUrl) {
    if (!docUrl) return true;
    const a = hostnameOf(url);
    const b = hostnameOf(docUrl);
    if (!a || !b) return false;
    if (a === b) return false;
    return !(a.endsWith('.' + b) || b.endsWith('.' + a));
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
    logBuffer.push(entry);
    if (logBuffer.length >= 200) flushLog();
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

  // ── Liste yükleme ─────────────────────────────────────────────────────────
  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }

  // Bir listeyi yükle: storage cache → paket dosyası → canlı URL (sırayla dene)
  async function loadListFromPackaged(src) {
    const cacheKey = 'listdata.' + src.id;
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
  }

  // Listeleri canlı kaynaktan güncelle (önbelleği de yenile).
  async function updateListsRemote() {
    let updated = 0;
    for (const src of LIST_SOURCES) {
      try {
        const text = await fetchText(src.url);
        const cacheKey = 'listdata.' + src.id;
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
  function onBeforeRequest(details) {
    if (!ready || settings.paused) return {};
    if (!/^https?:/i.test(details.url)) return {};
    const type = details.type || 'other';
    const typeBit = TYPE_BITS[type] || 4096;
    const hostname = hostnameOf(details.url);
    if (!hostname) return {};
    const docUrl = details.documentUrl || details.initiator || '';
    const docHost = hostnameOf(docUrl);
    const thirdParty = isThirdParty(details.url, docUrl);
    const lower = details.url.toLowerCase();

    if (settings.cnameCloaking && !cnameBlocked.has(hostname)) {
      watchCname(hostname);
    }
    if (cnameBlocked.has(hostname)) {
      bumpBlocked(type);
      pushLog({ t: Date.now(), type, url: details.url, rule: '(CNAME)', action: 'block', host: hostname, doc: docHost, thirdParty });
      return { cancel: true };
    }

    const action = Prizma.match(lower, typeBit, hostname, docHost, thirdParty);
    if (action === 1) {
      bumpBlocked(type);
      pushLog({ t: Date.now(), type, url: details.url, rule: Prizma.lastRule(), action: 'block', host: hostname, doc: docHost, thirdParty });
      return { cancel: true };
    }
    return {};
  }

  function onBeforeSendHeaders(details) {
    if (!ready || settings.paused) return {};
    if (!/^https?:/i.test(details.url)) return {};
    const headers = details.requestHeaders || [];
    let mod = false;

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
        // üst düzey host için generic + specific; alt çerçeveler de aynı hostu kullanır
        return { json: Prizma.cosmetic(host) };
      }
      case 'getGuard': {
        // VANGUARD DCP — guard indeksi (wasm export). İsteğe bağlı tutulur;
        // load_list sonrası aynıdır, her çağrıda yeniden serialize edilir.
        if (!settings.vanguardEnabled) return { json: null };
        return { json: Prizma.guardExport() };
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
    const got = await storageGet(['settings', 'stats', 'customFilters']);
    settings = { ...DEFAULT_SETTINGS, ...(got.settings || {}) };
    stats = { ...stats, ...(got.stats || {}) };
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
