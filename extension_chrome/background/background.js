'use strict';
// Prizma Background Service Worker (Manifest V3)
// Handles: declarativeNetRequest, webRequest, storage, messaging, alarms

// Import WASM engine (will be bundled)
importScripts('engine.js');

const TYPE_BITS = {
  main_frame: 1, sub_frame: 2, stylesheet: 4, script: 8, image: 16,
  object: 32, media: 64, xmlhttprequest: 128, fetch: 256,
  font: 512, websocket: 1024, ping: 2048, csp_report: 4096, other: 4096
};

const DEFAULT_SETTINGS = {
  paused: false, cnameCloaking: true, stripReferrer: false,
  stripCookies3p: false, cookiePartitioning: true,
  storagePartitioning: true, cookieFirstPartyIsolation: true,
  autoCleanupStorage: true, storageMaxAgeDays: 30,
  cookieBehavior: 'partition', cosmeticEnabled: true,
  vanguardEnabled: true, aggressiveMode: false,
  loggerKeep: 500, autoUpdateLists: true,
  updateIntervalHours: 6, debugMode: false
};

const LIST_SOURCES = [
  { id: 'easylist', name: 'EasyList', file: 'lists/easylist.txt', url: 'https://easylist.to/easylist/easylist.txt', enabled: true },
  { id: 'easyprivacy', name: 'EasyPrivacy', file: 'lists/easyprivacy.txt', url: 'https://easylist.to/easylist/easyprivacy.txt', enabled: true },
  { id: 'ublock-filters', name: 'uBO filters', file: 'lists/ublock-filters.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt', enabled: true },
  { id: 'ublock-unbreak', name: 'uBO unbreak', file: 'lists/ublock-unbreak.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt', enabled: true },
  { id: 'adguard-turkish', name: 'Türkçe (AdGuard)', file: 'lists/adguard-turkish.txt', url: 'https://filters.adtidy.org/extension/ublock/filters/13.txt', enabled: true },
  { id: 'adguard-tracking', name: 'Tracking (AdGuard)', file: 'lists/adguard-tracking.txt', url: 'https://filters.adtidy.org/extension/ublock/filters/3.txt', enabled: true },
  { id: 'prizma-hardcore', name: 'Prizma Hardcore', file: 'lists/prizma-hardcore.txt', url: null, enabled: true },
  { id: 'd3host', name: 'd3Host', file: 'lists/d3host.txt', url: 'https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.adblock', enabled: true },
  { id: 'ublock-2020', name: 'uBO 2020', file: 'lists/ublock-filters-2020.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2020.txt', enabled: true },
  { id: 'ublock-2021', name: 'uBO 2021', file: 'lists/ublock-filters-2021.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2021.txt', enabled: true },
  { id: 'ublock-2022', name: 'uBO 2022', file: 'lists/ublock-filters-2022.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2022.txt', enabled: true },
  { id: 'ublock-2023', name: 'uBO 2023', file: 'lists/ublock-filters-2023.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2023.txt', enabled: true },
  { id: 'ublock-2024', name: 'uBO 2024', file: 'lists/ublock-filters-2024.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2024.txt', enabled: true },
  { id: 'ublock-2025', name: 'uBO 2025', file: 'lists/ublock-filters-2025.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2025.txt', enabled: true },
  { id: 'ublock-2026', name: 'uBO 2026', file: 'lists/ublock-filters-2026.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-2026.txt', enabled: true },
  { id: 'ublock-general', name: 'uBO general', file: 'lists/ublock-general.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-general.txt', enabled: true },
  { id: 'ublock-mobile', name: 'uBO mobile', file: 'lists/ublock-mobile.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters-mobile.txt', enabled: true },
  { id: 'ublock-privacy', name: 'uBO privacy', file: 'lists/ublock-privacy.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt', enabled: true },
  { id: 'ublock-quickfix', name: 'uBO quickfix', file: 'lists/ublock-quickfixes.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt', enabled: true },
  { id: 'ublock-resabuse', name: 'uBO resabuse', file: 'lists/ublock-resabuse.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt', enabled: true },
  { id: 'ublock-legacy', name: 'uBO legacy', file: 'lists/ublock-legacy.txt', url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/legacy.txt', enabled: true },
  { id: 'oisd', name: 'OISD', file: 'lists/oisd.txt', url: 'https://raw.githubusercontent.com/EagleOne42/oisd/main/hosts_full.txt', enabled: true },
  { id: 'hagezi', name: 'HaGeZi', file: 'lists/hagezi.txt', url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/multi.txt', enabled: true },
  { id: 'adguard-dns', name: 'AdGuard DNS', file: 'lists/adguard-dns.txt', url: 'https://raw.githubusercontent.com/AdguardTeam/AdGuardSDNSFilter/master/Filters/rules.txt', enabled: true },
  { id: 'peterlowe', name: 'Peter Lowe', file: 'lists/peterlowe.txt', url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&mimetype=plaintext', enabled: true },
  { id: 'urlhaus', name: 'URLhaus', file: 'lists/urlhaus.txt', url: 'https://urlhaus.abuse.ch/downloads/hostfile/', enabled: true }
];

const SUSPICIOUS_COOKIE_PARAMS = [
  '_ga', '_gid', '_gat', '_gac_', '_fbp', '_fbc', '_gcl_', '_gcl_aw',
  '_gcl_dc', '_gcl_gb', '_gcl_gf', '_gcl_ha', '_gcl_hc', '_gcl_hp',
  'mc_', '_ym_', '_ym_d', '_ym_uid', '_ym_isad', '_ym_visorc',
  'fbclid', 'gclid', 'msclkid', 'ttclid', 'li_fat_id', 'twclid',
  'igclid', 'msclkid', 'cid'
];

let ready = false;
let settings = { ...DEFAULT_SETTINGS };
let siteRules = {};
let stats = { since: Date.now(), dayDate: new Date().toDateString(), dayBlocked: 0, total: 0, blocked: 0, byType: {} };
let logBuffer = [];
let webBlockedHosts = new Set();
const WEB_BLOCKED_MAX = 4000;
let guardJson = null;

async function init() {
  const got = await chrome.storage.local.get(['settings', 'stats', 'customFilters', 'siteRules']);
  settings = { ...DEFAULT_SETTINGS, ...(got.settings || {}) };
  stats = { ...stats, ...(got.stats || {}) };
  siteRules = got.siteRules || {};
  if (!got.stats) persistStats();

  await Prizma.init();
  await reloadEngine();

  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest,
    { urls: ['<all_urls>'] }, ['blocking']
  );
  chrome.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders,
    { urls: ['<all_urls>'] }, ['blocking', 'requestHeaders']
  );

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.commands.onCommand.addListener((cmd) => {
    if (cmd === 'toggle-prize') { settings.paused = !settings.paused; persistSettings(); }
  });

  setupUpdateAlarm();
  setupCleanupAlarm();

  ready = true;
  console.log('Prizma ready — ' + JSON.stringify(Prizma.counts()) + ' filters');
}

function setupUpdateAlarm() {
  chrome.alarms.clear('prizma-list-update');
  if (settings.autoUpdateLists && settings.updateIntervalHours > 0) {
    chrome.alarms.create('prizma-list-update', { periodInMinutes: settings.updateIntervalHours * 60 });
  }
}

function setupCleanupAlarm() {
  chrome.alarms.clear('prizma-storage-cleanup');
  if (settings.autoCleanupStorage) {
    chrome.alarms.create('prizma-storage-cleanup', { periodInMinutes: 24 * 60 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'prizma-list-update') {
    updateListsRemote().then((updated) => reloadEngine()).catch(() => {});
  } else if (alarm.name === 'prizma-storage-cleanup') {
    cleanupOldStorage().catch(() => {});
  }
});

// ... rest of the implementation (same as background.js but adapted for service worker)
// This is a condensed version - full implementation would include all functions

// Initialize
init();
