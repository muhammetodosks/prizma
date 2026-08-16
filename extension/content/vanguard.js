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

  // ── Durum ──────────────────────────────────────────────────────────────────
  let blockTbl = new Map();   // hostname → mask
  let allowTbl = new Map();   // hostname → mask
  let urlRules = [];          // [host, path, mask]
  let ready = false;
  let blockedCount = 0;
  let reportTimer = null;

  function hostToMap(entries) {
    const m = new Map();
    for (const [h, mask] of entries) {
      const k = h.toLowerCase();
      if (!m.has(k)) m.set(k, m.get(k) | mask);
      else m.set(k, m.get(k) | mask);
    }
    return m;
  }

  function loadGuard(json) {
    try {
      const g = JSON.parse(json);
      blockTbl = hostToMap(g.h || []);
      allowTbl = hostToMap(g.a || []);
      urlRules = (g.u || []).map((u) => ({
        host: u[0], path: u[1], mask: u[2], allow: u[3] === 1
      }));
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
    return -1;
  }

  function hostOf(url) {
    const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
    if (m) return m[1];
    const s = url.indexOf('/');
    return s === -1 ? url : url.slice(0, s);
  }

  function checkUrl(url, mask) {
    if (!ready || !url) return -1;
    const host = cleanHost(hostOf(url));
    if (!host) return -1;
    const h = checkHost(host, mask);
    if (h !== -1) return h;
    // yol önek kuralları
    const scheme = url.indexOf('://');
    const start = scheme === -1 ? 0 : scheme + 3;
    const slash = url.indexOf('/', start);
    if (slash === -1) return -1;
    const path = url.slice(slash);
    // exception path kuralları önce
    for (const u of urlRules) {
      if (!u.allow) continue;
      if (!(u.mask === G_ANY || (u.mask & mask))) continue;
      if (host.endsWith(u.host) &&
          (host.length === u.host.length ||
           host[host.length - u.host.length - 1] === '.') &&
          path.startsWith(u.path)) return 0;
    }
    for (const u of urlRules) {
      if (u.allow) continue;
      if (!(u.mask === G_ANY || (u.mask & mask))) continue;
      if (host.endsWith(u.host) &&
          (host.length === u.host.length ||
           host[host.length - u.host.length - 1] === '.') &&
          path.startsWith(u.path)) return 1;
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
    try {
      el.__prizmaBlocked = url;
      el.setAttribute('data-prizma-blocked', String(mask || G_ANY));
    } catch (e) {}
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(reportStats, 800);
    return true;
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

  // 2) setAttribute → src/data/data-src/href engelli ise set yapılmaz
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
        const mask = n === 'src' ? maskForTag(this) : G_ANY;
        if ((n === 'src' || n === 'data' || n === 'data-src' || n === 'href') &&
            typeof value === 'string' && value && checkUrl(value, mask) === 1) {
          markBlocked(this, value, mask);
          return;
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
      if (v && checkUrl(v, m) === 1) { markBlocked(root, v, m); root.removeAttribute('src'); }
    }
    if (!root || !root.querySelectorAll) return;
    let found;
    try { found = root.querySelectorAll('img[src],script[src],iframe[src],video[src],audio[src],source[src],embed[src],object[data],img[data-src],script[data-src]'); } catch (e) { return; }
    for (const el of found) {
      const attr = el.hasAttribute('src') ? 'src' : (el.hasAttribute('data') ? 'data' : 'data-src');
      const v = el.getAttribute(attr);
      const m = maskForTag(el);
      if (v && checkUrl(v, m) === 1) {
        markBlocked(el, v, m);
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

  function applyPatches() {
    patchSrcSetter(window.HTMLImageElement && HTMLImageElement.prototype, 'src', G_IMAGE);
    patchSrcSetter(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src', G_SCRIPT);
    patchSrcSetter(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src', G_IFRAME);
    patchSrcSetter(window.HTMLMediaElement && HTMLMediaElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLEmbedElement && HTMLEmbedElement.prototype, 'src', G_MEDIA);
    patchSrcSetter(window.HTMLObjectElement && HTMLObjectElement.prototype, 'data', G_MEDIA);
    patchSrcSetter(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href', G_ANY);
    patchSetAttribute();
    patchAppend();
    patchInnerHTML();
    patchDocumentWrite();
  }

  // ── Guard verisi: loader köprüsü ───────────────────────────────────────────
  function init() {
    // Guard verisini iste (postMessage köprüsü → loader → background)
    window.postMessage({ prizmaVanguard: true, type: 'getGuard' }, '*');
    applyPatches();
  }

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.prizmaVanguard !== true) return;
    if (d.type === 'guardData' && typeof d.json === 'string') {
      loadGuard(d.json);
      if (ready) scanInserted(document.documentElement);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();