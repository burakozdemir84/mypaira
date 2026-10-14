// Delivery of lead events to Make.com (env.LEAD_WEBHOOK_URL), sent at most once
// per (client_id, event). The `lead_events` table is the ledger; a failed
// delivery releases its claim so a later sweep or replay can try again.

export async function ensureEventsTable(db) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS lead_events (" +
        "client_id TEXT NOT NULL, event TEXT NOT NULL, " +
        "created_at TEXT DEFAULT (datetime('now')), " +
        "PRIMARY KEY (client_id, event))"
    )
    .run();
}

// Returns true when this call owns the event (it was not sent before).
export async function claimEvent(db, clientId, event) {
  const r = await db
    .prepare("INSERT OR IGNORE INTO lead_events (client_id, event) VALUES (?, ?)")
    .bind(clientId, event)
    .run();
  return !!(r && r.meta && r.meta.changes > 0);
}

export async function releaseEvent(db, clientId, event) {
  await db
    .prepare("DELETE FROM lead_events WHERE client_id = ? AND event = ?")
    .bind(clientId, event)
    .run();
}

export async function postWebhook(env, payload) {
  if (!env.LEAD_WEBHOOK_URL) return { ok: false, skipped: true };
  try {
    const r = await fetch(env.LEAD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    console.error("lead-events: webhook failed", err);
    return { ok: false, error: String(err) };
  }
}

// Claim, send, release on failure. Returns the delivery result.
export async function deliverOnce(env, clientId, event, payload) {
  const db = env.DB;
  await ensureEventsTable(db);
  if (!(await claimEvent(db, clientId, event))) return { ok: true, duplicate: true };
  const res = await postWebhook(env, payload);
  if (!res.ok) await releaseEvent(db, clientId, event);
  return res;
}

// Accepts the lead-only key (LEADS_KEY, used by the lead Make account) or the
// general automation key (PAIRA_AUTOMATION_KEY). Separate keys keep each Make
// account limited to what it needs.
export function checkKey(request, env) {
  const key = request.headers.get("X-PAIRA-KEY") || "";
  if (!key) return false;
  return (!!env.LEADS_KEY && key === env.LEADS_KEY) ||
    (!!env.PAIRA_AUTOMATION_KEY && key === env.PAIRA_AUTOMATION_KEY);
}
