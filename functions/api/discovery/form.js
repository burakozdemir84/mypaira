// /api/discovery/form   (Header: X-Invite-Token)
//
// GET   -> company details, NDA date and saved answers
// PUT   -> autosave a draft          Body: { answers, version }
// POST  -> submit (notifies Make)    Body: { answers, version }
//
// `version` prevents two colleagues from silently overwriting each other:
// a stale write gets 409 with the latest copy and the page merges.

import {
  json, readJson, readToken, ensureTables, loadByToken, publicView, sanitizeAnswers, nowIso, notify,
} from "../../../lib/discovery.js";
import { submittedNotify } from "../../../lib/discovery-mail.js";

async function context(request, env) {
  if (!env.DB) return { res: json({ ok: false, error: "server" }, 500) };
  await ensureTables(env.DB);
  const r = await loadByToken(env.DB, readToken(request));
  if (r.error) return { res: json({ ok: false, error: r.error }, r.status) };
  return { row: r.row };
}

export async function onRequestGet({ request, env }) {
  const c = await context(request, env);
  if (c.res) return c.res;
  const now = nowIso();
  await env.DB
    .prepare("UPDATE discovery_requests SET open_count = open_count + 1, last_opened_at = ?, first_opened_at = COALESCE(first_opened_at, ?) WHERE id = ?")
    .bind(now, now, c.row.id)
    .run();
  return json({ ok: true, ...publicView(c.row) });
}

async function save(ctx, submit) {
  const { request, env } = ctx;
  const c = await context(request, env);
  if (c.res) return c.res;
  const row = c.row;
  const parsed = await readJson(request);
  if (parsed.error) return json({ ok: false, error: parsed.error }, parsed.error === "too_large" ? 413 : 400);
  const body = parsed.body || {};
  const answers = sanitizeAnswers(body.answers);
  const expected = Number(body.version);
  if (!Number.isInteger(expected)) return json({ ok: false, error: "version_required" }, 400);

  const now = nowIso();
  const answersJson = JSON.stringify(answers);
  const r = submit
    ? await env.DB.prepare(
        "UPDATE discovery_requests SET answers_json = ?, version = version + 1, updated_at = ?, submitted_at = ?, submit_count = submit_count + 1 WHERE id = ? AND version = ?"
      ).bind(answersJson, now, now, row.id, expected).run()
    : await env.DB.prepare(
        "UPDATE discovery_requests SET answers_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?"
      ).bind(answersJson, now, row.id, expected).run();

  if (!r.meta || r.meta.changes === 0) {
    const latest = await env.DB.prepare("SELECT * FROM discovery_requests WHERE id = ?").bind(row.id).first();
    return json({ ok: false, error: "conflict", latest: publicView(latest) }, 409);
  }

  if (submit) {
    const updated = !!row.submitted_at;
    const origin = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const send = notify(env, {
      event: updated ? "discovery_updated" : "discovery_submitted",
      id: row.id, org: row.org, contact_name: row.contact_name, contact_email: row.contact_email,
      submitted_at: now, answers,
      emails: { notify: submittedNotify(row, answers, updated, origin + "/on-hazirlik-yonetim") },
    });
    try {
      const p = send.catch((e) => console.error("discovery: notify", e));
      if (typeof ctx.waitUntil === "function") ctx.waitUntil(p); else await p;
    } catch (e) {
      console.error("discovery: notify scheduling failed", e);
    }
  }
  return json({ ok: true, version: expected + 1, updated_at: now, submitted_at: submit ? now : row.submitted_at || null });
}

export const onRequestPut = (ctx) => save(ctx, false);
export const onRequestPost = (ctx) => save(ctx, true);
