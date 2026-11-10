import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import { syncFileToDrive, syncPending } from "../../functions/_lib/drive.js";
import * as adminFiles from "../../functions/api/admin/files.js";
import * as portalFiles from "../../functions/api/portal/files.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const MIGRATIONS = ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql", "0008_project_files.sql"];

function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of MIGRATIONS) sql.exec(read(`../../migrations/${f}`));
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), raw: sql };
}

function makeBucket() {
  const m = new Map();
  return {
    m,
    put: async (k, v) => { m.set(k, v); },
    get: async (k) => (m.has(k) ? { body: m.get(k), arrayBuffer: async () => m.get(k) } : null),
    delete: async (k) => { m.delete(k); },
  };
}

async function setup() {
  const db = makeDb();
  const { salt, hash } = await hashPassword("correct horse battery");
  const user = (id, email) => db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES (?,?,?,?)").run(id, email, hash, salt);
  user("u-admin", "elombe@swftstudios.com"); user("u-a", "a@example.com"); user("u-b", "b@example.com");
  db.raw.prepare("INSERT INTO projects(id,user_id,tier_id,status,name) VALUES ('p-a','u-a','custom','paid','A site')").run();
  db.raw.prepare("INSERT INTO projects(id,user_id,tier_id,status,name) VALUES ('p-b','u-b','custom','paid','B site')").run();
  return { db, bucket: makeBucket(), admin: await createSession(db, "u-admin"), a: await createSession(db, "u-a"), b: await createSession(db, "u-b") };
}

function req(s, path, { sid, method = "GET", file, fields = {}, origin = ORIGIN, env = {} } = {}) {
  let body;
  if (file || Object.keys(fields).length) {
    body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    if (file) body.append("file", file);
  }
  return {
    env: { DB: s.db, FILES: s.bucket, ...env },
    waitUntil: () => {},
    request: new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), ...(origin && method !== "GET" ? { Origin: origin } : {}) },
      body,
    }),
  };
}
const png = (name = "logo.png", bytes = 10) => new File([new Uint8Array(bytes).fill(1)], name, { type: "image/png" });
const body = async (res) => res.json();

test("client uploads, lists and downloads their own file; admin sees it", async () => {
  const s = await setup();
  let r = await portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file: png() }));
  assert.equal(r.status, 200);
  const files = (await body(r)).files;
  assert.equal(files.length, 1);
  assert.equal(files[0].by, "client");
  assert.equal(files[0].drive, "skipped"); // Drive not configured
  const dl = await portalFiles.onRequestGet(req(s, `/api/portal/files?id=${files[0].id}`, { sid: s.a }));
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("Content-Disposition"), /attachment; filename="logo.png"/);
  assert.equal(dl.headers.get("X-Content-Type-Options"), "nosniff");
  const adm = await body(await adminFiles.onRequestGet(req(s, "/api/admin/files?project=p-a", { sid: s.admin })));
  assert.equal(adm.files.length, 1);
  assert.equal(adm.drive, false);
});

test("clients cannot see or download another client's files", async () => {
  const s = await setup();
  const up = await body(await portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file: png() })));
  const id = up.files[0].id;
  assert.equal((await body(await portalFiles.onRequestGet(req(s, "/api/portal/files", { sid: s.b })))).files.length, 0);
  assert.equal((await portalFiles.onRequestGet(req(s, `/api/portal/files?id=${id}`, { sid: s.b }))).status, 404);
  assert.equal((await portalFiles.onRequestDelete(req(s, `/api/portal/files?id=${id}`, { sid: s.b, method: "DELETE" }))).status, 404);
  assert.equal(s.bucket.m.size, 1);
});

test("auth, origin, and admin gates", async () => {
  const s = await setup();
  assert.equal((await portalFiles.onRequestGet(req(s, "/api/portal/files"))).status, 401);
  assert.equal((await portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file: png(), origin: "https://evil.example" }))).status, 403);
  assert.equal((await adminFiles.onRequestGet(req(s, "/api/admin/files?project=p-a", { sid: s.a }))).status, 403);
  assert.equal((await adminFiles.onRequestPost(req(s, "/api/admin/files", { sid: s.admin, method: "POST", file: png(), fields: { project: "p-a" }, origin: null }))).status, 403);
  assert.equal((await adminFiles.onRequestPost(req(s, "/api/admin/files", { sid: s.admin, method: "POST", file: png(), fields: { project: "nope" } }))).status, 404);
  const noR2 = req(s, "/api/portal/files", { sid: s.a });
  noR2.env.FILES = undefined;
  assert.equal((await portalFiles.onRequestGet(noR2)).status, 503);
});

test("upload validation: empty, too large, blocked type, hostile names", async () => {
  const s = await setup();
  const post = (file) => portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file }));
  assert.equal((await post(new File([], "x.png"))).status, 400);
  assert.equal((await post(new File([new Uint8Array(25 * 1024 * 1024 + 1)], "big.zip"))).status, 400);
  assert.equal((await post(new File(["x"], "run.exe"))).status, 400);
  assert.equal((await post(new File(["<script>"], "page.html"))).status, 400);
  const ok = await body(await post(new File(["hi"], "../../etc/pass\u0000wd.txt", { type: "text/plain" })));
  assert.equal(ok.files[0].name, "passwd.txt");
});

test("client can remove their own upload but not SWFT's", async () => {
  const s = await setup();
  const mine = (await body(await portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file: png("mine.png") })))).files[0].id;
  const theirs = (await body(await adminFiles.onRequestPost(req(s, "/api/admin/files", { sid: s.admin, method: "POST", file: png("brief.png"), fields: { project: "p-a" } })))).files.find((f) => f.by === "admin").id;
  assert.equal((await portalFiles.onRequestDelete(req(s, `/api/portal/files?id=${theirs}`, { sid: s.a, method: "DELETE" }))).status, 403);
  assert.equal((await portalFiles.onRequestDelete(req(s, `/api/portal/files?id=${mine}`, { sid: s.a, method: "DELETE" }))).status, 200);
  assert.equal(s.bucket.m.size, 1);
  const list = await body(await portalFiles.onRequestGet(req(s, "/api/portal/files", { sid: s.a })));
  assert.equal(list.files.length, 1);
  assert.equal(list.files[0].by, "admin");
});

test("Drive mirror: syncs when configured, retries failures, skipped rows catch up later", async () => {
  const s = await setup();
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const env = { DB: s.db, FILES: s.bucket, DRIVE_ROOT_FOLDER_ID: "root123", GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "sa@x.iam", private_key: privateKey }) };
  // upload while Drive is not configured -> skipped
  await portalFiles.onRequestPost(req(s, "/api/portal/files", { sid: s.a, method: "POST", file: png("one.png") }));
  assert.equal(s.db.raw.prepare("SELECT drive_status s FROM project_files").get().s, "skipped");

  const calls = [];
  let failUpload = true;
  const fetchStub = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("oauth2")) return Response.json({ access_token: "tok" });
    if (String(url).includes("/upload/")) return failUpload ? new Response("{}", { status: 500 }) : Response.json({ id: "drive-file-1" });
    return Response.json({ id: "folder-1" });
  };
  const id = s.db.raw.prepare("SELECT id FROM project_files").get().id;
  assert.equal(await syncFileToDrive(s.db, env, id, fetchStub), "failed");
  assert.equal(s.db.raw.prepare("SELECT drive_status s, drive_error e FROM project_files").get().s, "failed");
  failUpload = false;
  assert.deepEqual(await syncPending(s.db, env, 10, fetchStub), { synced: 1, failed: 0, skipped: 0 });
  const row = s.db.raw.prepare("SELECT drive_status s, drive_file_id d FROM project_files").get();
  assert.equal(row.s, "synced"); assert.equal(row.d, "drive-file-1");
  assert.equal(s.db.raw.prepare("SELECT drive_folder_id f FROM projects WHERE id='p-a'").get().f, "folder-1");
  // second sync is a no-op and the folder is reused
  const before = calls.length;
  assert.equal(await syncFileToDrive(s.db, env, id, fetchStub), "synced");
  assert.equal(calls.length, before);
});
