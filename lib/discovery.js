// Pre-meeting discovery ("Ön Hazırlık"): shared helpers.
//
// Flow (see docs/ON_HAZIRLIK.md):
//   1. The company enters its details on /on-hazirlik (public page).
//   2. A PAIRA-signed confidentiality agreement is generated with those
//      details and offered as a PDF (and e-mailed through the Make webhook).
//   3. The 10-question form opens. The page address carries a personal token
//      in the URL fragment (#t=...), so the company can return to it later.
//   Only a hash of the token is stored.

import { fillNda } from "./nda-pdf.js";

export const MAX_BODY_BYTES = 48 * 1024;
const MAX_TEXT = 2000;
const MAX_SHORT = 200;
const DAY = 24 * 60 * 60 * 1000;

// The only answer keys the server accepts. Anything else is dropped.
// type: text (long), short, list (array of short strings), tri (var/yok/bilmiyorum), flag (bool)
export const ANSWER_SCHEMA = {
  filled_by: "short",
  filled_role: "short",
  q1_process: "text",
  q1_later: "flag",
  q2_roles: "text",
  q2_later: "flag",
  q3_volume: "short",
  q3_time: "short",
  q3_bottleneck: "text",
  q3_later: "flag",
  q4_ready: "list",
  q4_note: "text",
  q5_systems: "list",
  q5_other: "text",
  q5_owner: "short",
  q6_azure: "tri",
  q6_api: "tri",
  q6_cloud_limits: "tri",
  q6_note: "text",
  q7_target: "text",
  q7_later: "flag",
  q8_success: "text",
  q8_golive: "short",
  q8_pilot: "short",
  q9_cost: "text",
  q9_verbal: "flag",
  q10_decision: "text",
  q10_budget: "short",
  q10_reps: "short",
  q_other: "text",
};

const TRI = new Set(["var", "yok", "bilmiyorum", ""]);

export function sanitizeAnswers(input) {
  const out = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [key, type] of Object.entries(ANSWER_SCHEMA)) {
    const v = input[key];
    if (v == null) continue;
    if (type === "text" || type === "short") {
      if (typeof v !== "string") continue;
      const s = v.replace(/\u0000/g, "").trim();
      if (s) out[key] = s.slice(0, type === "text" ? MAX_TEXT : MAX_SHORT);
    } else if (type === "list") {
      if (!Array.isArray(v)) continue;
      const items = v
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => x.trim().slice(0, 100))
        .slice(0, 20);
      if (items.length) out[key] = items;
    } else if (type === "tri") {
      if (typeof v === "string" && TRI.has(v) && v) out[key] = v;
    } else if (type === "flag") {
      if (v === true) out[key] = true;
    }
  }
  return out;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      ...extra,
    },
  });
}

export async function readJson(request, max = MAX_BODY_BYTES) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > max) return { error: "too_large" };
  const text = await request.text();
  if (text.length > max) return { error: "too_large" };
  try {
    return { body: JSON.parse(text || "{}") };
  } catch (_e) {
    return { error: "bad_json" };
  }
}

// ---- crypto -------------------------------------------------------------

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b64url(b);
}

export function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return b64url(b);
}

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Constant-time compare of two strings of possibly different length.
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

// Admin access: the page's own key (DISCOVERY_ADMIN_KEY) or the automation
// key used by Make (PAIRA_AUTOMATION_KEY). The scorecard-only LEADS_KEY is not accepted.
export function checkAdminKey(request, env) {
  const key = request.headers.get("X-PAIRA-KEY") || "";
  if (!key) return false;
  return (!!env.DISCOVERY_ADMIN_KEY && safeEqual(key, env.DISCOVERY_ADMIN_KEY)) ||
    (!!env.PAIRA_AUTOMATION_KEY && safeEqual(key, env.PAIRA_AUTOMATION_KEY));
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function readToken(request) {
  const t = request.headers.get("X-Invite-Token") || "";
  return TOKEN_RE.test(t) ? t : "";
}

// ---- storage -------------------------------------------------------------

export async function ensureTables(db) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS discovery_requests (" +
        "id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, " +
        "org TEXT, address TEXT, contact_name TEXT, contact_title TEXT, contact_email TEXT, phone TEXT, " +
        "nda_date TEXT, ip_hash TEXT, expires_at TEXT NOT NULL, " +
        "created_at TEXT DEFAULT (datetime('now')), " +
        "first_opened_at TEXT, last_opened_at TEXT, open_count INTEGER DEFAULT 0, " +
        "answers_json TEXT, version INTEGER DEFAULT 0, updated_at TEXT, " +
        "submitted_at TEXT, submit_count INTEGER DEFAULT 0)"
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_discovery_ip ON discovery_requests(ip_hash, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS discovery_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)"),
  ]);
}

export function nowIso() {
  return new Date().toISOString();
}

export const ACCESS_DAYS = 60;
export function expiryFromNow(days = ACCESS_DAYS) {
  return new Date(Date.now() + Math.min(180, Math.max(1, Number(days) || ACCESS_DAYS)) * DAY).toISOString();
}

// Returns { row } or { error, status } for a token-bearing request.
export async function loadByToken(db, token) {
  if (!token) return { error: "invalid", status: 401 };
  const row = await db.prepare("SELECT * FROM discovery_requests WHERE token_hash = ?").bind(await sha256Hex(token)).first();
  if (!row) return { error: "invalid", status: 401 };
  if (Date.parse(row.expires_at) < Date.now()) return { error: "expired", status: 410 };
  return { row };
}

export async function getSetting(db, key) {
  const r = await db.prepare("SELECT value FROM discovery_settings WHERE key = ?").bind(key).first();
  return r ? r.value : null;
}

export async function setSetting(db, key, value) {
  await db
    .prepare("INSERT INTO discovery_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, value, nowIso())
    .run();
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function publicView(r) {
  let answers = {};
  try { answers = r.answers_json ? JSON.parse(r.answers_json) : {}; } catch (_e) { answers = {}; }
  return {
    org: r.org || "",
    address: r.address || "",
    contact_name: r.contact_name || "",
    contact_title: r.contact_title || "",
    contact_email: r.contact_email || "",
    nda_date: r.nda_date || "",
    expires_at: r.expires_at,
    version: r.version || 0,
    updated_at: r.updated_at || null,
    submitted_at: r.submitted_at || null,
    answers,
  };
}

export async function notify(env, payload) {
  if (!env.DISCOVERY_WEBHOOK_URL) return { ok: false, skipped: true };
  try {
    const r = await fetch(env.DISCOVERY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    console.error("discovery: webhook failed", err);
    return { ok: false, error: String(err) };
  }
}

// ---- NDA -----------------------------------------------------------------


let templateCache = null;
async function loadTemplate(env, request) {
  if (templateCache) return templateCache;
  const r = await env.ASSETS.fetch(new URL("/assets/nda/paira-nda-sablon.pdf", request.url));
  if (!r.ok) throw new Error("template_unavailable");
  templateCache = new Uint8Array(await r.arrayBuffer());
  return templateCache;
}

export function slug(s) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };
  return String(s || "")
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c])
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Sirket";
}

// Returns a PDF Response for a stored request row, or a JSON error.
export async function ndaResponse(env, request, row) {
  const sig = await getSetting(env.DB, "nda_signature_jpeg");
  if (!sig) return json({ ok: false, error: "signature_missing" }, 503);
  let pdf;
  try {
    pdf = fillNda(await loadTemplate(env, request), b64ToBytes(sig), {
      unvan: row.org, adres: row.address, eposta: row.contact_email,
    });
  } catch (err) {
    console.error("discovery: nda failed", err);
    return json({ ok: false, error: "nda_failed" }, 500);
  }
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="PAIRA_Gizlilik_Sozlesmesi_${slug(row.org)}.pdf"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
