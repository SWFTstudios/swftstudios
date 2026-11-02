import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  normalizePhone, hostOf, hoursFromPeriods, parsePlace, detectBookingLink, pickCity,
  searchPlaces, runPlacesPull, purgeStale, emailHash,
} from "../../workers/outreach/src/index.ts";

/** Minimal D1 look-alike over node:sqlite, running the real migrations. */
function makeDb() {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0001_init.sql", "0002_lead_host.sql"]) {
    sql.exec(readFileSync(new URL(`../../workers/outreach/migrations/${f}`, import.meta.url), "utf8"));
  }
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), batch: async (list) => { for (const s of list) await s.run(); }, raw: sql };
}

const NOW = new Date("2026-11-03T06:00:00Z");
const place = (id, name, extra = {}) => ({
  id, displayName: { text: name }, nationalPhoneNumber: `(201) 555-01${id.slice(-2)}`,
  websiteUri: `https://www.${name.toLowerCase().replace(/\W/g, "")}.com/`, rating: 4.1, userRatingCount: 12,
  regularOpeningHours: { periods: [1, 2, 3, 4, 5].map((day) => ({ open: { day, hour: 8, minute: 0 }, close: { day, hour: 17, minute: 0 } })) },
  ...extra,
});

function fakeFetch({ places, pages = {}, calls = [] }) {
  return async (url, init) => {
    calls.push(url);
    if (url.startsWith("https://places.googleapis.com/")) {
      assert.equal(init.headers["X-Goog-Api-Key"], "test-key");
      assert.ok(init.headers["X-Goog-FieldMask"].includes("places.userRatingCount"));
      return new Response(JSON.stringify({ places }), { status: 200 });
    }
    const html = pages[url];
    return html == null
      ? new Response("nope", { status: 404 })
      : new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  };
}

const env = (db) => ({ DB: db, GOOGLE_PLACES_KEY: "test-key", TARGET_TRADE: "HVAC", TARGET_CITIES: "Jersey City NJ;Hoboken NJ" });

test("helpers: phone, host, city rotation", () => {
  assert.equal(normalizePhone("+1 (201) 555-0142"), "2015550142");
  assert.equal(normalizePhone("555-0142"), null);
  assert.equal(hostOf("https://www.Acme.com/x"), "acme.com");
  assert.equal(pickCity("A;B;C", new Date(0)), "A");
  assert.equal(pickCity("A;B;C", new Date(86_400_000)), "B");
});

test("hoursFromPeriods: latest close per day, overnight/24h -> 2359, missing day = closed", () => {
  const h = hoursFromPeriods([
    { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } },
    { open: { day: 1, hour: 13, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
    { open: { day: 6, hour: 0, minute: 0 } },
    { open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
  ]);
  assert.deepEqual(h, [{ day: 1, close: "1730" }, { day: 5, close: "2359" }, { day: 6, close: "2359" }]);
});

test("parsePlace: social-media 'websites' get no host to scrape", () => {
  assert.equal(parsePlace(place("p01", "Acme HVAC")).websiteHost, "acmehvac.com");
  assert.equal(parsePlace({ ...place("p02", "Fb Co"), websiteUri: "https://facebook.com/fbco" }).websiteHost, null);
  assert.equal(parsePlace({ id: "x" }), null);
});

test("detectBookingLink", () => {
  assert.equal(detectBookingLink('<a href="https://calendly.com/x">Hi</a>'), true);
  assert.equal(detectBookingLink("<button>Book Online</button>"), true);
  assert.equal(detectBookingLink("<p>Call us anytime</p>"), false);
});

test("searchPlaces follows nextPageToken up to the page cap", async () => {
  let n = 0;
  const f = async () => new Response(JSON.stringify({ places: [{ id: `p${n}` }], nextPageToken: ++n < 5 ? "t" : undefined }), { status: 200 });
  assert.equal((await searchPlaces("k", "q", f)).length, 2); // MAX_PLACES_PAGES = 2
  await assert.rejects(searchPlaces("k", "q", async () => new Response("denied", { status: 403 })), /Places API 403/);
});

test("runPlacesPull: stores leads, finds emails, scores, dedupes branches, honours suppression", async () => {
  const db = makeDb();
  const places = [
    place("pl01", "Acme HVAC"),                                              // email on /contact
    place("pl02", "Bolt Heating", { websiteUri: undefined }),                // no website -> no_email
    place("pl03", "Acme HVAC Branch", { nationalPhoneNumber: "(201) 555-0101" }), // same phone as pl01 -> duplicate
    place("pl04", "Cedar Air"),                                              // suppressed address
    place("pl05", "Dune Cooling", { websiteUri: "https://facebook.com/dune" }), // social -> no_email
  ];
  await db.raw.exec(`INSERT INTO suppressions(email_hash, reason) VALUES ('${await emailHash("info@cedarair.com")}', 'unsubscribe')`);
  const calls = [];
  const f = fakeFetch({
    places, calls,
    pages: {
      "https://acmehvac.com/": "<p>Welcome</p>",
      "https://acmehvac.com/contact": "Reach us: info@acmehvac.com or Book Online",
      "https://cedarair.com/": "info@cedarair.com",
    },
  });

  const summary = await runPlacesPull(env(db), f, NOW);
  assert.equal(summary.city, pickCity(env(db).TARGET_CITIES, NOW));
  assert.equal(summary.found, 5);
  assert.equal(summary.inserted, 4);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.scored, 1);
  assert.equal(summary.noEmail, 2);
  assert.equal(summary.suppressed, 1);

  const acme = db.raw.prepare("SELECT * FROM leads WHERE place_id='pl01'").get();
  assert.equal(acme.email, "info@acmehvac.com");
  assert.equal(acme.email_source_url, "https://acmehvac.com/contact");
  assert.equal(acme.has_booking_link, 1);
  assert.equal(acme.status, "scored");
  assert.ok(acme.score > 0 && JSON.parse(acme.score_reasons).length > 0);
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE place_id='pl04'").get().status, "suppressed");
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM leads WHERE place_id='pl03'").get().c, 0);
  // never fetched the social page or an IP/odd host
  assert.ok(!calls.some((u) => u.includes("facebook.com")));
});

test("runPlacesPull is idempotent: rerun refreshes, doesn't duplicate or re-discover", async () => {
  const db = makeDb();
  const f = fakeFetch({ places: [place("pl01", "Acme HVAC")], pages: { "https://acmehvac.com/": "info@acmehvac.com" } });
  await runPlacesPull(env(db), f, NOW);
  const again = await runPlacesPull(env(db), f, NOW);
  assert.equal(again.inserted, 0);
  assert.equal(again.refreshed, 1);
  assert.equal(again.scored, 0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM leads").get().c, 1);
});

test("runPlacesPull fails loudly without an API key", async () => {
  await assert.rejects(runPlacesPull({ ...env(makeDb()), GOOGLE_PLACES_KEY: undefined }, fakeFetch({ places: [] }), NOW), /GOOGLE_PLACES_KEY/);
});

test("purgeStale removes old uncontacted leads but keeps ones with drafts", async () => {
  const db = makeDb();
  const old = "2026-09-01T00:00:00.000Z";
  db.raw.exec(`INSERT INTO leads(id,place_id,name,status,places_fetched_at) VALUES
    ('a','pa','Old scored','scored','${old}'),
    ('b','pb','Old drafted','scored','${old}'),
    ('c','pc','Fresh','scored','${NOW.toISOString()}')`);
  db.raw.exec("INSERT INTO drafts(id,lead_id,subject,body,facts_json) VALUES ('d','b','s','b','{}')");
  assert.equal(await purgeStale(env(db), NOW), 1);
  assert.deepEqual(db.raw.prepare("SELECT id FROM leads ORDER BY id").all().map((r) => r.id), ["b", "c"]);
});
