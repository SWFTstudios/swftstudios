# SWFT Studios – Project instructions

This file describes how to work in this repo: Git branching, Webflow imports, and which files are protected vs replaceable. Follow these instructions for a clean workflow and safe versioning.

---

## 1. Git branches and history

- **main**: Source of truth for the current SWFT Studios marketing site. All production deploys come from `main`. Do not rebase, squash, or force-push unless explicitly agreed and coordinated.
- **archive/\***: Read-only history markers for older eras. Examples:
  - `archive/pre-redesign` – state just before the current marketing site redesign.
  - `archive/github-thought-sessions`, `archive/blog-graph-views` – historical feature work.
  Do not merge into or delete `archive/*` branches without explicit instruction.
- **webflow/import-\***: Short-lived branches used only for bringing in Webflow exports. Create from `main`, copy only approved files, then merge to `main` and delete the branch.
- **feat/\***, **fix/\***: Use for normal development (e.g. `feat/case-study-copy-update`, `fix/tab-routing`). Always branch from `main`.

---

## 2. Protected vs Webflow-replaceable files

### Protected (never overwrite from Webflow)

These contain custom logic or config and must not be replaced by a Webflow export:

- `case-studies.html` – Videos & Insights hub (Match-style cards, prompt, modal; `js/case-studies-hub.js`, `css/case-studies-hub.css`, `data/case-studies-index.json`)
- `case-study/` – all case study slug pages and tag links
- `case-study.html` – template or redirect if used
- `detail_project.html`, `detail_video.html` – project/video detail logic
- `wrangler.jsonc` – Cloudflare config
- `.gitignore`, `.deploy-trigger` – repo/deploy behavior
- `js/swftstudios000.js` – custom JS; if Webflow adds JS, use a separate file

### Webflow-replaceable (safe to overwrite)

These page shells can be replaced when they match your Webflow design:

- `index.html`, `404.html`, `401.html`
- `websites.html`, `apps.html`, `media.html`, `website-pricing.html`
- `resources.html`, `portfolio-review.html`, `style-guide.html`, `swft-tv.html`, `videos.html`

### Assets

- **CSS**: Use `css/webflow-export.css` for Webflow’s output. Keep `css/swftstudios000.css` for custom overrides and case-study-specific styles.
- **Images**: Put Webflow-exported images in `images/webflow/` or replace `images/` selectively without removing assets used by protected pages.

---

## 3. Standard Webflow import workflow

Every Webflow export should follow this process:

1. **Start from clean main**  
   `git checkout main && git pull`

2. **Create an import branch**  
   `git checkout -b webflow/import-<short-description>` (e.g. `webflow/import-homepage-v2`)

3. **Export from Webflow to a staging folder**  
   Export to a folder outside the repo or into `webflow-export/` (this folder is in `.gitignore`).

4. **Copy only approved files**  
   From the export into the repo:
   - Replace only the Webflow-replaceable HTML files listed above.
   - Put Webflow CSS in `css/webflow-export.css` and link it in the HTML you replace.
   - Add new images to `images/` or `images/webflow/`.  
   Do **not** overwrite any protected files.

5. **Fix links and paths**  
   Ensure nav links still point to `case-studies.html` and `case-study/<slug>.html`. Check all `href` and `src` paths.

6. **Commit and push**  
   `git add .`  
   `git commit -m "webflow: import <description> (homepage/pricing/etc.)"`  
   `git push -u origin webflow/import-<description>`

7. **Review and merge to main**  
   Review the diff (only replaceable files and assets should change). Merge into `main`, then delete the `webflow/import-*` branch.

---

## 4. For agents and collaborators

- **Non-Webflow work**: Use `feat/*` or `fix/*` branches from `main`; do not use `archive/*` for new work.
- **Webflow imports**: Always use the import workflow above; never paste a full Webflow export directly on `main`.
- **Reference**: Full details are in [docs/WEBFLOW_WORKFLOW.md](docs/WEBFLOW_WORKFLOW.md).
