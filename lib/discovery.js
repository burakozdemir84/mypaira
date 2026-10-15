// Pre-meeting discovery form ("Ön Hazırlık Formu"): shared helpers.
//
// Access model (see docs/ON_HAZIRLIK.md):
//   - Every meeting gets its own invite. The invite link carries a 256-bit
//     random token in the URL fragment (#t=...), so it never reaches server
//     logs, proxies or Referer headers. The page sends it in X-Invite-Token.
//   - Only the SHA-256 hash of the token is stored. A leaked database does not
//     leak working links.
//   - Invites expire (default: 3 days after the meeting), can be revoked or
//     extended, and are locked by the admin when needed.
//   - Writes use optimistic locking (version), so two colleagues editing the
//     same link cannot silently overwrite each other.

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

export async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return { error: "too_large" };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: "too_large" };
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

// Admin access: only the automation key (not the scorecard-only LEADS_KEY).
export function checkAdminKey(request, env) {
  const key = request.headers.get("X-PAIRA-KEY") || "";
  if (!key || !env.PAIRA_AUTOMATION_KEY) return false;
  return safeEqual(key, env.PAIRA_AUTOMATION_KEY);
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function readToken(request) {
  const t = request.headers.get("X-Invite-Token") || "";
  return TOKEN_RE.test(t) ? t : "";
}

// ---- storage -------------------------------------------------------------

export async function ensureTable(db) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS discovery_invites (" +
        "id TEXT PRIMARY KEY, " +
        "token_hash TEXT UNIQUE NOT NULL, " +
        "org TEXT, contact_name TEXT, contact_email TEXT, " +
        "meeting_at TEXT, expires_at TEXT NOT NULL, " +
        "created_at TEXT DEFAULT (datetime('now')), " +
        "revoked_at TEXT, locked INTEGER DEFAULT 0, " +
        "first_opened_at TEXT, last_opened_at TEXT, open_count INTEGER DEFAULT 0, " +
        "answers_json TEXT, version INTEGER DEFAULT 0, updated_at TEXT, " +
        "submitted_at TEXT, submit_count INTEGER DEFAULT 0, note TEXT)"
    )
    .run();
}

export function nowIso() {
  return new Date().toISOString();
}

// Default expiry: 3 days after the meeting; 21 days from now if no meeting
// date; never more than 60 days out.
export function computeExpiry(meetingAt, days) {
  const now = Date.now();
  let t;
  if (days) t = now + Math.min(60, Math.max(1, Number(days))) * DAY;
  else if (meetingAt && !isNaN(Date.parse(meetingAt))) t = Date.parse(meetingAt) + 3 * DAY;
  else t = now + 21 * DAY;
  t = Math.min(t, now + 60 * DAY);
  t = Math.max(t, now + DAY);
  return new Date(t).toISOString();
}

// Returns { invite } or { error, status } for a token-bearing request.
export async function loadInviteByToken(db, token) {
  if (!token) return { error: "invalid", status: 401 };
  const hash = await sha256Hex(token);
  const inv = await db.prepare("SELECT * FROM discovery_invites WHERE token_hash = ?").bind(hash).first();
  if (!inv) return { error: "invalid", status: 401 };
  if (inv.revoked_at) return { error: "revoked", status: 410 };
  if (Date.parse(inv.expires_at) < Date.now()) return { error: "expired", status: 410 };
  return { invite: inv };
}

export function publicView(inv) {
  let answers = {};
  try { answers = inv.answers_json ? JSON.parse(inv.answers_json) : {}; } catch (_e) { answers = {}; }
  return {
    org: inv.org || "",
    contact_name: inv.contact_name || "",
    meeting_at: inv.meeting_at || null,
    expires_at: inv.expires_at,
    locked: !!inv.locked,
    version: inv.version || 0,
    updated_at: inv.updated_at || null,
    submitted_at: inv.submitted_at || null,
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
