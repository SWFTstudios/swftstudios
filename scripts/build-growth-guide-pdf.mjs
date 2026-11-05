#!/usr/bin/env node
/**
 * Builds the printable SWFT Growth Guide (downloads/swft-growth-guide.pdf)
 * from data/growth-guide.json, the same content the web Customer Journey
 * Check uses. Print-and-check: tick boxes and lines to write on; it does
 * not calculate or save anything.
 *
 *   npm run build:guide-pdf
 *
 * Needs Playwright with Chromium (npx playwright install chromium).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const G = JSON.parse(readFileSync(join(ROOT, "data/growth-guide.json"), "utf8"));
const OUT_DIR = join(ROOT, "downloads");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// The printed guide is generic: industry tokens become neutral wording
const neutral = { action: "take the main next step (inquire, buy, reserve or register)", actionNoun: "inquiry, order, reservation or registration", proof: "work, reviews or examples", relationship: "repeat business, referrals or continued participation" };
const fill = (t) => esc(String(t).replace(/\{(\w+)\}/g, (_, k) => neutral[k] || k));
const boxes = G.answers.map((a) => `<span class="box"></span>${esc(a.label)}`).join("");
const lines = (n) => `<div class="lines">${'<span></span>'.repeat(n)}</div>`;

const stagePages = G.stages.map((st) => `
<section class="page">
  <p class="eyebrow">${st.num} &middot; ${esc(st.title)}</p>
  <h2>${esc(st.question)}</h2>
  <p class="intro">${esc(st.intro)} Use a recent example, a customer test or a record where you can.</p>
  <ol class="qs">
    ${st.questions.map((q) => `<li><p>${fill(q)}</p><div class="opts">${boxes}</div></li>`).join("")}
  </ol>
  <div class="score">Stage total: Yes &times; 2 + Partly &times; 1 = <span class="blank"></span> / 10 &nbsp;&middot;&nbsp; &ldquo;I don't know&rdquo; answers to verify: <span class="blank short"></span></div>
  <div class="grid2">
    <div class="note"><h3>First action</h3><p>${fill(st.firstAction)}</p></div>
    <div class="note"><h3>Evidence to track</h3><p>${fill(st.evidence)}</p></div>
  </div>
  <p class="help"><b>SWFT can help with:</b> ${esc(st.help)}</p>
</section>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(G.title)}</title>
<style>
@page { size: Letter; margin: 0.6in 0.65in 0.7in; }
:root { --ink: #121211; --muted: #55554f; --line: #d9d8d2; --signal: #e8481f; --ice: #4457c9; --paper: #f6f6f3; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); }
.page { break-after: page; }
.page:last-child { break-after: auto; }
.eyebrow { margin: 0 0 6pt; font: 600 8pt/1.4 ui-monospace, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--signal); }
h1 { font-size: 34pt; line-height: 1; letter-spacing: -.04em; margin: 0 0 12pt; }
h2 { font-size: 20pt; line-height: 1.1; letter-spacing: -.03em; margin: 0 0 8pt; }
h3 { font-size: 10.5pt; margin: 0 0 4pt; }
p { margin: 0 0 8pt; }
.intro { color: var(--muted); max-width: 52em; }
.cover { display: flex; flex-direction: column; justify-content: space-between; min-height: 9.2in; }
.cover .brand { font-weight: 800; letter-spacing: -.03em; font-size: 14pt; }
.cover .brand span { color: var(--signal); font-weight: 400; font-style: italic; }
.cover .lead { font-size: 13pt; color: var(--muted); max-width: 32em; }
.cover .band { padding: 14pt 16pt; border-radius: 12pt; background: var(--paper); }
.cover ol { margin: 6pt 0 0; padding-left: 16pt; } .cover li { margin: 3pt 0; }
.qs { list-style: none; counter-reset: q; margin: 10pt 0; padding: 0; }
.qs li { counter-increment: q; padding: 8pt 0 8pt 22pt; border-top: 1px solid var(--line); position: relative; break-inside: avoid; }
.qs li::before { content: counter(q); position: absolute; left: 0; top: 8pt; font: 600 9pt ui-monospace, Menlo, monospace; color: var(--signal); }
.qs p { margin: 0 0 5pt; }
.opts { display: flex; gap: 14pt; flex-wrap: wrap; font-size: 9pt; color: var(--muted); }
.box { display: inline-block; width: 9pt; height: 9pt; border: 1.2px solid var(--ink); border-radius: 2px; margin-right: 4pt; vertical-align: -1pt; }
.score { margin: 4pt 0 12pt; padding: 8pt 10pt; border-radius: 8pt; background: var(--paper); font-size: 9.5pt; }
.blank { display: inline-block; width: 34pt; border-bottom: 1px solid var(--ink); }
.blank.short { width: 22pt; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
.note { padding: 10pt 12pt; border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: 8pt; break-inside: avoid; }
.note p { margin: 0; font-size: 9.5pt; }
.help { margin-top: 10pt; font-size: 9.5pt; color: var(--muted); }
.field { margin: 0 0 12pt; break-inside: avoid; }
.field p { margin: 0 0 2pt; font-weight: 600; }
.lines span { display: block; height: 20pt; border-bottom: 1px solid var(--line); }
.checks { display: flex; flex-wrap: wrap; gap: 6pt 16pt; font-size: 9.5pt; margin: 4pt 0 8pt; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { text-align: left; vertical-align: top; padding: 7pt 8pt; border-bottom: 1px solid var(--line); }
th { width: 40%; font-weight: 600; }
td.write { height: 26pt; }
thead th { font: 600 8pt ui-monospace, Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); width: auto; }
.weeks { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 8pt 0 14pt; }
.week { padding: 10pt 12pt; border: 1px solid var(--line); border-radius: 10pt; break-inside: avoid; }
.week span { font: 600 8pt ui-monospace, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--signal); }
.week b { display: block; font-size: 12pt; margin: 2pt 0 4pt; }
.week p { margin: 0; font-size: 9.5pt; color: var(--muted); }
.rules li { margin: 4pt 0; }
.small { font-size: 9pt; color: var(--muted); }
.cta { margin-top: 14pt; padding: 14pt 16pt; border-radius: 12pt; background: var(--ink); color: #fff; }
.cta h2 { color: #fff; } .cta p { color: #d6d6d0; } .cta b { color: #fff; }
</style></head><body>

<section class="page cover">
  <div>
    <p class="brand">SWFT<span>studios</span></p>
    <p class="eyebrow" style="margin-top:48pt">${esc(G.title)} &middot; printable ${esc(G.checkName)}</p>
    <h1>${esc(G.promise)}</h1>
    <p class="lead">See your business through your customer's eyes, from finding you to choosing you and coming back. Check four stages, choose your first priority, and leave with a practical 30-day plan.</p>
  </div>
  <div class="band">
    <h3>How to use this guide</h3>
    <ol>
      <li>Start with the change you want (page 2).</li>
      <li>Check each of the four stages. Tick one box per question. &ldquo;I don't know&rdquo; is a useful answer: it marks something to verify, not a failure.</li>
      <li>Choose your first priority (page 7) and fill in your 30-day plan and action card.</li>
    </ol>
    <p class="small" style="margin-top:8pt">Prefer it on screen? The interactive version scores it for you: swftstudios.com/growth-guide. ${esc(G.disclaimer)}</p>
  </div>
</section>

<section class="page">
  <p class="eyebrow">Start with the change you want</p>
  <h2>What are we checking?</h2>
  <div class="field"><p>1. What kind of business do you run?</p><div class="checks">${G.industries.map((i) => `<span><span class="box"></span>${esc(i.label)}</span>`).join("")}<span><span class="box"></span>Other: ________________</span></div></div>
  <div class="field"><p>2. What is the main offer you want this guide to focus on?</p>${lines(1)}</div>
  <div class="field"><p>3. Who is it for, and what does it help them achieve?</p>${lines(2)}</div>
  <div class="field"><p>4. What should an interested person do next?</p>${lines(1)}</div>
  <div class="field"><p>5. What would meaningful progress look like over the next 30 days?</p>
    <div class="checks">${G.outcomes.map((o) => `<span><span class="box"></span>${esc(o.label)}</span>`).join("")}</div>
    <table><tr><th>Where it is now (or &ldquo;don't know yet&rdquo;)</th><td class="write"></td></tr><tr><th>Where you want it</th><td class="write"></td></tr></table>
  </div>
  <p class="small">A target is your goal, not a forecast or a guarantee. For long sales cycles, choose an observable step (such as qualified conversations) now and review revenue later.</p>
</section>

${stagePages}

<section class="page">
  <p class="eyebrow">Choose your first priority</p>
  <h2>Fix what's broken before adding more.</h2>
  <ol class="rules">
    <li><b>Broken core action or handoff?</b> If you ticked &ldquo;No&rdquo; on Take action questions 2, 3 or 4, start there.</li>
    <li><b>Delivery or customer-care gap?</b> If you ticked &ldquo;No&rdquo; on Come back questions 1 or 2, fix that before bringing in more customers.</li>
    <li><b>Otherwise,</b> your weakest stage is the candidate. Check it against the outcome you chose on page 2.</li>
    <li><b>Lots of &ldquo;I don't know&rdquo;?</b> Your first priority is to find out: verify before you build.</li>
    <li><b>You decide.</b> A self-assessment can't reliably pick the highest-revenue opportunity. Change the priority if you know better, and note why.</li>
  </ol>
  <table>
    <tr><th>Your first priority</th><td class="write"></td></tr>
    <tr><th>What may be getting in the way of your outcome</th><td class="write"></td></tr>
    <tr><th>Do this week</th><td class="write"></td></tr>
    <tr><th>Record before changing it (baseline and source)</th><td class="write"></td></tr>
    <tr><th>Watch for</th><td class="write"></td></tr>
    <tr><th>Review on</th><td class="write"></td></tr>
    <tr><th>If it doesn't improve, check</th><td class="write"></td></tr>
  </table>
  <h3 style="margin-top:14pt">In order</h3>
  <table>
    <tr><th>Do now</th><td class="write"></td></tr>
    <tr><th>Do next</th><td class="write"></td></tr>
    <tr><th>Improve later</th><td class="write"></td></tr>
  </table>
  <p class="small" style="margin-top:6pt">One change at a time where you can, so you can tell what worked.</p>
</section>

<section class="page">
  <p class="eyebrow">Your 30-day plan</p>
  <h2>Understand, improve, connect, review.</h2>
  <div class="weeks">${G.plan.map((w) => `<div class="week"><span>${esc(w.week)}</span><b>${esc(w.title)}</b><p>${esc(w.text)}</p></div>`).join("")}</div>
  <h3>Three kinds of progress</h3>
  <table>${G.progress.map((p) => `<tr><th>${esc(p.label)}</th><td>${esc(p.text)}</td></tr>`).join("")}</table>
  <p class="small" style="margin-top:8pt">A finished deliverable isn't the result. Judge the change against your baseline, over a fair period, and note anything else that changed.</p>
</section>

<section class="page">
  <p class="eyebrow">Your action card</p>
  <h2>One change, owned and measured.</h2>
  <table>${G.card.map((c) => `<tr><th>${esc(c)}</th><td class="write"></td></tr>`).join("")}</table>
  <div class="note" style="margin-top:14pt"><h3>Example</h3><p>${esc(G.example)}</p></div>
</section>

<section class="page">
  <p class="eyebrow">Adapt it to your business</p>
  <h2>Same journey, different finish lines.</h2>
  <table>
    <thead><tr><th>Audience</th><th>Primary action</th><th>Trust content</th><th>Relationship outcome</th></tr></thead>
    ${G.industries.map((i) => `<tr><td><b>${esc(i.label)}</b></td><td>${esc(i.action.charAt(0).toUpperCase() + i.action.slice(1))}</td><td>${esc(i.proof.charAt(0).toUpperCase() + i.proof.slice(1))}</td><td>${esc(i.relationship.charAt(0).toUpperCase() + i.relationship.slice(1))}</td></tr>`).join("")}
  </table>
  <p class="small" style="margin-top:6pt">A registration is not attendance, and an inquiry is not a customer. Measure the step that matters.</p>
  <div class="cta">
    <p class="eyebrow" style="color:#ff8a6b">Want a second set of eyes?</p>
    <h2>We'll look at your journey with you.</h2>
    <p>Share your website or social profile at <b>swftstudios.com/growth-guide</b> and we'll email you three priorities to consider. No call required.</p>
    <p style="margin:0"><b>Want help putting the plan into practice?</b> Bring us your priority. We'll help define the outcome, build the workflow and agree on how we'll judge progress. hello@swftstudios.com</p>
  </div>
</section>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { ({ chromium } = (await import("node:module")).createRequire(import.meta.url)("playwright")); } catch { /* fall through */ }
}
if (!chromium) {
  console.error("Playwright is needed: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({
  path: join(OUT_DIR, "swft-growth-guide.pdf"),
  format: "Letter",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="font:8px -apple-system,Arial,sans-serif;color:#888;width:100%;text-align:center">${esc(G.title)} · swftstudios.com/growth-guide · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
  margin: { top: "0.6in", bottom: "0.7in", left: "0.65in", right: "0.65in" },
});
await browser.close();
console.log("wrote downloads/swft-growth-guide.pdf");
