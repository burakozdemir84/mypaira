// POST /api/leads/replay   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//
// Backfill: sends completed Scorecard leads that were never alerted (for
// example everything captured before lead alerts existed) through the same
// webhook, marked replay: true. By default the lead does NOT get a report
// e-mail on replay; only the internal notification and the CRM record.
//
// Body (JSON, all optional):
//   { "since": "2026-09-01", "with_report": false, "dry": true }

import { buildEvent } from "../../../lib/lead-intel.js";
import { checkKey, deliverOnce, ensureEventsTable } from "../../../lib/lead-events.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!checkKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch (_e) { body = {}; }
  const since = typeof body.since === "string" ? body.since : "2000-01-01";

  await ensureEventsTable(env.DB);
  const res = await env.DB.prepare(
    "SELECT * FROM leads WHERE source = 'scorecard' AND stage = 'complete' AND created_at >= ? " +
      "AND client_id NOT IN (SELECT client_id FROM lead_events WHERE event = 'scorecard.completed') " +
      "ORDER BY created_at ASC LIMIT 200"
  )
    .bind(since)
    .all();
  const rows = (res && res.results) || [];

  if (body.dry) return json({ ok: true, dry: true, count: rows.length, leads: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, org: r.org, score_pct: r.score_pct, created_at: r.created_at })) });
  if (!env.LEAD_WEBHOOK_URL) return json({ ok: false, error: "LEAD_WEBHOOK_URL not set" }, 500);

  let sent = 0, failed = 0;
  for (const r of rows) {
    const ev = buildEvent(r, "completed", { replay: true, withReport: !!body.with_report });
    const d = await deliverOnce(env, r.client_id, "scorecard.completed", ev);
    if (d.ok && !d.duplicate) sent++;
    else if (!d.ok) failed++;
  }
  return json({ ok: failed === 0, found: rows.length, sent, failed });
}
