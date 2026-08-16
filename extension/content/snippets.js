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

  const handlers = {
    'abort-current-inline-script': abortCurrentInlineScript,
    'abort-on-stack-trace': abortOnStackTrace,
    'addEventListener-defuser': addEventListenerDefuser,
    'alert-buster': alertBuster,
    'confirm-buster': confirmBuster,
    'prompt-buster': promptBuster,
    'noeval': noeval,
    'no-window-open': noWindowOpen,
    'close-window': closeWindow,
    'disable-newtab-link': disableNewtabLink,
    'json-prune': jsonPrune,
    'prevent-fetch': preventFetch,
    'prevent-xhr': preventXhr,
    'set-constant': setConstant,
    'set-cookie': setCookie,
    'remove-cookie': removeCookie,
    'replace-node-text': replaceNodeText
  };

  const fn = handlers[name];
  if (fn) {
    try { fn(parts); } catch (e) {}
  } else {
    log('bilinmeyen scriptlet:', name);
  }
})();
