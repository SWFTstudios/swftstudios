import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreLead, warmupCap, etParts, canSendNow, shouldAutoPause,
  signUnsubToken, verifyUnsubToken, emailHash, emailFooter, unsubHeaders,
  extractBusinessEmail,
} from "../../workers/outreach/src/index.ts";

test("scoreLead: no site, few reviews, closed weekends scores high with reasons", () => {
  const { score, reasons } = scoreLead({
    trade: "HVAC", website: null, rating: 4.0, reviewCount: 8,
    hours: [1, 2, 3, 4, 5].map((day) => ({ day, close: "1700" })),
  });
  assert.equal(score, 95); // 20 reviews + 25 no site + 10 rating + 15 weekends + 15 closes<=5pm + 10 trade
  assert.ok(reasons.some((r) => r.includes("no website")));
});

test("scoreLead: established, bookable business scores low", () => {
  const { score } = scoreLead({
    trade: "landscaping", website: "https://x.com", hasBookingLink: true, rating: 4.9, reviewCount: 400,
    hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, close: "2000" })),
  });
  assert.equal(score, 0);
});

test("warmupCap ramps 20 -> 35 -> 50", () => {
  const start = new Date("2026-11-03T00:00:00Z");
  assert.equal(warmupCap(start, new Date("2026-11-03T15:00:00Z")), 20);
  assert.equal(warmupCap(start, new Date("2026-11-09T15:00:00Z")), 20);
  assert.equal(warmupCap(start, new Date("2026-11-10T15:00:00Z")), 35);
  assert.equal(warmupCap(start, new Date("2026-11-17T15:00:00Z")), 50);
  assert.equal(warmupCap(start, new Date("2026-11-01T15:00:00Z")), 0);
});

test("etParts handles DST: 14:00Z is 9am EST in winter, 10am EDT in summer", () => {
  assert.equal(etParts(new Date("2026-11-03T14:00:00Z")).hour, 9);
  assert.equal(etParts(new Date("2026-07-07T14:00:00Z")).hour, 10);
});

test("canSendNow: window, weekend, pause, cap", () => {
  const tue9 = new Date("2026-11-03T14:00:00Z"); // Tue 9am EST
  assert.deepEqual(canSendNow({ now: tue9, sentToday: 5, cap: 20, paused: false }), { ok: true, remaining: 15 });
  assert.equal(canSendNow({ now: tue9, sentToday: 20, cap: 20, paused: false }).reason, "daily cap reached");
  assert.equal(canSendNow({ now: tue9, sentToday: 0, cap: 20, paused: true }).reason, "paused");
  assert.equal(canSendNow({ now: new Date("2026-11-03T18:00:00Z"), sentToday: 0, cap: 20, paused: false }).reason, "outside 9-11am ET");
  assert.equal(canSendNow({ now: new Date("2026-11-07T14:00:00Z"), sentToday: 0, cap: 20, paused: false }).reason, "weekend");
});

test("shouldAutoPause on any complaint or >3% bounces", () => {
  assert.equal(shouldAutoPause({ sent: 5, bounced: 0, complained: 1 }), true);
  assert.equal(shouldAutoPause({ sent: 100, bounced: 4, complained: 0 }), true);
  assert.equal(shouldAutoPause({ sent: 100, bounced: 3, complained: 0 }), false);
  assert.equal(shouldAutoPause({ sent: 10, bounced: 5, complained: 0 }), false); // too few sends to judge
});

test("unsubscribe tokens round-trip and reject tampering", async () => {
  const token = await signUnsubToken("Owner@Shop.com ", "s3cret");
  assert.equal(await verifyUnsubToken(token, "s3cret"), "owner@shop.com");
  assert.equal(await verifyUnsubToken(token, "other"), null);
  assert.equal(await verifyUnsubToken(token.slice(0, -2) + "xx", "s3cret"), null);
  assert.equal(await verifyUnsubToken("garbage", "s3cret"), null);
});

test("emailHash is case/whitespace insensitive", async () => {
  assert.equal(await emailHash(" A@B.com"), await emailHash("a@b.com"));
});

test("footer carries address + unsubscribe; headers are one-click", () => {
  const f = emailFooter("1 Main St, Jersey City NJ 07302", "https://x.test/u/t");
  assert.ok(f.includes("1 Main St") && f.includes("https://x.test/u/t"));
  assert.equal(unsubHeaders("https://x.test/u/t")["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("extractBusinessEmail: only generic mailbox on the business's own domain", () => {
  const page = `<a href="mailto:info@acmehvac.com">x</a> bob.smith@acmehvac.com sales@other.com office@acmehvac.com`;
  assert.equal(extractBusinessEmail(page, "www.acmehvac.com"), "info@acmehvac.com");
  assert.equal(extractBusinessEmail("bob@acmehvac.com", "acmehvac.com"), null);
  assert.equal(extractBusinessEmail("info@gmail.com", "acmehvac.com"), null);
});
