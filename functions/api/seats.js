// Cloudflare Pages Function: /api/seats
//
// Kontenjan sayacı. Make.com her iyzilink satışından sonra POST atar; sayfalar
// GET ile kalan kontenjanı okur.
//
// GET  /api/seats?event=ai-agents-2026-10-27
//      -> { ok, event, capacity, sold, remaining }
//
// POST /api/seats   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//      Body: { "event": "ai-agents-2026-10-27", "paymentNo": "4218335585" }
//      -> { ok, event, capacity, sold, remaining, isNew }
//      Aynı ödeme numarası ikinci kez gelirse sayılmaz (isNew: false).
//      İade ya da test kaydını düşmek için: { "event": "...", "paymentNo": "...", "remove": true }
//
// Kişisel veri saklanmaz: yalnızca etkinlik kodu ve ödeme numarası tutulur.
// Alıcı bilgileri Notion'da durur.
//
// Binding: env.DB (D1, paira_leads). Tablo ilk istekte oluşturulur.

const EVENTS = {
  "ai-agents-2026-10-27": { capacity: 30 },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function ensureTable(db) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS seat_sales (" +
        "event TEXT NOT NULL, payment_no TEXT NOT NULL, " +
        "created_at TEXT DEFAULT (datetime('now')), " +
        "PRIMARY KEY (event, payment_no))"
    )
    .run();
}

async function summary(db, event) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM seat_sales WHERE event = ?")
    .bind(event)
    .first();
  const sold = Number((row && row.n) || 0);
  const capacity = EVENTS[event].capacity;
  return { ok: true, event, capacity, sold, remaining: Math.max(0, capacity - sold) };
}

export async function onRequestGet({ request, env }) {
  const event = new URL(request.url).searchParams.get("event") || "";
  if (!EVENTS[event]) return json({ ok: false, error: "unknown event" }, 404);
  if (!env.DB) return json({ ok: false, error: "db binding missing" }, 500);
  try {
    await ensureTable(env.DB);
    return json(await summary(env.DB, event));
  } catch (e) {
    return json({ ok: false, error: "db error" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.PAIRA_AUTOMATION_KEY || request.headers.get("x-paira-key") !== env.PAIRA_AUTOMATION_KEY) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!env.DB) return json({ ok: false, error: "db binding missing" }, 500);
  let input;
  try { input = await request.json(); } catch (_e) { return json({ ok: false, error: "invalid json" }, 400); }
  const event = String(input.event || "").trim();
  const paymentNo = String(input.paymentNo || "").replace(/\D/g, "");
  if (!EVENTS[event]) return json({ ok: false, error: "unknown event" }, 404);
  if (!paymentNo) return json({ ok: false, error: "paymentNo required" }, 400);
  try {
    await ensureTable(env.DB);
    if (input.remove === true) {
      const d = await env.DB
        .prepare("DELETE FROM seat_sales WHERE event = ? AND payment_no = ?")
        .bind(event, paymentNo)
        .run();
      return json({ ...(await summary(env.DB, event)), removed: !!(d && d.meta && d.meta.changes > 0) });
    }
    const r = await env.DB
      .prepare("INSERT OR IGNORE INTO seat_sales (event, payment_no) VALUES (?, ?)")
      .bind(event, paymentNo)
      .run();
    const isNew = !!(r && r.meta && r.meta.changes > 0);
    return json({ ...(await summary(env.DB, event)), isNew });
  } catch (e) {
    return json({ ok: false, error: "db error" }, 500);
  }
}
