// GET /api/discovery/nda   (Header: X-Invite-Token)
// The PAIRA-signed confidentiality agreement, filled with the company's details.

import { json, readToken, ensureTables, loadByToken, ndaResponse } from "../../../lib/discovery.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "server" }, 500);
  await ensureTables(env.DB);
  const r = await loadByToken(env.DB, readToken(request));
  if (r.error) return json({ ok: false, error: r.error }, r.status);
  return ndaResponse(env, request, r.row);
}
