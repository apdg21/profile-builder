/* ResumePro: links a person's published resume, portfolio and profile sites.
   /api/publish writes rpLinks into data.json when the same person published
   more than one site. This adds each link to every site nav, or a floating
   pill if there is none. */
(function () {
  'use strict';

  var LABELS = { portfolio: 'Portfolio', resume: 'Resume', profile: 'Profile' };
  var ICONS = { portfolio: 'fa-folder-open', resume: 'fa-file-alt', profile: 'fa-id-card' };
  var FA_KEEP = /^fa-(solid|regular|brands|light|thin|duotone|sharp|fw|xs|sm|lg|xl|2x)$/;
  var MARK = 'data-rp-site-link';
  // Re-renders legitimately need re-inserts; anything past this is a loop.
  var MAX_INSERTS = 40;
  var inserted = 0;
  var links = [];

  function safeUrl(raw) {
    if (typeof raw !== 'string') return '';
    try {
      var u = new URL(raw);
      return u.protocol === 'https:' ? u.href : '';
    } catch (_) {
      return '';
    }
  }

  function isInPageLink(a) {
    var href = a.getAttribute('href') || '';
    if (href.length < 2 || href.charAt(0) !== '#' || href.indexOf('#data=') === 0) return false;
    if (a.closest('.offline-only') || a.classList.contains('nav-brand')) return false;
    return a.style.display !== 'none';
  }

  function navContainers() {
    var found = [];
    var all = document.querySelectorAll('nav, ul[class*="nav"], ul[id*="nav"], ul[class*="menu"], ul[id*="menu"]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest('footer')) continue;
      if (el.tagName === 'UL' && el.parentElement && el.parentElement.closest('nav')) continue;
      var anchors = Array.prototype.filter.call(el.querySelectorAll('a[href]'), isInPageLink);
      if (anchors.length >= 2) found.push({ el: el, sample: anchors[anchors.length - 1] });
    }
    return found;
  }

  function stripIds(node) {
    if (node.nodeType !== 1) return;
    node.removeAttribute('id');
    node.classList.remove('active', 'current', 'is-active', 'selected');
    for (var i = 0; i < node.children.length; i++) stripIds(node.children[i]);
  }

  function setLabel(a, text) {
    var walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
    var last = null;
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) last = walker.currentNode;
    }
    if (!last) {
      a.appendChild(document.createTextNode(text));
      return;
    }
    var lead = /^\s/.test(last.nodeValue) ? ' ' : '';
    last.nodeValue = lead + text;
    // Keep only the label: drop sibling counters/badges that were next to it.
    var parent = last.parentNode;
    if (parent !== a) {
      Array.prototype.slice.call(a.childNodes).forEach(function (n) {
        if (n !== parent && !n.contains(parent) && n.nodeType === 3 && n.nodeValue.trim()) a.removeChild(n);
      });
    }
  }

  function setIcon(a, type) {
    var svgs = a.querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) svgs[i].parentNode.removeChild(svgs[i]);
    var icons = a.querySelectorAll('i[class*="fa-"]');
    for (var j = 0; j < icons.length; j++) {
      var keep = icons[j].className.split(/\s+/).filter(function (c) {
        return c && (c.indexOf('fa-') !== 0 || FA_KEEP.test(c));
      });
      keep.push(ICONS[type]);
      icons[j].className = keep.join(' ');
    }
  }

  function makeLink(sample, link) {
    var li = sample.parentElement && sample.parentElement.tagName === 'LI' ? sample.parentElement : null;
    var host = li || sample;
    var clone = host.cloneNode(true);
    stripIds(clone);
    clone.removeAttribute('style');
    var a = clone.tagName === 'A' ? clone : clone.querySelector('a');
    Array.prototype.slice.call(a.attributes).forEach(function (attr) {
      if (/^(data-|aria-current|onclick)/.test(attr.name)) a.removeAttribute(attr.name);
    });
    clone.setAttribute(MARK, link.type);
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener';
    setIcon(a, link.type);
    setLabel(a, LABELS[link.type]);
    // Template scroll handlers bound later would preventDefault and try to
    // scroll to a "#section" -- this listener runs first and stops them.
    a.addEventListener('click', function (e) { e.stopImmediatePropagation(); });
    return { node: clone, after: host };
  }

  function insertIntoNavs() {
    var navs = navContainers();
    navs.forEach(function (nav) {
      links.forEach(function (link) {
        if (inserted >= MAX_INSERTS) return;
        if (nav.el.querySelector('[' + MARK + '="' + link.type + '"]')) return;
        var made = makeLink(nav.sample, link);
        made.after.parentNode.insertBefore(made.node, made.after.nextSibling);
        inserted++;
      });
    });
    return navs.length > 0;
  }

  function showPill() {
    if (document.querySelector('.rp-site-link-pill')) return;
    var style = document.createElement('style');
    style.textContent =
      '.rp-site-link-pill{position:fixed;left:18px;bottom:18px;z-index:2147483000;display:flex;gap:8px}' +
      '.rp-site-link-pill a{display:inline-flex;align-items:center;padding:10px 16px;border-radius:999px;' +
      'background:#111827;color:#fff;font:600 13px/1 "Segoe UI",system-ui,-apple-system,sans-serif;' +
      'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
      '.rp-site-link-pill a:hover{background:#000}' +
      '@media print{.rp-site-link-pill{display:none!important}}';
    document.head.appendChild(style);
    var wrap = document.createElement('div');
    wrap.className = 'rp-site-link-pill';
    links.forEach(function (link) {
      var a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'View ' + LABELS[link.type].toLowerCase() + ' \u2192';
      wrap.appendChild(a);
    });
    document.body.appendChild(wrap);
  }

  function start() {
    var placed = insertIntoNavs();
    // Many templates build their nav from data.json after load, and some
    // rebuild it later, so keep re-adding the link whenever the DOM changes.
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        if (insertIntoNavs()) placed = true;
      }, 50);
    }).observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      if (!placed && !insertIntoNavs()) showPill();
    }, 3000);
  }

  // Branch sites live at "/", but a profile's public URL is /p/<slug> with no
  // trailing slash. Without that slash a relative fetch would resolve to
  // /p/data.json, so build the directory part explicitly.
  function dataUrl() {
    var path = location.pathname;
    var base;
    if (/\/$/.test(path)) base = path;
    else if (/\.[a-z0-9]+$/i.test(path)) base = path.replace(/[^/]*$/, '');
    else base = path + '/';
    return base + 'data.json';
  }

  fetch(dataUrl(), { cache: 'no-cache' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var raw = data && data.rpLinks;
      if (!raw || typeof raw !== 'object') return;
      Object.keys(LABELS).forEach(function (type) {
        var url = safeUrl(raw[type]);
        if (url) links.push({ type: type, url: url });
      });
      if (!links.length) return;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    })
    .catch(function () {});
})();
