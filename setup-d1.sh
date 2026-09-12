#!/usr/bin/env bash
# One-shot: create the D1 database, wire its id into wrangler.toml, and apply
# the schema to the REMOTE (production) database.
#
# Run once, before the first ./deploy.sh that ships the /api/lead Function.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'   # needs D1:Edit + Pages:Edit
#   ./setup-d1.sh
#
# Safe to re-run: if the database exists it re-reads the id and re-applies the
# idempotent migration.

set -euo pipefail

ACCOUNT_ID='60153cf9393ce1866334788c1357bb53'
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set." >&2
  echo "  export CLOUDFLARE_API_TOKEN='your-token-here'" >&2
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
export WRANGLER_SEND_METRICS=false

# wrangler caches into the nearest node_modules/.cache. Ensure a writable one
# exists inside the repo so it never walks up to a directory it cannot write.
mkdir -p "$REPO/node_modules/.cache"
cd "$REPO"

echo "==> Creating D1 database 'paira_leads' (ignored if it already exists)…"
CREATE_OUT="$(npx --yes wrangler@4 d1 create paira_leads 2>&1 || true)"
echo "$CREATE_OUT"

# Pull the database_id (a uuid) out of the create output, or fall back to `d1 info`.
DBID="$(printf '%s' "$CREATE_OUT" | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
if [[ -z "$DBID" ]]; then
  DBID="$(npx --yes wrangler@4 d1 info paira_leads 2>/dev/null | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
fi
if [[ -z "$DBID" ]]; then
  echo "ERROR: could not determine the database_id. Run 'npx wrangler@4 d1 info paira_leads' and paste it into wrangler.toml manually." >&2
  exit 1
fi
echo "==> database_id = $DBID"

echo "==> Writing database_id into wrangler.toml…"
sed -i '' "s|database_id = \".*\"|database_id = \"$DBID\"|" wrangler.toml
grep 'database_id' wrangler.toml

echo "==> Applying schema to the REMOTE database…"
npx --yes wrangler@4 d1 execute paira_leads --remote --file=migrations/0001_leads.sql

echo
echo "D1 is ready."
echo "Next:"
echo "  1. (optional, for the Google Sheet) add the webhook secret:"
echo "       npx wrangler@4 pages secret put SHEET_WEBHOOK_URL --project-name=paira"
echo "  2. ship it:  ./deploy.sh"
