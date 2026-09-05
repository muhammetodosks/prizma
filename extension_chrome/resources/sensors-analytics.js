// Prizma $redirect=sensors-analytics.js — Sensors Data analytics no-op
(function () {
  'use strict';
  var noop = function () {};
  var track = noop;
  var sa = function () { track = noop; return sa; };
  sa.init = noop;
  sa.track = noop;
  sa.quick = noop;
  sa.login = noop;
  sa.logout = noop;
  sa.trackLink = noop;
  sa.trackClick = noop;
  sa.identify = noop;
  sa.setRegister = noop;
  sa.setOnceRegister = noop;
  sa.clearAllRegister = noop;
  sa.presend = noop;
  sa.use = noop;
  window.sensorsDataAnalytics = sa;
  window.sa = window.sa || sa;
})();