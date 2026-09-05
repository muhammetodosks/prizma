// Prizma $redirect=chartbeat.js — Chartbeat analytics no-op
(function () {
  'use strict';
  var noop = function () {};
  var c = window._sf_async_config || {};
  var cb = {
    push: noop,
    track: noop,
    send: noop,
    trackClick: noop,
    trackScroll: noop
  };
  window._cbq = cb;
  window.chartbeat = cb;
  window._sf = cb;
  window._sf_async_config = c;
})();