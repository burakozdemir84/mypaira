// /api/discovery/admin   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//
// GET                 -> list of invites (no answers)
// GET ?id=<id>        -> one invite with answers
// POST { action: "create", org, contact_name, contact_email, meeting_at, days? }
//                     -> { id, url, expires_at }   url is shown once; only its hash is stored
// POST { action: "reissue", id }      -> new link, the old one stops working
// POST { action: "extend", id, days } -> new expiry, counted from now
// POST { action: "revoke" | "lock" | "unlock" | "delete", id }
// POST { action: "purge", older_than_days? = 180 }
//                     -> deletes invites whose expiry is older than N days

import {
  json, readJson, checkAdminKey, ensureTable, newToken, newId, sha256Hex,
  computeExpiry, nowIso,
} from "../../../lib/discovery.js";

const DAY = 24 * 60 * 60 * 1000;

function linkFor(request, env, token) {
  const base = env.SITE_URL || new URL(request.url).origin;
  return base.replace(/\/$/, "") + "/on-hazirlik#t=" + token;
}

function adminView(r, withAnswers) {
  const now = Date.now();
  let status = "aktif";
  if (r.revoked_at) status = "iptal";
  else if (Date.parse(r.expires_at) < now) status = "süresi doldu";
  else if (r.locked) status = "kilitli";
  const out = {
    id: r.id, org: r.org, contact_name: r.contact_name, contact_email: r.contact_email,
    meeting_at: r.meeting_at, expires_at: r.expires_at, created_at: r.created_at,
    status, open_count: r.open_count || 0, first_opened_at: r.first_opened_at,
    last_opened_at: r.last_opened_at, updated_at: r.updated_at,
    submitted_at: r.submitted_at, submit_count: r.submit_count || 0, version: r.version || 0,
  };
  if (withAnswers) {
    try { out.answers = r.answers_json ? JSON.parse(r.answers_json) : {}; } catch (_e) { out.answers = {}; }
  }
  return out;
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function onRequestGet({ request, env }) {
  if (!checkAdminKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  await ensureTable(env.DB);
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const r = await env.DB.prepare("SELECT * FROM discovery_invites WHERE id = ?").bind(id).first();
    if (!r) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, invite: adminView(r, true) });
  }
  const res = await env.DB
    .prepare("SELECT * FROM discovery_invites ORDER BY created_at DESC LIMIT 200")
    .all();
  return json({ ok: true, invites: ((res && res.results) || []).map((r) => adminView(r, false)) });
}

export async function onRequestPost({ request, env }) {
  if (!checkAdminKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  await ensureTable(env.DB);
  const parsed = await readJson(request);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const b = parsed.body || {};
  const db = env.DB;

  if (b.action === "create") {
    const org = clean(b.org, 160);
    if (!org) return json({ ok: false, error: "org_required" }, 400);
    const meetingAt = clean(b.meeting_at, 40);
    if (meetingAt && isNaN(Date.parse(meetingAt))) return json({ ok: false, error: "bad_meeting_at" }, 400);
    const token = newToken();
    const id = newId();
    const expires = computeExpiry(meetingAt ? new Date(meetingAt).toISOString() : "", b.days);
    await db
      .prepare(
        "INSERT INTO discovery_invites (id, token_hash, org, contact_name, contact_email, meeting_at, expires_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(id, await sha256Hex(token), org, clean(b.contact_name, 120), clean(b.contact_email, 160),
        meetingAt ? new Date(meetingAt).toISOString() : null, expires)
      .run();
    return json({ ok: true, id, url: linkFor(request, env, token), expires_at: expires });
  }

  if (b.action === "purge") {
    const days = Math.max(30, Number(b.older_than_days) || 180);
    const cutoff = new Date(Date.now() - days * DAY).toISOString();
    const r = await db.prepare("DELETE FROM discovery_invites WHERE expires_at < ?").bind(cutoff).run();
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0, cutoff });
  }

  const id = clean(b.id, 40);
  const row = id && (await db.prepare("SELECT * FROM discovery_invites WHERE id = ?").bind(id).first());
  if (!row) return json({ ok: false, error: "not_found" }, 404);

  switch (b.action) {
    case "reissue": {
      const token = newToken();
      const expires = Date.parse(row.expires_at) < Date.now() ? computeExpiry(row.meeting_at) : row.expires_at;
      await db
        .prepare("UPDATE discovery_invites SET token_hash = ?, revoked_at = NULL, expires_at = ? WHERE id = ?")
        .bind(await sha256Hex(token), expires, id)
        .run();
      return json({ ok: true, id, url: linkFor(request, env, token), expires_at: expires });
    }
    case "extend": {
      const expires = computeExpiry("", b.days || 7);
      await db.prepare("UPDATE discovery_invites SET expires_at = ?, revoked_at = NULL WHERE id = ?").bind(expires, id).run();
      return json({ ok: true, id, expires_at: expires });
    }
    case "revoke":
      await db.prepare("UPDATE discovery_invites SET revoked_at = ? WHERE id = ?").bind(nowIso(), id).run();
      return json({ ok: true, id });
    case "lock":
    case "unlock":
      await db.prepare("UPDATE discovery_invites SET locked = ? WHERE id = ?").bind(b.action === "lock" ? 1 : 0, id).run();
      return json({ ok: true, id });
    case "delete":
      await db.prepare("DELETE FROM discovery_invites WHERE id = ?").bind(id).run();
      return json({ ok: true, id });
    default:
      return json({ ok: false, error: "unknown_action" }, 400);
  }
}
