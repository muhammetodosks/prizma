'use strict';
// Prizma panel mantığı

const $ = (id) => document.getElementById(id);

function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

let state = null;

async function refresh() {
  state = await browser.runtime.sendMessage({ type: 'getState' });
  if (!state) return;

  $('statBlocked').textContent = fmtCount(state.stats.blocked || 0);
  $('statToday').textContent = fmtCount(state.stats.dayBlocked || 0);
  $('statTotal').textContent = fmtCount(state.stats.total || 0);
  const c = state.counts || {};
  $('statRules').textContent = fmtCount((c.net || 0) + (c.regex || 0) + (c.cosmetic || 0));

  const g = state.guard || {};
  const gv = $('statVanguardHosts');
  if (gv) gv.textContent = fmtCount(g.host || 0);
  const gb = $('statVanguardBlocked');
  if (gb) gb.textContent = fmtCount(state.stats.vanguard || 0);

  $('pauseToggle').checked = !state.paused;
  $('engineInfo').textContent =
    'Motor: WASM C++ — ' + fmtCount(c.net || 0) + ' ağ, ' + fmtCount(c.cosmetic || 0) +
    ' cosmetic, ' + fmtCount(c.regex || 0) + ' regex kural';

  renderLists(state.lists || []);
  renderSettings(state.settings || {});
}

function renderLists(lists) {
  const box = $('listsBox');
  while (box.firstChild) box.removeChild(box.firstChild);
  for (const list of lists) {
    const row = document.createElement('div');
    row.className = 'list-row' + (list.enabled ? '' : ' off');
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'list-name';
    name.textContent = list.name;
    const status = document.createElement('div');
    status.className = 'list-status';
    status.textContent = list.enabled ? 'Etkin' : 'Kapalı';
    info.appendChild(name);
    info.appendChild(status);
    const sw = document.createElement('label');
    sw.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.list = list.id;
    input.checked = list.enabled;
    const slider = document.createElement('span');
    slider.className = 'slider';
    sw.appendChild(input);
    sw.appendChild(slider);
    row.appendChild(info);
    row.appendChild(sw);
    box.appendChild(row);
  }
  box.querySelectorAll('input[data-list]').forEach((input) => {
    input.addEventListener('change', () => {
      browser.runtime.sendMessage({ type: 'setListEnabled', id: input.dataset.list, enabled: input.checked });
    });
  });
}

function renderSettings(s) {
  document.querySelectorAll('input[data-setting]').forEach((input) => {
    input.checked = !!s[input.dataset.setting];
  });
  if (s.updateIntervalHours) {
    const iv = $('updateIntervalHours');
    if (iv) iv.value = String(s.updateIntervalHours);
  }
}

$('updateIntervalHours').addEventListener('change', async (ev) => {
  const v = Math.max(1, Math.min(168, parseInt(ev.target.value, 10) || 24));
  ev.target.value = String(v);
  await browser.runtime.sendMessage({ type: 'setSetting', key: 'updateIntervalHours', value: v });
});

$('pauseToggle').addEventListener('change', async (ev) => {
  await browser.runtime.sendMessage({ type: 'togglePause' });
  refresh();
});

document.querySelectorAll('input[data-setting]').forEach((input) => {
  input.addEventListener('change', async () => {
    await browser.runtime.sendMessage({ type: 'setSetting', key: input.dataset.setting, value: input.checked });
  });
});

$('btnLogger').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('logger/logger.html') });
});

$('btnUpdateLists').addEventListener('click', async () => {
  $('updateStatus').textContent = 'Güncelleniyor…';
  const r = await browser.runtime.sendMessage({ type: 'updateLists' });
  $('updateStatus').textContent = 'Güncellendi — ' + fmtCount(((r && r.counts && r.counts.net) || 0)) + ' ağ kuralı';
  refresh();
});

$('btnSaveCustom').addEventListener('click', async () => {
  $('customStatus').textContent = 'Kaydediliyor…';
  const r = await browser.runtime.sendMessage({ type: 'setCustomFilters', text: $('customFilters').value });
  $('customStatus').textContent = r && r.ok ? 'Kaydedildi' : 'Hata';
  refresh();
});

// özel filtreleri mevcut halde yükle
browser.storage.local.get(['customFilters']).then((got) => {
  if (got.customFilters) $('customFilters').value = got.customFilters;
});

refresh();