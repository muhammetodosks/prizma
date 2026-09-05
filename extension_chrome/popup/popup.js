'use strict';
// Prizma popup mantığı
const $ = (id) => document.getElementById(id);

function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: 'getState' });
  if (!state) return;

  $('blockedTotal').textContent = fmtCount(state.stats.blocked || 0);
  const counts = state.counts || {};
  const totalRules = (counts.net || 0) + (counts.regex || 0) + (counts.cosmetic || 0);
  $('filterCount').textContent = fmtCount(totalRules);

  const days = Math.max(1, Math.floor((Date.now() - (state.stats.since || Date.now())) / 86400000));
  $('sinceDays').textContent = String(days);

  const toggle = $('pauseToggle');
  toggle.checked = !state.paused;
  const agg = $('aggressiveToggle');
  if (agg) {
    agg.checked = !!(state.settings && state.settings.aggressiveMode);
    const warn = $('aggressiveWarn');
    if (warn) warn.style.display = agg.checked ? 'block' : 'none';
  }
  const dbg = $('debugToggle');
  if (dbg) {
    dbg.checked = !!(state.settings && state.settings.debugMode);
  }
  const el = $('state');
  el.textContent = state.paused ? 'Prizma duraklatıldı' : 'Prizma etkin';
  el.className = 'state ' + (state.paused ? 'paused' : 'active');
  $('title').textContent = state.paused ? 'Prizma (duraklı)' : 'Prizma';

  const guard = state.guard || {};
  $('guardHosts').textContent = fmtCount((guard.host || 0));
  $('vanguardBlocked').textContent = fmtCount(state.stats.vanguard || 0);

  await refreshSite();
}

async function refreshSite() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) {
      $('siteName').textContent = 'Bu site (yerel sayfa)';
      return;
    }
    let host = 'Bilinmeyen';
    try { host = new URL(tab.url).hostname; } catch (e) {}
    $('siteName').textContent = host;
    const r = await browser.runtime.sendMessage({ type: 'getSiteMode', hostname: host });
    const mode = (r && r.mode) || 'normal';
    const btns = document.querySelectorAll('#siteBtns .site-btn');
    for (const b of btns) {
      b.classList.toggle('active', b.dataset.mode === mode);
    }
  } catch (e) {}
}

document.querySelectorAll('#siteBtns .site-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      const host = new URL(tab.url).hostname;
      const mode = btn.dataset.mode;
      await browser.runtime.sendMessage({ type: 'setSiteMode', hostname: host, mode });
      refreshSite();
    } catch (e) {}
  });
});

$('pauseToggle').addEventListener('change', async (ev) => {
  const r = await browser.runtime.sendMessage({ type: 'togglePause' });
  if (r && r.paused !== undefined) refresh();
});

$('aggressiveToggle').addEventListener('change', async (ev) => {
  await browser.runtime.sendMessage({ type: 'setSetting', key: 'aggressiveMode', value: ev.target.checked });
  const warn = $('aggressiveWarn');
  if (warn) warn.style.display = ev.target.checked ? 'block' : 'none';
  refresh();
});

$('debugToggle').addEventListener('change', async (ev) => {
  await browser.runtime.sendMessage({ type: 'setSetting', key: 'debugMode', value: ev.target.checked });
});

$('btnUpdateLists').addEventListener('click', async (ev) => {
  const btn = $('btnUpdateLists');
  const st = $('updateState');
  btn.disabled = true;
  st.textContent = 'İndiriliyor…';
  try {
    const r = await browser.runtime.sendMessage({ type: 'updateLists' });
    const counts = (r && r.counts) || {};
    const total = (counts.net || 0) + (counts.regex || 0) + (counts.cosmetic || 0);
    st.textContent = (r && r.ok) ? '✓ ' + (r.updated || 0) + ' liste · ' + fmtCount(total) + ' kural' : '✗ hata';
  } catch (e) {
    st.textContent = '✗ hata';
  } finally {
    btn.disabled = false;
    setTimeout(() => { st.textContent = ''; }, 5000);
  }
  refresh();
});

$('btnLogger').addEventListener('click', (ev) => {
  ev.preventDefault();
  browser.tabs.create({ url: browser.runtime.getURL('logger/logger.html') });
});

$('btnOptions').addEventListener('click', (ev) => {
  ev.preventDefault();
  browser.runtime.openOptionsPage();
});

$('btnSettings').addEventListener('click', (ev) => {
  ev.preventDefault();
  browser.runtime.openOptionsPage();
});

refresh();