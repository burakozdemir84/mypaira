#!/usr/bin/env bash
# Redeploy the PAIRA site (static pages + the /api/lead Pages Function) to
# Cloudflare Pages.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN='...'      # account-scoped token with Pages:Edit + D1:Edit
#   ./deploy.sh
#
# The token is not stored in this file. Do not commit it.
#
# This uses the config form (`wrangler pages deploy`, no path arg) so the D1
# binding declared in wrangler.toml ships with the deployment. Run ./setup-d1.sh
# once first so wrangler.toml has a real database_id.

set -euo pipefail

ACCOUNT_ID='60153cf9393ce1866334788c1357bb53'
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Two ways to authenticate:
#   1. `npx wrangler@4 login` once (OAuth, cached in a platform config dir — see
#      below). Keeps the token out of shell history, but needs a browser.
#   2. export CLOUDFLARE_API_TOKEN='...' for CI or a non-interactive deploy.
# An API token, when present, takes precedence over a cached OAuth session.
# wrangler resolves its OAuth session dir in this order: ~/.wrangler if it exists
# (legacy, wins), else $XDG_CONFIG_HOME/.wrangler, else the platform default —
# ~/Library/Preferences/.wrangler on macOS, ~/.config/.wrangler on Linux. It is NOT
# ~/.wrangler on a stock Mac, so checking only that path rejects a valid login.
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  have_oauth=0
  for d in "$HOME/.wrangler" "${XDG_CONFIG_HOME:-}/.wrangler" \
           "$HOME/Library/Preferences/.wrangler" "$HOME/.config/.wrangler"; do
    [[ -f "$d/config/default.toml" ]] && have_oauth=1 && break
  done
  if [[ $have_oauth -eq 0 ]]; then
    echo "ERROR: no Cloudflare credentials found." >&2
    echo "  Either run:  npx wrangler@4 login" >&2
    echo "  or export:   CLOUDFLARE_API_TOKEN='your-token-here'" >&2
    echo "  See AGENTS.md section 5." >&2
    exit 1
  fi
  # A session file on disk does not mean the credentials still work. `whoami --json`
  # exits non-zero when unauthenticated; that is the real gate.
  if ! npx --yes wrangler@4 whoami --json >/dev/null 2>&1; then
    echo "ERROR: a cached wrangler login exists but is not valid (expired or revoked)." >&2
    echo "  Run:         npx wrangler@4 login" >&2
    echo "  or export:   CLOUDFLARE_API_TOKEN='your-token-here'" >&2
    echo "  See AGENTS.md section 5." >&2
    exit 1
  fi
fi
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
export WRANGLER_SEND_METRICS=false

if grep -q 'PLACEHOLDER_FILLED_BY_SETUP' "$REPO/wrangler.toml"; then
  echo "ERROR: wrangler.toml still has a placeholder database_id." >&2
  echo "  Run ./setup-d1.sh first (it creates the D1 db and fills the id in)." >&2
  exit 1
fi

# wrangler caches into the nearest node_modules/.cache. Ensure a writable one
# exists inside the repo so it never walks up to a directory it cannot write.
mkdir -p "$REPO/node_modules/.cache"

# Strip macOS metadata files; they would otherwise ship as site assets.
find "$REPO/site" -name '.DS_Store' -delete 2>/dev/null || true

cd "$REPO"
echo "Deploying (static + Functions + D1 binding) -> Cloudflare Pages project 'paira'"
npx --yes wrangler@4 pages deploy \
  --project-name="paira" \
  --branch=main \
  --commit-dirty=true

echo
echo "Done. Live at:"
echo "  https://paira-2hm.pages.dev"
echo "  https://www.mypaira.com"
echo
echo "Verify the lead pipeline:"
echo "  npx wrangler@4 d1 execute paira_leads --remote --command \"SELECT created_at,source,stage,email,score_pct,tier FROM leads ORDER BY created_at DESC LIMIT 20\""
