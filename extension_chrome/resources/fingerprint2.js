// Prizma $redirect=fingerprint2.js — Fingerprint2/3 parmak izi no-op
// Gerçek parmak izi üretmek yerine sabit/değişken kimlik döner; takip imkansız.
(function () {
  'use strict';
  function fakeId() {
    var s = '';
    var chars = '0123456789abcdef';
    for (var i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }
  function Fingerprint2() {}
  Fingerprint2.get = function (cb) { setTimeout(function () { cb(fakeId(), []); }, 0); };
  Fingerprint2.getPromise = function () {
    return new Promise(function (resolve) { setTimeout(function () { resolve({ visitorId: fakeId() }); }, 0); });
  };
  Fingerprint2.getV18 = Fingerprint2.get;
  Fingerprint2.prototype.get = Fingerprint2.get;
  window.Fingerprint2 = Fingerprint2;
  window.Fingerprint = Fingerprint2;
  if (window.FingerprintJS) {
    window.FingerprintJS.load = function () {
      return Promise.resolve({ get: function () { return Promise.resolve({ visitorId: fakeId() }); } });
    };
  }
})();