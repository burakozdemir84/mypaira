// POST /api/discovery/start   (public)
//
// Step 1 of /on-hazirlik: the company enters its details. Creates the record,
// returns the personal token for the page, and tells Make (DISCOVERY_WEBHOOK_URL)
// so the signed NDA and the personal link can be e-mailed.
//
// Body: { org, address, contact_name, contact_title, email, phone, website }
// `website` is a honeypot: real visitors never fill it.

import {
  json, readJson, ensureTables, newToken, newId, sha256Hex, expiryFromNow, nowIso, notify,
} from "../../../lib/discovery.js";
import { trDate } from "../../../lib/nda-pdf.js";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_PER_HOUR = 5;
const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  const parsed = await readJson(request, 8 * 1024);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const b = parsed.body || {};

  const f = {
    org: clean(b.org, 200),
    address: clean(b.address, 300),
    contact_name: clean(b.contact_name, 120),
    contact_title: clean(b.contact_title, 120),
    email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 40),
  };
  // Honeypot: pretend success, store nothing.
  if (clean(b.website, 200)) return json({ ok: true, token: null });

  const missing = ["org", "address", "contact_name", "email"].filter((k) => !f[k]);
  if (missing.length) return json({ ok: false, error: "missing", fields: missing }, 400);
  if (!EMAIL_RE.test(f.email)) return json({ ok: false, error: "email" }, 400);
  if (f.org.length < 3 || f.address.length < 10) return json({ ok: false, error: "too_short" }, 400);

  await ensureTables(env.DB);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = ip ? await sha256Hex(ip + "|" + (env.PAIRA_AUTOMATION_KEY || "paira")) : "";
  if (ipHash) {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const c = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM discovery_requests WHERE ip_hash = ? AND created_at >= ?")
      .bind(ipHash, since.replace("T", " ").slice(0, 19))
      .first();
    if (c && c.n >= MAX_PER_HOUR) return json({ ok: false, error: "rate" }, 429);
  }

  const id = newId();
  const token = newToken();
  const ndaDate = trDate();
  const expires = expiryFromNow();
  await env.DB
    .prepare(
      "INSERT INTO discovery_requests (id, token_hash, org, address, contact_name, contact_title, contact_email, phone, nda_date, ip_hash, expires_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id, await sha256Hex(token), f.org, f.address, f.contact_name, f.contact_title, f.email, f.phone, ndaDate, ipHash, expires)
    .run();

  const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const payload = {
    event: "discovery_started",
    id,
    created_at: nowIso(),
    org: f.org,
    address: f.address,
    contact_name: f.contact_name,
    contact_title: f.contact_title,
    contact_email: f.email,
    phone: f.phone,
    nda_date: ndaDate,
    form_url: origin + "/on-hazirlik#t=" + token,
    // Make downloads the PDF from here with the X-PAIRA-KEY header and attaches it.
    nda_pdf_url: origin + "/api/discovery/admin?nda=1&id=" + encodeURIComponent(id),
  };
  const send = notify(env, payload);
  if (waitUntil) waitUntil(send); else await send;

  return json({ ok: true, token, emailed: !!env.DISCOVERY_WEBHOOK_URL });
}
