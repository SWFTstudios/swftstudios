import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSlots, getAvailability } from "../../functions/api/availability.js";

const NOW = new Date("2026-10-27T15:00:00Z");

function fakeFetch(body, status = 200, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
}

test("extractSlots reads the v2 (2024-09-04) shape", () => {
  const slots = extractSlots({ data: { "2026-10-29": [{ start: "2026-10-29T14:00:00.000-04:00" }], "2026-10-28": [{ start: "2026-10-28T10:00:00.000-04:00" }] } });
  assert.deepEqual(slots, ["2026-10-28T10:00:00.000-04:00", "2026-10-29T14:00:00.000-04:00"]);
});

test("extractSlots reads the older { slots: { day: [{ time }] } } shape", () => {
  const slots = extractSlots({ status: "success", data: { slots: { "2026-10-28": [{ time: "2026-10-28T13:00:00Z" }] } } });
  assert.deepEqual(slots, ["2026-10-28T13:00:00Z"]);
});

test("getAvailability returns the next future slot and open days", async () => {
  const seen = [];
  const body = { data: {
    "2026-10-27": [{ start: "2026-10-27T09:00:00.000-04:00" }, { start: "2026-10-27T16:00:00.000-04:00" }],
    "2026-10-30": [{ start: "2026-10-30T11:00:00.000-04:00" }],
  } };
  const out = await getAvailability({}, NOW, fakeFetch(body, 200, seen));
  assert.equal(out.ok, true);
  assert.equal(out.next, "2026-10-27T16:00:00.000-04:00"); // 9am already passed
  assert.equal(out.openDays, 2);
  assert.equal(out.bookingUrl, "https://cal.com/swftstudios/swft-meeting");
  const url = new URL(seen[0].url);
  assert.equal(url.searchParams.get("eventTypeSlug"), "swft-meeting");
  assert.equal(url.searchParams.get("username"), "swftstudios");
  assert.equal(seen[0].init.headers["cal-api-version"], "2024-09-04");
  assert.equal(seen[0].init.headers.Authorization, undefined);
});

test("getAvailability sends the API key when set and reports a full calendar as null", async () => {
  const seen = [];
  const out = await getAvailability({ CAL_API_KEY: "k" }, NOW, fakeFetch({ data: {} }, 200, seen));
  assert.equal(out.next, null);
  assert.equal(seen[0].init.headers.Authorization, "Bearer k");
});

test("getAvailability throws on a Cal.com error so the handler can fall back", async () => {
  await assert.rejects(getAvailability({}, NOW, fakeFetch({ error: "x" }, 500)));
});
