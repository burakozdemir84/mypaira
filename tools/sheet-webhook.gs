/**
 * PAIRA Leads — Google Apps Script Web App webhook
 * ------------------------------------------------
 * Receives one JSON lead object per POST from the Cloudflare Pages Function
 * at /api/lead, and appends or updates one row per lead in this spreadsheet.
 * D1 is the system of record; this sheet is a mirror.
 *
 * Incoming JSON keys (from functions/api/lead.js), in payload order:
 *   ts, source, stage, name, email, org, title, phone, segment, score_pct,
 *   tier, kvkk_ok, news_ok, lang, country, path, answers, client_id
 *
 * Sheet column layout — reordered from the payload; this mapping is
 * authoritative, not the payload key order:
 *   A Timestamp   <- ts
 *   B Source      <- source
 *   C Stage       <- stage
 *   D Name        <- name
 *   E Email       <- email
 *   F Org         <- org
 *   G Title       <- title
 *   H Phone       <- phone
 *   I Score %     <- score_pct
 *   J Tier        <- tier
 *   K Segment     <- segment
 *   L KVKK        <- kvkk_ok    (rendered "Yes" / "No")
 *   M Newsletter  <- news_ok    (rendered "Yes" / "No")
 *   N Lang        <- lang
 *   O Country     <- country
 *   P Page        <- path
 *   Q Answers     <- answers    (raw JSON string, as-is)
 *   R ClientID    <- client_id  (upsert key — see findRowByClientId)
 *
 * Upsert behavior: the Scorecard writes a lead twice — "partial" on form
 * submit, "complete" when the score is shown — both with the same client_id.
 * A matching client_id in column R is overwritten in place instead of
 * appended, so each visitor is one row.
 */

// Written once, on first use of the sheet.
var HEADER_ROW = [
  "Timestamp", "Source", "Stage", "Name", "Email", "Org", "Title", "Phone",
  "Score %", "Tier", "Segment", "KVKK", "Newsletter", "Lang", "Country",
  "Page", "Answers", "ClientID"
];

// 1-based column number of ClientID — must stay in sync with HEADER_ROW.
var CLIENT_ID_COL = HEADER_ROW.length; // 18

function doPost(e) {
  // Serialize requests: two concurrent submissions could each miss the
  // client_id lookup and append, producing a duplicate row.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // give up after 30s

  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Empty sheet: write the header row before any data.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER_ROW);
    }

    var row = [
      data.ts || "",
      data.source || "",
      data.stage || "",
      data.name || "",
      data.email || "",
      data.org || "",
      data.title || "",
      data.phone || "",
      (data.score_pct === undefined || data.score_pct === null) ? "" : data.score_pct,
      data.tier || "",
      data.segment || "",
      data.kvkk_ok ? "Yes" : "No",
      data.news_ok ? "Yes" : "No",
      data.lang || "",
      data.country || "",
      data.path || "",
      data.answers || "",
      data.client_id || ""
    ];

    var clientId = data.client_id || "";
    var existingRow = clientId ? findRowByClientId(sheet, clientId) : -1;

    if (existingRow > 0) {
      // Visitor already has a row (e.g. "partial" -> "complete") — overwrite it.
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      // New visitor — append.
      sheet.appendRow(row);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Return valid JSON on failure too: the caller's best-effort fetch()
    // would otherwise throw on a malformed response.
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

/**
 * Exact-match search of the ClientID column, skipping the header row.
 * Returns the 1-based row number, or -1 if not found.
 */
function findRowByClientId(sheet, clientId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1; // header row only, or empty

  var range = sheet.getRange(2, CLIENT_ID_COL, lastRow - 1, 1);
  var values = range.getValues();

  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === clientId) {
      return i + 2; // +2: 0-based index -> 1-based row, past the header
    }
  }
  return -1;
}
