// Prizma $redirect=google-ima.js — Google IMA SDK no-op stub
// imasdk.googleapis.com/js/sdkloader/ima3.js yerine döner; reklam göstermez,
// sayfa video oynatıcısı çalışır durur. (uBO google-ima.js eşdeğeri)
(function () {
  'use strict';
  var noop = function () {};
  function AdDisplayContainer() { this.load = noop; }
  function AdsRequest() {}
  function AdsLoader() { this.requestAds = noop; this.addEventListener = noop; this.removeEventListener = noop; }
  function AdErrorEvent() { this.type = 'AD_ERROR'; }
  function AdEvent() {}
  function AdsManager() {
    this.addEventListener = noop; this.removeEventListener = noop;
    this.init = noop; this.start = noop; this.stop = noop; this.pause = noop;
    this.resize = noop; this.destroy = noop; this.getCurrentAd = noop;
  }
  var ima = {
    AdDisplayContainer: AdDisplayContainer,
    AdsRequest: AdsRequest,
    AdsLoader: AdsLoader,
    AdsManager: AdsManager,
    AdErrorEvent: AdErrorEvent,
    AdEvent: AdEvent,
    ViewMode: { NORMAL: 'normal', FULLSCREEN: 'fullscreen' }
  };
  var goog = window.google || (window.google = {});
  goog.ima = ima;
  goog.ima2 = ima;
  var tag = window.googletag || (window.googletag = {});
  tag.ima = ima;
})();