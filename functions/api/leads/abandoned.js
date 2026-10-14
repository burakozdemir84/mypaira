// POST /api/leads/abandoned   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//
// Sweep for Scorecard leads who left their details but did not finish.
// A Make.com scheduled scenario calls this hourly. Each lead found is sent
// once to env.LEAD_WEBHOOK_URL as event "scorecard.abandoned" (internal
// notification only, nothing goes to the lead).
//
//   ?minutes=60  minimum idle time before a partial counts as abandoned
//   ?days=14     ignore partials older than this (raise once for a backfill)
//   ?dry=1       list what would be sent, send nothing

import { buildEvent } from "../../../lib/lead-intel.js";
import { checkKey, deliverOnce, ensureEventsTable } from "../../../lib/lead-events.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function run({ request, env }) {
  if (!checkKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const minutes = Math.max(15, Number(url.searchParams.get("minutes")) || 60);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 14));
  const dry = url.searchParams.get("dry") === "1";

  await ensureEventsTable(env.DB);
  const res = await env.DB.prepare(
    "SELECT * FROM leads WHERE source = 'scorecard' AND stage = 'partial' AND email <> '' " +
      "AND updated_at <= datetime('now', ?) AND created_at >= datetime('now', ?) " +
      "AND client_id NOT IN (SELECT client_id FROM lead_events WHERE event = 'scorecard.abandoned') " +
      // same person finished another attempt under a new client_id: not abandoned
      "AND lower(email) NOT IN (SELECT lower(email) FROM leads WHERE source = 'scorecard' AND stage = 'complete') " +
      "ORDER BY created_at ASC LIMIT 50"
  )
    .bind("-" + minutes + " minutes", "-" + days + " days")
    .all();
  const rows = (res && res.results) || [];

  if (dry) return json({ ok: true, dry: true, count: rows.length, leads: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, org: r.org, created_at: r.created_at })) });
  if (!env.LEAD_WEBHOOK_URL) return json({ ok: false, error: "LEAD_WEBHOOK_URL not set" }, 500);

  let sent = 0, failed = 0;
  for (const r of rows) {
    const d = await deliverOnce(env, r.client_id, "scorecard.abandoned", buildEvent(r, "abandoned"));
    if (d.ok && !d.duplicate) sent++;
    else if (!d.ok) failed++;
  }
  return json({ ok: failed === 0, found: rows.length, sent, failed });
}

export const onRequestPost = run;
export const onRequestGet = run;
