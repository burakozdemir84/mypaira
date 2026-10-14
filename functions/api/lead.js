// Cloudflare Pages Function: POST /api/lead
//
// When a Scorecard reaches stage "complete", a lead event is sent once to
// env.LEAD_WEBHOOK_URL (Make.com) with the scoring, heat and ready to send
// e-mails. See lib/lead-intel.js and docs/LEAD_ALERTS.md.
// Upserts lead-capture records into D1 (binding: DB) and best-effort mirrors
// them to a Google Apps Script webhook (env: SHEET_WEBHOOK_URL).
//
// Bindings expected:
//   context.env.DB                -> D1 database binding (see migrations/0001_leads.sql)
//   context.env.SHEET_WEBHOOK_URL -> (optional) Apps Script webhook URL, string

import { buildEvent } from "../../lib/lead-intel.js";
import { deliverOnce } from "../../lib/lead-events.js";

const ALLOWED_SOURCES = new Set([
  "scorecard",
  "contact",
  "newsletter",
  "vibe-legal",
  "trainings",
  "events",
]);

// Requires a local part, a dotted domain and a TLD of >= 2 letters.
// Permissive by design, not RFC-exhaustive.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Sources where a valid, deliverable email is mandatory. Requests missing one
// are rejected at the edge rather than stored.
const EMAIL_REQUIRED_SOURCES = new Set([
  "scorecard",
  "contact",
  "newsletter",
  "vibe-legal",
  "trainings",
  "events",
]);

// Disposable / temporary inbox providers. Deliberately broad.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "sharklasers.com",
  "grr.la", "guerrillamailblock.com", "yopmail.com", "yopmail.net", "yopmail.fr",
  "temp-mail.org", "tempmail.com", "temp-mail.io", "tempmailo.com", "tempr.email",
  "throwawaymail.com", "getnada.com", "nada.email", "dispostable.com", "trashmail.com",
  "trashmail.de", "mailnesia.com", "maildrop.cc", "mailcatch.com", "fakeinbox.com",
  "fakemailgenerator.com", "spamgourmet.com", "mytemp.email", "mohmal.com",
  "emailondeck.com", "moakt.com", "mailtemp.net", "tmail.io", "tmpmail.org",
  "tmpmail.net", "burnermail.io", "33mail.com", "spam4.me", "byom.de", "einrot.com",
  "discard.email", "wegwerfmail.de", "wegwerfmail.net", "cs.email", "inboxkitten.com",
  "1secmail.com", "1secmail.org", "1secmail.net", "20minutemail.com", "anonaddy.me",
  "mailsac.com", "harakirimail.com", "vomoto.com", "spambog.com", "mvrht.com",
  "mailforspam.com", "mailexpire.com", "tempinbox.com", "mailimate.com",
]);

function emailDomain(email) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

// Checks whether the domain can receive mail, via Cloudflare DNS-over-HTTPS
// (no binding or key required). MX is the primary signal, with an A-record
// fallback for domains accepting mail on the apex. Fails open on any lookup or
// network error, so a resolver problem never blocks a real sign-up.
async function domainCanReceiveMail(domain) {
  const q = async (type) => {
    const url =
      "https://cloudflare-dns.com/dns-query?name=" +
      encodeURIComponent(domain) +
      "&type=" +
      type;
    const r = await fetch(url, { headers: { accept: "application/dns-json" } });
    if (!r.ok) return null; // signal "unknown"
    return r.json();
  };
  try {
    const mx = await q("MX");
    if (mx == null) return true; // resolver error -> fail open
    if (Array.isArray(mx.Answer) && mx.Answer.some((a) => a.type === 15)) return true;
    // NXDOMAIN (status 3) with no MX and no A means the domain doesn't exist.
    const a = await q("A");
    if (a == null) return true; // fail open
    if (Array.isArray(a.Answer) && a.Answer.length > 0) return true;
    return false; // definitively no MX and no A -> cannot receive mail
  } catch (_e) {
    return true; // network error -> fail open
  }
}

// Returns { ok:true } or { ok:false, reason:"..." }. `reason` is a stable code
// the client maps to a localized message.
async function validateEmail(email) {
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "syntax" };
  const domain = emailDomain(email);
  if (!domain || domain.indexOf(".") === -1) return { ok: false, reason: "syntax" };
  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: "disposable" };
  const deliverable = await domainCanReceiveMail(domain);
  if (!deliverable) return { ok: false, reason: "undeliverable" };
  return { ok: true };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function boolToInt(v) {
  return v ? 1 : 0;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let payload;
    try {
      payload = await request.json();
    } catch (_e) {
      return jsonResponse({ ok: false, error: "invalid_json" }, 400);
    }

    if (!payload || typeof payload !== "object") {
      return jsonResponse({ ok: false, error: "invalid_body" }, 400);
    }

    const client_id = str(payload.client_id).trim();
    if (!client_id) {
      return jsonResponse({ ok: false, error: "missing_client_id" }, 400);
    }

    const source = str(payload.source).trim();
    if (!ALLOWED_SOURCES.has(source)) {
      return jsonResponse({ ok: false, error: "invalid_source" }, 400);
    }

    const email = str(payload.email).trim();
    // Mandatory for EMAIL_REQUIRED_SOURCES, and validated whenever present:
    // syntax, not a disposable provider, domain can receive mail.
    // 422 = understood but rejected; the client maps `reason`.
    if (EMAIL_REQUIRED_SOURCES.has(source) && !email) {
      return jsonResponse({ ok: false, error: "invalid_email", reason: "required" }, 422);
    }
    if (email) {
      const v = await validateEmail(email);
      if (!v.ok) {
        return jsonResponse({ ok: false, error: "invalid_email", reason: v.reason }, 422);
      }
    }

    const stage = str(payload.stage).trim() || "partial";
    const name = str(payload.name).trim();
    const org = str(payload.org).trim();
    const title = str(payload.title).trim();
    const phone = str(payload.phone).trim();
    const segment = payload.segment == null ? null : str(payload.segment).trim() || null;
    const answers =
      payload.answers == null ? null : JSON.stringify(payload.answers);
    const score_pct =
      payload.score_pct == null || payload.score_pct === ""
        ? null
        : Number(payload.score_pct);
    const tier = payload.tier == null ? null : str(payload.tier).trim() || null;
    const kvkk_ok = boolToInt(payload.kvkk_ok);
    const news_ok = boolToInt(payload.news_ok);
    const lang = str(payload.lang).trim();
    const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
    const path = str(meta.path).trim();
    const country = (request.cf && request.cf.country) || null;

    const db = env.DB;
    if (!db) {
      console.error("lead.js: missing DB binding");
      return jsonResponse({ ok: false, error: "server_error" }, 500);
    }

    const upsertSql = `
      INSERT INTO leads (client_id, source, stage, name, email, org, title, phone,
        segment, answers_json, score_pct, tier, kvkk_ok, news_ok, lang, country, path, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(client_id) DO UPDATE SET
        stage=excluded.stage, name=excluded.name, email=excluded.email, org=excluded.org,
        title=excluded.title, phone=excluded.phone, segment=excluded.segment,
        answers_json=COALESCE(excluded.answers_json, leads.answers_json),
        score_pct=COALESCE(excluded.score_pct, leads.score_pct),
        tier=COALESCE(excluded.tier, leads.tier),
        kvkk_ok=excluded.kvkk_ok, news_ok=excluded.news_ok, lang=excluded.lang,
        country=excluded.country, path=excluded.path, updated_at=datetime('now');
    `;

    const runResult = await db
      .prepare(upsertSql)
      .bind(
        client_id,
        source,
        stage,
        name,
        email,
        org,
        title,
        phone,
        segment,
        answers,
        score_pct,
        tier,
        kvkk_ok,
        news_ok,
        lang,
        country,
        path
      )
      .run();

    let id = runResult && runResult.meta ? runResult.meta.last_row_id : null;
    if (!id) {
      const row = await db
        .prepare("SELECT id FROM leads WHERE client_id = ?")
        .bind(client_id)
        .first();
      id = row ? row.id : null;
    }

    // Lead alert: completed Scorecard -> Make.com (notification to Burak,
    // report to the lead, CRM). Runs after the response; never blocks it.
    if (source === "scorecard" && stage === "complete" && env.LEAD_WEBHOOK_URL) {
      context.waitUntil(
        (async () => {
          try {
            const row = await db.prepare("SELECT * FROM leads WHERE client_id = ?").bind(client_id).first();
            if (!row) return;
            await deliverOnce(env, client_id, "scorecard.completed", buildEvent(row, "completed"));
          } catch (err) {
            console.error("lead.js: lead alert failed", err);
          }
        })()
      );
    }

    // Best-effort mirror to the Apps Script webhook. D1 is the source of truth,
    // so a failure here must not affect the response.
    if (env.SHEET_WEBHOOK_URL) {
      const sheetPayload = {
        ts: new Date().toISOString(),
        source,
        stage,
        name,
        email,
        org,
        title,
        phone,
        segment,
        score_pct,
        tier,
        kvkk_ok,
        news_ok,
        lang,
        country,
        path,
        answers,
        client_id,
      };

      const sendToSheet = fetch(env.SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sheetPayload),
      }).catch((err) => {
        console.error("lead.js: sheet webhook failed", err);
      });

      context.waitUntil(sendToSheet);
    }

    return jsonResponse({ ok: true, id });
  } catch (err) {
    console.error("lead.js: unexpected error", err);
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}
