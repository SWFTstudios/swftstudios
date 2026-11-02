import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** Minimal D1 look-alike over node:sqlite that runs every outreach migration in order. */
export function makeDb() {
  const sql = new DatabaseSync(":memory:");
  const dir = new URL("../../workers/outreach/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sql.exec(readFileSync(new URL(f, dir), "utf8"));
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), batch: async (list) => { for (const s of list) await s.run(); }, raw: sql };
}

/** Map-backed KV with the three methods the Worker uses. */
export function makeKv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, map: m };
}
