// Prizma $redirect=amazon_apstag.js — Amazon APSTag (Unified Ad Marketplace) no-op
(function () {
  'use strict';
  var noop = function () {};
  var apstag = {
    init: noop,
    fetchBids: function (o, cb) { if (typeof o === 'function') o(); if (cb) cb(); },
    getBids: function () { return []; },
    setDisplayBids: noop,
    refreshBids: noop,
    removeDisplayBids: noop,
    _Q: []
  };
  if (window.apstag && window.apstag._Q) {
    window.apstag = apstag;
  }
  window.apstag = apstag;
})();