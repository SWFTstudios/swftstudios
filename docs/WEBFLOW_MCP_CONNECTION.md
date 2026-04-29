# Webflow MCP Connection Runbook

This document explains how Webflow MCP works in this project, when the connection is considered healthy, and how to initialize or recover it.

## How MCP Works Here

- The Webflow MCP server exposes Webflow APIs as tools (for example `webflow_guide_tool`, `data_sites_tool`, `data_pages_tool`, `element_tool`).
- The agent invokes these tools directly instead of writing raw API requests.
- Data-plane operations (site/page/CMS reads and writes) run through Data tools.
- Designer-plane operations require Bridge availability and an active connected Webflow site.

## Connection Model

- Connection is session-based, not permanently guaranteed.
- "Connected" means all three are true:
  - MCP server tools are available.
  - Bridge app is open and connected to the intended site.
  - Site visibility checks succeed via `data_sites_tool`.
- Connection can drop on Bridge restart, auth/session changes, or inactive bridge state.

## Project Baseline (Expected Identity)

- Site ID: `688e7554265d8089278ca76e`
- Site name: `SWFT STUDIOS 000 FINAL FOREVER`
- Short name: `swftstudios000`
- Staging domain: `swftstudios000.webflow.io`

## Initialization Checklist (Read Before Write)

1. Open Bridge app and confirm it is connected to the intended site.
2. Call `webflow_guide_tool` first (required for server contract).
3. Call `data_sites_tool` with:
   - `list_sites` (visibility check)
   - `get_site` for expected site ID (identity check)
4. Call `data_pages_tool` with `list_pages` for the expected site ID.
5. Optionally call `get_page_content` for a known page (for example Home) to verify payload reads.
6. Only proceed with writes after all checks succeed.

## Validation Result (Executed)

The runbook sequence was executed and returned healthy results:

- `webflow_guide_tool`: returned usage contract successfully.
- `data_sites_tool -> list_sites`: returned expected site ID `688e7554265d8089278ca76e`.
- `data_sites_tool -> get_site`: identity matched expected name and short name.
- `data_pages_tool -> list_pages`: returned page list for target site.
- `data_pages_tool -> get_page_content` (Home): returned node payload and pagination metadata.

## Healthy State Criteria

Treat the connection as healthy only when all are true:

- Expected site ID is visible in `list_sites`.
- `get_site` matches expected display name and short name.
- `list_pages` returns non-empty page data for the same site ID.
- `get_page_content` returns nodes for at least one known page when needed.
- For Designer actions, Bridge-backed operations complete without availability/auth errors.

## Failure Playbook

### Auth or Availability Errors

1. Stop all write operations.
2. Re-open Bridge app and reconnect to the correct site.
3. Re-run this exact sequence:
   - `webflow_guide_tool`
   - `data_sites_tool` (`list_sites`, `get_site`)
   - `data_pages_tool` (`list_pages`, optional `get_page_content`)
4. Resume only after all checks pass.

### Site Mismatch

1. Stop writes immediately.
2. Compare returned site identity against expected project baseline.
3. Re-target commands to `688e7554265d8089278ca76e`.
4. Re-run identity and page checks before any update operations.

### Designer Fails, Data Succeeds

1. Treat as Bridge-side connectivity issue.
2. Restart Bridge app.
3. Re-verify with the initialization checklist.
4. Retry a small read action first, then continue.

## Operating Guardrails

- Read before write for every sensitive/batch operation.
- Always pass explicit `site_id` / `page_id`; never rely on defaults.
- Capture a short session snapshot in work notes:
  - site ID
  - domain
  - last published timestamp (from `get_site`)
- If any verification step fails, abort writes and recover first.

