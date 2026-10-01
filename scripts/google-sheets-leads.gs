/**
 * SWFT Studios: lead log + email notifier (Google Apps Script web app).
 *
 * The website's form handlers (functions/_lib/sheets.js) POST each submission
 * here. The script
 *   1. appends it as a row on a tab named after the form (created on demand,
 *      with a header row that grows when a form gains a field), and
 *   2. when asked, emails the lead to hello@swftstudios.com. The site asks
 *      only when Resend failed, so the inbox never misses a lead.
 *
 * Setup: docs/GOOGLE_SHEETS_LEADS.md. Paste this into Extensions > Apps Script
 * on the leads spreadsheet, add the script property SHARED_SECRET, and deploy
 * as a web app (Execute as: Me, Who has access: Anyone). The shared secret is
 * what keeps the open URL from accepting anyone's data.
 */

var CONFIG = {
  // Fixed here, never taken from the request, so this URL can't be used to
  // email anyone else.
  NOTIFY_TO: "hello@swftstudios.com",
  // false: email only when the site asks (Resend fallback).
  // true:  also email on every appended lead (duplicates the Resend email).
  EMAIL_ON_EVERY_LEAD: false,
  // Tabs the site may write to. Anything else is rejected.
  SHEETS: ["Project Inquiry", "Growth Audit", "Paid Booking", "Website Build"],
  CELL_MAX: 5000
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!secretOk_(data.secret)) return json_({ ok: false, error: "unauthorized" });

    lock.waitLock(20000); // two leads at once must not interleave header edits
    if (data.action === "append") return json_(append_(data));
    if (data.action === "notify") return json_(notify_(data));
    return json_({ ok: false, error: "unknown action" });
  } catch (err) {
    console.error(String(err));
    return json_({ ok: false, error: "server error" });
  } finally {
    try { lock.releaseLock(); } catch (ignored) { /* not held */ }
  }
}

// Open the /exec URL in a browser to confirm the deployment is live.
function doGet() {
  return json_({ ok: true, service: "swft-leads" });
}

function secretOk_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expected || typeof given !== "string" || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function text_(value) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, CONFIG.CELL_MAX);
}

function append_(data) {
  if (CONFIG.SHEETS.indexOf(data.sheet) === -1) return { ok: false, error: "unknown sheet" };
  var fields = data.fields && typeof data.fields === "object" ? data.fields : {};
  var keys = Object.keys(fields);
  if (!keys.length) return { ok: false, error: "no fields" };

  var ss = spreadsheet_();
  var sheet = ss.getSheetByName(data.sheet) || ss.insertSheet(data.sheet);

  // Header row: keep existing columns, add any new field at the end.
  var headers = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String)
    : [];
  var added = keys.filter(function (k) { return headers.indexOf(k) === -1; });
  if (added.length) {
    sheet.getRange(1, headers.length + 1, 1, added.length).setValues([added]);
    headers = headers.concat(added);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var row = headers.map(function (h) { return text_(fields[h]); });
  var range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length);
  // Plain-text format first: a name or note that starts with "=", "+", "-" or
  // "@" is stored as text and can never run as a formula; phone numbers and
  // ZIP codes keep their leading zeros and plus signs.
  range.setNumberFormat("@");
  range.setValues([row]);

  if (CONFIG.EMAIL_ON_EVERY_LEAD) {
    notify_({ subject: "New lead: " + data.sheet, html: summaryHtml_(headers, row), replyTo: fields.Email });
  }
  return { ok: true };
}

function notify_(data) {
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_TO,
    subject: text_(data.subject || "New SWFT lead").replace(/[\r\n]+/g, " ").slice(0, 200),
    htmlBody: String(data.html || "").slice(0, 40000) || "(empty)",
    replyTo: /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(data.replyTo || "") ? data.replyTo : CONFIG.NOTIFY_TO,
    name: "SWFT Website"
  });
  return { ok: true };
}

function summaryHtml_(headers, row) {
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  return "<table>" + headers.map(function (h, i) {
    return row[i] ? "<tr><td><b>" + esc(h) + "</b></td><td>" + esc(row[i]) + "</td></tr>" : "";
  }).join("") + "</table>";
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
