/*
  site-import.js
  --------------
  Brings a PUBLISHED site back into the builder. The site's data.json is in the
  template's own shape, so this walks the template's mapping backwards and
  rebuilds the master-schema data the editor works with. Nothing here needs a
  license key: reading a site is free, only publishing/downloading is gated.

  Also detects which design a data.json came from, by scoring how many of each
  mapping's target paths (weighted by how rare they are across designs) are
  present in the data.

  Pure functions, no DOM -- shared by both builders and loadable in Node for
  tests.
*/
(function (root) {
  'use strict';

  var SITE_HOST_SUFFIX = '.resumepro-builds.pages.dev';
  var PUBLIC_HOST = 'resumepro.pages.dev';
  var SITE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
  // Portfolio and profile branches always carry their own suffix
  // (/api/publish appends it).
  var PORTFOLIO_ID_PATTERN = /-portfolio(?:-\d+)?$/;
  var PROFILE_ID_PATTERN = /-profile(?:-\d+)?$/;

  var PLATFORM_NAMES = {
    linkedin: 'LinkedIn', github: 'GitHub', gitlab: 'GitLab',
    facebook: 'Facebook', instagram: 'Instagram', twitter: 'Twitter',
    x: 'X', youtube: 'YouTube', tiktok: 'TikTok',
    dribbble: 'Dribbble', behance: 'Behance', medium: 'Medium',
    pinterest: 'Pinterest', stackoverflow: 'Stack Overflow', whatsapp: 'WhatsApp',
    telegram: 'Telegram', discord: 'Discord', threads: 'Threads',
    substack: 'Substack', codepen: 'CodePen', figma: 'Figma',
    vimeo: 'Vimeo', soundcloud: 'SoundCloud', spotify: 'Spotify',
    patreon: 'Patreon', calendly: 'Calendly', email: 'Email', website: 'Website'
  };

  function getPath(obj, path) {
    return String(path).split('.').reduce(function (acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var keys = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      var k = keys[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isEmpty(value) {
    return value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);
  }

  function sameValue(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }

  // --- Site ids ----------------------------------------------------------

  // The public profile URL is /p/<slug>; the branch behind it carries the
  // "-profile" suffix. Mirrors publicProfileSlug in functions/api/publish.js.
  function profileBranchFromSlug(slug) {
    var numbered = /^(.*)-(\d+)$/.exec(slug);
    return numbered ? numbered[1] + '-profile-' + numbered[2] : slug + '-profile';
  }

  // Accepts a bare id ("sofia-reyes"), one of our URLs, or a public profile
  // link ("https://resumepro.pages.dev/p/maya-reyes"), with or without a
  // scheme. Mirrors /api/site-data so the server never receives anything it
  // would reject and the user gets the error immediately.
  function parseSiteId(raw) {
    var value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!value) return null;

    // Public profile link (full URL or the bare "p/<slug>" form).
    var publicMatch = new RegExp(
      '^(?:https?:\\/\\/)?(?:www\\.)?' + PUBLIC_HOST.replace(/\./g, '\\.') +
      '\\/p\\/([a-z0-9][a-z0-9-]{0,62})(?:[/?#]|$)'
    ).exec(value);
    if (publicMatch) return profileBranchFromSlug(publicMatch[1]);
    if (value.indexOf('p/') === 0) {
      var bare = value.split('/')[1] || '';
      return SITE_ID_PATTERN.test(bare) ? profileBranchFromSlug(bare) : null;
    }

    // A pasted URL can carry a path or query; only the host matters.
    var id = value.split('/')[0];
    if (!SITE_ID_PATTERN.test(id)) {
      var withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : 'https://' + value;
      var host;
      try { host = new URL(withScheme).hostname; } catch (_) { return null; }
      if (host === SITE_HOST_SUFFIX.slice(1) || host.slice(-SITE_HOST_SUFFIX.length) !== SITE_HOST_SUFFIX) {
        return null;
      }
      id = host.slice(0, -SITE_HOST_SUFFIX.length);
    }
    return SITE_ID_PATTERN.test(id) ? id : null;
  }

  function siteUrl(id) {
    return 'https://' + id + SITE_HOST_SUFFIX;
  }

  function siteKind(id) {
    var value = String(id || '');
    if (PROFILE_ID_PATTERN.test(value)) return 'profile';
    return PORTFOLIO_ID_PATTERN.test(value) ? 'portfolio' : 'resume';
  }

  async function fetchSite(id) {
    var res = await fetch('/api/site-data?id=' + encodeURIComponent(id), {
      headers: { Accept: 'application/json' }
    });
    var body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    if (!res.ok) {
      var err = new Error((body && body.error) || 'Could not load that site.');
      err.code = body && body.code;
      err.status = res.status;
      throw err;
    }
    if (!body || !body.data) {
      var empty = new Error('That site has no saved details to load.');
      empty.code = 'site_empty';
      throw empty;
    }
    return body;
  }

  // --- Small text helpers -------------------------------------------------

  function htmlToText(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function restorePlatformName(slug) {
    var key = String(slug == null ? '' : slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (PLATFORM_NAMES[key]) return PLATFORM_NAMES[key];
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // "About {fullName}" + "About Sofia Reyes" -> { fullName: "Sofia Reyes" }.
  // Bails out when two tokens are separated only by whitespace ({a} {b}),
  // because the split between them is a guess: better to skip than to import
  // the value under the wrong field.
  function parseComposed(template, value) {
    var parts = [];
    var re = /\{([^}]+)\}/g;
    var match;
    var lastIndex = 0;
    while ((match = re.exec(template))) {
      if (match.index > lastIndex) parts.push({ literal: template.slice(lastIndex, match.index) });
      parts.push({ token: match[1] });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < template.length) parts.push({ literal: template.slice(lastIndex) });

    for (var i = 1; i < parts.length; i++) {
      if (!parts[i].token) continue;
      var between = parts[i - 1];
      if (between.token) return null;              // {a}{b}
      if (!between.literal.trim()) return null;    // {a} {b}
    }

    var tokenNames = [];
    var source = '^';
    parts.forEach(function (part) {
      if (part.token) {
        if (part.token === 'year') {
          source += '(\\d{4})';
        } else {
          source += '([\\s\\S]*?)';
          tokenNames.push(part.token);
        }
      } else {
        source += escapeRegExp(part.literal).replace(/\s+/g, '\\s+');
      }
    });
    source += '$';

    var found;
    try { found = new RegExp(source).exec(String(value).replace(/\s+/g, ' ').trim()); } catch (_) { return null; }
    if (!found) return null;

    var parsed = {};
    var group = 1;
    parts.forEach(function (part) {
      if (!part.token) return;
      var captured = found[group++];
      if (part.token !== 'year') parsed[part.token] = (captured || '').trim();
    });
    return parsed;
  }

  // --- Template detection -------------------------------------------------

  function targetPaths(mapping) {
    var paths = [];
    var add = function (p) { if (typeof p === 'string' && p && p.charAt(0) !== '_') paths.push(p); };

    if (mapping.scalar) {
      Object.keys(mapping.scalar).forEach(function (masterPath) {
        if (masterPath.charAt(0) === '_') return;
        var spec = mapping.scalar[masterPath];
        add(typeof spec === 'object' && spec ? spec.path : spec);
      });
    }
    var addArrayTargets = function (group) {
      if (!group) return;
      Object.keys(group).forEach(function (key) { add(group[key] && group[key].targetPath); });
    };
    addArrayTargets(mapping.arrays);
    addArrayTargets(mapping.objectMap);
    addArrayTargets(mapping.labelValueArray);
    addArrayTargets(mapping.contactItemsArray);
    addArrayTargets(mapping.groupedArrays);
    if (mapping.compose) Object.keys(mapping.compose).forEach(add);
    if (mapping.splitName) {
      add(mapping.splitName.firstNameTarget);
      add(mapping.splitName.lastNameTarget);
    }
    return paths.filter(function (p, i) { return paths.indexOf(p) === i; });
  }

  var IGNORE_SHAPE_KEY = /^(rp[A-Z]|ui$|theme$|rpLinks$)/;

  // Every design ships a default data.json that the published data is cloned
  // from, so the KEY STRUCTURE (ignoring values) is the most reliable
  // fingerprint. Array contents are skipped: a section the user left empty
  // would otherwise look like a different design.
  function shapeOf(value, prefix, out, depth) {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      out.add(prefix + '[]');
      return;
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        if (!prefix && IGNORE_SHAPE_KEY.test(key)) return;
        shapeOf(value[key], prefix ? prefix + '.' + key : key, out, depth + 1);
      });
      return;
    }
    out.add(prefix);
  }

  function dice(a, b) {
    var intersection = 0;
    a.forEach(function (value) { if (b.has(value)) intersection++; });
    return (2 * intersection) / (a.size + b.size || 1);
  }

  // Newer publishes record the design in data.json (rpTemplate). Older sites
  // are matched by shape; two designs can share a layout (e.g. style2/5/6),
  // in which case every tie is returned so the user can pick.
  function detectTemplate(data, mappings, options) {
    var keys = Object.keys(mappings || {});
    if (!data || typeof data !== 'object') return { key: null, confident: false, candidates: [] };

    var opts = options || {};
    var marked = typeof data.rpTemplate === 'string' ? data.rpTemplate : opts.template;
    if (marked && mappings[marked]) {
      return { key: marked, confident: true, candidates: [marked], method: 'marker' };
    }

    var samples = opts.samples;
    if (samples && Object.keys(samples).length) {
      var target = new Set();
      shapeOf(data, '', target, 0);
      var scored = keys.filter(function (key) { return samples[key]; }).map(function (key) {
        var signature = new Set();
        shapeOf(samples[key], '', signature, 0);
        return { key: key, score: dice(target, signature) };
      }).sort(function (a, b) { return b.score - a.score; });
      if (!scored.length) return { key: null, confident: false, candidates: [] };

      var best = scored[0];
      // Designs can share a layout (style2/5/6/9/10, style7 vs style3) and a
      // few mapping-only keys shift the scores slightly, so anything close to
      // the top is offered to the user as a candidate.
      var candidates = scored
        .filter(function (c) { return c.score >= best.score - 0.04; })
        .map(function (c) { return c.key; });
      return {
        key: best.key,
        score: best.score,
        confident: candidates.length === 1 && best.score >= 0.5,
        candidates: candidates,
        method: 'shape'
      };
    }

    // No samples available: fall back to which of the design's target paths
    // exist in the data (weaker, but still steady for a filled-in site).
    return detectByPaths(data, mappings);
  }

  function detectByPaths(data, mappings) {
    var keys = Object.keys(mappings || {});
    var signatures = {};
    var frequency = {};
    keys.forEach(function (key) {
      var paths = targetPaths(mappings[key] || {});
      signatures[key] = paths;
      paths.forEach(function (p) { frequency[p] = (frequency[p] || 0) + 1; });
    });
    var scored = keys.map(function (key) {
      var score = 0;
      signatures[key].forEach(function (p) {
        var value = getPath(data, p);
        if (value === undefined) return;
        // A rare path is a strong fingerprint; a path every design has is not.
        var weight = 1 / (frequency[p] || 1);
        score += weight;
        if (Array.isArray(value) && value.length) score += weight * 0.5;
      });
      return { key: key, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
    var best = scored[0] || { key: null, score: 0 };
    var runnerUp = scored[1] || { score: 0 };
    return {
      key: best.key,
      score: best.score,
      confident: best.score > 0 && best.score >= runnerUp.score * 1.08,
      candidates: scored.filter(function (c) { return c.score >= best.score - 1e-9; }).map(function (c) { return c.key; }),
      method: 'paths'
    };
  }

  // --- Reverse mapping ----------------------------------------------------

  function reverseMapping(data, mapping, options) {
    var out = {};
    if (!data || typeof data !== 'object' || !mapping) return out;

    var opts = options || {};
    var sample = opts.sample || null;
    var kind = opts.kind || 'resume';
    var validPaths = Array.isArray(opts.masterPaths) && opts.masterPaths.length
      ? new Set(opts.masterPaths)
      : null;

    var accept = function (path) { return !validPaths || validPaths.has(path); };
    var put = function (path, value) {
      if (!accept(path)) return;
      setPath(out, path, value);
    };
    var sampleMatches = function (targetPath, value) {
      if (!sample) return false;
      var sampleValue = getPath(sample, targetPath);
      return sampleValue !== undefined && sameValue(sampleValue, value);
    };

    // 1. Split name: personalInfo.firstName + lastName -> fullName.
    if (mapping.splitName) {
      var first = getPath(data, mapping.splitName.firstNameTarget);
      var last = getPath(data, mapping.splitName.lastNameTarget);
      var full = [first, last].map(function (v) { return typeof v === 'string' ? v.trim() : ''; })
        .filter(Boolean).join(' ');
      if (full) put(mapping.splitName.sourcePath, full);
    }

    // 2. Scalars: template value -> master field.
    if (mapping.scalar) {
      Object.keys(mapping.scalar).forEach(function (masterPath) {
        if (masterPath.charAt(0) === '_') return;
        var spec = mapping.scalar[masterPath];
        var targetPath = (typeof spec === 'object' && spec) ? spec.path : spec;
        if (!targetPath) return;
        var value = getPath(data, targetPath);
        if (value === undefined) return;
        // keepWhenBlank fields hold the design's own copy until replaced --
        // identical to the sample means the user never touched it.
        if (typeof spec === 'object' && spec && spec.keepWhenBlank && sampleMatches(targetPath, value)) return;
        if (typeof spec === 'object' && spec && spec.wrapInArray && Array.isArray(value)) value = value[0];
        if (typeof spec === 'object' && spec && spec.html) value = htmlToText(value);
        if (typeof value === 'string') value = value.trim();
        if (typeof value === 'string' && value === '') return;
        put(masterPath, value);
      });
    }

    // 3. Arrays: template items -> master items.
    if (mapping.arrays) {
      Object.keys(mapping.arrays).forEach(function (masterPath) {
        var cfg = mapping.arrays[masterPath];
        if (!cfg || !cfg.targetPath) return;
        var arr = getPath(data, cfg.targetPath);
        if (!Array.isArray(arr)) return;
        if (!arr.length) { put(masterPath, []); return; }

        if (cfg.scalarFromItem) {
          put(masterPath, arr
            .filter(function (v) { return typeof v === 'string' && v.trim(); })
            .map(function (v) {
              var item = {};
              item[cfg.scalarFromItem] = v.trim();
              return item;
            }));
          return;
        }
        if (!cfg.itemMap) { put(masterPath, clone(arr)); return; }

        var reverse = {};
        Object.keys(cfg.itemMap).forEach(function (masterField) {
          if (masterField.charAt(0) === '_' || masterField === 'joinBulletsAs') return;
          reverse[cfg.itemMap[masterField]] = masterField;
        });

        var items = arr.map(function (target) {
          if (!target || typeof target !== 'object') return null;
          var item = {};

          Object.keys(reverse).forEach(function (targetField) {
            if (target[targetField] === undefined) return;
            var masterField = reverse[targetField];
            var value = target[targetField];

            // A single paragraph on the site becomes one bullet per line; the
            // original bullet split can't be recovered when it was joined.
            if (masterField === 'bullets') {
              if (cfg.itemMap.joinBulletsAs === 'paragraph' && typeof value === 'string') {
                item.bullets = value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
              } else if (Array.isArray(value)) {
                item.bullets = clone(value);
              } else if (typeof value === 'string' && value.trim()) {
                item.bullets = [value.trim()];
              }
              return;
            }
            item[masterField] = value;
          });

          // Dates were joined into one string ("2020 – 2023"); split them back.
          if (Array.isArray(cfg.joinFields)) {
            cfg.joinFields.forEach(function (rule) {
              var combined = target[rule.targetField];
              if (typeof combined !== 'string' || !combined.trim()) return;
              var parts = combined.split(rule.separator || ' ').map(function (s) { return s.trim(); });
              if (parts.length === rule.sourceFields.length) {
                rule.sourceFields.forEach(function (field, i) { if (parts[i]) item[field] = parts[i]; });
              } else if (!item[rule.sourceFields[0]]) {
                item[rule.sourceFields[0]] = combined.trim();
              }
            });
          }

          // A comma-separated master field was split into a list; rejoin it.
          if (cfg.splitFields) {
            Object.keys(cfg.splitFields).forEach(function (masterField) {
              var rule = cfg.splitFields[masterField] || {};
              var value = target[rule.targetField || masterField];
              if (!Array.isArray(value)) return;
              var cleaned = value.map(function (v) { return String(v).trim(); }).filter(Boolean);
              if (cleaned.length) item[masterField] = cleaned.join(', ');
            });
          }

          // Platform names became slug for the icon lookup; restore a readable one.
          if (cfg.lowercaseFields) {
            Object.keys(cfg.lowercaseFields).forEach(function (masterField) {
              var value = target[cfg.lowercaseFields[masterField]];
              if (value) item[masterField] = restorePlatformName(value);
            });
          }

          return item;
        }).filter(function (item) {
          return item && Object.keys(item).some(function (k) { return !isEmpty(item[k]); });
        });

        put(masterPath, items);
      });
    }

    // 4. Object map (socials keyed by platform) -> array of {platform, url}.
    if (mapping.objectMap) {
      Object.keys(mapping.objectMap).forEach(function (masterPath) {
        var cfg = mapping.objectMap[masterPath];
        if (!cfg || !cfg.targetPath) return;
        var obj = getPath(data, cfg.targetPath);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        var arr = Object.keys(obj)
          .filter(function (key) { return key && obj[key] != null && obj[key] !== ''; })
          .map(function (key) {
            var item = {};
            item[cfg.keyFrom] = restorePlatformName(key);
            item[cfg.valueFrom] = obj[key];
            return item;
          });
        put(masterPath, arr);
      });
    }

    // 5. Composed strings ("{fullName} | {jobTitle}") -> their master fields.
    if (mapping.compose) {
      Object.keys(mapping.compose).forEach(function (targetPath) {
        var cfg = mapping.compose[targetPath];
        if (!cfg || typeof cfg.template !== 'string') return;
        var value = getPath(data, targetPath);
        if (typeof value !== 'string' || !value.trim()) return;

        var parsed = parseComposed(cfg.template, value);
        if (cfg.onlyIfBlank) {
          // aboutTitle: the site shows the default "About <name>" only while
          // the field is empty, so an equal value means it was never filled.
          if (parsed) {
            var recomputed = cfg.template.replace(/\{([^}]+)\}/g, function (m, token) {
              if (token === 'year') return String(new Date().getFullYear());
              return parsed[token] !== undefined ? parsed[token] : '';
            }).replace(/\s+/g, ' ').trim();
            if (recomputed === value.replace(/\s+/g, ' ').trim()) return;
          }
          put(cfg.onlyIfBlank, value.trim());
          return;
        }
        if (!parsed) {
          // Two adjacent content tokens ({headline} {tagline}) can't be split
          // safely. Keep the whole text in the first field -- re-publishing
          // composes the exact same string, so nothing is lost. Never do this
          // for footers, where the "first token" is usually the person's name
          // inside a copyright line.
          if (/footer|copyright/i.test(targetPath)) return;
          var tokenNames = [];
          String(cfg.template).replace(/\{([^}]+)\}/g, function (m, token) {
            if (token !== 'year') tokenNames.push(token);
          });
          if (tokenNames.length === 2 && tokenNames.every(accept)) {
            put(tokenNames[0], value.trim());
          }
          return;
        }
        Object.keys(parsed).forEach(function (token) {
          if (parsed[token]) put(token, parsed[token]);
        });
      });
    }

    // 6. label/value lists (style18's about.personalInfo).
    if (mapping.labelValueArray) {
      Object.keys(mapping.labelValueArray).forEach(function (targetPath) {
        var cfg = mapping.labelValueArray[targetPath];
        var arr = getPath(data, targetPath);
        if (!cfg || !Array.isArray(arr) || !arr.length) return;
        if (sampleMatches(targetPath, arr)) return;
        arr.forEach(function (entry) {
          if (!entry || typeof entry !== 'object' || isEmpty(entry.value)) return;
          var def = (cfg.items || []).find(function (item) {
            return String(item.label).toLowerCase() === String(entry.label || '').toLowerCase();
          });
          if (def) put(def.sourcePath, String(entry.value).trim());
        });
      });
    }

    // 7. Icon-linked contact lists -> their master fields.
    if (mapping.contactItemsArray) {
      Object.keys(mapping.contactItemsArray).forEach(function (targetPath) {
        var cfg = mapping.contactItemsArray[targetPath];
        var arr = getPath(data, targetPath);
        if (!cfg || !Array.isArray(arr) || !arr.length) return;
        if (sampleMatches(targetPath, arr)) return;
        arr.forEach(function (entry) {
          if (!entry || isEmpty(entry.text)) return;
          var def = (cfg.items || []).find(function (item) {
            return item.icon && entry.icon === item.icon;
          });
          if (!def && entry.link) {
            def = (cfg.items || []).find(function (item) {
              var prefix = String(item.linkTemplate || '').split('{value}')[0];
              return prefix && String(entry.link).indexOf(prefix) === 0;
            });
          }
          if (def) put(def.sourcePath, String(entry.text).trim());
        });
      });
    }

    // 8. Grouped arrays (style14 skills + languages under one list).
    if (mapping.groupedArrays) {
      Object.keys(mapping.groupedArrays).forEach(function (key) {
        var cfg = mapping.groupedArrays[key];
        var groups = cfg && getPath(data, cfg.targetPath);
        if (!Array.isArray(groups)) return;
        var collected = {};
        groups.forEach(function (group) {
          if (!group || typeof group !== 'object') return;
          var label = group[cfg.groupField];
          var items = Array.isArray(group[cfg.itemsField]) ? group[cfg.itemsField] : [];
          var def = (cfg.groups || []).find(function (g) { return g.groupValue === label; });

          // Group labels can be user values (style14 splits skills by
          // category). Then pick the definition whose mapped item fields best
          // match the item keys, preferring the one that carries a groupBy.
          if (!def && items.length && items[0] && typeof items[0] === 'object') {
            var keys = Object.keys(items[0]);
            var ranked = (cfg.groups || []).map(function (g) {
              var targets = Object.values(g.itemMap || {});
              var score = keys.filter(function (k) { return targets.indexOf(k) !== -1; }).length;
              return { def: g, score: score, groupBy: !!g.groupBy };
            }).sort(function (a, b) {
              return (b.score - a.score) || ((b.groupBy ? 1 : 0) - (a.groupBy ? 1 : 0));
            });
            if (ranked.length && ranked[0].score > 0) def = ranked[0].def;
          }
          if (!def) return;

          items.forEach(function (target) {
            if (!target || typeof target !== 'object') return;
            var item = {};
            Object.keys(def.itemMap || {}).forEach(function (masterField) {
              var targetField = def.itemMap[masterField];
              if (target[targetField] !== undefined) item[masterField] = target[targetField];
            });
            if (def.groupBy && label) item[def.groupBy] = label;
            if (!collected[def.sourcePath]) collected[def.sourcePath] = [];
            collected[def.sourcePath].push(item);
          });
        });
        Object.keys(collected).forEach(function (sourcePath) {
          if (collected[sourcePath].length) put(sourcePath, collected[sourcePath]);
        });
      });
    }

    // 9. Colours, hidden sections and the portfolio photo ride under ui.
    if (data.ui && typeof data.ui === 'object' && !Array.isArray(data.ui)) {
      out.ui = clone(data.ui);
      if (kind === 'portfolio' && typeof data.ui.profileImage === 'string' && data.ui.profileImage) {
        put('profileImage', data.ui.profileImage);
      }
    }

    // 10. Portfolio-only reserved keys.
    if (kind === 'portfolio') {
      if (typeof data.rpWorkTitle === 'string' && data.rpWorkTitle.trim()) put('projectsTitle', data.rpWorkTitle.trim());
      if (Array.isArray(data.rpWorkSections) && data.rpWorkSections.length) put('workSections', clone(data.rpWorkSections));
      if (typeof data.rpHeroImage === 'string' && data.rpHeroImage.trim()) put('heroImage', data.rpHeroImage);
    }

    return out;
  }

  // Matches a published theme object to a preset so the builder highlights the
  // right swatch; anything custom still restores as "Custom".
  function themeFromData(data, presets) {
    var theme = data && data.theme;
    if (!theme || typeof theme !== 'object') return null;
    var keys = ['gradientStart', 'gradientEnd', 'accentColor', 'textColor', 'headingColor'];
    var matches = function (candidate) {
      if (!candidate || typeof candidate !== 'object') return false;
      return keys.every(function (k) {
        return !theme[k] || !candidate[k] ||
          String(theme[k]).toLowerCase() === String(candidate[k]).toLowerCase();
      });
    };
    if (presets) {
      var ids = Object.keys(presets);
      for (var i = 0; i < ids.length; i++) {
        if (matches(presets[ids[i]] && presets[ids[i]].theme)) {
          return { id: ids[i], theme: clone(theme) };
        }
      }
    }
    return { id: 'custom', theme: clone(theme) };
  }

  /*
   * Profile sites publish the canonical shape as-is, so there is no
   * reverse-mapping step: the data is already what the editor edits. The
   * design is recorded under rpTemplate at publish time.
   */
  function profileFromData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    var style = String(data.rpTemplate || '').replace(/^profile[\/_]/, '');
    return {
      style: /^style\d+$/.test(style) ? style : '',
      canonical: clone(data)
    };
  }

  var api = {
    parseSiteId: parseSiteId,
    siteUrl: siteUrl,
    siteKind: siteKind,
    fetchSite: fetchSite,
    detectTemplate: detectTemplate,
    reverseMapping: reverseMapping,
    themeFromData: themeFromData,
    profileFromData: profileFromData,
    htmlToText: htmlToText,
    parseComposed: parseComposed,
    targetPaths: targetPaths
  };

  root.RPSiteImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
