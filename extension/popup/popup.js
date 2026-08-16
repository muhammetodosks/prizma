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
  const el = $('state');
  el.textContent = state.paused ? 'Prizma duraklatıldı' : 'Prizma etkin';
  el.className = 'state ' + (state.paused ? 'paused' : 'active');
  $('title').textContent = state.paused ? 'Prizma (duraklı)' : 'Prizma';

  const guard = state.guard || {};
  $('guardHosts').textContent = fmtCount((guard.host || 0));
  $('vanguardBlocked').textContent = fmtCount(state.stats.vanguard || 0);
}

$('pauseToggle').addEventListener('change', async (ev) => {
  const r = await browser.runtime.sendMessage({ type: 'togglePause' });
  if (r && r.paused !== undefined) refresh();
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