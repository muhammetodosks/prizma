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
    if (entry.procedural && entry.procedural.length) {
      for (const s of entry.procedural) {
        if (/[:\(\)\[\]"=']/.test(s)) {
          parts.push(s + '{display:none !important}');
        }
      }
    }
    return parts.join('\n');
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
    injectScriptlets(data);
  }

  // ── Dinamik yeniden uygulama (DOM sonradan yüklenen öğeler) ───────────────
  let watcher = null;
  function startWatcher() {
    if (watcher || !data) return;
    watcher = setInterval(() => {
      if (data.remove && data.remove.length) applyRemove(data);
    }, 5000);
  }

  // ── Veri çekme ────────────────────────────────────────────────────────────
  browser.runtime.sendMessage({ type: 'getCosmetic', hostname: HOSTNAME })
    .then((res) => {
      if (res && res.json) {
        try { data = JSON.parse(res.json); } catch (e) { data = null; }
      }
      apply();
      startWatcher();
    })
    .catch(() => {});

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