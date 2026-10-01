/**
 * Live smoke test: submit one marked test lead through each form endpoint of a
 * deployed site and confirm the server reports the email as delivered.
 * Real emails go to hello@swftstudios.com (the visitor copy goes there too).
 * No card is charged: the booking check uses a quote request.
 *
 *   node tests/forms/live-smoke.mjs https://swftstudios.com
 *   node tests/forms/live-smoke.mjs https://<preview>.swftstudios-website.pages.dev
 *
 * Then look for three "[SWFT TEST]" emails in hello@swftstudios.com.
 * Airtable (if configured) gets matching rows marked [SWFT TEST]; delete them after.
 */
const base = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node tests/forms/live-smoke.mjs <site URL>");
  process.exit(2);
}

const INBOX = "hello@swftstudios.com";
const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
const tag = `[SWFT TEST ${stamp}]`;

const checks = [
  ["Contact", "/api/contact", {
    name: `${tag} Contact`, email: INBOX, businessName: `${tag} Contact`,
    details: "Automated delivery check. Safe to delete.", sourcePage: "live-smoke",
  }],
  ["Growth Audit", "/api/growth-audit", {
    firstName: tag, lastName: "Growth Audit", email: INBOX, businessName: `${tag} Growth Audit`,
    website: "https://swftstudios.com", websiteUrl: "https://swftstudios.com",
    desiredService: "not-sure", biggestLeak: "Automated delivery check",
    details: "Automated delivery check. Safe to delete.", sourcePage: "live-smoke",
  }],
  ["Booking (quote, no charge)", "/api/book-tier", {
    tierId: "website-only", quoteOnly: true, name: `${tag} Booking`, email: INBOX,
    businessName: `${tag} Booking`, customization: { goal: "Automated delivery check", addOns: [] },
    notes: "Automated delivery check. Safe to delete.", sourcePage: "live-smoke",
  }],
];

let failed = 0;
for (const [name, path, body] of checks) {
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const delivered = res.ok && data.ok && data.emailDelivered === true;
    if (!delivered) failed++;
    console.log(`${delivered ? "PASS" : "FAIL"}  ${name}: HTTP ${res.status}` +
      `, emailDelivered=${data.emailDelivered}, storedInAirtable=${data.stored}` +
      (data.error ? `, error="${data.error}"` : "") + (data.warning ? `, warning="${data.warning}"` : ""));
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}

console.log(failed
  ? `\n${failed} form(s) did not confirm delivery. Check RESEND_API_KEY / RESEND_FROM and the Resend logs.`
  : `\nServer confirmed delivery for all forms. Check ${INBOX} for the "${tag}" emails.`);
process.exit(failed ? 1 : 0);
