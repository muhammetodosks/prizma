'use strict';
// Prizma logger mantığı

const $ = (id) => document.getElementById(id);
let log = [];
let searchTerm = '';
let actionFilter = '';

const TYPE_CLASS = {
  image: 'img', script: 'script', stylesheet: 'css', xmlhttprequest: 'xhr',
  sub_frame: 'doc', main_frame: 'doc', media: 'media', font: 'img',
  websocket: 'xhr', ping: 'oth', object: 'oth', other: 'oth', cname: 'oth'
};

function timeStr(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function render() {
  const rows = log.filter((e) => {
    if (actionFilter && e.action !== actionFilter && !(actionFilter === 'cname' && e.type === 'cname')) return false;
    if (searchTerm) {
      const hay = ((e.url || '') + ' ' + (e.rule || '') + ' ' + (e.host || '')).toLowerCase();
      if (hay.indexOf(searchTerm) === -1) return false;
    }
    return true;
  });
  const body = $('logBody');
  while (body.firstChild) body.removeChild(body.firstChild);
  $('empty').style.display = rows.length ? 'none' : 'block';
  for (const e of rows.slice(-500)) {
    const tr = document.createElement('tr');
    const type = e.type || 'other';

    const tdTime = document.createElement('td');
    tdTime.textContent = timeStr(e.t);

    const tdType = document.createElement('td');
    const code = document.createElement('code');
    code.className = 'type ' + (TYPE_CLASS[type] || 'oth');
    code.textContent = type;
    tdType.appendChild(code);

    const tdHost = document.createElement('td');
    tdHost.className = 'url';
    tdHost.textContent = e.host || e.url || '';

    const tdDoc = document.createElement('td');
    tdDoc.className = 'url';
    tdDoc.textContent = e.doc || '';

    const tdParty = document.createElement('td');
    const span = document.createElement('span');
    span.className = 'pill ' + (e.thirdParty ? 'yes' : 'no');
    span.textContent = e.thirdParty ? '3p' : '1p';
    tdParty.appendChild(span);

    const tdRule = document.createElement('td');
    tdRule.className = 'rule';
    tdRule.textContent = e.rule || '';

    tr.appendChild(tdTime);
    tr.appendChild(tdType);
    tr.appendChild(tdHost);
    tr.appendChild(tdDoc);
    tr.appendChild(tdParty);
    tr.appendChild(tdRule);
    body.appendChild(tr);
  }
}

async function poll() {
  const r = await browser.runtime.sendMessage({ type: 'getLog' });
  if (r && r.log) {
    log = r.log;
    render();
  }
}

$('search').addEventListener('input', (ev) => { searchTerm = ev.target.value.trim().toLowerCase(); render(); });
$('filterAction').addEventListener('change', (ev) => { actionFilter = ev.target.value; render(); });
$('btnClear').addEventListener('click', async () => {
  await browser.storage.local.remove(['log']);
  log = [];
  render();
});

poll();
setInterval(poll, 1500);