/*
  mapping-engine.js
  ------------------
  Deterministically transforms master-schema form data into a specific
  template's real data.json shape, using that template's mapping config.
  No AI involved in this step — it's pure, instant, and can never hallucinate,
  since it only ever moves/renames values that already exist.
*/

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toParagraphHtml(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (/<(p|br|div|h[1-6])\b/i.test(text)) return text; // already HTML
  return text
    .split(/\n{2,}|\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}

function slugifyPlatform(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * @param {object} masterData - form data following the master schema
 * @param {object} originalTemplateData - the template's own default data.json
 *        (used as the base, so untouched fields like theme colors, footer
 *        boilerplate, etc. are preserved exactly as the template author wrote them)
 * @param {object} mapping - one entry from profile-mappings.json for this template
 * @param {object} [options] - { keepSampleWhenBlank: true } leaves the
 *        template's own sample value in place wherever the user has not filled
 *        a field, so an empty design still previews as a finished page. The
 *        generated site (no options) blanks unfilled fields as before.
 * @returns {object} a new object in the template's exact schema shape
 */
function applyMapping(masterData, originalTemplateData, mapping, options) {
  const result = deepClone(originalTemplateData);
  const keepSample = !!(options && options.keepSampleWhenBlank);

  // 0. If the main project list is empty but titled work sections exist, the
  // first section becomes the design's own work section: its projects feed
  // the normal projects mapping and its heading names the section. Designs
  // clone their own last rendered card for any further section, so at least
  // one project has to reach the main grid or there is nothing to clone.
  if (Array.isArray(masterData.workSections) && masterData.workSections.length) {
    const mainProjects = getPath(masterData, 'projects');
    const hasMain = Array.isArray(mainProjects) && mainProjects.length > 0;
    const first = masterData.workSections[0] || {};
    const firstProjects = Array.isArray(first.projects)
      ? first.projects.filter(p => p && Object.keys(p).some(k => p[k] !== '' && p[k] != null))
      : [];
    if (!hasMain && firstProjects.length) {
      masterData = Object.assign({}, masterData, {
        projects: firstProjects,
        projectsTitle: String(masterData.projectsTitle || '').trim() || first.title || '',
        workSections: masterData.workSections.slice(1)
      });
    }
  }

  // 1. Split-name handling (e.g. style11's personalInfo.firstName/lastName)
  if (mapping.splitName) {
    const full = (getPath(masterData, mapping.splitName.sourcePath) || '').trim();
    if (full || !keepSample) {
      const parts = full.split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      setPath(result, mapping.splitName.firstNameTarget, firstName);
      setPath(result, mapping.splitName.lastNameTarget, lastName);
    }
  }

  // 2. Scalar field mapping. Normally targetPath is a plain string. It can
  // also be an object { path, wrapInArray: true } for templates that expect
  // a single-paragraph field as a one-element array of paragraphs instead
  // of a plain string. `fallbackFrom` names a second master path used when
  // the first is blank (e.g. a hero paragraph built from headline, falling
  // back to the tagline); `html` wraps plain text in <p> tags for templates
  // that render the field as HTML.
  if (mapping.scalar) {
    for (const [masterPath, targetSpec] of Object.entries(mapping.scalar)) {
      if (masterPath.startsWith('_')) continue; // skip note/comment keys
      const opts = (typeof targetSpec === 'object' && targetSpec) || {};
      let value = getPath(masterData, masterPath);
      let isBlank = value === undefined || value === null || value === '';
      if (isBlank && opts.fallbackFrom) {
        const fallback = getPath(masterData, opts.fallbackFrom);
        if (fallback !== undefined && fallback !== null && fallback !== '') {
          value = fallback;
          isBlank = false;
        }
      }
      const targetPath = opts.path || targetSpec;
      const wrap = !!opts.wrapInArray;
      if (isBlank) {
        // keepSampleWhenBlank: preview keeps the design's sample copy until
        // the user writes their own.
        if (keepSample) continue;
        // Blank field: clear the template's sample value so it never shows on the site.
        if (targetPath === 'profile.image') continue; // photo handled separately
        // keepWhenBlank: the design ships with its own artwork there (e.g. a
        // hero photo) — leave it in place until the user replaces it.
        if (opts.keepWhenBlank) continue;
        setPath(result, targetPath, wrap ? [] : '');
        continue;
      }
      const output = opts.html ? toParagraphHtml(value) : value;
      setPath(result, targetPath, wrap ? [output] : output);
    }
  }

  // 3. Array field mapping
  if (mapping.arrays) {
    for (const [masterArrayPath, arrCfg] of Object.entries(mapping.arrays)) {
      const sourceArr = getPath(masterData, masterArrayPath);
      if (!Array.isArray(sourceArr) || sourceArr.length === 0) {
        // Empty section: clear the template's sample items so nothing shows on
        // the site — except in the editor preview, which keeps them visible.
        if (!keepSample && arrCfg.targetPath) setPath(result, arrCfg.targetPath, []);
        continue;
      }

      let newArr;
      if (arrCfg.scalarFromItem) {
        // e.g. master skills=[{name,level}] -> target skills=["JavaScript", "React"]
        newArr = sourceArr.map(item => item[arrCfg.scalarFromItem]).filter(Boolean);
      } else if (arrCfg.itemMap) {
        // Designs that keep their social links in the footer know how to draw
        // each platform (their own icon class or image name). Collect those
        // from the template's own data so a user-entered link keeps the
        // design's icon instead of rendering blank.
        let iconLookup = null;
        if (arrCfg.inheritIconFrom) {
          iconLookup = {};
          const donor = getPath(result, arrCfg.inheritIconFrom);
          if (Array.isArray(donor)) {
            donor.forEach(entry => {
              if (!entry || typeof entry !== 'object') return;
              const key = String(entry.name || entry.platform || '').trim().toLowerCase();
              if (key && entry.icon) iconLookup[key] = entry.icon;
            });
          }
        }
        newArr = sourceArr.map(item => {
          const obj = {};
          for (const [masterField, targetField] of Object.entries(arrCfg.itemMap)) {
            if (masterField.startsWith('_') || masterField === 'joinBulletsAs') continue;
            let value = item[masterField];
            if (masterField === 'bullets' && Array.isArray(value) && arrCfg.itemMap.joinBulletsAs === 'paragraph') {
              value = value.join(' ');
            }
            if (value !== undefined) obj[targetField] = value;
          }
          // fallbackFields: when a target field ended up empty, take its value
          // from another master item field (e.g. a lightbox URL falling back to
          // the project link).
          if (arrCfg.fallbackFields) {
            for (const [targetField, masterField] of Object.entries(arrCfg.fallbackFields)) {
              if (!obj[targetField]) {
                const alt = item[masterField];
                if (alt !== undefined && alt !== null && alt !== '') obj[targetField] = alt;
              }
            }
          }
          // splitFields: one comma-separated master value -> an array of
          // strings on the target (e.g. project tags -> categories[]).
          if (arrCfg.splitFields) {
            for (const [masterField, rule] of Object.entries(arrCfg.splitFields)) {
              const raw = item[masterField];
              const parts = typeof raw === 'string'
                ? raw.split(rule.separator || ',')
                : Array.isArray(raw) ? raw : [];
              const cleaned = parts.map(p => String(p).trim()).filter(Boolean);
              obj[rule.targetField || masterField] = cleaned;
            }
          }
          // lowercaseFields: platform names become icon slugs
          // ("LinkedIn" -> "linkedin", "GitHub" -> "github").
          if (arrCfg.lowercaseFields) {
            for (const [masterField, targetField] of Object.entries(arrCfg.lowercaseFields)) {
              const raw = item[masterField];
              if (raw) obj[targetField] = slugifyPlatform(raw);
            }
          }
          if (iconLookup || arrCfg.iconFallback) {
            const platform = String(obj.name || obj.platform || '').trim().toLowerCase();
            if (!obj.icon && platform && iconLookup && iconLookup[platform]) obj.icon = iconLookup[platform];
            if (!obj.icon && arrCfg.iconFallback) {
              obj.icon = arrCfg.iconFallback.replace('{slug}', platform.replace(/[^a-z0-9]+/gi, '-'));
            }
          }
          // joinFields: combine two or more master item fields into a single
          // target string (e.g. startDate + endDate -> one "period" field),
          // for templates that store a date range as one string rather than
          // separate start/end fields.
          if (arrCfg.joinFields) {
            arrCfg.joinFields.forEach(rule => {
              const parts = rule.sourceFields.map(f => item[f]).filter(Boolean);
              if (parts.length > 0) {
                obj[rule.targetField] = parts.join(rule.separator || ' ');
              }
            });
          }
          return obj;

        });
      } else {
        newArr = sourceArr;
      }
      setPath(result, arrCfg.targetPath, newArr);
    }
  }

  // 4. Object-map handling (e.g. style20's socials={LinkedIn:"...", Instagram:"..."} —
  //    an object keyed by platform name, rather than an array of {platform,url})
  if (mapping.objectMap) {
    for (const [masterArrayPath, objCfg] of Object.entries(mapping.objectMap)) {
      const sourceArr = getPath(masterData, masterArrayPath);
      if (!Array.isArray(sourceArr) || sourceArr.length === 0) {
        if (!keepSample && objCfg.targetPath) setPath(result, objCfg.targetPath, {});
        continue;
      }
      const obj = {};
      sourceArr.forEach(item => {
        let key = item[objCfg.keyFrom];
        if (key && objCfg.normalizeKey === 'lowerSlug') key = slugifyPlatform(key);
        const value = item[objCfg.valueFrom];
        if (key) obj[key] = value;
      });
      setPath(result, objCfg.targetPath, obj);
    }
  }

  // 5. Compose: build a single formatted string from multiple master
  // fields, for templates that display a combined value (e.g. one
  // "contact" string containing email/phone/location together, rather
  // than separate fields) instead of a structured object.
  if (mapping.compose) {
    for (const [targetPath, composeCfg] of Object.entries(mapping.compose)) {
      // onlyIfBlank: use this default only while the named master field is
      // empty, so the design's sample heading (which may name the demo
      // person) is never shown for someone who filled the field in.
      if (composeCfg.onlyIfBlank && getPath(masterData, composeCfg.onlyIfBlank)) continue;
      let hasUserValue = false;
      const rendered = composeCfg.template.replace(/\{([^}]+)\}/g, (match, token) => {
        if (token === 'year') return String(new Date().getFullYear());
        const value = getPath(masterData, token);
        if (value !== undefined && value !== null && value !== '') hasUserValue = true;
        return value !== undefined && value !== null ? value : '';
      });
      // Nothing from the user to compose: keep the design's sample line
      // (e.g. "About Jane Doe") rather than replacing it with a lone "About".
      if (keepSample && !hasUserValue) continue;
      setPath(result, targetPath, rendered.replace(/\s+/g, ' ').trim());
    }
  }

  // 6. labelValueArray: build an array of {label, value} pairs from a
  // fixed list of master field paths — for templates that display personal
  // info as a generic "definition list" rather than named fields (e.g.
  // [{label:"Email", value:"..."}] instead of a plain contact.email field).
  // Entries whose source value is missing/empty are skipped entirely.
  if (mapping.labelValueArray) {
    for (const [targetPath, cfg] of Object.entries(mapping.labelValueArray)) {
      const items = cfg.items
        .map(def => ({ label: def.label, value: getPath(masterData, def.sourcePath) }))
        .filter(entry => entry.value !== undefined && entry.value !== null && entry.value !== '');
      if (keepSample && items.length === 0) continue;
      setPath(result, targetPath, items);
    }
  }

  // 7. contactItemsArray: build an array of {icon, text, link} objects from
  // a fixed list of master field paths — for templates that render contact
  // methods as a generic icon-linked list rather than named fields. Each
  // definition's linkTemplate supports a {value} placeholder.
  if (mapping.contactItemsArray) {
    for (const [targetPath, cfg] of Object.entries(mapping.contactItemsArray)) {
      const items = cfg.items
        .map(def => {
          const value = getPath(masterData, def.sourcePath);
          if (!value) return null;
          return {
            icon: def.icon,
            text: value,
            link: def.linkTemplate ? def.linkTemplate.replace('{value}', value) : value
          };
        })
        .filter(Boolean);
      if (keepSample && items.length === 0) continue;
      setPath(result, targetPath, items);
    }
  }

  // 8. groupedArrays: wrap mapped array items inside a single synthetic
  // parent object — for templates that group items under a category (e.g.
  // skills displayed as [{category:"...", items:[...]}] rather than a flat
  // list). Supports multiple source arrays (e.g. master's separate "skills"
  // and "languages") each becoming their own group within the same output
  // array, since some templates fold both into one grouped structure.
  // A group may also set `groupBy` to split one source array by an item
  // field (e.g. a per-skill "category"), producing one group per distinct
  // value in first-seen order; blank values fall back to `groupValue`.
  if (mapping.groupedArrays) {
    for (const [key, cfg] of Object.entries(mapping.groupedArrays)) {
      const groupsOutput = [];
      const mapItems = (sourceArr, groupDef) => sourceArr.map(item => {
        const obj = {};
        for (const [masterField, targetField] of Object.entries(groupDef.itemMap)) {
          if (item[masterField] !== undefined) obj[targetField] = item[masterField];
        }
        return obj;
      });
      cfg.groups.forEach(groupDef => {
        const sourceArr = getPath(masterData, groupDef.sourcePath);
        if (!Array.isArray(sourceArr) || sourceArr.length === 0) return;

        if (groupDef.groupBy) {
          const buckets = new Map();
          const order = [];
          sourceArr.forEach(item => {
            const raw = item && item[groupDef.groupBy];
            const label = raw === undefined || raw === null ? '' : String(raw).trim();
            if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
            buckets.get(label).push(item);
          });
          order.forEach(label => {
            groupsOutput.push({
              [cfg.groupField]: label || groupDef.groupValue || '',
              [cfg.itemsField]: mapItems(buckets.get(label), groupDef)
            });
          });
          return;
        }

        groupsOutput.push({
          [cfg.groupField]: groupDef.groupValue,
          [cfg.itemsField]: mapItems(sourceArr, groupDef)
        });
      });
      if (groupsOutput.length > 0) {
        setPath(result, cfg.targetPath, groupsOutput);
      } else if (!keepSample && cfg.targetPath) {
        setPath(result, cfg.targetPath, []);
      }
    }
  }

  // 9b. workSections: extra user-titled work sections. They are rendered by
  // assets/rp-work-sections.js after the design's own work grid, so they
  // travel under reserved rp keys rather than any template's shape. The main
  // heading travels too: several designs hard-code it in markup, where no
  // field mapping can reach.
  if (mapping.copyWorkSections !== false) {
    const title = String(getPath(masterData, 'projectsTitle') || '').trim();
    if (title) result.rpWorkTitle = title;
    else delete result.rpWorkTitle;

    const sections = getPath(masterData, 'workSections');
    if (Array.isArray(sections)) {
      const clean = sections
        .map(section => {
          const projects = Array.isArray(section && section.projects) ? section.projects : [];
          return {
            title: section && section.title ? String(section.title).trim() : '',
            description: section && section.description ? String(section.description).trim() : '',
            projects: projects.filter(p => p && Object.keys(p).some(k => p[k] !== '' && p[k] != null))
          };
        })
        .filter(section => section.title || section.projects.length > 0);
      if (clean.length) result.rpWorkSections = clean;
      else delete result.rpWorkSections;
    }
  }

  // 9c. heroImage: a user background photo for the hero. Every design gets the
  // option through assets/rp-hero-bg.js, which paints a scrim over the photo so
  // hero text stays readable, so it also travels under a reserved key.
  if (mapping.copyHeroImage !== false) {
    const heroImage = getPath(masterData, 'heroImage');
    if (typeof heroImage === 'string' && heroImage.trim()) result.rpHeroImage = heroImage;
    else delete result.rpHeroImage;
  }

  // 10. clear: sample paths the form never fills (e.g. a demo status tag or
  // demo stats). Each path is blanked by type: string -> "", array -> [], object -> {}.
  if (Array.isArray(mapping.clear) && !keepSample) {
    for (const p of mapping.clear) {
      const cur = getPath(result, p);
      if (cur === undefined) continue;
      const blank = Array.isArray(cur) ? [] : (cur !== null && typeof cur === 'object') ? {} : '';
      setPath(result, p, blank);
    }
  }

  // 10. clearIfBlank: like clear, but only when the given master field is blank.
  // Used for the sample photo: an uploaded photo always wins.
  if (mapping.clearIfBlank && !keepSample) {
    for (const [masterPath, paths] of Object.entries(mapping.clearIfBlank)) {
      const v = getPath(masterData, masterPath);
      const masterBlank = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (!masterBlank) continue;
      for (const p of paths) {
        const cur = getPath(result, p);
        if (cur === undefined) continue;
        setPath(result, p, Array.isArray(cur) ? [] : (cur !== null && typeof cur === 'object') ? {} : '');
      }
    }
  }

  // 11. ui: the user's own colour overrides (per section and per page-frame
  // part). They are not part of any template's shape, so they travel across
  // untouched and end up in data.json.
  if (masterData && masterData.ui && typeof masterData.ui === 'object') {
    result.ui = deepClone(masterData.ui);
  }

  // 12. Some designs hard-code their portrait <img src="assets/profile.jpg">
  // in the markup instead of reading a data field. Carry the uploaded photo
  // under ui so those templates can point the image at it after rendering.
  const profileImage = getPath(masterData, 'profileImage');
  if (profileImage) {
    if (!result.ui || typeof result.ui !== 'object') result.ui = {};
    result.ui.profileImage = profileImage;
  }

  return result;
}

// Export for both browser (script tag) and Node/Cloudflare Functions use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyMapping, getPath, setPath, deepClone };
}
