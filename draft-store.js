/*
 * Auto-saved builder drafts.
 *
 * The builders keep everything in memory, so closing or refreshing the tab
 * used to throw away the whole site — including colours and the selected
 * theme. This module snapshots the builder state into IndexedDB
 * (localStorage when IndexedDB is unavailable) and offers to restore it on
 * the next visit.
 *
 * One record per (kind, template): "resume:style4", "profile:style3".
 * Call RPDrafts.boot({...}) after the editor is ready.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'rpDrafts';
  var DB_VERSION = 1;
  var STORE = 'drafts';
  var LS_PREFIX = 'rpDraft:';
  var SAVE_DELAY = 700;
  var MAX_DRAFTS = 20;

  var config = null;
  var dbPromise = null;
  var saveTimer = null;
  var resolved = true;
  var pillTimer = null;
  var banner = null;

  // ── Storage ──────────────────────────────────────────────────────────────

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var idb = global.indexedDB;
      if (!idb) { resolve(null); return; }
      var req;
      try { req = idb.open(DB_NAME, DB_VERSION); }
      catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function lsKey(id) { return LS_PREFIX + id; }

  function lsAll() {
    var out = [];
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var key = global.localStorage.key(i);
        if (!key || key.indexOf(LS_PREFIX) !== 0) continue;
        try {
          var record = JSON.parse(global.localStorage.getItem(key));
          if (record && record.id) out.push(record);
        } catch (e) { /* skip corrupt entry */ }
      }
    } catch (e) { /* storage unavailable */ }
    return out;
  }

  function lsPut(record) {
    try {
      global.localStorage.setItem(lsKey(record.id), JSON.stringify(record));
      return true;
    } catch (e) { return false; }
  }

  function lsRemove(id) {
    try { global.localStorage.removeItem(lsKey(id)); } catch (e) { /* ignore */ }
  }

  function readAll() {
    return openDb().then(function (db) {
      if (!db) return lsAll();
      return new Promise(function (resolve) {
        var out = [];
        try {
          var tx = db.transaction(STORE, 'readonly');
          var req = tx.objectStore(STORE).getAll();
          req.onsuccess = function () { out = req.result || []; };
          tx.oncomplete = function () { resolve(out); };
          tx.onerror = function () { resolve(out); };
          tx.onabort = function () { resolve(out); };
        } catch (e) { resolve(out); }
      });
    });
  }

  function writeRecord(record) {
    return openDb().then(function (db) {
      if (!db) return lsPut(record);
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(record);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      }).then(function (ok) {
        // QuotaExceeded on very large photo data: retry without the photo.
        if (ok || !record.photo) return ok;
        var slim = {};
        for (var k in record) if (Object.prototype.hasOwnProperty.call(record, k)) slim[k] = record[k];
        slim.photo = '';
        return openDb().then(function (db2) {
          if (!db2) return lsPut(slim);
          return new Promise(function (resolve) {
            try {
              var tx = db2.transaction(STORE, 'readwrite');
              tx.objectStore(STORE).put(slim);
              tx.oncomplete = function () { resolve(true); };
              tx.onerror = tx.onabort = function () { resolve(false); };
            } catch (e) { resolve(false); }
          });
        });
      });
    });
  }

  function removeRecord(id) {
    lsRemove(id);
    return openDb().then(function (db) {
      if (!db) return;
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      } catch (e) { /* ignore */ }
    });
  }

  // ── Record helpers ───────────────────────────────────────────────────────

  // Anything the person actually entered. A colours-only change counts.
  function meaningful(value, depth) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return !!value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return true;
    if (depth > 4) return false;
    if (Array.isArray(value)) return value.some(function (v) { return meaningful(v, depth + 1); });
    if (typeof value === 'object') {
      return Object.keys(value).some(function (k) { return meaningful(value[k], depth + 1); });
    }
    return false;
  }

  function hasContent(record) {
    if (!record) return false;
    if (record.rawText && record.rawText.trim()) return true;
    if (record.canonical && meaningful(record.canonical, 0)) return true;
    return false;
  }

  function relativeTime(ts) {
    var diff = Math.max(0, Date.now() - (ts || 0));
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
    var hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hrs / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  function clockTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function templateLabel(template) {
    if (config && typeof config.labelFor === 'function') {
      var label = config.labelFor(template);
      if (label) return label;
    }
    return template ? String(template).toUpperCase() : 'your design';
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!config || !resolved) return Promise.resolve(false);

    var record;
    try { record = config.getRecord(); }
    catch (e) { return Promise.resolve(false); }
    if (!record || !record.template || !hasContent(record)) return Promise.resolve(false);

    record.id = config.kind + ':' + record.template;
    record.kind = config.kind;
    record.v = 1;
    record.updatedAt = Date.now();

    return writeRecord(record).then(function (ok) {
      showPill(ok, record.updatedAt);
      return ok;
    });
  }

  function schedule() {
    if (!config || !resolved) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY);
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  function hidePill() {
    var pill = document.getElementById('rpDraftPill');
    if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
    clearTimeout(pillTimer);
  }

  function showPill(ok, ts) {
    if (banner) return;
    var pill = document.getElementById('rpDraftPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'rpDraftPill';
      pill.setAttribute('role', 'status');
      pill.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99990;' +
        'font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
        'color:#475569;background:rgba(255,255,255,.94);border:1px solid #e2e8f0;' +
        'border-radius:999px;padding:6px 12px;box-shadow:0 4px 14px rgba(15,23,42,.10);' +
        'transition:opacity .35s ease;pointer-events:none;';
      document.body.appendChild(pill);
    }
    pill.textContent = ok ? 'Draft saved · ' + clockTime(ts) : 'Draft could not be saved';
    pill.style.color = ok ? '#475569' : '#b91c1c';
    pill.style.opacity = '1';
    clearTimeout(pillTimer);
    pillTimer = setTimeout(function () { pill.style.opacity = '0'; }, 2400);
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function showBanner(record) {
    if (banner) return;
    hidePill();

    var box = document.createElement('div');
    box.id = 'rpDraftBanner';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Saved draft');
    box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99991;' +
      'width:min(340px,calc(100vw - 32px));box-sizing:border-box;' +
      'font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'color:#0f172a;background:#fff;border:1px solid #e2e8f0;border-radius:14px;' +
      'padding:16px;box-shadow:0 16px 40px rgba(15,23,42,.18);';

    var title = document.createElement('div');
    title.textContent = 'Saved draft found';
    title.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:4px;';
    box.appendChild(title);

    var meta = document.createElement('div');
    meta.textContent = templateLabel(record.template) + ' · saved ' + relativeTime(record.updatedAt);
    meta.style.cssText = 'color:#475569;margin-bottom:6px;';
    box.appendChild(meta);

    var note = document.createElement('div');
    note.textContent = 'Continue where you left off, or start a new one.';
    note.style.cssText = 'color:#64748b;margin-bottom:12px;';
    box.appendChild(note);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    var go = document.createElement('button');
    go.type = 'button';
    go.dataset.act = 'continue';
    go.textContent = 'Continue';
    go.style.cssText = 'flex:1 1 auto;padding:8px 14px;border-radius:9px;border:1px solid #1d4ed8;' +
      'background:#1d4ed8;color:#fff;font:inherit;font-weight:600;cursor:pointer;';
    row.appendChild(go);

    var fresh = document.createElement('button');
    fresh.type = 'button';
    fresh.dataset.act = 'fresh';
    fresh.textContent = 'Start fresh';
    fresh.style.cssText = 'flex:1 1 auto;padding:8px 14px;border-radius:9px;border:1px solid #cbd5e1;' +
      'background:#fff;color:#0f172a;font:inherit;font-weight:600;cursor:pointer;';
    row.appendChild(fresh);

    box.appendChild(row);
    document.body.appendChild(box);
    banner = box;

    go.addEventListener('click', function () {
      hideBanner();
      resolved = true;
      try { config.onContinue(record); }
      catch (e) { console.error('[drafts] could not restore draft', e); }
    });

    fresh.addEventListener('click', function () {
      var ok = global.confirm('Start fresh? Your saved draft for this design will be deleted.');
      if (!ok) return;
      hideBanner();
      removeRecord(record.id).then(function () {
        resolved = true;
        try { if (typeof config.onDiscard === 'function') config.onDiscard(record); }
        catch (e) { /* ignore */ }
      });
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  function prune(records) {
    records.slice(MAX_DRAFTS).forEach(function (record) { removeRecord(record.id); });
  }

  function bindAutosave() {
    if (config.autosaveEvents !== false) {
      document.addEventListener('input', schedule, true);
      document.addEventListener('change', schedule, true);
      document.addEventListener('click', schedule, true);
      global.addEventListener('rpThemeChange', schedule);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
    global.addEventListener('pagehide', function () { flush(); });
  }

  function boot(cfg) {
    config = cfg || {};
    config.kind = config.kind || 'resume';
    resolved = !!config.skipPrompt;
    bindAutosave();

    readAll().then(function (records) {
      var mine = (records || [])
        .filter(function (r) { return r && r.kind === config.kind; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      prune(mine);

      var newest = mine[0];
      if (config.skipPrompt || !newest || !hasContent(newest)) {
        resolved = true;
        return;
      }
      showBanner(newest);
    });
  }

  function list(kind) {
    return readAll().then(function (records) {
      return (records || [])
        .filter(function (r) { return !kind || r.kind === kind; })
        .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    });
  }

  global.RPDrafts = {
    boot: boot,
    schedule: schedule,
    flush: flush,
    list: list,
    _relativeTime: relativeTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
