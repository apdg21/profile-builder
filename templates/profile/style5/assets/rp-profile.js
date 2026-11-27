/*
 * rp-profile.js
 * -------------
 * One renderer for every profile design. It turns the canonical profile data
 * (the same shape the builder edits) into semantic HTML. Designs differ in
 * their stylesheet, not their markup, so a field added here reaches all of
 * them at once.
 *
 * No DOM, no fetch, no dependencies: the builder runs this exact file at
 * publish time to bake real content into the HTML, which is what makes the
 * published page readable by search engines without executing JavaScript.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPProfile = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SECTIONS = [
    { id: 'about', section: 'About', label: 'About' },
    { id: 'services', section: 'Services', label: 'Services' },
    { id: 'work', section: 'Work', label: 'Work' },
    { id: 'skills', section: 'Skills', label: 'Skills' },
    { id: 'credentials', section: 'Credentials', label: 'Credentials' },
    { id: 'testimonials', section: 'Testimonials', label: 'Testimonials' },
    { id: 'faq', section: 'FAQ', label: 'FAQ' },
    { id: 'contact', section: 'Contact', label: 'Contact' }
  ];

  var ICON_PATHS = {
    facebook: '<path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.5-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94z"/>',
    messenger: '<path d="M12 2C6.3 2 2 6.2 2 11.6c0 2.9 1.2 5.5 3.1 7.3v3.6l2.9-1.6c.9.3 1.9.4 3 .4 5.7 0 10-4.2 10-9.7S17.7 2 12 2zm1 13.1-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.4 5.8z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/>',
    linkedin: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9z"/>',
    x: '<path d="M4 3h4.6l4.1 5.5L17.6 3H21l-6.6 7.5L21.5 21H17l-4.5-6-5 6H4l7-8.2z"/>',
    tiktok: '<path d="M16.6 3c.4 2.1 1.8 3.6 3.9 3.9v3c-1.4 0-2.7-.4-3.9-1.2v6.1c0 3.4-2.5 5.8-5.8 5.8-3.1 0-5.8-2.5-5.8-5.7 0-3.3 2.8-5.9 6.1-5.7v3.1c-1.6-.3-3.1.8-3.1 2.5 0 1.4 1.1 2.6 2.6 2.6 1.6 0 2.8-1.2 2.8-2.9V3z"/>',
    youtube: '<path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8zM10 15.5v-7l6 3.5z"/>',
    github: '<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.4 4.6-4.6 4.9.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>',
    whatsapp: '<path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2zm5.1 14.1c-.2.6-1.2 1.1-1.7 1.2-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.4-.5-2.4-1-4-3.4-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.7.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.8 2c.1.2.1.4 0 .6l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/>',
    viber: '<path d="M12 2C6.9 2 3 5.2 3 9.7c0 2.5 1.1 4.7 2.9 6.1v3.7l3.2-1.5c.9.3 1.9.4 2.9.4 5.1 0 9-3.2 9-7.7S17.1 2 12 2zm4.4 10.8c-.2.5-1 1-1.4 1.1-.4.1-.8.1-1.3-.1-.3-.1-.7-.2-1.2-.4-2.1-.9-3.4-3-3.5-3.1-.1-.2-.8-1.1-.8-2.1s.5-1.5.7-1.7c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.7c.1.2.1.3 0 .5l-.3.4c-.1.1-.2.3-.1.5.2.3.7 1.1 1.5 1.8 1 .9 1.8 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.3.1.2.1.6-.1 1.1z"/>',
    website: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 9h17M3.5 15h17M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m3.5 7 8.5 6 8.5-6" fill="none" stroke="currentColor" stroke-width="2"/>',
    phone: '<path d="M6.6 3.5h3l1.5 4-2 1.4c.8 2 2.5 3.7 4.5 4.5l1.4-2 4 1.5v3c0 .9-.7 1.6-1.6 1.6C10.6 18 6 13.4 5 6.1c0-.9.7-1.6 1.6-1.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    location: '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };

  var PLATFORM_KEYS = {
    facebook: 'facebook', fb: 'facebook',
    messenger: 'messenger',
    instagram: 'instagram', ig: 'instagram',
    linkedin: 'linkedin', li: 'linkedin',
    x: 'x', twitter: 'x', xtwitter: 'x',
    tiktok: 'tiktok', tiktokph: 'tiktok',
    youtube: 'youtube', yt: 'youtube',
    github: 'github', gh: 'github',
    whatsapp: 'whatsapp', wa: 'whatsapp',
    viber: 'viber',
    website: 'website', site: 'website', link: 'website',
    email: 'email', mail: 'email',
    phone: 'phone'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function has(value) {
    return text(value) !== '';
  }

  function safeUrl(value) {
    var url = text(value);
    if (!url) return '';
    if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
    if (/^\/\//.test(url)) return 'https:' + url;
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#]|$)/i.test(url)) return 'https://' + url;
    return '';
  }

  // Photo sources are either a data: URI (what the builder uploads) or the
  // template's own relative sample path. safeUrl() rejects both on purpose,
  // so images get their own gate: only real images and plain paths pass,
  // never javascript: or a data: type that could smuggle markup.
  function imageSrc(value) {
    var url = text(value);
    if (!url) return '';
    if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(url)) return url;
    var web = safeUrl(url);
    if (web && /^https?:/i.test(web)) return web;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
    if (/^[a-z0-9][a-z0-9._\/-]*$/i.test(url)) return url;
    return '';
  }

  function slug(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function icon(name, className) {
    var path = ICON_PATHS[name] || ICON_PATHS.website;
    return '<svg class="' + (className || 'pf-icon') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>';
  }

  function platformKey(platform) {
    var key = slug(platform);
    return PLATFORM_KEYS[key] || 'website';
  }

  function platformLabel(platform, key) {
    var given = text(platform);
    if (given) return given;
    var labels = {
      facebook: 'Facebook', messenger: 'Messenger', instagram: 'Instagram',
      linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', youtube: 'YouTube',
      github: 'GitHub', whatsapp: 'WhatsApp', viber: 'Viber',
      website: 'Website', email: 'Email', phone: 'Phone'
    };
    return labels[key] || 'Link';
  }

  function paragraphs(value) {
    return text(value)
      .split(/\n{2,}|\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .map(function (line) { return '<p>' + esc(line) + '</p>'; })
      .join('');
  }

  function hiddenSet(data) {
    var list = data && data.ui && data.ui.hiddenSections;
    var set = {};
    if (Array.isArray(list)) list.forEach(function (name) { set[String(name)] = true; });
    return set;
  }

  function items(value) {
    return Array.isArray(value) ? value.filter(function (item) {
      if (!item || typeof item !== 'object') return false;
      return Object.keys(item).some(function (key) { return has(item[key]); });
    }) : [];
  }

  function socialLinks(data) {
    return items(data.socialLinks).map(function (link) {
      var key = platformKey(link.platform);
      return {
        key: key,
        label: platformLabel(link.platform, key),
        url: key === 'email' && has(link.url) ? 'mailto:' + text(link.url) : safeUrl(link.url)
      };
    }).filter(function (link) { return link.url; });
  }

  function renderSocial(links, className) {
    if (!links.length) return '';
    return '<div class="pf-social' + (className ? ' ' + className : '') + '">' + links.map(function (link) {
      return '<a class="pf-social__link" href="' + esc(link.url) + '" target="_blank" rel="noopener" aria-label="' + esc(link.label) + '" title="' + esc(link.label) + '">'
        + icon(link.key) + '<span class="pf-sr">' + esc(link.label) + '</span></a>';
    }).join('') + '</div>';
  }

  function initials(name) {
    return text(name).split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('');
  }

  function sectionOpen(id, sectionName, title, intro) {
    return '<section class="pf-section" id="' + id + '" data-rp-section="' + esc(sectionName) + '">'
      + '<div class="pf-section__head">'
      + '<p class="pf-eyebrow">' + esc(sectionName) + '</p>'
      + '<h2 class="pf-section__title">' + esc(title || sectionName) + '</h2>'
      + (has(intro) ? '<div class="pf-section__intro">' + paragraphs(intro) + '</div>' : '')
      + '</div>';
  }

  function renderHero(data, shape) {
    if (shape.hidden.Basics) return '';
    var name = text(data.fullName) || 'Your name';
    var photo = imageSrc(data.profileImage);
    var cover = imageSrc(data.coverImage);
    var actions = [];

    var ctaLabel = text(data.ctaText);
    var ctaUrl = safeUrl(data.ctaUrl) || (has(shape.contactAny) ? '#contact' : '');
    if (ctaUrl) actions.push('<a class="pf-btn pf-btn--solid" href="' + esc(ctaUrl) + '">' + esc(ctaLabel || 'Get in touch') + icon('arrow', 'pf-icon pf-icon--btn') + '</a>');
    if (shape.contactAny) actions.push('<a class="pf-btn pf-btn--ghost" href="#contact">Contact</a>');

    var photoHtml = photo
      ? '<img class="pf-hero__photo" src="' + esc(photo) + '" alt="Photo of ' + esc(name) + '" loading="eager">'
      : '<div class="pf-hero__photo pf-hero__photo--mono" aria-hidden="true">' + esc(initials(name)) + '</div>';

    return '<section class="pf-hero' + (cover ? ' pf-hero--cover' : '') + '" id="hero" data-rp-section="Basics">'
      + (cover ? '<div class="pf-hero__cover" style="background-image:url(\'' + esc(cover) + '\')"></div>' : '')
      + '<div class="pf-hero__inner">'
      + '<div class="pf-hero__media">' + photoHtml + '</div>'
      + '<div class="pf-hero__body">'
      + (has(data.availability) ? '<p class="pf-pill"><span class="pf-pill__dot"></span>' + esc(data.availability) + '</p>' : '')
      + '<h1 class="pf-hero__name">' + esc(name) + '</h1>'
      + (has(data.headline) ? '<p class="pf-hero__headline">' + esc(data.headline) + '</p>' : '')
      + (has(data.tagline) ? '<p class="pf-hero__tagline">' + esc(data.tagline) + '</p>' : '')
      + (has(data.location) ? '<p class="pf-hero__location">' + icon('location', 'pf-icon pf-icon--inline') + esc(data.location) + '</p>' : '')
      + (actions.length ? '<div class="pf-hero__actions">' + actions.join('') + '</div>' : '')
      + renderSocial(shape.social, 'pf-social--hero')
      + '</div></div></section>';
  }

  function renderAbout(data, shape) {
    if (shape.hidden.About || !has(data.aboutText)) return '';
    return sectionOpen('about', 'About', data.aboutTitle || 'About', '')
      + '<div class="pf-prose">' + paragraphs(data.aboutText) + '</div>'
      + '</section>';
  }

  function renderServices(data, shape) {
    var list = items(data.services);
    if (shape.hidden.Services || !list.length) return '';
    var cards = list.map(function (service) {
      var link = safeUrl(service.link);
      return '<article class="pf-card pf-service">'
        + '<h3 class="pf-card__title">' + esc(service.title || 'Service') + '</h3>'
        + (has(service.description) ? '<p class="pf-card__text">' + esc(service.description) + '</p>' : '')
        + (has(service.price) || link ? '<div class="pf-card__foot">'
          + (has(service.price) ? '<span class="pf-price">' + esc(service.price) + '</span>' : '')
          + (link ? '<a class="pf-link" href="' + esc(link) + '" target="_blank" rel="noopener">Details' + icon('arrow', 'pf-icon pf-icon--inline') + '</a>' : '')
          + '</div>' : '')
        + '</article>';
    }).join('');
    return sectionOpen('services', 'Services', data.servicesTitle || 'Services', data.servicesIntro)
      + '<div class="pf-grid pf-grid--cards">' + cards + '</div>'
      + '</section>';
  }

  function renderWork(data, shape) {
    var list = items(data.work);
    if (shape.hidden.Work || !list.length) return '';
    var rows = list.map(function (job) {
      var meta = [job.company, job.period].filter(has).join(' · ');
      return '<article class="pf-work">'
        + '<div class="pf-work__head">'
        + '<h3 class="pf-work__role">' + esc(job.role || job.company || 'Work') + '</h3>'
        + (meta ? '<p class="pf-work__meta">' + esc(meta) + '</p>' : '')
        + '</div>'
        + (has(job.description) ? '<p class="pf-work__text">' + esc(job.description) + '</p>' : '')
        + '</article>';
    }).join('');
    return sectionOpen('work', 'Work', data.workTitle || 'Experience', '')
      + '<div class="pf-work-list">' + rows + '</div>'
      + '</section>';
  }

  function renderSkills(data, shape) {
    var list = items(data.skills).map(function (skill) { return text(skill.name); }).filter(Boolean);
    if (shape.hidden.Skills || !list.length) return '';
    return sectionOpen('skills', 'Skills', data.skillsTitle || 'Skills', '')
      + '<ul class="pf-chips">' + list.map(function (name) {
        return '<li class="pf-chip">' + esc(name) + '</li>';
      }).join('') + '</ul>'
      + '</section>';
  }

  function renderCredentials(data, shape) {
    var list = items(data.credentials);
    if (shape.hidden.Credentials || !list.length) return '';
    var rows = list.map(function (entry) {
      var meta = [entry.issuer, entry.year].filter(has).join(' · ');
      return '<li class="pf-credential">'
        + '<span class="pf-credential__title">' + esc(entry.title || '') + '</span>'
        + (meta ? '<span class="pf-credential__meta">' + esc(meta) + '</span>' : '')
        + '</li>';
    }).join('');
    return sectionOpen('credentials', 'Credentials', data.credentialsTitle || 'Credentials', '')
      + '<ul class="pf-credentials">' + rows + '</ul>'
      + '</section>';
  }

  function renderTestimonials(data, shape) {
    var list = items(data.testimonials);
    if (shape.hidden.Testimonials || !list.length) return '';
    var cards = list.map(function (t) {
      return '<figure class="pf-quote">'
        + '<blockquote>' + esc(t.text || '') + '</blockquote>'
        + '<figcaption>'
        + '<strong>' + esc(t.author || '') + '</strong>'
        + (has(t.role) ? '<span>' + esc(t.role) + '</span>' : '')
        + '</figcaption></figure>';
    }).join('');
    return sectionOpen('testimonials', 'Testimonials', data.testimonialsTitle || 'Testimonials', '')
      + '<div class="pf-grid pf-grid--quotes">' + cards + '</div>'
      + '</section>';
  }

  function renderFaq(data, shape) {
    var list = items(data.faq);
    if (shape.hidden.FAQ || !list.length) return '';
    var rows = list.map(function (entry) {
      return '<details class="pf-faq">'
        + '<summary>' + esc(entry.question || 'Question') + '</summary>'
        + '<p>' + esc(entry.answer || '') + '</p>'
        + '</details>';
    }).join('');
    return sectionOpen('faq', 'FAQ', data.faqTitle || 'Frequently asked', '')
      + '<div class="pf-faq-list">' + rows + '</div>'
      + '</section>';
  }

  function renderContact(data, shape) {
    if (shape.hidden.Contact) return '';
    var cards = [];

    if (has(data.messengerUsername)) {
      var username = text(data.messengerUsername).replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?(?:m\.me|messenger\.com)\//i, '').replace(/\/+$/, '');
      cards.push('<div class="pf-card pf-messenger" data-rp-messenger-card>'
        + '<h3 class="pf-card__title">Message me on Messenger</h3>'
        + '<p class="pf-card__text">' + esc(data.messengerNote || 'Write your message here — Messenger opens with it ready to send.') + '</p>'
        + '<form class="pf-form" data-rp-messenger="' + esc(username) + '">'
        + '<label>Your name<input type="text" name="name" autocomplete="name" required></label>'
        + '<label>Message<textarea name="message" rows="3" required></textarea></label>'
        + '<button type="submit" class="pf-btn pf-btn--solid">Open Messenger' + icon('arrow', 'pf-icon pf-icon--btn') + '</button>'
        + '</form>'
        + '<noscript><p><a class="pf-btn pf-btn--solid" href="https://m.me/' + esc(username) + '">Open Messenger</a></p></noscript>'
        + '</div>');
    }

    var channels = [];
    if (has(data.email)) {
      channels.push('<li><a href="mailto:' + esc(text(data.email)) + '">' + icon('email', 'pf-icon pf-icon--inline') + '<span>' + esc(data.email) + '</span></a></li>');
    }
    if (has(data.phone)) {
      channels.push('<li><a href="tel:' + esc(text(data.phone).replace(/\s+/g, '')) + '">' + icon('phone', 'pf-icon pf-icon--inline') + '<span>' + esc(data.phone) + '</span></a></li>');
    }
    var booking = safeUrl(data.bookingUrl);
    if (booking) {
      channels.push('<li><a href="' + esc(booking) + '" target="_blank" rel="noopener">' + icon('calendar', 'pf-icon pf-icon--inline') + '<span>' + esc(data.bookingLabel || 'Book a call') + '</span></a></li>');
    }
    if (has(data.businessUrl) && safeUrl(data.businessUrl)) {
      channels.push('<li><a href="' + esc(safeUrl(data.businessUrl)) + '" target="_blank" rel="noopener">' + icon('website', 'pf-icon pf-icon--inline') + '<span>' + esc(data.businessName || data.businessUrl) + '</span></a></li>');
    }
    if (channels.length) {
      cards.push('<div class="pf-card pf-channels">'
        + '<h3 class="pf-card__title">Other ways to reach me</h3>'
        + '<ul class="pf-channel-list">' + channels.join('') + '</ul>'
        + renderSocial(shape.social, 'pf-social--contact')
        + '</div>');
    }

    if (!cards.length && !has(data.contactIntro)) return '';

    return sectionOpen('contact', 'Contact', data.contactTitle || 'Get in touch', '')
      + (has(data.contactIntro) ? '<div class="pf-contact__intro">' + paragraphs(data.contactIntro) + '</div>' : '')
      + '<div class="pf-contact__grid">' + cards.join('') + '</div>'
      + '</section>';
  }

  function renderFooter(data, shape) {
    if (shape.hidden.Footer) return '';
    var name = text(data.fullName);
    var year = new Date().getFullYear();
    var line = text(data.copyright) || (name ? '© ' + year + ' ' + name : '');
    return '<footer class="pf-footer">'
      + '<p class="pf-footer__line">' + esc(line) + '</p>'
      + '<a class="pf-footer__top" href="#top">Back to top</a>'
      + '</footer>';
  }

  function render(data) {
    data = data && typeof data === 'object' ? data : {};
    var hidden = hiddenSet(data);
    var social = hidden.Social ? [] : socialLinks(data);
    var contactAny = has(data.messengerUsername) || has(data.email) || has(data.phone)
      || has(safeUrl(data.bookingUrl)) || social.length > 0;
    var shape = {
      hidden: hidden,
      social: social,
      contactAny: contactAny || has(data.contactIntro)
    };

    var body = renderHero(data, shape)
      + renderAbout(data, shape)
      + renderServices(data, shape)
      + renderWork(data, shape)
      + renderSkills(data, shape)
      + renderCredentials(data, shape)
      + renderTestimonials(data, shape)
      + renderFaq(data, shape)
      + renderContact(data, shape);

    return body
      ? '<div class="pf" data-rp-profile>' + buildNav(data, shape, social) + '<main class="pf-main" id="top">' + body + '</main>' + renderFooter(data, shape) + '</div>'
      : '';
  }

  function buildNav(data, shape, social) {
    var links = [];
    if (!shape.hidden.About && has(data.aboutText)) links.push({ href: '#about', label: 'About' });
    if (!shape.hidden.Services && items(data.services).length) links.push({ href: '#services', label: 'Services' });
    if (!shape.hidden.Work && items(data.work).length) links.push({ href: '#work', label: 'Work' });
    if (!shape.hidden.Skills && items(data.skills).length) links.push({ href: '#skills', label: 'Skills' });
    if (!shape.hidden.Credentials && items(data.credentials).length) links.push({ href: '#credentials', label: 'Credentials' });
    if (!shape.hidden.Testimonials && items(data.testimonials).length) links.push({ href: '#testimonials', label: 'Testimonials' });
    if (!shape.hidden.FAQ && items(data.faq).length) links.push({ href: '#faq', label: 'FAQ' });
    if (shape.contactAny) links.push({ href: '#contact', label: 'Contact' });

    if (!links.length) return '';
    return '<header class="pf-nav">'
      + '<a class="pf-nav__brand" href="#top">' + esc(text(data.fullName) || 'Profile') + '</a>'
      + '<nav class="pf-nav__links" aria-label="Sections">'
      + links.map(function (link) { return '<a href="' + link.href + '">' + link.label + '</a>'; }).join('')
      + '</nav>'
      + (shape.contactAny ? '<a class="pf-nav__cta" href="#contact">' + esc(text(data.ctaText) || 'Get in touch') + '</a>' : '')
      + '</header>';
  }

  function mount(el, data) {
    if (!el) return;
    el.innerHTML = render(data);
  }

  // --- Structured data -----------------------------------------------------
  // Person inside ProfilePage: exactly the shape Google documents for
  // profile pages, and what makes a name searchable when there is no
  // Wikipedia article to point at.
  function addressFrom(location) {
    var parts = text(location).split(',').map(function (part) { return part.trim(); }).filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return { '@type': 'PostalAddress', 'addressLocality': parts[0] };
    return {
      '@type': 'PostalAddress',
      'addressLocality': parts[0],
      'addressCountry': parts[parts.length - 1]
    };
  }

  function buildJsonLd(data, pageUrl) {
    data = data && typeof data === 'object' ? data : {};
    var url = safeUrl(pageUrl) || '';
    var name = text(data.fullName);
    var person = {
      '@type': 'Person',
      'name': name || 'Profile',
      'jobTitle': text(data.headline) || undefined,
      'description': text(data.aboutText).replace(/\s+/g, ' ').slice(0, 300) || undefined,
      'knowsAbout': items(data.skills).map(function (s) { return text(s.name); }).filter(Boolean).slice(0, 20)
    };
    if (url) person.url = url;
    if (has(data.email)) person.email = 'mailto:' + text(data.email);
    if (has(data.phone)) person.telephone = text(data.phone);
    var address = addressFrom(data.location);
    if (address) person.address = address;
    var sameAs = hiddenSet(data).Social ? [] : socialLinks(data)
      .map(function (link) { return /^https?:/i.test(link.url) ? link.url : ''; })
      .filter(Boolean);
    if (sameAs.length) person.sameAs = sameAs;
    if (has(data.businessName)) {
      person.worksFor = {
        '@type': 'Organization',
        'name': text(data.businessName),
        'url': safeUrl(data.businessUrl) || undefined
      };
    }
    var alumni = items(data.credentials)
      .filter(function (c) { return has(c.issuer); })
      .map(function (c) { return { '@type': 'EducationalOrganization', 'name': text(c.issuer) }; });
    if (alumni.length) person.alumniOf = alumni;
    var services = items(data.services);
    if (services.length) {
      person.hasOfferCatalog = {
        '@type': 'OfferCatalog',
        'name': text(data.servicesTitle) || 'Services',
        'itemListElement': services.slice(0, 12).map(function (s) {
          return {
            '@type': 'Offer',
            'itemOffered': {
              '@type': 'Service',
              'name': text(s.title),
              'description': text(s.description) || undefined
            }
          };
        })
      };
    }
    if (has(data.profileImage) && /^https?:/i.test(text(data.profileImage))) person.image = text(data.profileImage);

    var page = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      'name': name ? (name + (has(data.headline) ? ' — ' + text(data.headline) : '')) : 'Profile',
      'mainEntity': person
    };
    if (url) {
      page.url = url;
      page['@id'] = url + '#profile';
      person['@id'] = url + '#person';
    }
    return page;
  }

  return {
    render: render,
    mount: mount,
    buildJsonLd: buildJsonLd,
    sections: SECTIONS.slice(),
    safeUrl: safeUrl,
    esc: esc
  };
});
