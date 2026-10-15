// /api/discovery/admin   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//
// GET                     -> list of requests (no answers) and signature status
// GET ?id=<id>            -> one request with answers
// GET ?id=<id>&nda=1      -> that company's signed NDA as PDF (Make uses this)
// POST { action: "signature", jpeg_base64 }   -> store PAIRA's signature/stamp image
// POST { action: "extend", id, days }         -> keep the personal link open longer
// POST { action: "delete", id }
// POST { action: "purge", older_than_days }   -> delete requests expired that long ago

import {
  json, readJson, checkAdminKey, ensureTables, expiryFromNow, getSetting, setSetting,
  b64ToBytes, ndaResponse,
} from "../../../lib/discovery.js";
import { jpegInfo } from "../../../lib/nda-pdf.js";

const DAY = 24 * 60 * 60 * 1000;

function view(r, withAnswers) {
  const out = {
    id: r.id, org: r.org, address: r.address, contact_name: r.contact_name, contact_title: r.contact_title,
    contact_email: r.contact_email, phone: r.phone, nda_date: r.nda_date, created_at: r.created_at,
    expires_at: r.expires_at, expired: Date.parse(r.expires_at) < Date.now(),
    open_count: r.open_count || 0, last_opened_at: r.last_opened_at, updated_at: r.updated_at,
    submitted_at: r.submitted_at, submit_count: r.submit_count || 0,
  };
  let answers = {};
  try { answers = r.answers_json ? JSON.parse(r.answers_json) : {}; } catch (_e) { answers = {}; }
  out.answered = Object.keys(answers).length;
  if (withAnswers) out.answers = answers;
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!checkAdminKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  await ensureTables(env.DB);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const r = await env.DB.prepare("SELECT * FROM discovery_requests WHERE id = ?").bind(id).first();
    if (!r) return json({ ok: false, error: "not_found" }, 404);
    if (url.searchParams.get("nda")) return ndaResponse(env, request, r);
    return json({ ok: true, request: view(r, true) });
  }
  const res = await env.DB.prepare("SELECT * FROM discovery_requests ORDER BY created_at DESC LIMIT 300").all();
  const sig = await getSetting(env.DB, "nda_signature_jpeg");
  return json({ ok: true, signature: !!sig, requests: ((res && res.results) || []).map((r) => view(r, false)) });
}

export async function onRequestPost({ request, env }) {
  if (!checkAdminKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  await ensureTables(env.DB);
  const parsed = await readJson(request, 1024 * 1024);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const b = parsed.body || {};
  const db = env.DB;

  if (b.action === "signature") {
    if (typeof b.jpeg_base64 !== "string") return json({ ok: false, error: "jpeg_required" }, 400);
    let bytes;
    try { bytes = b64ToBytes(b.jpeg_base64); } catch (_e) { return json({ ok: false, error: "bad_base64" }, 400); }
    const info = jpegInfo(bytes);
    if (!info || bytes.length > 700 * 1024) return json({ ok: false, error: "jpeg_invalid" }, 400);
    await setSetting(db, "nda_signature_jpeg", b.jpeg_base64);
    return json({ ok: true, width: info.width, height: info.height, bytes: bytes.length });
  }

  if (b.action === "purge") {
    const days = Math.max(30, Number(b.older_than_days) || 180);
    const cutoff = new Date(Date.now() - days * DAY).toISOString();
    const r = await db.prepare("DELETE FROM discovery_requests WHERE expires_at < ?").bind(cutoff).run();
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0, cutoff });
  }

  const id = typeof b.id === "string" ? b.id.slice(0, 40) : "";
  const row = id && (await db.prepare("SELECT id FROM discovery_requests WHERE id = ?").bind(id).first());
  if (!row) return json({ ok: false, error: "not_found" }, 404);

  if (b.action === "extend") {
    const expires = expiryFromNow(b.days || 30);
    await db.prepare("UPDATE discovery_requests SET expires_at = ? WHERE id = ?").bind(expires, id).run();
    return json({ ok: true, id, expires_at: expires });
  }
  if (b.action === "delete") {
    await db.prepare("DELETE FROM discovery_requests WHERE id = ?").bind(id).run();
    return json({ ok: true, id });
  }
  return json({ ok: false, error: "unknown_action" }, 400);
}
