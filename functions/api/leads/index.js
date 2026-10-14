// GET /api/leads   (Header: X-PAIRA-KEY: <env.PAIRA_AUTOMATION_KEY>)
//
// Export of captured leads with scoring intel, for CRM backfill and review.
//   ?source=scorecard   (default: all sources)
//   ?since=2026-09-01   (created_at >= since, UTC)
//   ?stage=complete|partial
//   ?format=csv         (default: json)
//   ?limit=500          (max 2000)

import { analyze } from "../../../lib/lead-intel.js";
import { checkKey } from "../../../lib/lead-events.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet({ request, env }) {
  if (!checkKey(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const where = [];
  const binds = [];
  const source = url.searchParams.get("source");
  const since = url.searchParams.get("since");
  const stage = url.searchParams.get("stage");
  if (source) { where.push("source = ?"); binds.push(source); }
  if (since) { where.push("created_at >= ?"); binds.push(since); }
  if (stage) { where.push("stage = ?"); binds.push(stage); }
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit")) || 500));

  const sql =
    "SELECT * FROM leads" + (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY created_at DESC LIMIT " + limit;
  const res = await env.DB.prepare(sql).bind(...binds).all();
  const rows = (res && res.results) || [];

  const out = rows.map((r) => {
    const base = {
      id: r.id, created_at: r.created_at, updated_at: r.updated_at, source: r.source, stage: r.stage,
      name: r.name, email: r.email, org: r.org, title: r.title, phone: r.phone,
      lang: r.lang, country: r.country, kvkk_ok: r.kvkk_ok, news_ok: r.news_ok,
    };
    if (r.source !== "scorecard") return base;
    const i = analyze(r);
    return Object.assign(base, {
      heat: r.stage === "complete" ? i.heatLabel : "YARIM KALDI",
      score_pct: i.pct, tier: i.tier, segment: i.segmentLabel, size: i.size,
      priority: i.priority, wants_contact: i.wantsContact ? 1 : 0,
      reasons: i.reasons.join(" | "),
      open_doors: i.openDoors.map((d) => d.question).join(" | "),
    });
  });

  if (url.searchParams.get("format") === "csv") {
    const cols = ["id", "created_at", "stage", "heat", "name", "email", "phone", "org", "title", "segment",
      "size", "priority", "wants_contact", "score_pct", "tier", "reasons", "open_doors", "lang", "country",
      "news_ok", "source"];
    const lines = [cols.join(",")].concat(out.map((o) => cols.map((c) => csvCell(o[c])).join(",")));
    return new Response("﻿" + lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="paira-leads.csv"',
        "cache-control": "no-store",
      },
    });
  }
  return json({ ok: true, count: out.length, leads: out });
}
