# PAIRA Leads — Google Sheet Setup (no coding required)

Turns a blank Google Sheet into a live feed of the leads the PAIRA website
captures (Scorecard sign-ups, and later contact/newsletter forms). The steps
are order-dependent; setup takes about 5 minutes.

## 1. Create the Sheet

At [sheets.google.com](https://sheets.google.com), create a new blank
spreadsheet and rename it **"PAIRA Leads"** (click the title in the top left).

## 2. Open the script editor

In the Sheet's menu bar: **Extensions → Apps Script**. This opens a separate
code editor tab bound to the Sheet.

## 3. Paste the code

- Delete everything in the default `Code.gs` file.
- Copy the entire contents of `tools/sheet-webhook.gs` from this repo and
  paste it into the empty editor.
- Click the **Save** icon (or Ctrl/Cmd+S).

## 4. Deploy it as a Web App

- Top right: **Deploy → New deployment**.
- Click the gear icon next to "Select type" and choose **Web app**.
- Fill in:
  - **Execute as:** `Me` (the signed-in Google account)
  - **Who has access:** `Anyone`
- Click **Deploy**.
- Google prompts for authorization, since the script edits this Sheet. Click
  through **Authorize access → account → Advanced → Go to (project name) →
  Allow**. The unverified-app warning is expected; the script is local to this
  Sheet.

## 5. Copy the Web app URL

After deploying, Google shows a **Web app URL** ending in `/exec`. Send it to
the developer; it is stored as the Cloudflare Pages secret
`SHEET_WEBHOOK_URL` and is **not** committed to any file in this repo.

## 6. Test it

Once the secret is set, the webhook can be tested directly (substitute the
deployment URL):

```bash
curl -X POST "PASTE_YOUR_WEB_APP_URL_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "ts": "2026-07-24T12:00:00Z",
    "source": "scorecard",
    "stage": "complete",
    "name": "Test Person",
    "email": "test@example.com",
    "org": "Test Org",
    "title": "Partner",
    "phone": "",
    "segment": "A",
    "score_pct": 72,
    "tier": "Practitioner",
    "kvkk_ok": true,
    "news_ok": false,
    "lang": "en",
    "country": "TR",
    "path": "/en/scorecard",
    "answers": "{}",
    "client_id": "test-row-1"
  }'
```

Refresh the Sheet: a header row appears (first time only) plus one row of test
data. Re-running the same command **updates that same row** rather than adding
a second one, because rows are matched on `client_id`. This is expected.

## 7. Changing columns later

To add, remove, or reorder columns, edit `tools/sheet-webhook.gs` — both the
`HEADER_ROW` list and the row built in `doPost` — then in the Apps Script
editor: **Deploy → Manage deployments → edit (pencil) → New version →
Deploy**. Saving the file is not enough; Web apps pick up changes only on a
new deployment version.

## Why the URL is a secret

Anyone holding the Web app URL can append data to this Sheet, so it must never
be published or committed to the repo. The Sheet is a mirror only: the
Cloudflare D1 database (`paira_leads`) is the source of truth for lead data
even if a Sheet edit or deployment mistake breaks this webhook.
