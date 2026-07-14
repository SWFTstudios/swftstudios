# AGENTS.md

Project rules, branching, and the Webflow import workflow live in `instructions.md`,
`.cursorrules`, and `docs/WEBFLOW_WORKFLOW.md`. Read those before doing feature work.

## Cursor Cloud specific instructions

This repo is the SWFT Studios marketing site: a set of static HTML/CSS/JS assets
served by a Cloudflare Worker (`src/worker.ts`) via Wrangler. The Worker also
exposes three JSON API routes — `POST /api/case-study-match`,
`POST /api/build-request`, and `POST /api/contact` — and falls back to a
deterministic implementation when optional integrations are absent. There is no
build step; assets are served directly from the repo root.

- **Dependencies / versions:** Node 22 + npm. Deps (`wrangler`, `typescript`,
  `@cloudflare/workers-types`) are installed by the update script (`npm install`).
- **Lint / typecheck:** `npx tsc --noEmit` (config in `tsconfig.json`, covers
  `src/**/*.ts`). There is no separate ESLint setup.
- **Run the dev server:** the AI binding in `wrangler.jsonc` forces a remote
  connection that requires a Cloudflare login, so plain `npx wrangler dev` fails
  with "You must be logged in". Run local-only instead:

  ```
  npx wrangler dev --local --port 8787 --persist-to /tmp/wrangler-state
  ```

  - `--local` disables remote bindings (Workers AI shows as "not supported"; the
    API routes then use their deterministic fallback, which is fine for dev).
  - `--persist-to /tmp/wrangler-state` is important: without it, Wrangler writes
    its state into `.wrangler/` inside the served assets directory (repo root),
    which the asset watcher then detects and hot-reloads on — an infinite
    "Reloading local server…" loop. Persisting outside the repo breaks the loop.
  - Set `WRANGLER_SEND_METRICS=false` to avoid the first-run telemetry prompt.

- **`.assetsignore`:** the installed Wrangler ignores the `assets.exclude` field
  in `wrangler.jsonc` (it only warns). Without an `.assetsignore` file at the repo
  root, `wrangler dev` tries to serve `node_modules` (the ~118 MiB `workerd`
  binary) and aborts with "Asset too large". `.assetsignore` lists the dirs/files
  to keep out of the asset bundle; keep it in sync if new non-asset dirs appear.

- **URLs:** Wrangler's default `html_handling` redirects `/foo.html` → `/foo`
  (HTTP 307), so hit clean paths (e.g. `/services`) or follow redirects.

- **Secrets (optional, not needed for dev):** `AIRTABLE_TOKEN` enables lead
  storage; `STRIPE_SECRET_KEY` enables checkout. Without them the API routes
  return `ok:true, stored:false` and the UI still shows success. See
  `docs/INTEGRATIONS.md`.
