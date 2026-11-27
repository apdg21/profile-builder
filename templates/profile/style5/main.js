/*
 * main.js — thin browser wrapper around rp-profile.js.
 *
 * Published sites arrive with the page already rendered into #rp-app (the
 * builder bakes it in at publish time), so search engines and social previews
 * never have to run JavaScript. This file only renders in the builder preview,
 * where data.json is fetched live, and wires the Messenger form.
 */
(function () {
  'use strict';

  var app = document.getElementById('rp-app');

  function render(data) {
    try {
      if (window.RPProfile) window.RPProfile.mount(app, data);
    } catch (err) {
      if (window.console) console.error('[profile] render failed', err);
    }
  }

  // The section editor calls this with its live data.
  window.__rpRender = render;

  if (app && app.getAttribute('data-rp-prerendered') !== '1' && !app.children.length) {
    fetch('data.json', { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { if (data) render(data); })
      .catch(function () { /* file:// or offline: leave the shell */ });
  }

  // Messenger handoff: the form never posts anywhere. It opens Facebook
  // Messenger with the visitor's message ready to send, using the public
  // m.me link format. Works without a Page access token or server.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.getAttribute || !form.hasAttribute('data-rp-messenger')) return;
    event.preventDefault();

    var username = (form.getAttribute('data-rp-messenger') || '').replace(/^@/, '');
    if (!username) return;

    var nameField = form.querySelector('[name="name"]');
    var messageField = form.querySelector('[name="message"]');
    var name = nameField ? nameField.value.trim() : '';
    var message = messageField ? messageField.value.trim() : '';
    if (!message) return;

    var body = (name ? 'Hi, I\'m ' + name + '.\n\n' : '') + message;
    var url = 'https://m.me/' + encodeURIComponent(username) + '?text=' + encodeURIComponent(body);
    window.open(url, '_blank', 'noopener');
  });
})();
