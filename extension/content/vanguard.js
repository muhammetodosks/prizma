'use strict';
// ═══ VANGUARD DCP™ (Deterministic Creation-Prevention) — MAIN WORLD ═══════════
// Prizma'nın imza teknolojisi: reklam öğesi DOM'da HİÇ oluşmaz.
//
// uBlock Origin reklamı GİZLER  → öğe DOM'da var, sayfa tespit edebilir
//                                (offsetParent, getBoundingClientRect, size).
// Prizma reklamı HİÇ VAR ETMEZ → DOM öğesi oluşmaz, istek atılmaz, anti-adblock
//                                tespit edemez. Element, event, ölçüm yok.
//
// Bu dosya MAIN WORLD'de çalışır (vanguard-loader.js ile <script> olarak
// enjekte edilir). Prototip seviyesinde src/data/href/appendChild/innerHTML
// yamalanır; böylece sayfa betikleri ad öğesi oluşturmayı DENEDİĞİNDE bile
// öğe oluşmaz. Guard verisi loader üzerinden postMessage köprüsüyle alınır.

(() => {
  if (window.__prizmaVanguard) return;
  window.__prizmaVanguard = true;

  // ── Guard türleri (guard.h ile eşleşir) ────────────────────────────────────
  // G_ANY = tüm tipler (wildcard). C++ tarafıyla birebir aynı değerler.
  const G_IMAGE = 1, G_SCRIPT = 2, G_IFRAME = 4, G_MEDIA = 8,
        G_STYLE = 16, G_XHR = 32, G_ANY = 0xFFFFFFFF;

  // B18: Engellenen script'lerin yönlendirileceği HTTP 404 hedefi. Tarayıcı
  // script öğesi bu hedefe yüklenmeyi deneyince onerror üretir; anti-adblock
  // testler (adblock-tester gibi) bu olayı "blocked" olarak sonuçlandırır.
  // NXDOMAIN (.invalid) Firefox'ta script onerror ÜRETMEZ (kanıtlandı); 404
  // veren gerçek bir hedef şarttır.
  const BLOCK_SCRIPT_URL = 'https://example.com/prizma-blocked.js';

  // ── Durum ──────────────────────────────────────────────────────────────────
  let blockTbl = new Map();   // hostname → mask
  let allowTbl = new Map();   // hostname → mask
  let webBlockTbl = new Map(); // ağ katmanında engellenen hostlar (çifte kalkan)
  let urlRules = [];          // [host, path, mask]
  // B10: urlRules — host → { allow:[], block:[] } indeksi. 13K kuralı her
  // checkUrl'de lineer taramak binlerce öğede milyonlarca işlem yapıyordu;
  // host bazlı bakılınca tek `get` + suffix zinciri yeterli.
  let urlRuleIndex = null;
  let ready = false;
  let blockedCount = 0;
  let reportTimer = null;

  function hostToMap(entries) {
    const m = new Map();
    for (const [h, mask] of entries) {
      const k = h.toLowerCase();
      // B8: iki dal da `m.get(k) | mask` idi (same-OR) — tek satırda birleştir.
      m.set(k, (m.get(k) || 0) | mask);
    }
    return m;
  }

  function buildUrlRuleIndex() {
    const idx = new Map();
    for (const u of urlRules) {
      const h = u.host;
      let node = idx.get(h);
      if (!node) { node = { allow: [], block: [] }; idx.set(h, node); }
      node[u.allow ? 'allow' : 'block'].push(u);
    }
    urlRuleIndex = idx;
  }

  function loadGuard(json) {
    try {
      const g = JSON.parse(json);
      blockTbl = hostToMap(g.h || []);
      allowTbl = hostToMap(g.a || []);
      webBlockTbl = hostToMap(g.w || []);
      urlRules = (g.u || []).map((u) => ({
        host: u[0], path: u[1], mask: u[2], allow: u[3] === 1
      }));
      buildUrlRuleIndex();
      ready = true;
    } catch (e) {
      ready = false;
    }
  }

  // ── Eşleştirme (guard.cpp check_host/check_url mantığı) ───────────────────
  function checkHostTbl(tbl, hostname, mask) {
    let h = hostname;
    while (h) {
      const m = tbl.get(h);
      if (m !== undefined && (m === G_ANY || (m & mask))) return 1;
      const dot = h.indexOf('.');
      if (dot === -1) break;
      h = h.slice(dot + 1);
    }
    return 0;
  }

  function cleanHost(raw) {
    let h = String(raw || '').toLowerCase();
    const colon = h.indexOf(':');
    if (colon !== -1) h = h.slice(0, colon);
    while (h && h.endsWith('.')) h = h.slice(0, -1);
    return h;
  }

  function checkHost(hostname, mask) {
    const h = cleanHost(hostname);
    if (!h) return -1;
    if (checkHostTbl(allowTbl, h, mask)) return 0;   // exception → izin
    if (checkHostTbl(blockTbl, h, mask)) return 1;   // engel
    // Çifte kalkan: ağ katmanında (webRequest) zaten engellenen hostlar,
    // DCP tarafında da kesilir — statik HTML / data:URI yollarından sızmasın.
    if (checkHostTbl(webBlockTbl, h, mask)) return 1;
    return -1;
  }

  function hostOf(url) {
    const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
    if (m) return m[1];
    const s = url.indexOf('/');
    return s === -1 ? url : url.slice(0, s);
  }

  // srcset="url1 1x, url2 2x" — her adayı ayrı ayrı kontrol et; biri engelli
  // ise srcset'in tamamı düşer (hiçbir varyant yüklenmez). Descriptor
  // (1x, 2x, 480w) dikkate alınmaz.
  function checkSrcset(value, mask) {
    if (!value) return -1;
    const parts = value.split(',');
    for (const part of parts) {
      const token = part.trim().split(/\s+/)[0];
      if (!token || !/^https?:/i.test(token)) continue;
      const r = checkUrl(token, mask);
      if (r === 1) return 1;
    }
    return -1;
  }

  function checkUrl(url, mask) {
    if (!ready || !url) return -1;
    const host = cleanHost(hostOf(url));
    if (!host) return -1;
    const h = checkHost(host, mask);
    if (h !== -1) return h;
    // yol önek kuralları — yalnızca ilgili host'un (ve üst hostların) listesine bak
    const scheme = url.indexOf('://');
    const start = scheme === -1 ? 0 : scheme + 3;
    const slash = url.indexOf('/', start);
    if (slash === -1) return -1;
    const path = url.slice(slash);
    let hh = host;
    while (hh) {
      const node = urlRuleIndex && urlRuleIndex.get(hh);
      if (node) {
        for (const u of node.allow) {
          if (!(u.mask === G_ANY || (u.mask & mask))) continue;
          if (path.startsWith(u.path)) return 0;
        }
        for (const u of node.block) {
          if (!(u.mask === G_ANY || (u.mask & mask))) continue;
          if (path.startsWith(u.path)) return 1;
        }
      }
      const dot = hh.indexOf('.');
      if (dot === -1) break;
      hh = hh.slice(dot + 1);
    }
    return -1;
  }

  function maskForTag(el) {
    const tag = (el && el.tagName || '').toLowerCase();
    switch (tag) {
      case 'img': return G_IMAGE;
      case 'script': return G_SCRIPT;
      case 'iframe': return G_IFRAME;
      case 'video': case 'audio': case 'source': return G_MEDIA;
      case 'object': case 'embed': return G_MEDIA;
      case 'link':
        return /stylesheet/i.test(el.rel || '') ? G_STYLE : G_ANY;
      default: return G_ANY;
    }
  }

  function markBlocked(el, url, mask) {
    blockedCount++;
    timingCount++;
    try {
      el.__prizmaBlocked = url;
      el.setAttribute('data-prizma-blocked', String(mask || G_ANY));
    } catch (e) {}
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(reportStats, 800);
    bumpTimingCleanup();
    return true;
  }

  // ── HTML filtering (uBO HTML filtering eşdeğeri) ───────────────────────────
  // Bloklanan script/iframe öğesi DOM'dan TAMAMEN kaldırılır (uBO'nun yaptığı);
  // medya (img/video/audio) gizlenir (layout kaymasını önler, istek gitmez).
  const REMOVE_TAGS = new Set(['script', 'iframe', 'embed', 'object', 'frame']);
  const HIDE_TAGS = new Set(['img', 'video', 'audio', 'source']);

  function purgeBlocked(el) {
    if (!el || el.nodeType !== 1) return;
    const tag = (el.tagName || '').toLowerCase();
    if (REMOVE_TAGS.has(tag)) {
      try { el.remove(); } catch (e) {}
    } else if (HIDE_TAGS.has(tag)) {
      try {
        el.style.setProperty('display', 'none', 'important');
      } catch (e) {}
    }
  }

  function reportStats() {
    reportTimer = null;
    if (!blockedCount) return;
    const c = blockedCount;
    blockedCount = 0;
    try {
      window.postMessage({ prizmaVanguard: true, type: 'stats', blocked: c }, '*');
    } catch (e) {}
  }

  // ── Resource Timing temizleyici (tam görünmezlik) ────────────────────────
  // Bloklanan istekler performance.getEntriesByType('resource') listesinden
  // silinir; anti-adblock script "bu kaynak hiç yüklenmedi" görür ve Prizma'yı
  // tespit edemez. uBO bunu yapamaz (öğeyi gizler, istek listesinde kalır).
  // performance.clearResourceTimings() tümü siler; ayrım yapılamaz, bu yüzden
  // sadece bloklanmış istek sayısı arttığında temizleriz (nadir yazma).
  let timingTimer = null;
  let timingCount = 0;
  function bumpTimingCleanup() {
    timingCount++;
    if (timingTimer) return;
    timingTimer = setTimeout(() => {
      timingTimer = null;
      try { performance.clearResourceTimings(); } catch (e) {}
    }, 400);
  }
  function maybeCleanTimings() {
    // bir blok olduğunda kayıtları temizle (statik HTML + ağ için)
    if (timingCount > 0) bumpTimingCleanup();
  }

  // ── Prototip yamaları ──────────────────────────────────────────────────────
  // 1) src setter → değer hiç yazılmaz (istek atılmaz, öğe yüklenmez)
  function patchSrcSetter(proto, prop, mask) {
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(proto, prop); } catch (e) { return; }
    if (!desc || !desc.set) return;
    const origSet = desc.set;
    const origGet = desc.get;
    try {
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          if (this.__prizmaBlocked) return '';
          try { return origGet ? origGet.call(this) : ''; } catch (e) { return ''; }
        },
        set(v) {
          if (typeof v === 'string' && v && checkUrl(v, mask) === 1) {
            markBlocked(this, v, mask);
            if (mask === G_SCRIPT) {
              // B18: Script'i DOM'dan kaldırmak yerine HTTP 404 hedefine
              // yönlendir. Tarayıcı script öğesi için onerror üretir →
              // anti-adblock testler "blocked" olarak sonuçlanır. src'yi hiç
              // yazmamak (eski davranış) ne onload ne onerror üretiyordu;
              // loadjs gibi yükleyiciler bu yüzden "checking…" takılıyordu.
              try {
                delete this.__prizmaBlocked;
                origSet.call(this, BLOCK_SCRIPT_URL);
              } catch (e) {}
              return;
            }
            try { if (this.isConnected) purgeBlocked(this); } catch (e) {}
            return; // src HİÇ yazılmaz → öğe yüklenmez
          }
          if (this.__prizmaBlocked) {
            try { delete this.__prizmaBlocked; } catch (e) {}
          }
          try { origSet.call(this, v); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  // 2) setAttribute → src/data/data-src/href/srcset/data-original vb. engelli ise set yapılmaz
  const URL_ATTRS = new Set(['src', 'data', 'data-src', 'data-srcset', 'href',
    'data-original', 'data-lazy-src', 'data-lazy', 'data-srcs', 'data-url',
    'data-href', 'poster', 'data-poster', 'xlink:href', 'data-bg',
    'data-background', 'background', 'imagesrcset', 'srcset']);
  function patchSetAttribute() {
    const elProto = window.Element && Element.prototype;
    if (!elProto) return;
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(elProto, 'setAttribute'); } catch (e) { return; }
    if (!desc || !desc.value) return;
    const orig = desc.value;
    try {
      elProto.setAttribute = function (name, value) {
        const n = String(name).toLowerCase();
        const isUrlAttr = URL_ATTRS.has(n);
        const mask = n === 'src' ? maskForTag(this) : G_ANY;
        if (isUrlAttr && typeof value === 'string' && value) {
          let verdict;
          if (n === 'srcset' || n === 'imagesrcset' || n === 'data-srcset') {
            verdict = checkSrcset(value, mask);
          } else {
            verdict = checkUrl(value, mask);
          }
          if (verdict === 1) {
            markBlocked(this, value, mask);
            try { if (this.isConnected) purgeBlocked(this); } catch (e) {}
            return;
          }
        }
        if (n === 'src' && this.__prizmaBlocked) {
          try { delete this.__prizmaBlocked; } catch (e) {}
        }
        return orig.call(this, name, value);
      };
    } catch (e) {}
  }

  // 3) appendChild/insertBefore → sonradan eklenenleri tara (innerHTML baypası)
  function scanInserted(root) {
    if (!ready) return;
    if (root && root.nodeType === 1 && root.hasAttribute && root.hasAttribute('src')) {
      const v = root.getAttribute('src');
      const m = maskForTag(root);
      if (v && checkUrl(v, m) === 1) {
        markBlocked(root, v, m);
        purgeBlocked(root);
        try { root.removeAttribute('src'); } catch (e) {}
        return;
      }
    }
    if (root && root.nodeType === 1 && root.hasAttribute && root.hasAttribute('srcset')) {
      const v = root.getAttribute('srcset');
      if (v && checkSrcset(v, G_IMAGE) === 1) {
        markBlocked(root, v, G_IMAGE);
        purgeBlocked(root);
        try { root.removeAttribute('srcset'); } catch (e) {}
        return;
      }
    }
    if (!root || !root.querySelectorAll) return;
    let found;
    try {
      found = root.querySelectorAll(
        'img[src],script[src],iframe[src],video[src],audio[src],source[src],' +
        'embed[src],object[data],img[data-src],script[data-src],img[srcset],' +
        'source[srcset],img[data-srcset],iframe[data-src],img[data-original],' +
        'video[poster],div[data-bg],div[data-background],iframe[data-src],' +
        'a[href],link[href],img[data-lazy-src]'
      );
    } catch (e) { return; }
    for (const el of found) {
      const tag = (el.tagName || '').toLowerCase();
      const m = maskForTag(el);
      let attr = null;
      if (tag === 'a' || tag === 'link') attr = 'href';
      else if (el.hasAttribute('srcset')) attr = 'srcset';
      else if (el.hasAttribute('data-srcset')) attr = 'data-srcset';
      else if (el.hasAttribute('src')) attr = 'src';
      else if (el.hasAttribute('data')) attr = 'data';
      else if (el.hasAttribute('data-src')) attr = 'data-src';
      else if (el.hasAttribute('data-original')) attr = 'data-original';
      else if (el.hasAttribute('poster')) attr = 'poster';
      else if (el.hasAttribute('data-bg')) attr = 'data-bg';
      else if (el.hasAttribute('data-background')) attr = 'data-background';
      else if (el.hasAttribute('data-lazy-src')) attr = 'data-lazy-src';
      else continue;
      const v = el.getAttribute(attr);
      if (!v) continue;
      const isMulti = (attr === 'srcset' || attr === 'data-srcset');
      const verdict = isMulti ? checkSrcset(v, m) : checkUrl(v, m);
      if (verdict === 1) {
        markBlocked(el, v, m);
        purgeBlocked(el);
        try { el.removeAttribute(attr); } catch (e) {}
      }
    }
  }

  function patchAppend() {
    const nodeProto = window.Node && Node.prototype;
    if (!nodeProto) return;
    const descAppend = Object.getOwnPropertyDescriptor(nodeProto, 'appendChild');
    if (descAppend && descAppend.value) {
      const orig = descAppend.value;
      nodeProto.appendChild = function (...args) {
        const r = orig.apply(this, args);
        scanInserted(r);
        return r;
      };
    }
    const descInsert = Object.getOwnPropertyDescriptor(nodeProto, 'insertBefore');
    if (descInsert && descInsert.value) {
      const orig = descInsert.value;
      nodeProto.insertBefore = function (...args) {
        const r = orig.apply(this, args);
        scanInserted(args[0]);
        return r;
      };
    }
  }

  // 4) innerHTML setter → set sonrası bloklu src'leri temizle
  function patchInnerHTML() {
    const elProto = window.Element && Element.prototype;
    if (!elProto) return;
    const desc = Object.getOwnPropertyDescriptor(elProto, 'innerHTML');
    if (!desc || !desc.set) return;
    const origSet = desc.set;
    try {
      Object.defineProperty(elProto, 'innerHTML', {
        configurable: true,
        enumerable: desc.enumerable,
        get() { return desc.get ? desc.get.call(this) : ''; },
        set(v) {
          origSet.call(this, v);
          scanInserted(this);
        }
      });
    } catch (e) {}
  }

  // 5) document.write / writeln
  function patchDocumentWrite() {
    const doc = window.document;
    for (const fnName of ['write', 'writeln']) {
      try {
        const orig = doc[fnName];
        if (typeof orig !== 'function') continue;
        doc[fnName] = function (...args) {
          const r = orig.apply(this, args);
          scanInserted(document.documentElement);
          return r;
        };
      } catch (e) {}
    }
  }

  // srcset özel setter — srcset="url 1x, url 2x" liste halinde; engelli aday
  // varsa setter hiç yazmaz. (HTMLImageElement / HTMLSourceElement)
  function patchSrcsetSetter(proto) {
    let desc;
    try { desc = Object.getOwnPropertyDescriptor(proto, 'srcset'); } catch (e) { return; }
    if (!desc || !desc.set) return;
    const origSet = desc.set;
    const origGet = desc.get;
    try {
      Object.defineProperty(proto, 'srcset', {
        configurable: true,
        enumerable: desc.enumerable,
        get() { return origGet ? origGet.call(this) : ''; },
        set(v) {
          if (typeof v === 'string' && v && checkSrcset(v, G_IMAGE) === 1) {
            markBlocked(this, v, G_IMAGE);
            try { if (this.isConnected) purgeBlocked(this); } catch (e) {}
            return; // srcset HİÇ yazılmaz → hiçbir varyant yüklenmez
          }
          try { origSet.call(this, v); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  function applyPatches() {
    patchSrcSetter(window.HTMLImageElement && HTMLImageElement.prototype, 'src', G_IMAGE);
    patchSrcSetter(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src', G_SCRIPT);
    patchSrcSetter(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src', G_IFRAME);
    patchSrcSetter(window.HTMLMediaElement && HTMLMediaElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLEmbedElement && HTMLEmbedElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLObjectElement && HTMLObjectElement.prototype, 'data', G_MEDIA);
    patchSrcSetter(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href', G_ANY);
    patchSrcsetSetter(window.HTMLImageElement && HTMLImageElement.prototype);
    patchSrcsetSetter(window.HTMLSourceElement && HTMLSourceElement.prototype);
    patchSetAttribute();
    patchAppend();
    patchInnerHTML();
    patchDocumentWrite();
  }

  // ── Guard verisi: loader köprüsü ───────────────────────────────────────────
  function init() {
    // Yamaları HEMEN uygula — DOMContentLoaded beklenmez, aksi halde document_start
    // ile DOMContentLoaded arasında koşan sayfa script'leri src setter yamasından
    // kaçar (race condition). Guard verisi async gelir; geldiğinde tüm DOM taranır.
    applyPatches();
    // Guard verisini iste (postMessage köprüsü → loader → background)
    window.postMessage({ prizmaVanguard: true, type: 'getGuard' }, '*');
  }

  let guardRefresh = 0;
  // B10: guard 6.1MB'a büyüdü (AdGuard Tracking 151K host) — 6 kez yeniden
  // alıp parse etmek ana thread'i sayfa başına saniyelerce donduruyordu
  // ("hiçbir site açılmıyor"). Tek tazeleme yeterli: ilk guard'ı statik DOM
  // taraması için al, ardından webBlockedHosts (`w`) güncel gelir.
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.prizmaVanguard !== true) return;
    if (d.type === 'guardData' && typeof d.json === 'string') {
      loadGuard(d.json);
      if (ready) scanInserted(document.documentElement);
      guardRefresh++;
      if (guardRefresh < 2) {
        setTimeout(() => {
          window.postMessage({ prizmaVanguard: true, type: 'getGuard' }, '*');
        }, 800);
      }
    }
  });

  // Enjeksiyon anında hemen başla — readyState'e bakma. Script document_start'ta
  // head'e append edilir ve hemen çalışır; gecikme = kaçırılmış öğe = reklam.
  init();
})();