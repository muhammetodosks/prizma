'use strict';
// Prizma content script — cosmetic filtre uygulama + scriptlet enjeksiyonu + element picker
// İzole dünyada çalışır; scriptlet'ler main world'e script tag ile enjekte edilir.

(() => {
  if (window.__prizmaCosmeticLoaded) return;
  window.__prizmaCosmeticLoaded = true;

  const HOSTNAME = location.hostname;
  let data = null;
  let applied = false;

  // ── CSS enjeksiyonu ───────────────────────────────────────────────────────
  function injectCSS(css) {
    let style = document.getElementById('prizma-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'prizma-css';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent += css + '\n';
  }

  function buildCSS(entry) {
    const parts = [];
    if (entry.hide && entry.hide.length) {
      parts.push(entry.hide.map(s => s + '{display:none !important}').join('\n'));
    }
    if (entry.style && entry.style.length) {
      for (const pair of entry.style) {
        if (Array.isArray(pair) && pair.length === 2) {
          parts.push(pair[0] + '{' + pair[1] + '}');
        }
      }
    }
    return parts.join('\n');
  }

  // ── Prosedürel operatör çözümleyici (uBO :has-text/:upward/:xpath vb.) ───
  // Tarayıcı bu pseudo'ları CSS olarak tanımaz; bu yüzden JS ile çözülür.
  // entry.procedural = [{ sel, op }] — sel seçicinin prosedürel kısmını içerir.
  function hideProcedural(entry) {
    if (!entry.procedural || !entry.procedural.length) return;
    for (const p of entry.procedural) {
      try { hideProceduralOp(p); } catch (e) {}
    }
  }

  function parseOp(sel, op) {
    // op örn: has-text, upward, xpath, matches-attr, matches-property, not, has
    const re = new RegExp('^' + op + '\\((.*)\\)$');
    const m = sel.match(re);
    return m ? m[1] : '';
  }

  function hideProceduralOp(p) {
    const sel = p.sel || '';
    const op = p.op || '';
    if (!sel || !op) return;
    const arg = parseOp(sel, op);
    switch (op) {
      case 'has-text': {
        const text = unquote(arg).toLowerCase();
        if (!text) return;
        const run = () => {
          const nodes = document.querySelectorAll(sel.slice(0, sel.lastIndexOf(':')) || 'body *');
          for (const el of nodes) {
            if (el.childElementCount === 0 && (el.textContent || '').toLowerCase().indexOf(text) !== -1) {
              el.style.setProperty('display', 'none', 'important');
            }
          }
        };
        run();
        observeMutations(run);
        break;
      }
      case 'upward': {
        const n = parseInt(unquote(arg), 10);
        if (!Number.isFinite(n) || n < 1) return;
        const baseSel = sel.slice(0, sel.lastIndexOf(':'));
        const run = () => {
          const nodes = document.querySelectorAll(baseSel || 'body *');
          for (const el of nodes) {
            let up = el;
            for (let i = 0; i < n && up; i++) up = up.parentElement;
            if (up && up !== document.documentElement && up !== document.body) {
              up.style.setProperty('display', 'none', 'important');
            }
          }
        };
        run();
        observeMutations(run);
        break;
      }
      case 'matches-attr': {
        // arg: "^attr=\"değer\"" veya "attr*=değer" biçiminde
        const m = arg.match(/^\^?([a-zA-Z_-]+)(=|\*=|\^=|\$=|\|=)"?([^"]*)"?$/);
        if (!m) return;
        const [, attr, comp, val] = m;
        const run = () => {
          const baseSel = sel.slice(0, sel.lastIndexOf(':'));
          const nodes = document.querySelectorAll(baseSel || 'body *');
          for (const el of nodes) {
            const av = el.getAttribute(attr);
            if (av == null) continue;
            let hit = false;
            if (comp === '=') hit = av === val;
            else if (comp === '*=') hit = av.indexOf(val) !== -1;
            else if (comp === '^=') hit = av.startsWith(val);
            else if (comp === '$=') hit = av.endsWith(val);
            else if (comp === '|=') hit = av === val || av.startsWith(val + '-');
            if (hit) el.style.setProperty('display', 'none', 'important');
          }
        };
        run();
        observeMutations(run);
        break;
      }
      case 'matches-property': {
        const m = arg.match(/^([a-zA-Z0-9_.]+)([=<>])(.*)$/);
        if (!m) return;
        const [, prop, comp, val] = m;
        const run = () => {
          const baseSel = sel.slice(0, sel.lastIndexOf(':'));
          const nodes = document.querySelectorAll(baseSel || 'body *');
          for (const el of nodes) {
            let v;
            try {
              v = prop.split('.').reduce((o, k) => (o == null ? undefined : o[k]), el);
            } catch (e) { v = undefined; }
            let hit = false;
            if (comp === '=') hit = String(v) === String(val);
            else if (comp === '>') hit = parseFloat(v) > parseFloat(val);
            else if (comp === '<') hit = parseFloat(v) < parseFloat(val);
            if (hit) el.style.setProperty('display', 'none', 'important');
          }
        };
        run();
        observeMutations(run);
        break;
      }
      case 'min-text-length': {
        const n = parseInt(unquote(arg), 10);
        if (!Number.isFinite(n) || n < 1) return;
        const baseSel = sel.slice(0, sel.lastIndexOf(':'));
        const run = () => {
          const nodes = document.querySelectorAll(baseSel || 'body *');
          for (const el of nodes) {
            if ((el.textContent || '').length >= n) {
              el.style.setProperty('display', 'none', 'important');
            }
          }
        };
        run();
        observeMutations(run);
        break;
      }
      case 'xpath': {
        let expr = unquote(arg);
        if (!expr) return;
        const run = () => {
          try {
            const res = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < res.snapshotLength; i++) {
              const el = res.snapshotItem(i);
              if (el && el.style) el.style.setProperty('display', 'none', 'important');
            }
          } catch (e) {}
        };
        run();
        observeMutations(run);
        break;
      }
      case 'has': case 'not': {
        // :has(seçici) / :not(seçici) — tarayıcı yerel destekliyorsa CSS yeterli,
        // değilse querySelectorAll desteklediği kadarıyla uygula.
        const run = () => {
          try {
            const nodes = document.querySelectorAll(sel);
            for (const el of nodes) el.style.setProperty('display', 'none', 'important');
          } catch (e) {}
        };
        run();
        observeMutations(run);
        break;
      }
      default:
        // bilinmeyen op — CSS'e olduğu gibi bırak (uyumsuz pseudo sessizce atlanır)
        try {
          const nodes = document.querySelectorAll(sel);
          for (const el of nodes) el.style.setProperty('display', 'none', 'important');
        } catch (e) {}
    }
  }

  function unquote(s) {
    const t = String(s).trim();
    if (t.length >= 2 && (t[0] === '\'' || t[0] === '"') && t[t.length - 1] === t[0]) {
      return t.slice(1, -1);
    }
    return t;
  }

  function observeMutations(fn) {
    try {
      const mo = new MutationObserver(() => queueMicrotask(fn));
      mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }

  function applyRemove(entry) {
    if (!entry.remove || !entry.remove.length) return;
    const remove = [];
    for (const sel of entry.remove) {
      if (!sel) continue;
      try {
        const el = document.querySelector(sel);
        if (el) remove.push(el);
      } catch (e) {}
    }
    for (const el of remove) {
      try { el.remove(); } catch (e) {}
    }
  }

  // ── Scriptlet enjeksiyonu (main world) ────────────────────────────────────
  function injectScriptlets(entry) {
    if (!entry.scriptlets || !entry.scriptlets.length) return;
    for (const sc of entry.scriptlets) {
      if (!sc || !sc.name) continue;
      const args = [sc.name].concat(sc.args || []).join(',');
      try {
        const script = document.createElement('script');
        script.src = browser.runtime.getURL('content/snippets.js?' + encodeURIComponent(args));
        script.async = false;
        (document.head || document.documentElement).appendChild(script);
      } catch (e) {}
    }
  }

  function apply() {
    if (applied || !data) return;
    applied = true;
    const css = buildCSS(data);
    if (css) injectCSS(css);
    applyRemove(data);
    hideProcedural(data);
    injectScriptlets(data);
  }

  // ── Dinamik yeniden uygulama (DOM sonradan yüklenen öğeler) ───────────────
  let watcher = null;
  function startWatcher() {
    if (watcher || !data) return;
    const applyRemoveDebounced = () => {
      if (data.remove && data.remove.length) applyRemove(data);
    };
    // MutationObserver anlık; döngü koruması için microtask'te çalıştır
    const mo = new MutationObserver((mutations) => {
      if (!data || !data.remove || !data.remove.length) return;
      queueMicrotask(applyRemoveDebounced);
    });
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    watcher = mo;
  }

  // ── Veri çekme (retry döngüsü) ────────────────────────────────────────────
  // Background init asenkron olduğu için (WASM + liste yükleme) document_start'ta
  // gönderilen ilk mesaj "no receiver" alabilir. Retry ile yeniden denenir.
  // COSMETIC_MAX_RETRY: toplam deneme sayısı; 300ms + deneme*200ms artan gecikme.
  const COSMETIC_MAX_RETRY = 30;
  function fetchCosmetic(attempt) {
    browser.runtime.sendMessage({ type: 'getCosmetic', hostname: HOSTNAME })
      .then((res) => {
        if (res && res.json) {
          try { data = JSON.parse(res.json); } catch (e) { data = null; }
        } else if (res && res.ok) {
          try { data = JSON.parse(res.json || 'null'); } catch (e) { data = null; }
        }
        if (!data) {
          if (attempt < COSMETIC_MAX_RETRY) {
            setTimeout(() => fetchCosmetic(attempt + 1), 300 + attempt * 200);
          }
          return;
        }
        apply();
        startWatcher();
      })
      .catch(() => {
        if (attempt < COSMETIC_MAX_RETRY) {
          setTimeout(() => fetchCosmetic(attempt + 1), 300 + attempt * 200);
        }
      });
  }
  fetchCosmetic(0);

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(apply, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0), { once: true });
  }

  // ── Element picker ────────────────────────────────────────────────────────
  let picking = false;
  let overlay = null;
  let highlight = null;

  function cleanupPicker() {
    picking = false;
    if (overlay) { overlay.remove(); overlay = null; }
    if (highlight) { highlight.remove(); highlight = null; }
    window.removeEventListener('mousemove', onPickMove, true);
    window.removeEventListener('click', onPickClick, true);
    window.removeEventListener('keydown', onPickKey, true);
    document.documentElement.style.cursor = '';
  }

  function onPickMove(ev) {
    const el = ev.target instanceof Element ? ev.target : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    highlight.style.left = (r.left + scrollX) + 'px';
    highlight.style.top = (r.top + scrollY) + 'px';
    highlight.style.width = r.width + 'px';
    highlight.style.height = r.height + 'px';
    highlight.textContent = (el.tagName || '').toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  }

  function onPickClick(ev) {
    if (!picking) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.target instanceof Element ? ev.target : null;
    if (el && el !== document.documentElement) {
      selectElement(el);
    }
  }

  function onPickKey(ev) {
    if (ev.key === 'Escape') { cleanupPicker(); }
  }

  function selectElement(el) {
    const selector = buildSelector(el);
    cleanupPicker();
    const filter = HOSTNAME + '##' + selector;
    browser.runtime.sendMessage({ type: 'addUserFilter', filter }).then((r) => {
      if (r && r.ok) {
        try { el.remove(); } catch (e) {}
      }
    });
  }

  function buildSelector(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node !== document.documentElement && parts.length < 8) {
      let sel = node.tagName.toLowerCase();
      if (node.id) { sel = '#' + CSS.escape(node.id); }
      else if (node.className && typeof node.className === 'string') {
        const cls = node.className.trim().split(/\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) sel += '.' + cls.map(c => CSS.escape(c)).join('.');
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function startPicker() {
    if (picking) return;
    picking = true;
    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', zIndex: '2147483647', top: '0', left: '0',
      width: '100%', height: '100%', cursor: 'crosshair',
      background: 'rgba(100,100,100,0.15)',
      pointerEvents: 'none'
    });
    highlight = document.createElement('div');
    Object.assign(highlight.style, {
      position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
      border: '2px solid #7c4dff', background: 'rgba(124,77,255,0.15)',
      color: '#7c4dff', font: '11px monospace', padding: '2px 4px',
      whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '60vw'
    });
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(highlight);
    document.documentElement.style.cursor = 'crosshair';
    window.addEventListener('mousemove', onPickMove, true);
    window.addEventListener('click', onPickClick, true);
    window.addEventListener('keydown', onPickKey, true);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'startPicker') { startPicker(); return { ok: true }; }
    return {};
  });
})();