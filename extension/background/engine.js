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
    // heapStr UTF-8 byte dizisi üretir; C++ tarafına GERÇEK BYTE uzunluğu
    // verilmelidir. text.length UTF-16 birim sayar — Türkçe (ı,ş,ğ,ü,ö,ç)
    // ve diğer çok baytlı karakterler içeren listelerde byte uzunluğundan
    // kısa kalır ve listenin SONU SESSİZCE KESİLİRDİ (kural kaybı).
    const b = enc.encode(text);
    const p = Module._malloc(b.length + 1);
    mem().set(b, p);
    mem()[p + b.length] = 0;
    Module._prizma_load_list(p, b.length);
    Module._free(p);
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
  // JS-Native RegExp motoru: C++'ın derleyemediği (lookahead vb.) regex'ler
  // burada native RegExp ile değerlendirilir. Sonuç WASM sonucuyla önceliğe
  // göre birleştirilir: 3=allow_imp > 2=block_imp > 1=allow > 0=block.
  function match(url, typeBit, hostname, docHostname, thirdParty) {
    lastRegexRule = '';
    if (!Module) return -1;
    const up = heapStr(url);
    const hp = heapStr(hostname || '');
    const dp = heapStr(docHostname || '');
    const action = Module._prizma_match(up, typeBit | 0, hp, dp, thirdParty ? 1 : 0);
    const priority = Module._prizma_match_priority();
    freePtr(up); freePtr(hp); freePtr(dp);

    const reg = regexMatch(url, typeBit, hostname || '', docHostname || '', thirdParty);
    if (reg) {
      if (reg.priority > priority) {
        lastRegexRule = reg.raw;
        return reg.action;
      }
      if (reg.priority === priority && priority >= 0) {
        // eşit öncelik: allow (0) kazanır — exception, bloktan üstündür
        lastRegexRule = reg.raw;
        return (reg.action === 0 || action === 0) ? 0 : 1;
      }
    }
    return action;
  }

  function lastRule() {
    if (lastRegexRule) return lastRegexRule;
    return readCStr(Module._prizma_last_rule());
  }

  // ── JS-Native RegExp Engine ───────────────────────────────────────────────
  // Teknoloji 1: C++ std::regex, ECMAScript lookahead/lookbehind/named-group
  // desteklemez; uBO/AdGuard listelerindeki bu regex'ler WASM'de sessizce
  // atlanırdı (B2). loadList sonrası regex_export_json() ile devredilen
  // filtreler burada native RegExp ile derlenir ve eşleştirilir.
  let regexRules = [];     // [{re, src, raw, e, i, m, t, p, hp, d, tok}]
  let lastRegexRule = '';

  function regexExport() {
    if (!Module) return null;
    const cap = 4 * 1024 * 1024;
    const buf = Module._malloc(cap);
    const len = Module._prizma_regex_export(buf, cap);
    if (len <= 0) { Module._free(buf); return null; }
    const u8 = mem();
    const s = dec.decode(u8.subarray(buf, buf + len));
    Module._free(buf);
    return s;
  }

  // Listeler yüklendikten sonra çağrılmalı (background reloadEngine).
  function syncRegexes() {
    regexRules = [];
    lastRegexRule = '';
    if (!Module) return;
    const j = regexExport();
    if (!j) return;
    let arr;
    try { arr = JSON.parse(j); } catch (e) { return; }
    for (const rf of arr) {
      if (rf.ok) continue;  // C++ tarafı zaten eşleştiriyor → çifte değerlendirme yok
      let re;
      try { re = new RegExp(rf.s, rf.m ? '' : 'i'); } catch (e) { continue; }
      regexRules.push({
        re, src: rf.s, raw: rf.raw,
        e: rf.e, i: rf.i, m: rf.m,
        t: rf.t || 0, p: rf.p, hp: rf.hp, d: rf.d || [], tok: rf.tok || ''
      });
    }
  }

  function regexDomainsOk(rules, docHostname) {
    let anyPositive = false;
    const dh = (docHostname || '').toLowerCase();
    for (const r of rules) {
      const name = r[0], neg = !!r[1];
      const hit = dh === name || dh.endsWith('.' + name);
      if (neg) {
        if (hit) return false;
      } else {
        anyPositive = true;
        if (hit) return true;
      }
    }
    return !anyPositive;
  }

  // Yalnızca C++'ın devrettiği (ok===0) regex'leri değerlendirir.
  // Dönüş: {action, priority, raw} | null
  function regexMatch(url, typeBit, hostname, docHostname, thirdParty) {
    let best = null;
    for (const rf of regexRules) {
      if (rf.tok && url.indexOf(rf.tok) === -1) continue;
      if (rf.t && (rf.t & typeBit) === 0) continue;
      if (rf.hp) {
        if (rf.p === 1 && !thirdParty) continue;
        if (rf.p === 2 && thirdParty) continue;
      }
      if (rf.d && rf.d.length) {
        if (!regexDomainsOk(rf.d, docHostname)) continue;
      }
      let m;
      try { m = rf.re.test(url); } catch (e) { continue; }
      if (!m) continue;
      const priority = rf.e ? (rf.i ? 3 : 1) : (rf.i ? 2 : 0);
      if (!best || priority > best.priority) {
        best = { action: rf.e ? 0 : 1, priority, raw: rf.raw };
      }
    }
    return best;
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
    syncRegexes,
    guardCheckHost, guardCheckUrl, guardExport, guardCounts
  };
})();
