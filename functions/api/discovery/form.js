// /api/discovery/form   (Header: X-Invite-Token: <token from the invite link>)
//
// GET   -> current invite view and saved answers (counts an "open")
// PUT   -> autosave a draft          Body: { answers, version }
// POST  -> submit (notifies Burak)   Body: { answers, version }
//
// version is optimistic locking: if someone else saved in the meantime the
// server answers 409 with the latest copy, and the page asks the user to
// review before saving again.

import {
  json, readJson, readToken, ensureTable, loadInviteByToken,
  publicView, sanitizeAnswers, nowIso, notify,
} from "../../../lib/discovery.js";

const MESSAGES = { invalid: 401, revoked: 410, expired: 410 };

async function context(request, env) {
  if (!env.DB) return { res: json({ ok: false, error: "server" }, 500) };
  await ensureTable(env.DB);
  const r = await loadInviteByToken(env.DB, readToken(request));
  if (r.error) return { res: json({ ok: false, error: r.error }, MESSAGES[r.error] || 401) };
  return { invite: r.invite };
}

export async function onRequestGet({ request, env }) {
  const c = await context(request, env);
  if (c.res) return c.res;
  const now = nowIso();
  await env.DB
    .prepare(
      "UPDATE discovery_invites SET open_count = open_count + 1, last_opened_at = ?, " +
        "first_opened_at = COALESCE(first_opened_at, ?) WHERE id = ?"
    )
    .bind(now, now, c.invite.id)
    .run();
  return json({ ok: true, ...publicView(c.invite) });
}

async function save(request, env, submit) {
  const c = await context(request, env);
  if (c.res) return c.res;
  const inv = c.invite;
  if (inv.locked) return json({ ok: false, error: "locked" }, 423);

  const parsed = await readJson(request);
  if (parsed.error) return json({ ok: false, error: parsed.error }, parsed.error === "too_large" ? 413 : 400);
  const body = parsed.body || {};
  const answers = sanitizeAnswers(body.answers);
  const expected = Number(body.version);
  if (!Number.isInteger(expected)) return json({ ok: false, error: "version_required" }, 400);

  const now = nowIso();
  const answersJson = JSON.stringify(answers);
  const sql = submit
    ? "UPDATE discovery_invites SET answers_json = ?, version = version + 1, updated_at = ?, " +
      "submitted_at = ?, submit_count = submit_count + 1 WHERE id = ? AND version = ?"
    : "UPDATE discovery_invites SET answers_json = ?, version = version + 1, updated_at = ? " +
      "WHERE id = ? AND version = ?";
  const binds = submit
    ? [answersJson, now, now, inv.id, expected]
    : [answersJson, now, inv.id, expected];
  const r = await env.DB.prepare(sql).bind(...binds).run();

  if (!r.meta || r.meta.changes === 0) {
    const latest = await env.DB.prepare("SELECT * FROM discovery_invites WHERE id = ?").bind(inv.id).first();
    return json({ ok: false, error: "conflict", latest: publicView(latest) }, 409);
  }

  const version = expected + 1;
  if (submit) {
    await notify(env, {
      event: inv.submitted_at ? "discovery_updated" : "discovery_submitted",
      invite_id: inv.id,
      org: inv.org,
      contact_name: inv.contact_name,
      contact_email: inv.contact_email,
      meeting_at: inv.meeting_at,
      submitted_at: now,
      answers,
    });
  }
  return json({ ok: true, version, updated_at: now, submitted_at: submit ? now : inv.submitted_at || null });
}

export const onRequestPut = ({ request, env }) => save(request, env, false);
export const onRequestPost = ({ request, env }) => save(request, env, true);
