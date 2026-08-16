'use strict';
// Prizma WASM motor köprüsü — C ABI (wasm_bindings.cpp) bağlaması
const Prizma = (() => {
  let Module = null;
  let enginePtr = 0;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function mem() { return Module.HEAPU8; }

  function heapStr(s) {
    const b = enc.encode(s);
    const p = Module._malloc(b.length + 1);
    mem().set(b, p);
    mem()[p + b.length] = 0;
    return p;
  }

  function freePtr(p) {
    if (p) Module._free(p);
  }

  function readCStr(p) {
    if (!p) return '';
    const u8 = mem();
    let e = p;
    while (e < u8.length && u8[e]) e++;
    return dec.decode(u8.subarray(p, e));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Script yüklenemedi: ' + src));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function init() {
    if (Module) return;
    await loadScript(browser.runtime.getURL('wasm/prizma.js'));
    // MODULARIZE=1 → global createPrizmaModule fabrikası
    if (typeof createPrizmaModule !== 'function') {
      throw new Error('Prizma WASM fabrikası bulunamadı');
    }
    const wasmUrl = browser.runtime.getURL('wasm/prizma.wasm');
    Module = await createPrizmaModule({
      instantiateWasm: (imports, callback) => {
        fetch(wasmUrl).then((r) => r.arrayBuffer()).then((bytes) => {
          return WebAssembly.instantiate(bytes, imports).then((res) => {
            callback(res.instance);
          });
        }).catch((e) => { throw e; });
        return {};
      }
    });
    enginePtr = Module._prizma_new();
  }

  function loadList(text) {
    if (!Module || !text) return;
    const p = heapStr(text);
    Module._prizma_load_list(p, text.length);
    freePtr(p);
  }

  function clear() {
    if (Module) Module._prizma_clear();
  }

  function counts() {
    if (!Module) return { net: 0, regex: 0, cosmetic: 0 };
    return {
      net: Module._prizma_net_filter_count(),
      regex: Module._prizma_regex_filter_count(),
      cosmetic: Module._prizma_cosmetic_filter_count()
    };
  }

  // action: 1 engelle, 0 izin (exception), -1 eşleşme yok
  function match(url, typeBit, hostname, docHostname, thirdParty) {
    if (!Module) return -1;
    const up = heapStr(url);
    const hp = heapStr(hostname || '');
    const dp = heapStr(docHostname || '');
    const action = Module._prizma_match(up, typeBit | 0, hp, dp, thirdParty ? 1 : 0);
    freePtr(up); freePtr(hp); freePtr(dp);
    return action;
  }

  function lastRule() {
    return readCStr(Module._prizma_last_rule());
  }

  function cosmetic(hostname) {
    if (!Module) return null;
    const p = heapStr(hostname || '');
    const cap = 4 * 1024 * 1024; // cosmetic çıktısı büyük olabilir (ör. YouTube ~240KB)
    const buf = Module._malloc(cap);
    const len = Module._prizma_cosmetic(p, buf, cap);
    freePtr(p);
    if (len <= 0) { Module._free(buf); return null; }
    const u8 = mem();
    const s = dec.decode(u8.subarray(buf, buf + len));
    Module._free(buf);
    return s;
  }

  function stats() {
    if (!Module) return null;
    return readCStr(Module._prizma_stats());
  }

  // ── Vanguard Guard (DCP) ──────────────────────────────────────────────────
  function guardCheckHost(hostname, guardType) {
    if (!Module || !hostname) return -1;
    const p = heapStr(hostname);
    const r = Module._prizma_guard_check_host(p, guardType | 0);
    freePtr(p);
    return r;
  }

  function guardCheckUrl(url, guardType) {
    if (!Module || !url) return -1;
    const p = heapStr(url);
    const r = Module._prizma_guard_check_url(p, guardType | 0);
    freePtr(p);
    return r;
  }

  // Guard indeksini JSON dizesi olarak döndürür (content script DCP dağıtımı)
  function guardExport() {
    if (!Module) return null;
    const cap = 4 * 1024 * 1024;
    const buf = Module._malloc(cap);
    const len = Module._prizma_guard_export(buf, cap);
    if (len <= 0) { Module._free(buf); return null; }
    const u8 = mem();
    const s = dec.decode(u8.subarray(buf, buf + len));
    Module._free(buf);
    return s;
  }

  function guardCounts() {
    if (!Module) return { host: 0, allow: 0 };
    return {
      host: Module._prizma_guard_host_count(),
      allow: Module._prizma_guard_allow_count()
    };
  }

  return {
    init, loadList, clear, counts, match, lastRule, cosmetic, stats,
    guardCheckHost, guardCheckUrl, guardExport, guardCounts
  };
})();
