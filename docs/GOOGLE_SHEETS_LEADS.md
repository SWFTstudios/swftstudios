# Google Sheets lead log + email fallback

Every form submission (contact, Free Growth Audit, booking / quote, website build) is saved in **two places at once**, then emailed:

| Step | Where | Needs |
|---|---|---|
| 1. CRM | **Airtable** (form table + Pipeline) | `AIRTABLE_TOKEN` (already used) |
| 2. Lead log | **Google Sheet**, one tab per form | `GOOGLE_SHEETS_WEBHOOK_URL` + `GOOGLE_SHEETS_SECRET` (this guide) |
| 3. Notification | Email to **hello@swftstudios.com** via Resend | `RESEND_API_KEY` (already used) |
| 3b. If Resend fails | The Google Sheets script emails **hello@swftstudios.com** instead | same two Sheets values |

Airtable and the Sheet are independent: either one counts as a saved copy, and a form still succeeds if the email went out, or if either copy was saved. The Sheets part does nothing until its two secrets are set.

The site posts to a small **Google Apps Script web app** ([`scripts/google-sheets-leads.gs`](../scripts/google-sheets-leads.gs)) that lives inside the spreadsheet. No Google API keys or service accounts are needed.

## One-time setup (about 5 minutes)

1. **Create the sheet.** In Google Sheets, make a new spreadsheet named `SWFT Leads`. Do it from the Google account that should send the fallback emails (ideally the `hello@swftstudios.com` account). Leave it empty; the script creates the tabs `Project Inquiry`, `Growth Audit`, `Paid Booking` and `Website Build`, and their header rows, on the first lead.
2. **Add the script.** In the sheet: **Extensions → Apps Script**. Delete the default code, paste the whole of [`scripts/google-sheets-leads.gs`](../scripts/google-sheets-leads.gs), and save.
3. **Set the shared secret.** In Apps Script: **Project Settings (gear) → Script properties → Add script property**. Name `SHARED_SECRET`, value a long random string (for example the output of `openssl rand -hex 24`). Keep a copy; you need it in step 5.
4. **Deploy it.** **Deploy → New deployment → Select type: Web app.** Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Google asks you to authorize: choose your account, **Advanced → Go to (project)**, and allow access to your spreadsheets and email sending. Copy the **Web app URL** (it ends in `/exec`).
   - "Anyone" is required so the website can call it. The shared secret is what stops anyone else from writing rows.
   - Check it is live by opening the URL in a browser: you should see `{"ok":true,"service":"swft-leads"}`.
5. **Add two secrets in Cloudflare.** **Workers & Pages → swftstudios-website → Settings → Variables and Secrets** (add them for Production, and Preview if you test there):
   - `GOOGLE_SHEETS_WEBHOOK_URL` = the Web app URL from step 4
   - `GOOGLE_SHEETS_SECRET` = the same value as `SHARED_SECRET`

   If a separately deployed `swftstudios` Worker also serves the domain, add the same two secrets there; secrets don't carry over between Pages and Workers. Then **redeploy** (Deployments → Retry deployment, or push any commit) so the new secrets take effect.
6. **Test it.** Submit the contact form on the live site with your own details. Within a few seconds you should see a row on the **Project Inquiry** tab, the Airtable record, and the email at hello@swftstudios.com. Repeat for the Free Growth Audit.

Keep the URL and secret out of GitHub, HTML and chat. They are secrets in Cloudflare only.

## How it behaves

- **Columns** are the same field names Airtable uses (Name, Email, Phone, Business, Source Page, UTM fields, Status, and so on), plus `Submitted At` and `Form`. If a form gains a field later, the script adds a new column at the end; existing columns and rows never move.
- **Values are plain text.** A message starting with `=`, `+`, `-` or `@` is stored as text and can't run as a formula; phone numbers and ZIP codes keep their leading `+` and zeros.
- **Emails** to hello@ normally come from Resend (with the lead as reply-to, plus the visitor confirmation). The script only emails when Resend failed or isn't configured, so you never get two. To get an email from the script for **every** lead too, set `EMAIL_ON_EVERY_LEAD: true` in the script (you will then get two emails per lead).
- **The recipient is fixed** inside the script (`CONFIG.NOTIFY_TO`), not taken from the request, so the public URL can't be used to email anyone else. Only the four form tabs are writable.
- **Email limits.** Emails from the script count against the Google account's daily limit (about 100 for a free account, 1,500 for Workspace). That only matters if Resend is down.
- **Editing the script later:** after changing the code, **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No rows appear, Airtable and email work | The two Cloudflare secrets aren't set (or the site wasn't redeployed after adding them), or the secret doesn't match `SHARED_SECRET`. Check Cloudflare request logs for `Google Sheets webhook rejected`. |
| `unauthorized` in the logs | `GOOGLE_SHEETS_SECRET` differs from the script property `SHARED_SECRET`. |
| The URL opens a Google sign-in page | The deployment's access isn't "Anyone". Redeploy with **Who has access: Anyone**. |
| `unknown sheet` in the logs | A form group was renamed in code. Add the new tab name to `CONFIG.SHEETS` in the script and redeploy it. |
| Rows appear but no fallback email | Expected while Resend works. Test the fallback by temporarily removing `RESEND_API_KEY` in a Preview deployment. |

## Tests

`npm run test:forms` covers both halves with no network or secrets: the form handlers (rows land on the right tab, Resend failure falls back to the script's email, both services down still returns an honest error) and the Apps Script itself, run against fake spreadsheet and mail objects (wrong secret, header growth, text-only cells, fixed recipient).
