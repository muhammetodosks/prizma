'use strict';
// VANGUARD loader — izole dünyada çalışır.
// 1) vanguard.js'yi MAIN WORLD'e <script> olarak enjekte eder (prototip yamaları
//    sayfa betiklerini etkilesin diye).
// 2) Main world ↔ background arasında postMessage köprüsü kurar:
//    main world "getGuard" ister → loader background'dan alır → geri gönderir.
//    main world "stats" bildirir → loader background'a iletir.

(() => {
  if (window.__prizmaVanguardLoader) return;
  window.__prizmaVanguardLoader = true;

  // Vanguard'ı mümkün olduğunca erken çalıştır (document_start).
  try {
    const s = document.createElement('script');
    s.src = browser.runtime.getURL('content/vanguard.js');
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}

  let guardPending = null;

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.prizmaVanguard !== true) return;

    if (d.type === 'getGuard') {
      // aynı anda gelen istekleri tek mesajda birleştir
      if (guardPending) return;
      guardPending = true;
      browser.runtime.sendMessage({ type: 'getGuard' })
        .then((res) => {
          guardPending = false;
          window.postMessage(
            { prizmaVanguard: true, type: 'guardData', json: (res && res.json) || null },
            '*'
          );
        })
        .catch(() => {
          guardPending = false;
          window.postMessage(
            { prizmaVanguard: true, type: 'guardData', json: null },
            '*'
          );
        });
    } else if (d.type === 'stats' && typeof d.blocked === 'number') {
      try {
        browser.runtime.sendMessage({ type: 'vanguardStats', blocked: d.blocked });
      } catch (e) {}
    }
  });
})();