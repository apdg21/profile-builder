# Profile Builder

A standalone "identity page" product: professional details, services, skills,
social links, a Messenger contact form and a booking link on one page that
search engines can index. It shares the plumbing of the other builders
(publishing, licensing, drafts, theme/colour injection) but has its own
schema, mappings, renderer and four designs under `templates/profile/`. No AI
and no JSON upload — the customer fills the section editor and gets exactly
that content.

The point of the product is discoverability: a published profile is served at
`https://resumepro.pages.dev/p/<slug>`, which is the canonical URL written at
publish time, with a `ProfilePage` JSON-LD block describing the person. The
underlying branch alias stays `x-robots-tag: noindex`, so only the `/p/` URL is
indexed.

## Pages and modules

| File | Purpose |
| --- | --- |
| `index.html` | The builder: design picker → section editor → generate → preview / download / publish. Accepts `?template=styleN` and Gumroad's `?license_key=…`. Includes "Edit my existing profile". |
| `profile-editor.js` | Three-pane editor (sections rail, sandboxed preview, properties panel). Speaks the resume editor's postMessage protocol (`__rpToken`, `__rpEditorData`, `__rpEditorCss`, `__rpEditorHidden`, `__rpEditorSelect`). |
| `profile-master-schema.json` | Canonical fields shown in the panel (Basics, About, Services, Work, Skills, Credentials, Testimonials, FAQ, Contact, Social, Footer). |
| `profile-mappings.json` | Canonical field → `data.json` path for each design. |
| `all_template_schemas.json` | Path schema of every design's sample `data.json`. |
| `mapping-engine.js` | Deterministic `applyMapping(masterData, templateData, mapping)` — no AI. |
| `site-import.js` | `parseSiteId`, `siteKind`, `profileFromData`, `reverseMapping`, `themeFromData` — used by the restore flow and testable in Node. |
| `preview-and-download.js` | Preview modal, theme + user-colour injection, hidden sections, ZIP download, license gate, publish flow, SEO head helpers. |
| `user-colors.js` | Per-section text/background colour CSS, scoped with `[data-rp-section="…"]`. |
| `draft-store.js` | Auto-saved drafts in IndexedDB (kind `profile`). |
| `templates/profile/style1…style4/` | The four designs. |

## Data flow

1. The editor keeps one canonical object (the master schema) and prunes empty
   repeatable rows.
2. `applyMapping` copies it onto the selected design's sample `data.json`
   shape using `profile-mappings.json`. Preview uses
   `keepSampleWhenBlank: true`, so a fresh design still shows its sample
   persona; generated/published data does not, so no sample content ships.
3. The browser fetches `data.json` at runtime and calls
   `RPProfile.mount(root, data)` from `assets/rp-profile.js`. Each design's
   `main.js` is a thin wrapper around that shared renderer (`window.__rpRender`
   for live editor updates, Messenger form → `https://m.me/<username>?text=`).
4. Publishing and ZIP download bake the rendered HTML into `#rp-app`
   (`data-rp-prerendered="1"`), so crawlers see real content without running
   JavaScript. `main.js` skips rendering when that marker is present.

All four designs share one markup contract, which is why one renderer serves
them: `<div class="pf">` → `<header class="pf-nav">` →
`<main class="pf-main">` with `<section data-rp-section="About|Services|…">` →
`<footer class="pf-footer">`. Colour theming rides on `--pf-*` custom
properties.

### Hidden sections and colours

- The editor checkbox list writes `ui.hiddenSections`; the injector turns it
  into CSS for `[data-rp-section="X"]` (plus the hero/footer scopes).
- Theme presets override `--pf-accent`, `--pf-hero-bg`, `--pf-footer-bg`, etc.
- Per-section user colours are injected after the theme and prefix every
  selector with `:root body`, so the customer's picks always win.

### Editable headings

All section headings are optional schema fields (`aboutTitle`, `servicesTitle`,
`workTitle`, `skillsTitle`, `credentialsTitle`, `testimonialsTitle`, `faqTitle`,
`contactTitle`). Leaving one empty lets the design's own heading stand.

## Publishing and indexing

The browser POSTs the files to `/api/publish` with `X-License-Key`,
`X-License-Template` (`profile/styleN`) and `X-Site-Type: profile`. The
function:

- re-verifies the license (refunded / charged-back / disputed purchases are
  rejected everywhere),
- names branches `<name>-profile` so a profile, resume and portfolio for the
  same person coexist on `resumepro-builds`,
- writes/validates the HMAC branch ownership marker on updates,
- inserts the URL-dependent SEO tags now that the branch (and public URL)
  exists — canonical, `og:url`, and `ProfilePage` JSON-LD `url`/`@id`,
- returns `{ url, branch_url, resume_id, pair_token }`; `url` is the public
  `/p/<slug>` link. The frontend stores `resume_id` per design
  (`publishedProfileId_profile_styleN`) so later publishes update the same
  branch.

Supporting pieces:

- `functions/p/[[path]].js` proxies `/p/<slug>` to
  `<slug>-profile.resumepro-builds.pages.dev`, strips `x-robots-tag`, and
  serves sub-paths (assets) unchanged.
- `functions/sitemap-profiles.xml.js` lists every `-profile` branch at its
  `/p/` URL; `robots.txt` points at it.
- The client also bakes `<title>`, description, Open Graph/Twitter tags and
  JSON-LD before upload, so a ZIP download is self-describing too (without a
  canonical, since there is no URL yet).

Profiles do not take part in resume ↔ portfolio pairing.

### Restore ("Edit my existing profile")

`/api/site-data` returns a published site's `data.json` from either its branch
id or its public `/p/<slug>` link. `site-import.js` rebuilds the canonical
object with `reverseMapping` and identifies the design from the `rpTemplate`
field written at publish time. Editing is free; only re-publishing asks for the
license key again.

## Gumroad

Each of the 4 designs is its own Gumroad product, so a key unlocks only the
design it was bought for:

- Checkout URLs: one per design in `CHECKOUT_URL_BY_TEMPLATE`
  (`preview-and-download.js`); unknown styles fall back to
  `https://resumeprotemplate.gumroad.com/profile-collection`.
- Frontend license storage key: `rpProfileLicense`.
- Server product mapping: each `profile/style1…style4` key in
  `functions/api/_license.js` has its own `GUMROAD_PRODUCT_ID_*` secret.

## Server secrets (Cloudflare Pages)

| Secret | Used by | Notes |
| --- | --- | --- |
| `GUMROAD_PRODUCT_ID_PROFILE_IDENTITY` | `functions/api/verify-license.js`, `publish.js` | Product ID from that design's Content → License Key module. |
| `GUMROAD_PRODUCT_ID_PROFILE_EDITORIAL` | same | |
| `GUMROAD_PRODUCT_ID_PROFILE_SPOTLIGHT` | same | |
| `GUMROAD_PRODUCT_ID_PROFILE_QUIET` | same | |
| `GITHUB_TOKEN` | `publish.js`, `sitemap-profiles.xml.js` | Fine-grained token scoped to `apdg21/resumepro-builds` with Contents: Read and write. |
| `PUBLISH_OWNER_SECRET` | `publish.js` | Any long random string; HMACs the license key into each branch's `.resumepro-owner`. **Never rotate** — changing it orphans every published site. |

```
wrangler pages secret put GUMROAD_PRODUCT_ID_PROFILE_IDENTITY
wrangler pages secret put GUMROAD_PRODUCT_ID_PROFILE_EDITORIAL
wrangler pages secret put GUMROAD_PRODUCT_ID_PROFILE_SPOTLIGHT
wrangler pages secret put GUMROAD_PRODUCT_ID_PROFILE_QUIET
```

`GITHUB_TOKEN` and `PUBLISH_OWNER_SECRET` are already set for the existing
builders on the same Pages project.

## Local check

Serve the repository root (not the builder folder) so `templates/` and
`functions/` resolve:

```
python -m http.server 8765
# http://127.0.0.1:8765/profile-builder/?template=style1
```

`functions/api/*` and `/p/` only run on Cloudflare Pages (or
`wrangler pages dev`), so publishing and the public profile URL cannot be
exercised from the plain static server.
