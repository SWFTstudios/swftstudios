## Webflow → Git workflow

This document defines how Webflow exports are integrated into the SWFT Studios repo without breaking custom logic or Git history.

### 1. Branches and history

- **main**: Source of truth for the current SWFT Studios marketing site.
- **archive/***: Read-only history markers for older eras:
  - `archive/pre-redesign`: state of the repo just before the current marketing site redesign.
  - `archive/github-thought-sessions`, `archive/blog-graph-views`, and any future `archive/*` branches point at historical work and should not be changed.

Do **not** rebase, squash, or force-push `main` unless explicitly agreed and coordinated.

### 2. Protected vs Webflow-replaceable files

**Protected (never overwritten by Webflow)**:

- `case-studies.html` – tab + hash routing logic.
- `case-study/` – all case study slug pages and tag links.
- `case-study.html` – if used as a template/redirect.
- `detail_project.html`, `detail_video.html` – project/video detail logic.
- `wrangler.jsonc` – Cloudflare config.
- `.gitignore`, `.deploy-trigger` – repo/deploy behavior.
- `js/swftstudios000.js` – custom JS. If Webflow adds JS, prefer a separate file rather than replacing this one.

**Webflow-replaceable (safe to overwrite)**:

These are page shells and marketing pages that can match Webflow designs:

- `index.html`, `404.html`, `401.html`
- `websites.html`, `apps.html`, `media.html`, `website-pricing.html`
- `resources.html`, `portfolio-review.html`, `style-guide.html`, `swft-tv.html`, `videos.html`

### 3. Assets

**CSS**

- Prefer a dedicated stylesheet for Webflow output, e.g. `css/webflow-export.css`.
- Keep `css/swftstudios000.css` for custom overrides and case-study-specific styles.

**Images**

- Either place Webflow-exported images under `images/webflow/`, or
- Replace files in `images/` selectively, ensuring you do not delete images used only by protected pages.

### 4. Standard Webflow import workflow

Every Webflow export should follow this branch-based workflow:

1. **Start from clean `main`**
   - `git checkout main && git pull`

2. **Create an import branch**
   - Name: `webflow/import-<short-description>` (for example, `webflow/import-homepage-v2`).
   - `git checkout -b webflow/import-homepage-v2`

3. **Export from Webflow to a staging folder**
   - Export the site or specific page to a folder **outside** the repo or into `webflow-export/`.
   - If you use `webflow-export/` inside this repo, it must stay ignored by Git.

4. **Copy only approved files from the export**
   - From the export into this repo, copy:
     - HTML files from the Webflow-replaceable list (for example, exported `index.html` → repo `index.html`).
     - Webflow CSS → `css/webflow-export.css` (and ensure the HTML references it).
     - Any new images referenced by those pages → `images/` or `images/webflow/`.
   - Do **not** copy anything that would overwrite protected files (`case-studies.html`, `case-study/`, `detail_*.html`, `wrangler.jsonc`, custom JS, etc.).

5. **Fix links and asset paths**
   - Ensure navigation links continue to point to:
     - `case-studies.html` for the case studies hub.
     - `case-study/<slug>.html` for individual case studies.
   - Confirm all `href` and `src` paths match this repo’s structure.

6. **Commit and push the import branch**
   - `git add .`
   - `git commit -m "webflow: import <description> (homepage/pricing/etc.)"`
   - `git push -u origin webflow/import-<description>`

7. **Review and merge to `main`**
   - Open a PR or review the diff locally.
   - Confirm only the expected Webflow-replaceable files and related assets changed.
   - Merge into `main`.
   - Delete the `webflow/import-*` branch after merge.

### 5. How to work in this repo

- For **non-Webflow features/fixes**, use purpose-named branches off `main` (for example, `feat/case-study-copy-update`, `fix/tab-routing`).
- For **Webflow imports**, always follow the import workflow above and never paste a full export directly on `main`.
- Treat `archive/*` branches as read-only history references.

### 6. Changelog

- **2026-04-29 — export baseline alignment**
  - Imported approved Webflow-replaceable pages from `swftstudios000.webflow`.
  - Synced Webflow CSS (`normalize.css`, `components.css`, `swftstudios000.css`) plus `fonts/` and `images/`.
  - Preserved protected files: case-study pages/routes, Worker config, repo config, and `js/swftstudios000.js`.
  - Added `docs/WEBFLOW_ELEMENT_MAP.md` as a page-level section/heading checklist for post-import verification.

