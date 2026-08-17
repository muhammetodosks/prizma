// Prizma snippets — ana dünyada (main world) çalışan uBO uyumlu scriptlet'ler
// Content script tarafından: <script src=".../snippets.js?name,arg1,arg2">
(function () {
  'use strict';
  if (window.__prizmaSnippetsLoaded) return;
  window.__prizmaSnippetsLoaded = true;

  const q = (() => {
    try {
      const src = document.currentScript && document.currentScript.src;
      if (!src) return null;
      const i = src.indexOf('?');
      return i >= 0 ? decodeURIComponent(src.slice(i + 1)) : null;
    } catch (e) { return null; }
  })();
  if (!q) return;

  const parts = q.split(',').map(s => s.trim());
  const name = parts.shift();
  if (!name) return;

  const log = (...m) => {
    try { console.info('[prizma]', ...m); } catch (e) {}
  };

  const safeWindow = window;
  const safeDocument = document;
  const T = () => true;
  const F = () => false;

  const noopPassive = () => {};

  // ── abort-current-inline-script ──────────────────────────────────────────
  const abortCurrentInlineScript = (needle) => {
    const target = needle || '';
    try {
      const nativeFn = Function.prototype.apply;
      Function.prototype.apply = function (thisArg, argsArray) {
        const src = String(this).slice(0, 256).toLowerCase();
        if (target && src.indexOf(target.toLowerCase()) !== -1) {
          log('abort-current-inline-script:', target);
          throw new Error('aborted by prizma');
        }
        return nativeFn.call(this, thisArg, argsArray);
      };
    } catch (e) {}
  };

  // ── abort-on-stack-trace ─────────────────────────────────────────────────
  const abortOnStackTrace = (prop, stackNeedle) => {
    const key = Array.isArray(prop) ? prop[0] : prop;
    if (typeof key !== 'string' || key.length === 0) return;
    const obj = window;
    const parts = key.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) return;
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (typeof o[last] !== 'function') return;
    const orig = o[last];
    o[last] = function () {
      const st = (new Error()).stack || '';
      if (stackNeedle && st.toLowerCase().indexOf(String(stackNeedle).toLowerCase()) !== -1) {
        log('abort-on-stack-trace:', key);
        return undefined;
      }
      return orig.apply(this, arguments);
    };
  };

  // ── addEventListener-defuser ──────────────────────────────────────────────
  const addEventListenerDefuser = (target, type, needle) => {
    try {
      const proto = (target === 'window' ? window : document).EventTarget.prototype;
      const origAdd = proto.addEventListener;
      const isType = (t) => !type || t === type;
      const isNeedle = (fn) => !needle || String(fn).indexOf(needle) !== -1;
      proto.addEventListener = function (t, fn, opts) {
        if (isType(t) && typeof fn === 'function' && isNeedle(fn)) {
          log('addEventListener-defuser:', t);
          return;
        }
        return origAdd.call(this, t, fn, opts);
      };
    } catch (e) {}
  };

  // ── alert / confirm / prompt buster ───────────────────────────────────────
  const alertBuster = () => {
    window.alert = (msg) => { log('alert-blocked:', String(msg).slice(0, 80)); };
  };
  const confirmBuster = () => {
    window.confirm = () => true;
  };
  const promptBuster = () => {
    window.prompt = () => null;
  };

  // ── noeval ────────────────────────────────────────────────────────────────
  const noeval = () => {
    try {
      window.eval = function () { throw new Error('eval blocked by prizma'); };
      window.Function.prototype.constructor = function () {
        throw new Error('new Function blocked by prizma');
      };
    } catch (e) {}
  };

  // ── no-window-open ────────────────────────────────────────────────────────
  const noWindowOpen = () => {
    try {
      window.open = function () { log('window.open blocked'); return null; };
    } catch (e) {}
  };

  // ── close-window ──────────────────────────────────────────────────────────
  const closeWindow = (delay) => {
    const ms = parseInt(delay || '0', 10);
    const doClose = () => { try { window.close(); } catch (e) {} };
    if (ms > 0) setTimeout(doClose, ms); else doClose();
  };

  // ── disable-newtab-link ───────────────────────────────────────────────────
  const disableNewtabLink = () => {
    try {
      window.addEventListener('click', (ev) => {
        const a = ev.target && ev.target.closest ? ev.target.closest('a[target="_blank"]') : null;
        if (a) { a.removeAttribute('target'); }
      }, true);
    } catch (e) {}
  };

  // ── json-prune ────────────────────────────────────────────────────────────
  const jsonPrune = (props) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) {
        for (const v of val) prune(v);
      } else if (val && typeof val === 'object') {
        for (const key of pruneList) {
          try { delete val[key]; } catch (e) {}
        }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    try {
      const origParse = JSON.parse;
      JSON.parse = function (text, reviver) {
        const r = origParse.call(this, text, reviver);
        prune(r);
        return r;
      };
    } catch (e) {}
  };

  // ── prevent-fetch ─────────────────────────────────────────────────────────
  const preventFetch = (needles) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const match = (url) => {
      if (!list.length) return true;
      const u = String(url).toLowerCase();
      return list.some(n => n && u.indexOf(n.toLowerCase()) !== -1);
    };
    try {
      const orig = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (match(url)) {
          log('prevent-fetch:', url);
          return Promise.reject(new TypeError('fetch blocked by prizma'));
        }
        return orig.call(this, input, init);
      };
    } catch (e) {}
  };

  // ── prevent-xhr ───────────────────────────────────────────────────────────
  const preventXhr = (needles) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const match = (url) => {
      if (!list.length) return true;
      const u = String(url).toLowerCase();
      return list.some(n => n && u.indexOf(n.toLowerCase()) !== -1);
    };
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__prizmaUrl = url || '';
        if (match(this.__prizmaUrl)) {
          this.__prizmaBlocked = true;
          log('prevent-xhr:', url);
          return;
        }
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        if (this.__prizmaBlocked) {
          setTimeout(() => {
            try { this.abort(); } catch (e) {}
            try { this.onerror && this.onerror(new Event('error')); } catch (e) {}
          }, 0);
          return;
        }
        return origSend.apply(this, arguments);
      };
    } catch (e) {}
  };

  // ── set-constant ──────────────────────────────────────────────────────────
  const setConstant = (key, value) => {
    let v = value;
    if (v === 'undefined') v = undefined;
    else if (v === 'false') v = false;
    else if (v === 'true') v = true;
    else if (v === 'null') v = null;
    else if (v === 'emptyObj') v = {};
    else if (v === 'emptyArr') v = [];
    else if (v === 'noopFunc') v = () => {};
    else if (v === 'noopPrimitive') v = undefined;
    else if (v === 'noopScript') v = () => {};
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    const obj = window;
    let o = obj;
    const parts = String(key).split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) { o[parts[i]] = {}; }
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    let setter;
    try { setter = Object.getOwnPropertyDescriptor(o, last) && o[last]; } catch (e) {}
    if (typeof setter === 'function') {
      Object.defineProperty(o, last, {
        get: () => v, set: () => {}, configurable: true
      });
    } else {
      try { o[last] = v; } catch (e) {}
    }
  };

  // ── set-cookie / remove-cookie ────────────────────────────────────────────
  const setCookie = (key, value) => {
    try { safeDocument.cookie = key + '=' + value + '; path=/; max-age=31536000'; } catch (e) {}
  };
  const removeCookie = (keys) => {
    (keys || '').split(' ').filter(Boolean).forEach((k) => {
      try { safeDocument.cookie = k + '=; path=/; max-age=0'; } catch (e) {}
    });
  };

  // ── replace-node-text ─────────────────────────────────────────────────────
  const replaceNodeText = (needle, replacement) => {
    const n = String(needle || '');
    const r = String(replacement || '');
    if (!n) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.indexOf(n) !== -1) targets.push(node);
    }
    targets.forEach((tn) => { tn.nodeValue = tn.nodeValue.split(n).join(r); });
  };

  // ── set-attr ──────────────────────────────────────────────────────────────
  const setAttr = (selector, attr, value) => {
    if (!selector) return;
    const set = () => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (attr === 'data-toscript' && value === 'true') el.removeAttribute('data-toscript');
          else el.setAttribute(attr, value || '');
        });
      } catch (e) {}
    };
    set();
    try {
      new MutationObserver(set).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── remove-attr ───────────────────────────────────────────────────────────
  const removeAttr = (selector, attr) => {
    if (!selector) return;
    const remove = () => {
      try {
        document.querySelectorAll(selector).forEach((el) => { el.removeAttribute(attr); });
      } catch (e) {}
    };
    remove();
    try {
      new MutationObserver(remove).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── prevent-setTimeout / prevent-setInterval ─────────────────────────────
  const preventSetTimer = (timerFn, needles) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const match = (fn) => {
      if (!list.length) return false;
      const s = String(fn).toLowerCase();
      return list.some(n => n && s.indexOf(n.toLowerCase()) !== -1);
    };
    try {
      const orig = window[timerFn];
      window[timerFn] = function (fn, delay, ...rest) {
        if (typeof fn === 'function' && match(fn)) {
          log(timerFn + '-blocked:', delay);
          return 0;
        }
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };

  // ── spoof-css ─────────────────────────────────────────────────────────────
  const spoofCss = (props, value) => {
    const v = value === 'undefined' ? undefined : value;
    const list = (props || '').split(' ').filter(Boolean);
    if (!list.length) return;
    const css = list.map(p => p + ': ' + (v === undefined ? 'auto !important' : (v + ' !important')) + ';').join(' ');
    try {
      const style = document.createElement('style');
      style.id = 'prizma-spoof-css';
      style.textContent = '*{' + css + '}';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  };

  // ── trusted-replace-xhr / trusted-replace-fetch-response ────────────────
  const replaceXhr = (needles, props, val) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const pruneList = (props || '').split(' ').filter(Boolean);
    const isMatch = (url) => !list.length || list.some(n => n && url.indexOf(n) !== -1);
    const patchVal = (v) => {
      if (pruneList.length === 0) return v;
      for (const p of pruneList) {
        try {
          if (Array.isArray(v)) { v = v.map(x => (x && typeof x === 'object' ? patchVal(x) : x)); }
          else if (v && typeof v === 'object') { delete v[p]; v[p] = val === undefined ? '' : val; }
        } catch (e) {}
      }
      return v;
    };
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__prizmaUrl = String(url || '');
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        if (isMatch(this.__prizmaUrl)) {
          try {
            const text = patchVal(this.responseText || '');
            this.responseText = text;
          } catch (e) {}
        }
        return origSend.apply(this, arguments);
      };
    } catch (e) {}
  };

  // ── trusted-set-constant ─────────────────────────────────────────────────
  const trustedSetConstant = (key, value) => {
    setConstant(key, value);
  };

  // ── trusted-replace-fetch-response ───────────────────────────────────────
  const replaceFetchResponse = (needles, props, val) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const pruneList = (props || '').split(' ').filter(Boolean);
    const isMatch = (url) => !list.length || list.some(n => n && url.indexOf(n) !== -1);
    const patchVal = (v) => {
      if (pruneList.length === 0) return v;
      for (const p of pruneList) {
        try {
          if (Array.isArray(v)) { v = v.map(x => (x && typeof x === 'object' ? patchVal(x) : x)); }
          else if (v && typeof v === 'object') { delete v[p]; v[p] = val === undefined ? '' : val; }
        } catch (e) {}
      }
      return v;
    };
    try {
      const orig = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        return orig.call(this, input, init).then(async (res) => {
          if (!isMatch(url)) return res;
          try {
            const clone = res.clone();
            let body = await clone.text();
            let parsed = null;
            try { parsed = JSON.parse(body); } catch (e) {}
            if (parsed) { parsed = patchVal(parsed); body = JSON.stringify(parsed); }
            return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
          } catch (e) { return res; }
        });
      };
    } catch (e) {}
  };

  // ── abort-on-property-read (aost) ────────────────────────────────────────
  // window[kök.yol] okunduğunda hata fırlatır (AdGuard abort-on-property-read)
  const abortOnPropertyRead = (prop, needle) => {
    const key = Array.isArray(prop) ? prop[0] : prop;
    if (typeof key !== 'string' || !key) return;
    const parts = key.split('.');
    let o = window;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) return;
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    try {
      Object.defineProperty(o, last, {
        configurable: true,
        get() {
          log('abort-on-property-read:', key);
          if (needle) throw new Error('aborted by prizma');
          return undefined;
        },
        set(v) { if (!needle) log('abort-on-property-read(set):', key); }
      });
    } catch (e) {}
  };

  // ── no-setTimeout-if (AdGuard no-setTimeout-if) ──────────────────────────
  const noSetTimeoutIf = (needle) => {
    const n = String(needle || '');
    if (!n) return;
    try {
      const orig = window.setTimeout;
      window.setTimeout = function (fn, delay, ...rest) {
        const s = String(fn).toLowerCase();
        if (s.indexOf(n.toLowerCase()) !== -1) { log('no-setTimeout-if:', n); return 0; }
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };

  // ── no-xhr-if (AdGuard no-xhr-if) ────────────────────────────────────────
  const noXhrIf = (needle) => {
    preventXhr(needle);
  };

  // ── remove-class ─────────────────────────────────────────────────────────
  const removeClass = (selector, cls) => {
    if (!selector) return;
    const run = () => {
      try {
        document.querySelectorAll(selector).forEach((el) => { el.classList.remove(cls); });
      } catch (e) {}
    };
    run();
    try {
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  };

  // ── remove-node-text (AdGuard) ───────────────────────────────────────────
  const removeNodeText = (nodeType, needle) => {
    const n = String(needle || '');
    if (!n) return;
    const type = String(nodeType || '').toLowerCase();
    const run = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || node.nodeValue.indexOf(n) === -1) continue;
        if (type && node.parentNode) {
          const t = node.parentNode.tagName.toLowerCase();
          if (t !== type) continue;
        }
        targets.push(node);
      }
      targets.forEach((tn) => { try { tn.remove(); } catch (e) {} });
    };
    run();
    try {
      new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── google-ima (uBO google-ima) ──────────────────────────────────────────
  const googleIma = () => {
    const fakeCue = { error: null };
    const noop = () => {};
    const fakePlayer = {
      getAdDisplayContainer: noop, load: noop, addEventListener: noop,
      removeEventListener: noop, setAdWillAutoPlayCleanup: noop
    };
    try {
      const goog = window.googletag || {};
      goog.cmd = goog.cmd || [];
      goog.ima = {
        AdDisplayContainer: function () { this.load = noop; },
        AdsRequest: function () {},
        AdsLoader: function () { this.requestAds = noop; this.addEventListener = noop; },
        AdErrorEvent: fakeCue,
        AdEvent: fakeCue,
        AdManager: function () { return fakePlayer; },
        ViewMode: { NORMAL: 0 }
      };
      window.googletag = goog;
      window.google = window.google || {};
      window.google.ima = goog.ima;
    } catch (e) {}
  };

  // ── abort-on-property-write (aopw) ───────────────────────────────────────
  const abortOnPropertyWrite = (prop, needle) => {
    const key = Array.isArray(prop) ? prop[0] : prop;
    if (typeof key !== 'string' || !key) return;
    const parts = key.split('.');
    let o = window;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) return;
      o = o[parts[i]];
    }
    const last = parts[parts.length - 1];
    try {
      Object.defineProperty(o, last, {
        configurable: true,
        get() { return undefined; },
        set(v) {
          log('abort-on-property-write:', key);
          if (needle) throw new Error('aborted by prizma');
        }
      });
    } catch (e) {}
  };

  // ── no-window-open-if (nowoif) ───────────────────────────────────────────
  const noWindowOpenIf = (needle) => {
    const n = String(needle || '').toLowerCase();
    try {
      const orig = window.open;
      window.open = function (url, ...rest) {
        const u = String(url || '').toLowerCase();
        if (!n || u.indexOf(n) !== -1) {
          log('no-window-open-if:', url);
          return null;
        }
        return orig.call(this, url, ...rest);
      };
    } catch (e) {}
  };

  // ── disable-webRTC (nowebrtc) ────────────────────────────────────────────
  const disableWebRTC = () => {
    try {
      const no = () => undefined;
      const RTCPeerConnection = window.RTCPeerConnection;
      if (RTCPeerConnection) {
        for (const m of ['createOffer', 'createAnswer', 'setLocalDescription', 'setRemoteDescription', 'addIceCandidate', 'createDataChannel']) {
          try { RTCPeerConnection.prototype[m] = no; } catch (e) {}
        }
      }
      try { window.RTCPeerConnection.prototype.getStats = function (cb) { cb([]); }; } catch (e) {}
      try { window.webkitRTCPeerConnection = RTCPeerConnection; } catch (e) {}
    } catch (e) {}
  };

  // ── noeval-if ────────────────────────────────────────────────────────────
  const noevalIf = (needle) => {
    const n = String(needle || '').toLowerCase();
    if (!n) return;
    const check = (s) => String(s).toLowerCase().indexOf(n) !== -1;
    try {
      const origEval = window.eval;
      window.eval = function (code) {
        if (check(code)) { log('noeval-if:', n); return undefined; }
        return origEval.call(this, code);
      };
    } catch (e) {}
    try {
      const origFn = window.Function;
      window.Function = function (...args) {
        const body = args.pop() || '';
        if (check(body)) { log('noeval-if(Function):', n); return function () {}; }
        return origFn.apply(this, [...args, body]);
      };
      window.Function.prototype = origFn.prototype;
    } catch (e) {}
  };

  // ── popads / popads-dummy ────────────────────────────────────────────────
  const popads = () => {
    try {
      const no = () => {};
      const fake = {
        init: no, setTimeout: no, setInterval: no, EventTracker: function () {},
        EventTrack: function () {}, Events: function () {}, getRetVal: () => true
      };
      window.popads = fake;
      window.popads_dummy = fake;
      window.popads_js = fake;
    } catch (e) {}
  };

  // ── refresh-defuser ──────────────────────────────────────────────────────
  const refreshDefuser = (delay) => {
    const n = parseInt(String(delay || '').trim() || '1', 10);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      const origReload = Location.prototype.reload;
      Location.prototype.reload = function () {
        log('refresh-defuser: reload blocked');
      };
      // bazı siteler location.href = location.href ile yeniler
      let last = 0;
      const guard = (fn) => function (...args) {
        const now = Date.now();
        if (now - last > n * 1000) { last = now; return fn.apply(this, args); }
        log('refresh-defuser: blocked');
        return undefined;
      };
      try { HTMLAnchorElement.prototype.click = guard(HTMLAnchorElement.prototype.click); } catch (e) {}
      void origReload;
    } catch (e) {}
  };

  // ── fingerprint2 (fngprnt) ───────────────────────────────────────────────
  const fingerprint2 = () => {
    try {
      if (window.Fingerprint2) {
        window.Fingerprint2.get = () => Promise.resolve('0000000000000000');
        window.Fingerprint2.getV18 = (cb) => { setTimeout(() => cb('0000000000000000'), 10); };
      }
      if (window.FingerprintJS) {
        window.FingerprintJS.load = () => Promise.resolve({ get: () => Promise.resolve({ visitorId: '0000000000000000' }) });
      }
    } catch (e) {}
  };

  // ── cookie-remover (cookie-remover) ──────────────────────────────────────
  const cookieRemover = (needles) => {
    const list = (needles || '').split(' ').filter(Boolean);
    const run = () => {
      try {
        document.cookie.split(';').forEach((c) => {
          const eq = c.indexOf('=');
          const k = (eq === -1 ? c : c.slice(0, eq)).trim();
          if (list.some(n => n && k.toLowerCase().indexOf(n.toLowerCase()) !== -1)) {
            safeDocument.cookie = k + '=; path=/; max-age=0; domain=.' + location.hostname;
            safeDocument.cookie = k + '=; path=/; max-age=0';
          }
        });
      } catch (e) {}
    };
    run();
    try {
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── set-local-storage-item ───────────────────────────────────────────────
  const setLocalStorageItem = (key, value) => {
    try {
      const v = value === 'undefined' ? undefined : value;
      localStorage.setItem(key, v);
    } catch (e) {}
  };

  // ── json-prune-xhr-response (json-prune için xhr versiyonu) ──────────────
  const jsonPruneXhrResponse = (props) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) { for (const v of val) prune(v); }
      else if (val && typeof val === 'object') {
        for (const key of pruneList) { try { delete val[key]; } catch (e) {} }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    try {
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function () {
        const res = origSend.apply(this, arguments);
        try {
          const origGet = XMLHttpRequest.prototype.__lookupGetter__('responseText');
          const self = this;
          Object.defineProperty(this, 'responseText', {
            get() {
              const raw = origGet ? origGet.call(self) : '';
              try { const parsed = JSON.parse(raw); prune(parsed); return JSON.stringify(parsed); }
              catch (e) { return raw; }
            },
            configurable: true
          });
        } catch (e) {}
        return res;
      };
    } catch (e) {}
  };

  // ── json-prune-fetch-response / jsonl-edit-xhr-response ──────────────────
  const jsonPruneFetchResponse = (props) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) { for (const v of val) prune(v); }
      else if (val && typeof val === 'object') {
        for (const key of pruneList) { try { delete val[key]; } catch (e) {} }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    try {
      const orig = window.fetch;
      window.fetch = function (input, init) {
        return orig.call(this, input, init).then(async (res) => {
          try {
            const clone = res.clone();
            let body = await clone.text();
            const parsed = JSON.parse(body);
            prune(parsed);
            return new Response(JSON.stringify(parsed), { status: res.status, statusText: res.statusText, headers: res.headers });
          } catch (e) { return res; }
        });
      };
    } catch (e) {}
  };

  // ── adjust-setTimeout ────────────────────────────────────────────────────
  const adjustSetTimeout = (needle, minDelay, maxDelay) => {
    const n = String(needle || '').toLowerCase();
    const lo = parseFloat(minDelay);
    const hi = parseFloat(maxDelay);
    try {
      const orig = window.setTimeout;
      window.setTimeout = function (fn, delay, ...rest) {
        if (n && typeof fn === 'function' && String(fn).toLowerCase().indexOf(n) !== -1) {
          let d = parseFloat(delay) || 0;
          if (Number.isFinite(lo)) d = Math.max(lo, d);
          if (Number.isFinite(hi)) d = Math.min(hi, d);
          log('adjust-setTimeout:', d);
          return orig.call(this, fn, d, ...rest);
        }
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };

  // ── href-sanitizer ───────────────────────────────────────────────────────
  const hrefSanitizer = (selector) => {
    try {
      const safe = (href) => {
        try {
          const u = new URL(href, location.href);
          if (u.protocol === 'javascript:') return 'about:blank';
        } catch (e) {}
        return href;
      };
      const fix = () => {
        try {
          document.querySelectorAll(selector || 'a[href^="javascript:"]').forEach((a) => {
            if (a.href && a.getAttribute('href')) {
              a.setAttribute('href', safe(a.getAttribute('href')));
            }
          });
        } catch (e) {}
      };
      fix();
      try {
        new MutationObserver(fix).observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) {}
    } catch (e) {}
  };

  // ── no-requestAnimationFrame-if (norafif) ────────────────────────────────
  const noRafIf = (needle) => {
    const n = String(needle || '').toLowerCase();
    if (!n) return;
    try {
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        if (typeof cb === 'function' && String(cb).toLowerCase().indexOf(n) !== -1) {
          log('no-requestAnimationFrame-if:', n);
          return 0;
        }
        return orig.call(this, cb);
      };
    } catch (e) {}
  };

  // ── xml-prune (json-prune'un XHR text variantı) ──────────────────────────
  const xmlPrune = (props) => {
    jsonPruneXhrResponse(props);
  };

  // ── nobab / nofab / nano-sib / nano-stb (anti-adblock bypass) ────────────
  // AdBlock savaş algoritmalarını devre dışı bırakır; window.__adblock__ tespiti engellenir.
  const antiAdblockBypass = () => {
    const no = () => true;
    try {
      if (window.detectedAdBlock === undefined) { Object.defineProperty(window, 'detectedAdBlock', { get: no, configurable: true }); }
      else { window.detectedAdBlock = no; }
      if (window.__adBlockInit === undefined) { window.__adBlockInit = true; }
      const fakeCanDetect = () => false;
      try { window.__canBlockAds = no; } catch (e) {}
      try { window.__adblockStatus = 'off'; } catch (e) {}
      const spoof = () => no;
      try {
        const origGoogletag = window.googletag;
        if (origGoogletag) {
          origGoogletag.cmd = origGoogletag.cmd || [];
          origGoogletag.pubads = () => ({
            enableSingleRequest: no, disableInitialLoad: no, refresh: no,
            setTargeting: no, setSlot: no, enableServices: no
          });
        }
      } catch (e) {}
      void fakeCanDetect; void spoof;
    } catch (e) {}
  };

  // ── addEventListener-logger (aell) ───────────────────────────────────────
  const addEventListenerLogger = (target, type, needle) => {
    try {
      const proto = (target === 'window' ? window : document).EventTarget.prototype;
      const origAdd = proto.addEventListener;
      proto.addEventListener = function (t, fn, opts) {
        const okType = !type || t === type;
        const okNeedle = !needle || (typeof fn === 'function' && String(fn).indexOf(needle) !== -1);
        if (okType && okNeedle) { try { console.log('[prizma:log]', t, String(fn).slice(0, 120)); } catch (e) {} }
        return origAdd.call(this, t, fn, opts);
      };
    } catch (e) {}
  };

  // ── addEventListener-remove ───────────────────────────────────────────────
  const addEventListenerRemove = (target, type, needle) => {
    try {
      const proto = (target === 'window' ? window : document).EventTarget.prototype;
      const origRemove = proto.removeEventListener;
      proto.removeEventListener = function (t, fn, opts) {
        if (type && t !== type) return origRemove.call(this, t, fn, opts);
        if (needle && typeof fn === 'function' && String(fn).indexOf(needle) === -1) {
          return origRemove.call(this, t, fn, opts);
        }
        return origRemove.call(this, t, fn, opts);
      };
    } catch (e) {}
  };

  // ── adjust-setInterval (asi) ─────────────────────────────────────────────
  const adjustSetInterval = (needle, minDelay, maxDelay) => {
    const n = String(needle || '').toLowerCase();
    const lo = parseFloat(minDelay);
    const hi = parseFloat(maxDelay);
    try {
      const orig = window.setInterval;
      window.setInterval = function (fn, delay, ...rest) {
        if (n && typeof fn === 'function' && String(fn).toLowerCase().indexOf(n) !== -1) {
          let d = parseFloat(delay) || 0;
          if (Number.isFinite(lo)) d = Math.max(lo, d);
          if (Number.isFinite(hi)) d = Math.min(hi, d);
          return orig.call(this, fn, d, ...rest);
        }
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };

  // ── all-arguments-defuse ─────────────────────────────────────────────────
  const allArgumentsDefuse = () => {
    try {
      const origApply = Function.prototype.apply;
      Function.prototype.apply = function () {
        const fn = this;
        const args = arguments[1] || [];
        if (typeof fn === 'function' && String(fn).length > 1) {
          for (const a of args) {
            if (typeof a === 'string' && a.toLowerCase().indexOf('ad') !== -1 && a.length > 20) {
              return undefined;
            }
          }
        }
        return origApply.apply(this, arguments);
      };
    } catch (e) {}
  };

  // ── assign-tie ───────────────────────────────────────────────────────────
  const assignTie = (from, to) => {
    const f = String(from || '');
    const t = String(to || '');
    if (!f || !t) return;
    const parts = t.split('.');
    const set = (v) => {
      let o = window;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null) return;
        o = o[parts[i]];
      }
      try { o[parts[parts.length - 1]] = v; } catch (e) {}
    };
    try {
      const orig = window[f];
      if (typeof orig === 'function') {
        Object.defineProperty(window, f, {
          configurable: true,
          get: () => function () { const v = orig.apply(this, arguments); set(v); return v; },
          set: () => {}
        });
      }
    } catch (e) {}
  };

  // ── base64-prune / base64-json-prune ─────────────────────────────────────
  const base64Prune = (props, needle, repl) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) { for (const v of val) prune(v); }
      else if (val && typeof val === 'object') {
        for (const key of pruneList) { try { delete val[key]; } catch (e) {} }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    const decode = (s) => {
      try {
        const bin = atob(s);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      } catch (e) { return null; }
    };
    const encode = (s) => {
      try {
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      } catch (e) { return s; }
    };
    try {
      const origParse = JSON.parse;
      JSON.parse = function (text, reviver) {
        const r = origParse.call(this, text, reviver);
        prune(r);
        return r;
      };
    } catch (e) {}
    try {
      const origAtob = window.atob;
      window.atob = function (s) {
        const raw = origAtob.call(this, s);
        const decoded = decode(raw);
        if (decoded) {
          try {
            const parsed = JSON.parse(decoded);
            prune(parsed);
            return encode(JSON.stringify(parsed));
          } catch (e) {}
        }
        return raw;
      };
    } catch (e) {}
  };

  // ── cdc-defuser ──────────────────────────────────────────────────────────
  const cdcDefuser = () => {
    try {
      const check = (el) => {
        if (el && el.getAttribute && el.getAttribute('_cdc_')) {
          el.removeAttribute('_cdc_');
        }
      };
      check(document.documentElement);
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) {
              check(n);
              if (n.querySelectorAll) n.querySelectorAll('[_cdc_]').forEach(check);
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── create-element-token ─────────────────────────────────────────────────
  const createElementToken = () => {
    try {
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag, opts) {
        const el = origCreate(tag, opts);
        if (tag && String(tag).toLowerCase().indexOf('script') !== -1) {
          try { el.setAttribute('data-prizma-token', token); } catch (e) {}
        }
        return el;
      };
    } catch (e) {}
  };

  // ── detailed-events / simplified-events ─────────────────────────────────
  const detailedEvents = () => {
    try {
      const store = window.__prizmaEvents || (window.__prizmaEvents = []);
      const proto = EventTarget.prototype;
      const origAdd = proto.addEventListener;
      proto.addEventListener = function (t, fn, opts) {
        try { store.push({ t, fn: String(fn).slice(0, 100), at: Date.now() }); } catch (e) {}
        return origAdd.call(this, t, fn, opts);
      };
    } catch (e) {}
  };
  const simplifiedEvents = detailedEvents;

  // ── disable-pinterest ────────────────────────────────────────────────────
  const disablePinterest = () => {
    try {
      window.addEventListener('click', (ev) => {
        const a = ev.target && ev.target.closest ? ev.target.closest('a[data-pin-do], a[href*="pinterest.com/pin"]') : null;
        if (a) ev.preventDefault();
      }, true);
    } catch (e) {}
  };

  // ── disable-pubwise ──────────────────────────────────────────────────────
  const disablePubwise = () => {
    try {
      window.pubwise = undefined;
      if (window.googletag && window.googletag.pubads) {
        const no = () => {};
        window.googletag.pubads = () => ({
          enableSingleRequest: no, disableInitialLoad: no, refresh: no,
          setTargeting: no, setSlot: no, enableServices: no, addEventListener: no
        });
      }
    } catch (e) {}
  };

  // ── disable-youtube-player ───────────────────────────────────────────────
  const disableYoutubePlayer = () => {
    try {
      const no = () => {};
      window.YT = {
        Player: function () {}, PlayerState: {}, Loading: function () {},
        PlayerVars: {}, Playlist: {}, enableJsApi: no
      };
      window.onYouTubeIframeAPIReady = no;
      const origPush = Array.prototype.push;
      Array.prototype.push = function (...items) {
        if (this === window && items.length && items[0] && items[0].eventName) {
          return this.length;
        }
        return origPush.apply(this, items);
      };
    } catch (e) {}
  };

  // ── element-popover-defuser ─────────────────────────────────────────────
  const elementPopoverDefuser = (selector) => {
    try {
      const run = () => {
        document.querySelectorAll(selector || '[data-popper-placement], [x-placement]').forEach((el) => {
          const parent = el.closest('[data-popper-reference-hidden]');
          if (parent) parent.removeAttribute('data-popper-reference-hidden');
        });
      };
      run();
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── elements-js-nowebrtc ─────────────────────────────────────────────────
  const elementsJsNoWebrtc = () => {
    disableWebRTC();
  };

  // ── eval-data-prune ─────────────────────────────────────────────────────
  const evalDataPrune = (props) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) { for (const v of val) prune(v); }
      else if (val && typeof val === 'object') {
        for (const key of pruneList) { try { delete val[key]; } catch (e) {} }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    try {
      const origEval = window.eval;
      window.eval = function (code) {
        const r = origEval.call(this, code);
        prune(r);
        return r;
      };
    } catch (e) {}
  };

  // ── event-scheduler ─────────────────────────────────────────────────────
  const eventScheduler = (delay, evts) => {
    const ms = parseInt(String(delay || '0').trim(), 10) || 0;
    const names = (evts || '').split(' ').filter(Boolean);
    try {
      setTimeout(() => {
        for (const n of names) {
          try { window.dispatchEvent(new Event(n)); } catch (e) {}
        }
      }, ms);
    } catch (e) {}
  };

  // ── fetch-request / xhr-request ─────────────────────────────────────────
  const fetchRequest = (url, props) => {
    try {
      const u = String(url || '');
      if (!u) return;
      fetch(u).then((r) => r.text()).then((t) => {
        try {
          const json = JSON.parse(t);
          const pruneList = (props || '').split(' ').filter(Boolean);
          const prune = (val) => {
            if (Array.isArray(val)) { for (const v of val) prune(v); }
            else if (val && typeof val === 'object') {
              for (const key of pruneList) { try { delete val[key]; } catch (e) {} }
              for (const k of Object.keys(val)) prune(val[k]);
            }
          };
          prune(json);
          window.__prizmaFetched = json;
        } catch (e) {}
      }).catch(() => {});
    } catch (e) {}
  };
  const xhrRequest = (url, props) => {
    fetchRequest(url, props);
  };

  // ── fiddle-scriptlet ────────────────────────────────────────────────────
  const fiddleScriptlet = () => {};

  // ── googletagservices-defuser ───────────────────────────────────────────
  const googletagservicesDefuser = () => {
    try {
      const no = () => {};
      if (!window.googletag) window.googletag = {};
      const googletag = window.googletag;
      googletag.cmd = googletag.cmd || [];
      const push = googletag.cmd.push.bind(googletag.cmd);
      googletag.cmd.push = (f) => { if (typeof f === 'function') { try { f(); } catch (e) {} } return 1; };
      googletag.pubads = () => ({
        enableSingleRequest: no, disableInitialLoad: no, refresh: no,
        setTargeting: no, setSlot: no, enableServices: no, addEventListener: no,
        removeEventListener: no, set: no, get: () => undefined
      });
      googletag.display = no;
      googletag.enableServices = no;
      googletag.destroySlots = no;
      googletag.sizeMapping = () => ({ addSize: () => ({ build: () => ({}) }) });
      googletag.defineSlot = () => ({
        addService: no, setTargeting: no, defineSizeMapping: no,
        setCollapseEmptyDiv: no, addEventListener: no, set: no
      });
      googletag.defineOutOfPageSlot = () => ({ addService: no });
      googletag.Slot = function () {};
      void push;
    } catch (e) {}
  };

  // ── iframe-abort-current-script ─────────────────────────────────────────
  const iframeAbortCurrentScript = (needle) => {
    try {
      const frames = window.frames || [];
      for (let i = 0; i < frames.length; i++) {
        try {
          const w = frames[i];
          const src = String(w.location.href || '');
          if (needle && src.toLowerCase().indexOf(String(needle).toLowerCase()) === -1) continue;
          const origApply = Function.prototype.apply;
          w.Function.prototype.apply = function (thisArg, argsArray) {
            const src2 = String(this).slice(0, 256).toLowerCase();
            if (needle && src2.indexOf(String(needle).toLowerCase()) !== -1) {
              throw new Error('aborted by prizma');
            }
            return origApply.call(this, thisArg, argsArray);
          };
        } catch (e) {}
      }
    } catch (e) {}
  };

  // ── indexOf-defuser ─────────────────────────────────────────────────────
  const indexOfDefuser = (needle, forced) => {
    const n = String(needle || '');
    if (!n) return;
    try {
      const origIndexOf = String.prototype.indexOf;
      String.prototype.indexOf = function (search, pos) {
        if (String(search) === n) return forced ? -1 : 0;
        return origIndexOf.call(this, search, pos);
      };
    } catch (e) {}
  };

  // ── leave-privacy ───────────────────────────────────────────────────────
  const leavePrivacy = (until) => {
    try {
      const origGetItem = localStorage.getItem.bind(localStorage);
      const origSetItem = localStorage.setItem.bind(localStorage);
      const clear = () => localStorage.clear();
      localStorage.clear = clear;
      if (until) {
        const ms = parseInt(String(until).trim() || '0', 10) || 0;
        if (ms > 0) { setTimeout(clear, ms); }
      }
      void origGetItem; void origSetItem;
    } catch (e) {}
  };

  // ── limit-character-frequency ───────────────────────────────────────────
  const limitCharacterFrequency = (needle, limit) => {
    const n = String(needle || '');
    const lim = parseInt(String(limit || '').trim(), 10);
    if (!n || !Number.isFinite(lim) || lim <= 0) return;
    try {
      const origToString = Function.prototype.toString;
      Function.prototype.toString = function () {
        const s = origToString.call(this);
        if (n === '*' || s.indexOf(n) !== -1) {
          let count = 0;
          for (const c of s) if (c === n) count++;
          if (count > lim) return s.replace(new RegExp(n, 'g'), () => n).slice(0, s.length - (count - lim));
        }
        return s;
      };
    } catch (e) {}
  };

  // ── log family ──────────────────────────────────────────────────────────
  const logScriptlet = (args) => {
    try { console.log('[prizma:log]', ...args); } catch (e) {}
  };
  const logEval = () => {
    try {
      const origEval = window.eval;
      window.eval = function (code) { try { console.log('[prizma:log-eval]', String(code).slice(0, 200)); } catch (e) {} return origEval.call(this, code); };
    } catch (e) {}
  };
  const logFetch = () => {
    try {
      const orig = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        try { console.log('[prizma:log-fetch]', url); } catch (e) {}
        return orig.call(this, input, init);
      };
    } catch (e) {}
  };
  const logOnerror = () => {
    try {
      window.addEventListener('error', (ev) => {
        try { console.log('[prizma:log-onerror]', ev.message || '', ev.filename || ''); } catch (e) {}
      }, true);
    } catch (e) {}
  };
  const logSetTimeout = () => {
    try {
      const orig = window.setTimeout;
      window.setTimeout = function (fn, delay, ...rest) {
        try { console.log('[prizma:log-setTimeout]', typeof fn === 'function' ? String(fn).slice(0, 120) : fn, delay); } catch (e) {}
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };
  const logSetInterval = () => {
    try {
      const orig = window.setInterval;
      window.setInterval = function (fn, delay, ...rest) {
        try { console.log('[prizma:log-setInterval]', typeof fn === 'function' ? String(fn).slice(0, 120) : fn, delay); } catch (e) {}
        return orig.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };
  const logXhr = () => {
    try {
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { console.log('[prizma:log-xhr]', url); } catch (e) {}
        return origOpen.apply(this, arguments);
      };
    } catch (e) {}
  };

  // ── main-world-var ──────────────────────────────────────────────────────
  const mainWorldVar = (name) => {
    const n = String(name || '');
    if (!n) return;
    try {
      const value = window[n];
      const el = document.createElement('script');
      el.textContent = 'window.' + n + '=' + JSON.stringify(value) + ';';
      (document.head || document.documentElement).appendChild(el);
    } catch (e) {}
  };

  // ── matrix ──────────────────────────────────────────────────────────────
  const matrix = () => {
    try {
      const origGet = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        const ctx = origGet.call(this, type, attrs);
        if (ctx && typeof ctx.getImageData === 'function') {
          const origGetImageData = ctx.getImageData.bind(ctx);
          ctx.getImageData = function () {
            const img = origGetImageData.apply(this, arguments);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
              if (Math.random() > 0.995) { d[i] ^= 0xff; d[i + 1] ^= 0xff; d[i + 2] ^= 0xff; }
            }
            return img;
          };
        }
        return ctx;
      };
    } catch (e) {}
  };

  // ── no-abort-on-property-read ───────────────────────────────────────────
  const noAbortOnPropertyRead = (prop) => {
    const key = Array.isArray(prop) ? prop[0] : prop;
    if (typeof key !== 'string' || !key) return;
    try {
      const parts = key.split('.');
      let o = window;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null) return;
        o = o[parts[i]];
      }
      const last = parts[parts.length - 1];
      const orig = o[last];
      Object.defineProperty(o, last, {
        configurable: true,
        get: () => orig,
        set: () => {}
      });
    } catch (e) {}
  };

  // ── no-admiral ──────────────────────────────────────────────────────────
  const noAdmiral = () => {
    try {
      const no = () => {};
      window.__adblock = { init: no, run: no, refresh: no };
      window.adblock = { init: no, run: no };
      window.__admiral = { init: no };
    } catch (e) {}
  };

  // ── no-advance-typing ───────────────────────────────────────────────────
  const noAdvanceTyping = () => {
    try {
      const run = () => {
        document.querySelectorAll('input[autocomplete="off"], input[data-advance-typing]').forEach((el) => {
          el.removeAttribute('autocomplete');
        });
      };
      run();
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── no-child-elements ───────────────────────────────────────────────────
  const noChildElements = (selector) => {
    if (!selector) return;
    try {
      const run = () => {
        document.querySelectorAll(selector).forEach((el) => {
          while (el.firstChild) el.removeChild(el.firstChild);
        });
      };
      run();
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── no-cpu-computation ──────────────────────────────────────────────────
  const noCpuComputation = () => {
    try {
      const origSetTimeout = window.setTimeout;
      const origSetInterval = window.setInterval;
      window.setTimeout = function (fn, delay, ...rest) {
        const d = parseInt(String(delay || '').trim(), 10) || 0;
        if (d > 1000) return origSetTimeout.call(this, fn, Math.min(d, 2000), ...rest);
        return origSetTimeout.call(this, fn, delay, ...rest);
      };
      window.setInterval = function (fn, delay, ...rest) {
        const d = parseInt(String(delay || '').trim(), 10) || 0;
        if (d < 100) return origSetInterval.call(this, fn, 1000, ...rest);
        return origSetInterval.call(this, fn, delay, ...rest);
      };
    } catch (e) {}
  };

  // ── no-debugger ─────────────────────────────────────────────────────────
  const noDebugger = () => {
    try {
      const origEval = window.eval;
      window.eval = function (code) {
        if (String(code).indexOf('debugger') !== -1) return undefined;
        return origEval.call(this, code);
      };
      window.Function.prototype.constructor = function (...args) {
        const body = args.pop() || '';
        if (String(body).indexOf('debugger') !== -1) return function () {};
        return origEval.call(window, body.length ? 'return (' + body + ')' : '');
      };
    } catch (e) {}
  };

  // ── no-floc ─────────────────────────────────────────────────────────────
  const noFloc = () => {
    try {
      if (navigator.interestCohort) {
        Object.defineProperty(navigator, 'interestCohort', { get: () => undefined, configurable: true });
      }
    } catch (e) {}
  };

  // ── no-fixed-position ───────────────────────────────────────────────────
  const noFixedPosition = () => {
    try {
      const style = document.createElement('style');
      style.textContent = '*{position:static !important}';
      style.id = 'prizma-no-fixed';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  };

  // ── no-fonts ────────────────────────────────────────────────────────────
  const noFonts = () => {
    try {
      const style = document.createElement('style');
      style.textContent = '*{font-family:inherit !important}';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  };

  // ── no-google-analytics ─────────────────────────────────────────────────
  const noGoogleAnalytics = () => {
    try {
      window.GoogleAnalyticsObject = undefined;
      window.ga = undefined;
      window.__ga = undefined;
      window._gaq = undefined;
      window.gtag = function () {};
      window.dataLayer = undefined;
    } catch (e) {}
  };

  // ── no-google-csi ───────────────────────────────────────────────────────
  const noGoogleCsi = () => {
    try {
      window._pubcid = undefined;
      window._pubcid_callback = undefined;
      window.google = window.google || {};
      window.google.csi = undefined;
      window.google.sn = undefined;
      window.google.si = undefined;
    } catch (e) {}
  };

  // ── no-google-tag-manager ───────────────────────────────────────────────
  const noGoogleTagManager = () => {
    try {
      window.dataLayer = undefined;
      window.google_tag_manager = undefined;
      window.google_optimize = undefined;
      window.google_tag_manager_test = undefined;
    } catch (e) {}
  };

  // ── no-highlight ────────────────────────────────────────────────────────
  const noHighlight = () => {
    try {
      window.getSelection = () => ({ removeAllRanges: () => {}, toString: () => '', addRange: () => {}, removeRange: () => {} });
    } catch (e) {}
  };

  // ── no-inline-script ────────────────────────────────────────────────────
  const noInlineScript = () => {
    try {
      document.querySelectorAll('script:not([src])').forEach((s) => s.remove());
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.tagName === 'SCRIPT' && !n.src) n.remove();
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── no-internet-explorer ────────────────────────────────────────────────
  const noInternetExplorer = () => {};

  // ── no-large-all ────────────────────────────────────────────────────────
  const noLargeAll = (selector, size) => {
    const lim = parseInt(String(size || '').trim(), 10);
    const sel = selector || 'img, video, iframe';
    try {
      const run = () => {
        document.querySelectorAll(sel).forEach((el) => {
          if (Number.isFinite(lim) && el.tagName === 'IMG') {
            const n = el.naturalWidth * el.naturalHeight;
            if (n > lim) { el.removeAttribute('src'); }
          } else if (Number.isFinite(lim) && el.tagName === 'IFRAME') {
            const r = el.getBoundingClientRect();
            if (r.width * r.height > lim) el.remove();
          }
        });
      };
      run();
      new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── no-mutationObserver ─────────────────────────────────────────────────
  const noMutationObserver = () => {
    try { window.MutationObserver = undefined; } catch (e) {}
    try { window.WebKitMutationObserver = undefined; } catch (e) {}
  };

  // ── no-new-iframe ───────────────────────────────────────────────────────
  const noNewIframe = () => {
    try {
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag, opts) {
        if (String(tag).toLowerCase() === 'iframe') {
          const el = origCreate('div');
          return el;
        }
        return origCreate(tag, opts);
      };
    } catch (e) {}
  };

  // ── no-ntp ──────────────────────────────────────────────────────────────
  const noNtp = () => {
    try {
      window.NTP = undefined;
      window.chrome = window.chrome || {};
      window.chrome.ntp = undefined;
    } catch (e) {}
  };

  // ── no-other-host ───────────────────────────────────────────────────────
  const noOtherHost = (host) => {
    const h = String(host || '').toLowerCase();
    if (!h) return;
    try {
      const origFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        try {
          const u = new URL(url, location.href);
          if (u.hostname.toLowerCase() !== h) return Promise.reject(new TypeError('blocked'));
        } catch (e) {}
        return origFetch.call(this, input, init);
      };
    } catch (e) {}
  };

  // ── no-popups ───────────────────────────────────────────────────────────
  const noPopups = () => {
    try {
      window.open = function () { return null; };
      window.addEventListener('click', (ev) => {
        const a = ev.target && ev.target.closest ? ev.target.closest('a[target="_blank"]') : null;
        if (a) ev.preventDefault();
      }, true);
    } catch (e) {}
  };

  // ── no-prompt ───────────────────────────────────────────────────────────
  const noPrompt = () => {
    try { window.prompt = () => null; } catch (e) {}
  };

  // ── no-scripting ────────────────────────────────────────────────────────
  const noScripting = () => {
    try {
      document.querySelectorAll('script').forEach((s) => s.remove());
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.tagName === 'SCRIPT') n.remove();
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── no-setTimeout (hepsini engelle) ─────────────────────────────────────
  const noSetTimeout = () => {
    try {
      window.setTimeout = function () { return 0; };
      window.setInterval = function () { return 0; };
      window.requestAnimationFrame = function () { return 0; };
    } catch (e) {}
  };

  // ── no-svg ──────────────────────────────────────────────────────────────
  const noSvg = () => {
    try {
      const origCreate = document.createElement.bind(document);
      document.createElementNS = function (ns, tag, opts) {
        if (String(ns).indexOf('w3.org/2000/svg') !== -1) return origCreate('div', opts);
        return document.createElementNS.apply(document, arguments);
      };
    } catch (e) {}
  };

  // ── no-youtube ──────────────────────────────────────────────────────────
  const noYoutube = () => {
    try {
      window.YT = undefined;
      window.yt = undefined;
      window.youtube = undefined;
      document.querySelectorAll('.ytd-player, #player').forEach((el) => el.remove());
    } catch (e) {}
  };

  // ── nowebrtc-if ─────────────────────────────────────────────────────────
  const noWebrtcIf = (needle) => {
    const n = String(needle || '').toLowerCase();
    const u = location.href.toLowerCase();
    if (n && u.indexOf(n) === -1) return;
    disableWebRTC();
  };

  // ── performance.now-if ──────────────────────────────────────────────────
  const performanceNowIf = (needle, delta) => {
    const n = String(needle || '').toLowerCase();
    const d = parseFloat(delta);
    try {
      const orig = performance.now.bind(performance);
      const fakeNow = () => orig();
      performance.now = function () {
        const base = orig();
        if (n && String(n).indexOf('!') === 0 && String(n).slice(1).toLowerCase() === (location.hostname || '').toLowerCase()) {
          return Number.isFinite(d) ? base - d : base;
        }
        return base;
      };
      void fakeNow;
    } catch (e) {}
  };

  // ── prevent-addEventListener ────────────────────────────────────────────
  const preventAddEventListener = (type, needle) => {
    try {
      const proto = EventTarget.prototype;
      const origAdd = proto.addEventListener;
      proto.addEventListener = function (t, fn, opts) {
        if (type && t === type) {
          if (!needle || (typeof fn === 'function' && String(fn).indexOf(needle) !== -1)) {
            return;
          }
        }
        return origAdd.call(this, t, fn, opts);
      };
    } catch (e) {}
  };

  // ── prevent-requestAnimationFrame ───────────────────────────────────────
  const preventRequestAnimationFrame = (needle) => {
    try {
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        if (needle && typeof cb === 'function' && String(cb).indexOf(needle) !== -1) return 0;
        if (!needle) return 0;
        return orig.call(this, cb);
      };
    } catch (e) {}
  };

  // ── promise-uuid / uuid7 ────────────────────────────────────────────────
  const promiseUuid = () => {
    try {
      window.uuid = () => Promise.resolve('00000000-0000-0000-0000-000000000000');
    } catch (e) {}
  };
  const uuid7 = () => {
    try {
      const fake = '00000000-0000-7000-8000-000000000000';
      if (window.uuidv7) window.uuidv7 = () => fake;
      if (window.uuid7) window.uuid7 = () => fake;
    } catch (e) {}
  };

  // ── prune-primitives / prpr ─────────────────────────────────────────────
  const prunePrimitives = (props) => {
    const pruneList = (props || '').split(' ').filter(Boolean);
    if (!pruneList.length) return;
    const prune = (val) => {
      if (Array.isArray(val)) { for (const v of val) prune(v); }
      else if (val && typeof val === 'object') {
        for (const key of pruneList) {
          const v = val[key];
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            try { delete val[key]; } catch (e) {}
          }
        }
        for (const k of Object.keys(val)) prune(val[k]);
      }
    };
    try {
      const origParse = JSON.parse;
      JSON.parse = function (text, reviver) {
        const r = origParse.call(this, text, reviver);
        prune(r);
        return r;
      };
    } catch (e) {}
  };

  // ── push-defuser ────────────────────────────────────────────────────────
  const pushDefuser = (needle) => {
    const n = String(needle || '');
    try {
      const origPush = Array.prototype.push;
      Array.prototype.push = function (...items) {
        if (n && this.length && typeof this[0] === 'object' && this[0] !== null) {
          const tags = (this[0].eventCategory || '') + ' ' + (this[0].eventAction || '') + ' ' + (this[0].eventLabel || '');
          if (tags.toLowerCase().indexOf(n.toLowerCase()) !== -1) {
            return this.length;
          }
        }
        return origPush.apply(this, items);
      };
    } catch (e) {}
  };

  // ── redirect-rule / redirect-if-loaded ──────────────────────────────────
  const redirectIfLoaded = () => {};
  const redirectRule = () => {};

  // ── remove-attribute ────────────────────────────────────────────────────
  const removeAttribute = (selector, attr) => removeAttr(selector, attr);

  // ── remove-data-attr ────────────────────────────────────────────────────
  const removeDataAttr = (selector, attr) => {
    if (!selector) return;
    const a = attr ? 'data-' + String(attr) : '';
    const run = () => {
      document.querySelectorAll(selector).forEach((el) => {
        if (a) el.removeAttribute(a);
        else {
          for (const at of Array.from(el.attributes)) {
            if (at.name.indexOf('data-') === 0) el.removeAttribute(at.name);
          }
        }
      });
    };
    run();
    try { new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  };

  // ── remove-elements / remove-id ─────────────────────────────────────────
  const removeElements = (selectors) => {
    const list = (selectors || '').split(/\s*,\s*/).filter(Boolean);
    if (!list.length) return;
    const run = () => {
      for (const s of list) {
        try { document.querySelectorAll(s).forEach((el) => el.remove()); } catch (e) {}
      }
    };
    run();
    try { new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  };
  const removeId = (id) => {
    const run = () => {
      const el = document.getElementById(String(id || ''));
      if (el) el.remove();
    };
    run();
    try { new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  };

  // ── remove-in-shadow-dom ────────────────────────────────────────────────
  const removeInShadowDom = (selector) => {
    if (!selector) return;
    try {
      const all = (root) => {
        const walk = (r) => {
          try { r.querySelectorAll(selector).forEach((el) => el.remove()); } catch (e) {}
          for (const el of r.querySelectorAll('*')) {
            if (el.shadowRoot) walk(el.shadowRoot);
          }
        };
        walk(root);
      };
      all(document);
      new MutationObserver(() => all(document)).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  };

  // ── remove-node-text-elements ───────────────────────────────────────────
  const removeNodeTextElements = (nodeType, needle) => removeNodeText(nodeType, needle);

  // ── remove-query ────────────────────────────────────────────────────────
  const removeQuery = (query) => {
    const q = String(query || '');
    if (!q) return;
    try {
      const url = new URL(location.href);
      url.searchParams.delete(q);
      history.replaceState(null, '', url.toString());
    } catch (e) {}
  };

  // ── remove-script ───────────────────────────────────────────────────────
  const removeScript = (needle) => {
    const n = String(needle || '').toLowerCase();
    const run = () => {
      document.querySelectorAll('script').forEach((s) => {
        if (!n || String(s.src || '').toLowerCase().indexOf(n) !== -1 || String(s.textContent).toLowerCase().indexOf(n) !== -1) {
          s.remove();
        }
      });
    };
    run();
    try { new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  };

  // ── remove-tab-url / set-tab-url ────────────────────────────────────────
  const removeTabUrl = (needle) => {
    const n = String(needle || '').toLowerCase();
    try {
      const url = new URL(location.href);
      if (n && (url.href.toLowerCase().indexOf(n) !== -1 || url.search.toLowerCase().indexOf(n) !== -1)) {
        history.replaceState(null, '', url.origin + url.pathname);
      }
    } catch (e) {}
  };
  const setTabUrl = (url) => {
    try { history.replaceState(null, '', String(url || '')); } catch (e) {}
  };

  // ── remove-xhr-response-header ─────────────────────────────────────────
  const removeXhrResponseHeader = (needle) => {
    const n = String(needle || '').toLowerCase();
    if (!n) return;
    try {
      const origSet = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
        if (String(k).toLowerCase().indexOf(n) !== -1) return;
        return origSet.call(this, k, v);
      };
    } catch (e) {}
  };

  // ── replace-node-text-elements ──────────────────────────────────────────
  const replaceNodeTextElements = (needle, repl, nodeType) => {
    replaceNodeText(needle, repl);
  };

  // ── sanitize-html ───────────────────────────────────────────────────────
  const sanitizeHtml = () => {
    try {
      window.sanitizeHtml = (html) => String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/javascript:/gi, '');
    } catch (e) {}
  };

  // ── set-mutation-observer ───────────────────────────────────────────────
  const setMutationObserver = (target, callback, options) => {
    try {
      const cb = new Function('mutations', 'observer', String(callback || ''));
      const obs = new MutationObserver(cb);
      obs.observe(document.querySelector(target) || document, JSON.parse(String(options || '{}')));
      window.__prizmaMutationObserver = obs;
    } catch (e) {}
  };

  // ── set-query ───────────────────────────────────────────────────────────
  const setQuery = (key, value) => {
    const k = String(key || '');
    const v = String(value || '');
    if (!k) return;
    try {
      const url = new URL(location.href);
      url.searchParams.set(k, v);
      history.replaceState(null, '', url.toString());
    } catch (e) {}
  };

  // ── set-session-storage-item ────────────────────────────────────────────
  const setSessionStorageItem = (key, value) => {
    try {
      const v = value === 'undefined' ? undefined : value;
      sessionStorage.setItem(String(key || ''), v);
    } catch (e) {}
  };

  // ── set-traffic-attributes ──────────────────────────────────────────────
  const setTrafficAttributes = () => {
    try {
      const no = () => {};
      window.googletag = window.googletag || {};
      window.googletag.pubads = () => ({
        addEventListener: no, removeEventListener: no, enableSingleRequest: no,
        disableInitialLoad: no, refresh: no, setTargeting: no, setSlot: no,
        enableServices: no, set: no, get: () => undefined
      });
      if (window._googCmp) window._googCmp = undefined;
    } catch (e) {}
  };

  // ── set-window-opener ───────────────────────────────────────────────────
  const setWindowOpener = () => {
    try {
      Object.defineProperty(window, 'opener', { get: () => null, configurable: true });
    } catch (e) {}
  };

  // ── start-video-with-audio ──────────────────────────────────────────────
  const startVideoWithAudio = (selector) => {
    try {
      const el = document.querySelector(selector || 'video');
      if (el) {
        el.muted = false;
        el.play().catch(() => {});
      }
    } catch (e) {}
  };

  // ── submit-captcha ──────────────────────────────────────────────────────
  const submitCaptcha = (selector) => {
    try {
      const run = () => {
        document.querySelectorAll(selector || 'form').forEach((f) => {
          if (f.querySelector('input[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]')) {
            try { f.submit(); } catch (e) {}
          }
        });
      };
      setTimeout(run, 1000);
    } catch (e) {}
  };

  // ── switch-to-local-ipv4 ────────────────────────────────────────────────
  const switchToLocalIpv4 = () => {};

  // ── tab-scriptlet ───────────────────────────────────────────────────────
  const tabScriptlet = (name, args) => {
    const n = String(name || '');
    const parts2 = (args || '').split(',');
    const fn = handlers[n];
    if (fn) { try { fn(parts2); } catch (e) {} }
  };

  // ── text-prune ──────────────────────────────────────────────────────────
  const textPrune = (needles) => {
    const list = (needles || '').split(' ').filter(Boolean);
    if (!list.length) return;
    const run = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue) continue;
        for (const n of list) {
          if (n && node.nodeValue.indexOf(n) !== -1) {
            targets.push(node);
            break;
          }
        }
      }
      targets.forEach((tn) => { try { tn.remove(); } catch (e) {} });
    };
    run();
    try { new MutationObserver(run).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  };

  // ── toggle ──────────────────────────────────────────────────────────────
  const toggle = (prop, value) => {
    const p = String(prop || '');
    const v = value === 'undefined' ? undefined : value;
    if (!p) return;
    try {
      const obj = window;
      const parts = p.split('.');
      let o = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] == null) return;
        o = o[parts[i]];
      }
      Object.defineProperty(o, parts[parts.length - 1], {
        configurable: true,
        get: () => v,
        set: () => {}
      });
    } catch (e) {}
  };

  // ── trusted-click / trusted-click-element ───────────────────────────────
  const trustedClick = (selector) => {
    try {
      const el = document.querySelector(String(selector || ''));
      if (el) el.click();
    } catch (e) {}
  };
  const trustedClickElement = (selector) => {
    try {
      const el = document.querySelector(String(selector || ''));
      if (el) { el.click(); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
    } catch (e) {}
  };

  // ── trusted-fetch ───────────────────────────────────────────────────────
  const trustedFetch = (url, props) => {
    fetchRequest(url, props);
  };

  // ── trusted-json-prune ──────────────────────────────────────────────────
  const trustedJsonPrune = (props) => jsonPrune(props);

  // ── trusted-link ────────────────────────────────────────────────────────
  const trustedLink = (url) => {
    try { location.href = String(url || ''); } catch (e) {}
  };

  // ── trusted-replace-node-text ───────────────────────────────────────────
  const trustedReplaceNodeText = (needle, repl) => replaceNodeText(needle, repl);

  // ── trusted-replace-xhr-response-body ───────────────────────────────────
  const trustedReplaceXhrResponseBody = (needles, props, val) => replaceXhr(needles, props, val);

  // ── trusted-set-attr ────────────────────────────────────────────────────
  const trustedSetAttr = (selector, attr, value) => setAttr(selector, attr, value);

  // ── trusted-set-cookie-reload ───────────────────────────────────────────
  const trustedSetCookieReload = (key, value) => {
    setCookie(key, value);
    try { location.reload(); } catch (e) {}
  };

  // ── trusted-set-local-storage-item ──────────────────────────────────────
  const trustedSetLocalStorageItem = (key, value) => setLocalStorageItem(key, value);

  // ── trusted-set-session-storage-item ────────────────────────────────────
  const trustedSetSessionStorageItem = (key, value) => setSessionStorageItem(key, value);

  // ── trusted-suppress-native-error ───────────────────────────────────────
  const trustedSuppressNativeError = (needle) => {
    const n = String(needle || '').toLowerCase();
    try {
      const origOnerror = window.onerror;
      window.onerror = function (msg, src, line, col, err) {
        if (n && String(msg).toLowerCase().indexOf(n) !== -1) return true;
        return origOnerror ? origOnerror.apply(this, arguments) : false;
      };
    } catch (e) {}
  };

  // ── trusted-throttle ────────────────────────────────────────────────────
  const trustedThrottle = (needle, delay) => {
    const n = String(needle || '');
    const ms = parseInt(String(delay || '0').trim(), 10) || 1000;
    try {
      const origSetTimeout = window.setTimeout;
      window.setTimeout = function (fn, d, ...rest) {
        if (n && typeof fn === 'function' && String(fn).indexOf(n) !== -1) {
          return origSetTimeout.call(this, fn, Math.max(ms, parseFloat(d) || 0), ...rest);
        }
        return origSetTimeout.call(this, fn, d, ...rest);
      };
    } catch (e) {}
  };

  // ── xhr-json-prune / xhr-prune ─────────────────────────────────────────
  const xhrJsonPrune = (props) => jsonPruneXhrResponse(props);
  const xhrPrune = (props) => jsonPruneXhrResponse(props);

  // ── json-prune-fetch-response-body ──────────────────────────────────────
  const jsonPruneFetchResponseBody = (props) => jsonPruneFetchResponse(props);

  // ── json-prune-xhr-response-body ────────────────────────────────────────
  const jsonPruneXhrResponseBody = (props) => jsonPruneXhrResponse(props);

  // ── fetch-json-prune / fetch-prune ──────────────────────────────────────
  const fetchJsonPrune = (props) => jsonPruneFetchResponse(props);
  const fetchPrune = (props) => jsonPruneFetchResponse(props);

  // ── eval-prune ──────────────────────────────────────────────────────────
  const evalPrune = (props) => evalDataPrune(props);

  // ── no-top-frame-ancestors ──────────────────────────────────────────────
  const noTopFrameAncestors = () => {
    try {
      if (window.top !== window) { try { window.top.postMessage('prizma-frame-block', '*'); } catch (e) {} }
    } catch (e) {}
  };

  // ── no-frame-ancestors ──────────────────────────────────────────────────
  const noFrameAncestors = () => {
    try {
      if (window.top !== window) { throw new Error('frame blocked by prizma'); }
    } catch (e) {}
  };

  // ── abort-on-mutation (amcd) ────────────────────────────────────────────
  const abortOnMutation = (selector) => {
    const sel = String(selector || '');
    try {
      const no = () => {};
      const fakeObs = function (cb) {
        this.observe = no;
        this.disconnect = no;
        this.takeRecords = () => [];
      };
      window.MutationObserver = fakeObs;
      window.WebKitMutationObserver = fakeObs;
      if (sel) {
        const run = () => { try { document.querySelectorAll(sel).forEach((el) => el.remove()); } catch (e) {} };
        setTimeout(run, 0);
      }
    } catch (e) {}
  };

  // ── aligned-href-serde ──────────────────────────────────────────────────
  const alignedHrefSerde = () => {
    try {
      const origGet = HTMLAnchorElement.prototype.__lookupGetter__('href');
      Object.defineProperty(HTMLAnchorElement.prototype, 'href', {
        configurable: true,
        get: function () {
          const v = origGet.call(this);
          return v === '#' ? '' : v;
        },
        set: function (v) { this.setAttribute('href', v); }
      });
    } catch (e) {}
  };

  // ── adguard-* isimleri (listelerde kullanılır) ──────────────────────────
  const adguardSetConstant = (key, value) => setConstant(key, value);
  const adguardRemoveClass = (selector, cls) => removeClass(selector, cls);
  const adguardAbortOnPropertyRead = (prop) => abortOnPropertyRead(prop);
  const adguardAbortOnPropertyWrite = (prop) => abortOnPropertyWrite(prop);
  const adguardNoSetTimeoutIf = (needle) => noSetTimeoutIf(needle);
  const adguardNoSetIntervalIf = (needle) => noSetTimeoutIf(needle);
  const adguardNowoif = (needle) => noWindowOpenIf(needle);
  const adguardAeld = (target, type, needle) => addEventListenerDefuser(target, type, needle);
  const adguardJsonPrune = (props) => jsonPrune(props);
  const adguardJsonPruneXhr = (props) => jsonPruneXhrResponse(props);
  const adguardJsonPruneFetch = (props) => jsonPruneFetchResponse(props);
  const adguardRmnt = (nodeType, needle) => removeNodeText(nodeType, needle);
  const adguardRpnt = (needle, repl) => replaceNodeText(needle, repl);
  const adguardDebugger = () => noDebugger();
  const adguardLog = (args) => logScriptlet(args);
  const adguardPreventFetch = (needles) => preventFetch(needles);
  const adguardPreventXhr = (needles) => preventXhr(needles);
  const adguardNoeval = () => noeval();
  const adguardNoWebrtc = () => disableWebRTC();
  const adguardDisableWebrtc = () => disableWebRTC();
  const adguardAopr = (prop) => abortOnPropertyRead(prop);
  const adguardAopw = (prop) => abortOnPropertyWrite(prop);
  const adguardNostif = (needle) => noSetTimeoutIf(needle);
  const adguardNosiif = (needle) => noSetTimeoutIf(needle);
  const adguardPreventPopunders = () => noPopups();
  const adguardAbortOnInlineScript = (needle) => abortCurrentInlineScript(needle);
  const adguardWindowClose = (delay) => closeWindow(delay);
  const adguardPopupClose = () => closeWindow('0');

  const handlers = {
    'abort-current-inline-script': abortCurrentInlineScript,
    'abort-current-script': abortCurrentInlineScript,
    'acs': abortCurrentInlineScript,
    'abort-on-stack-trace': abortOnStackTrace,
    'aost': abortOnStackTrace,
    'abort-on-property-read': abortOnPropertyRead,
    'aopr': abortOnPropertyRead,
    'abort-on-property-write': abortOnPropertyWrite,
    'aopw': abortOnPropertyWrite,
    'addEventListener-defuser': addEventListenerDefuser,
    'add-event-listener-defuser': addEventListenerDefuser,
    'aeld': addEventListenerDefuser,
    'alert-buster': alertBuster,
    'confirm-buster': confirmBuster,
    'prompt-buster': promptBuster,
    'noeval': noeval,
    'noeval-if': noevalIf,
    'no-window-open': noWindowOpen,
    'no-window-open-if': noWindowOpenIf,
    'nowoif': noWindowOpenIf,
    'disable-webRTC': disableWebRTC,
    'nowebrtc': disableWebRTC,
    'close-window': closeWindow,
    'disable-newtab-link': disableNewtabLink,
    'disable-newtab-links': disableNewtabLink,
    'json-prune': jsonPrune,
    'json-prune-xhr-response': jsonPruneXhrResponse,
    'json-prune-fetch-response': jsonPruneFetchResponse,
    'jsonl-edit-xhr-response': jsonPruneXhrResponse,
    'json-edit': jsonPrune,
    'adjust-setTimeout': adjustSetTimeout,
    'xml-prune': xmlPrune,
    'href-sanitizer': hrefSanitizer,
    'no-requestAnimationFrame-if': noRafIf,
    'norafif': noRafIf,
    'nobab': antiAdblockBypass,
    'nofab': antiAdblockBypass,
    'nano-sib': antiAdblockBypass,
    'nano-stb': antiAdblockBypass,
    'prevent-fetch': preventFetch,
    'no-fetch-if': preventFetch,
    'trusted-prevent-fetch': preventFetch,
    'prevent-xhr': preventXhr,
    'no-xhr-if': noXhrIf,
    'prevent-setTimeout': (p) => preventSetTimer('setTimeout', p),
    'prevent-setInterval': (p) => preventSetTimer('setInterval', p),
    'no-setTimeout-if': noSetTimeoutIf,
    'no-setInterval-if': noSetTimeoutIf,
    'nostif': noSetTimeoutIf,
    'nosiif': noSetTimeoutIf,
    'set-constant': setConstant,
    'trusted-set-constant': trustedSetConstant,
    'trusted-set': trustedSetConstant,
    'set': setConstant,
    'set-attr': setAttr,
    'remove-attr': removeAttr,
    'ra': removeAttr,
    'remove-class': removeClass,
    'remove-node-text': removeNodeText,
    'rmnt': removeNodeText,
    'set-cookie': setCookie,
    'trusted-set-cookie': setCookie,
    'remove-cookie': removeCookie,
    'cookie-remover': cookieRemover,
    'replace-node-text': replaceNodeText,
    'rpnt': replaceNodeText,
    'trusted-rpnt': replaceNodeText,
    'spoof-css': spoofCss,
    'google-ima': googleIma,
    'popads': popads,
    'popads-dummy': popads,
    'refresh-defuser': refreshDefuser,
    'fingerprint2': fingerprint2,
    'fngprnt': fingerprint2,
    'set-local-storage-item': setLocalStorageItem,
    'trusted-replace-xhr': replaceXhr,
    'trusted-replace-xhr-response': replaceXhr,
    'trusted-replace-fetch-response': replaceFetchResponse,
    'trusted-replace-argument': replaceNodeText,

    // ── Genişletilmiş scriptlet'ler (uBO paritesi) ──────────────────────
    'addEventListener-logger': addEventListenerLogger,
    'aell': addEventListenerLogger,
    'addEventListener-remove': addEventListenerRemove,
    'adjust-setInterval': adjustSetInterval,
    'asi': adjustSetInterval,
    'all-arguments-defuse': allArgumentsDefuse,
    'assign-tie': assignTie,
    'base64-prune': base64Prune,
    'base64-json-prune': base64Prune,
    'cdc-defuser': cdcDefuser,
    'create-element-token': createElementToken,
    'detailed-events': detailedEvents,
    'simplified-events': simplifiedEvents,
    'disable-pinterest': disablePinterest,
    'disable-pubwise': disablePubwise,
    'disable-youtube-player': disableYoutubePlayer,
    'element-popover-defuser': elementPopoverDefuser,
    'elements-js-nowebrtc': elementsJsNoWebrtc,
    'eval-data-prune': evalDataPrune,
    'eval-prune': evalPrune,
    'event-scheduler': eventScheduler,
    'fetch-json-prune': fetchJsonPrune,
    'fetch-prune': fetchPrune,
    'fetch-request': fetchRequest,
    'fiddle-scriptlet': fiddleScriptlet,
    'googletagservices-defuser': googletagservicesDefuser,
    'iframe-abort-current-script': iframeAbortCurrentScript,
    'indexOf-defuser': indexOfDefuser,
    'json-prune-fetch-response-body': jsonPruneFetchResponseBody,
    'json-prune-xhr-response-body': jsonPruneXhrResponseBody,
    'leave-privacy': leavePrivacy,
    'limit-character-frequency': limitCharacterFrequency,
    'log': logScriptlet,
    'log-addEventListener': addEventListenerLogger,
    'log-eval': logEval,
    'log-fetch': logFetch,
    'log-onerror': logOnerror,
    'log-setInterval': logSetInterval,
    'log-setTimeout': logSetTimeout,
    'log-xhr': logXhr,
    'main-world-var': mainWorldVar,
    'matrix': matrix,
    'no-abort-on-property-read': noAbortOnPropertyRead,
    'no-admiral': noAdmiral,
    'no-advance-typing': noAdvanceTyping,
    'no-child-elements': noChildElements,
    'no-cpu-computation': noCpuComputation,
    'no-debugger': noDebugger,
    'no-floc': noFloc,
    'no-fixed-position': noFixedPosition,
    'no-fonts': noFonts,
    'no-google-analytics': noGoogleAnalytics,
    'no-google-csi': noGoogleCsi,
    'no-google-tag-manager': noGoogleTagManager,
    'no-highlight': noHighlight,
    'no-inline-script': noInlineScript,
    'no-internet-explorer': noInternetExplorer,
    'no-large-all': noLargeAll,
    'no-mutationObserver': noMutationObserver,
    'no-new-iframe': noNewIframe,
    'no-ntp': noNtp,
    'no-other-host': noOtherHost,
    'no-popups': noPopups,
    'no-prompt': noPrompt,
    'no-scripting': noScripting,
    'no-setTimeout': noSetTimeout,
    'no-svg': noSvg,
    'no-youtube': noYoutube,
    'nowebrtc-if': noWebrtcIf,
    'performance.now-if': performanceNowIf,
    'prevent-addEventListener': preventAddEventListener,
    'prevent-requestAnimationFrame': preventRequestAnimationFrame,
    'promise-uuid': promiseUuid,
    'uuid7': uuid7,
    'prune-primitives': prunePrimitives,
    'prpr': prunePrimitives,
    'push-defuser': pushDefuser,
    'redirect-if-loaded': redirectIfLoaded,
    'redirect-rule': redirectRule,
    'remove-attribute': removeAttribute,
    'remove-data-attr': removeDataAttr,
    'remove-elements': removeElements,
    'remove-id': removeId,
    'remove-in-shadow-dom': removeInShadowDom,
    'remove-node-text-elements': removeNodeTextElements,
    'remove-query': removeQuery,
    'remove-script': removeScript,
    'remove-tab-url': removeTabUrl,
    'set-tab-url': setTabUrl,
    'remove-xhr-response-header': removeXhrResponseHeader,
    'replace-node-text-elements': replaceNodeTextElements,
    'sanitize-html': sanitizeHtml,
    'set-mutation-observer': setMutationObserver,
    'set-query': setQuery,
    'set-session-storage-item': setSessionStorageItem,
    'trusted-set-session-storage-item': setSessionStorageItem,
    'set-traffic-attributes': setTrafficAttributes,
    'set-window-opener': setWindowOpener,
    'start-video-with-audio': startVideoWithAudio,
    'submit-captcha': submitCaptcha,
    'switch-to-local-ipv4': switchToLocalIpv4,
    'tab-scriptlet': tabScriptlet,
    'text-prune': textPrune,
    'toggle': toggle,
    'trusted-click': trustedClick,
    'trusted-click-element': trustedClickElement,
    'trusted-fetch': trustedFetch,
    'trusted-json-prune': trustedJsonPrune,
    'trusted-link': trustedLink,
    'trusted-replace-node-text': trustedReplaceNodeText,
    'trusted-replace-xhr-response-body': trustedReplaceXhrResponseBody,
    'trusted-set-attr': trustedSetAttr,
    'trusted-set-cookie-reload': trustedSetCookieReload,
    'trusted-set-local-storage-item': trustedSetLocalStorageItem,
    'trusted-suppress-native-error': trustedSuppressNativeError,
    'trusted-throttle': trustedThrottle,
    'xhr-json-prune': xhrJsonPrune,
    'xhr-prune': xhrPrune,
    'xhr-request': xhrRequest,

    // ── Kanonik uBO isimleri + ek alias'lar ─────────────────────────────
    'addEventListener-defuser': addEventListenerDefuser,
    'aset': adjustSetTimeout,
    'adj': adjustSetInterval,
    'no-bab-defuser': antiAdblockBypass,
    'no-frame-ancestors': noFrameAncestors,
    'no-top-frame-ancestors': noTopFrameAncestors,
    'abort-on-mutation': abortOnMutation,
    'amcd': abortOnMutation,
    'aligned-href-serde': alignedHrefSerde,
    'prevent-window-open': noWindowOpen,
    'no-window-open-defuser': noWindowOpenIf,
    'window.open-defuser': noWindowOpenIf,
    'no-setInterval-defuser': noSetTimeoutIf,
    'no-setTimeout-defuser': noSetTimeoutIf,
    'setInterval-defuser': noSetTimeoutIf,
    'setTimeout-defuser': noSetTimeoutIf,
    'remove-class': removeClass,
    'no-mutation': abortOnMutation,
    'set-localstorage-item': setLocalStorageItem,
    'set-session-storage': setSessionStorageItem,
    'remove-session-storage': () => { try { sessionStorage.clear(); } catch (e) {} },
    'remove-local-storage': () => { try { localStorage.clear(); } catch (e) {} },
    'clear-cookies': () => { try { document.cookie.split(';').forEach((c) => { const k = c.split('=')[0].trim(); document.cookie = k + '=; path=/; max-age=0'; }); } catch (e) {} },
    'debugger-stub': noDebugger,
    'no-debugger-stub': noDebugger,
    'disable-speech-synthesis': () => { try { window.speechSynthesis = undefined; } catch (e) {} },
    'disable-geolocation': () => { try { navigator.geolocation = undefined; } catch (e) {} },
    'disable-notifications': () => { try { window.Notification = undefined; } catch (e) {} },
    'no-webgl': () => { try { HTMLCanvasElement.prototype.getContext = function (t, a) { if (String(t).indexOf('webgl') !== -1) return null; return document.createElement('canvas').getContext(t, a); }; } catch (e) {} },

    // ── AdGuard isimleri (listelerde kullanılır) ─────────────────────────
    'adguard-set-constant': adguardSetConstant,
    'adguard-remove-class': adguardRemoveClass,
    'adguard-abort-on-property-read': adguardAbortOnPropertyRead,
    'adguard-abort-on-property-write': adguardAbortOnPropertyWrite,
    'adguard-no-setTimeout-if': adguardNoSetTimeoutIf,
    'adguard-no-setInterval-if': adguardNoSetIntervalIf,
    'adguard-no-window-open-if': adguardNowoif,
    'adguard-addEventListener-defuser': adguardAeld,
    'adguard-json-prune': adguardJsonPrune,
    'adguard-json-prune-xhr-response': adguardJsonPruneXhr,
    'adguard-json-prune-fetch-response': adguardJsonPruneFetch,
    'adguard-remove-node-text': adguardRmnt,
    'adguard-replace-node-text': adguardRpnt,
    'adguard-debugger': adguardDebugger,
    'adguard-log': adguardLog,
    'adguard-prevent-fetch': adguardPreventFetch,
    'adguard-prevent-xhr': adguardPreventXhr,
    'adguard-noeval': adguardNoeval,
    'adguard-nowebrtc': adguardNoWebrtc,
    'adguard-disable-web-rtc': adguardDisableWebrtc,
    'adguard-aopr': adguardAopr,
    'adguard-aopw': adguardAopw,
    'adguard-nostif': adguardNostif,
    'adguard-nosiif': adguardNosiif,
    'adguard-nowoif': adguardNowoif,
    'adguard-prevent-popunders': adguardPreventPopunders,
    'adguard-abort-on-inline-script': adguardAbortOnInlineScript,
    'adguard-window-close': adguardWindowClose,
    'adguard-popup-close': adguardPopupClose
  };

  const fn = handlers[name];
  if (fn) {
    try { fn(parts); } catch (e) {}
  } else {
    log('bilinmeyen scriptlet:', name);
  }
})();
