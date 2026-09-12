# AGENTS.md — operating guide for this repo

Read this before touching anything. It is written for an AI coding assistant working on
this repo, and for the developer supervising it. `README.md` describes the site's design
and content; `DEPLOY.md` is the deployment and DNS runbook. This file is the short path
from "change a page" to "it is live".

---

## 1. What this is

A bilingual (TR/EN) static marketing site with one serverless endpoint, hosted on
Cloudflare Pages.

| | |
|---|---|
| Live site | https://www.mypaira.com (apex `mypaira.com` redirects to `www`) |
| Pages preview URL | https://paira-2hm.pages.dev |
| Cloudflare Pages project | `paira` |
| Cloudflare account id | `60153cf9393ce1866334788c1357bb53` |
| Account owner | `Burakozdemir84@hotmail.com` — ask this person for access |
| Build output dir | `site/` (declared in `wrangler.toml`) |
| Serverless endpoint | `POST /api/lead` → `functions/api/lead.js` |
| Database | Cloudflare D1, `paira_leads`, bound as `env.DB` |
| Registrar / DNS | GoDaddy |
| Mail | Microsoft 365 via GoDaddy — **DNS mail records must never be touched** |

There is **no build step**. `site/` is shipped as-is. There is no framework, no bundler,
no `npm run build`. `node_modules/` exists only to give wrangler a writable cache dir.

**This repo is not under version control.** There is no git history and no remote. It is
the only copy of the source for a live production site. Initialise a repo and push it
somewhere private before making changes.

---

## 2. Rules that will break production if ignored

1. **Never edit `site/support.js`.** It is a compiled artifact of a separate design-tool
   runtime (`dc-runtime`) whose source is *not* in this bundle. Every page depends on it
   and it cannot be regenerated from here. If it breaks, every page renders blank.
2. **Never touch the mail DNS records.** `MX`, `SPF`, `_dmarc`, `autodiscover`, `msoid`,
   `lyncdiscover`, `email`, `_domainconnect`. Breaking these takes down the client's
   email. The full list and the rollback values are in `DEPLOY.md`.
3. **Never delete a `paira:*:start` / `paira:*:end` comment** in a page. They are
   load-bearing markers, not decoration — see §6.
4. **Never commit a Cloudflare API token.** Tokens go in the environment, never in a file.
   `.gitignore` already excludes `.env*` and `.wrangler/`.
5. **Do not rename files under `site/`.** URLs are derived from filenames and
   `site/_redirects` maps the historical names. A rename is a broken link plus a lost
   redirect.

---

## 3. Change a page and ship it

```bash
cd /path/to/design_handoff_paira_site

# 1. Edit the page. Turkish pages are in site/, English in site/en/.
#    Content lives directly in the HTML; layout is in inline style="" attributes.

# 2. Preview locally. Run from the repo root with no path argument so wrangler
#    reads wrangler.toml and wires up functions/ and a LOCAL D1 database.
npx --yes wrangler@4 pages dev
#    The local D1 is a separate, empty database — it is not production data.
#    For a content-only edit, opening site/<page>.html in a browser is enough.

# 3. Ship.
./deploy.sh

# 4. Verify (see §7).
```

Page ↔ URL mapping — the filename is the URL slug:

| File | URL | | File | URL |
|---|---|---|---|---|
| `site/index.html` | `/` | | `site/en/index.html` | `/en/` |
| `site/skorkart.html` | `/skorkart` | | `site/en/scorecard.html` | `/en/scorecard` |
| `site/danismanlik.html` | `/danismanlik` | | `site/en/consulting.html` | `/en/consulting` |
| `site/egitimler.html` | `/egitimler` | | `site/en/trainings.html` | `/en/trainings` |
| `site/etkinlikler.html` | `/etkinlikler` | | `site/en/events.html` | `/en/events` |
| `site/manifesto.html` | `/manifesto` | | `site/en/manifesto.html` | `/en/manifesto` |
| `site/hakkimizda.html` | `/hakkimizda` | | `site/en/about.html` | `/en/about` |
| `site/paira-notes.html` | `/paira-notes` | | `site/en/paira-notes.html` | `/en/paira-notes` |
| `site/vibe-legal.html` | `/vibe-legal` | | `site/en/vibe-legal.html` | `/en/vibe-legal` |
| `site/iletisim.html` | `/iletisim` | | `site/en/contact.html` | `/en/contact` |
| `site/aydinlatma-metni.html` | `/aydinlatma-metni` | | `site/en/privacy-policy.html` | `/en/privacy-policy` |

**A text change in one language is only half the job.** The pages are mirrored TR/EN and
cross-linked with `hreflang`. Change the Turkish page, change its English counterpart.

**Adding a new page** also requires: a row in the `PAIRS` list in `tools/inject-i18n.py`,
then re-running both injection scripts (§6), and a nav link in every other page.

---

## 4. Deploying

`./deploy.sh` is the only supported path. It runs:

```bash
npx --yes wrangler@4 pages deploy --project-name=paira --branch=main --commit-dirty=true
```

with no path argument on purpose — that "config form" is what makes wrangler read
`wrangler.toml` and ship the D1 binding along with the deployment. **Do not replace it
with `wrangler pages deploy site`**: that form ignores `wrangler.toml`, so the deployment
goes out with no `env.DB` binding and `/api/lead` starts returning `500 server_error` on
every submission while the static pages look perfectly fine.

The script also verifies credentials up front (see §5), refuses to run if `wrangler.toml`
still has a placeholder `database_id`, and deletes `.DS_Store` files so macOS metadata is
not uploaded as site assets.

**`--branch=main` only reaches production if the project's production branch is `main`.**
Pages decides this itself: the deployment is production when the branch you pass equals the
project's configured `production_branch`. If they ever diverge, the deploy silently lands
in **preview** — which reads *preview's* secrets, where `SHEET_WEBHOOK_URL` is unset, so
the pages look correct while the Sheet mirror quietly stops. Confirm the production branch
in the dashboard (Workers & Pages → `paira` → Settings) before changing `--branch`.

Deploys are atomic and versioned. A bad deploy is rolled back from the Cloudflare
dashboard (Workers & Pages → `paira` → Deployments → an older deployment →
**Rollback**), which is faster than fixing forward.

---

## 5. Credentials — when they expire or are missing

> **State as of 2026-09-07: the cached OAuth session on the handover machine is expired**
> (it lapsed on 2026-02-14). Deploying requires a fresh credential — this section is not
> hypothetical, it is the first thing to do.

`deploy.sh` checks credentials before doing anything and fails with one of:

```
ERROR: no Cloudflare credentials found.
ERROR: a cached wrangler login exists but is not valid (expired or revoked).
```

Either auth path works. Pick based on whether a human is at the keyboard.

### Option A — OAuth (interactive; for a human)

```bash
npx --yes wrangler@4 login     # opens a browser; sign in as the account owner
npx --yes wrangler@4 whoami    # confirm
./deploy.sh
```

The session is cached in a platform-specific directory — on a stock Mac it is **not**
`~/.wrangler`. Wrangler resolves it in this order:

1. `~/.wrangler` — legacy; wins if it exists
2. `$XDG_CONFIG_HOME/.wrangler`
3. `~/Library/Preferences/.wrangler` (macOS) or `~/.config/.wrangler` (Linux)

The session lives at `<that dir>/config/default.toml`. `deploy.sh` checks all four
candidates, then confirms with `wrangler whoami --json` — a config file on disk does not
mean the credentials still work. The file records an `expiration_time`; when it passes,
wrangler reports `Failed to fetch auth token: 400 Bad Request` / `Not logged in.` and the
refresh does **not** always recover on its own — re-run `wrangler login`.

Variants: `wrangler login --use-keyring` stores the session in the macOS Keychain instead;
`wrangler login --device` uses the OAuth device-code flow for a headless box. `wrangler
logout` invalidates and deletes it.

OAuth needs an interactive browser at least once, so it does **not** work for an agent
running non-interactively or in CI.

### Option B — API token (non-interactive; required for an agent or CI)

**An AI agent deploying without a human present must use this path.**

Create the token in the Cloudflare dashboard, signed in as the account owner
(`Burakozdemir84@hotmail.com`):

**Manage Account → API Tokens → Create Token → Create Custom Token**
(equivalently **My Profile → API Tokens**, or go straight to
`https://dash.cloudflare.com/profile/api-tokens`).

Add these three permissions:

| Group | Resource | Level | Needed for |
|---|---|---|---|
| Account | Cloudflare Pages | **Edit** | `pages deploy`, `pages project list`, and Pages secrets |
| Account | D1 | **Edit** | `d1 execute --remote`, `d1 list`, `d1 info` |
| Account | Account Settings | **Read** | `wrangler whoami`, account resolution |

Pages secrets need no separate scope — `pages secret put/list` hit the Pages project
endpoint, which *Cloudflare Pages · Edit* already covers.

Then, under **Account Resources**, `Include` → the specific account
`60153cf9393ce1866334788c1357bb53`. Set **TTL** deliberately: leaving the expiry blank
means the token never expires; setting one is what produces the expiry this section
exists for. The token secret is shown **once only** — capture it immediately.

```bash
export CLOUDFLARE_API_TOKEN='<the new token>'
npx --yes wrangler@4 whoami                # must succeed before anything else
./deploy.sh
```

`deploy.sh` and `setup-d1.sh` export `CLOUDFLARE_ACCOUNT_ID` themselves, so it does not
need setting by hand. A token in the environment takes precedence over a cached OAuth
session — if a deploy acts as the wrong account, check for a stale `CLOUDFLARE_API_TOKEN`
first.

### Check credentials before assuming code is broken

```bash
npx --yes wrangler@4 whoami                                   # auth works at all?
npx --yes wrangler@4 pages project list                       # Pages scope; `paira` visible?
npx --yes wrangler@4 d1 list                                  # D1 scope; `paira_leads` visible?
npx --yes wrangler@4 pages secret list --project-name=paira   # SHEET_WEBHOOK_URL present?
```

Run all of them, not just `whoami`. A token that is valid but missing the D1 scope deploys
successfully and then fails only on D1 commands — the site looks fine while lead capture is
broken. If `whoami` fails, it is a credential problem, not a code problem; do not start
editing files.

### Reading the error

The Cloudflare error code tells you which problem you have:

| CLI output | Meaning | Fix |
|---|---|---|
| `Invalid access token [code: 9109]` on `/accounts` | token is wrong, revoked, or expired | issue a new token (Option B) |
| `Authentication error [code: 10000]` on an account path, with the "custom API token set in an environment variable" hint | token is valid but **missing a scope** — or points at the wrong account | re-check the three permissions and the account resource |
| `Failed to fetch auth token: 400 Bad Request` then `Not logged in.` | stale OAuth refresh token on disk | `wrangler login` again |
| `More than one account available but unable to select one in non-interactive mode` | `CLOUDFLARE_ACCOUNT_ID` not set | export it (`deploy.sh` already does) |
| `Must specify a project name.` | `--project-name=paira` missing | use `./deploy.sh`, do not hand-roll the command |

A `10000` cannot distinguish "missing scope" from "wrong account" by code alone — check
both. Note also that D1 commands need an explicit `--remote` to hit production; without it
they run against a local database and appear to succeed while touching nothing real.

### The `SHEET_WEBHOOK_URL` secret

It is a Pages secret stored on Cloudflare, **not** in this repo, and it survives
redeploys. `pages secret put` writes to the *project's* config, while `pages deploy` only
uploads assets and creates a deployment — it never touches secrets. Cloudflare's docs say
the same: secrets are preserved from the previous version and are not deleted by
deployments.

```bash
npx --yes wrangler@4 pages secret list --project-name=paira
npx --yes wrangler@4 pages secret put SHEET_WEBHOOK_URL --project-name=paira
```

**Secrets are scoped per environment** — `production` and `preview` hold separate values.
`--project-name` alone targets `production`, which is what this project needs. The global
`-e` / `--env` flag switches it and accepts only `production` or `preview`; it is hidden
from `--help` but the command does read it.

If the secret is missing, `/api/lead` still works and still writes to D1 — only the Google
Sheet mirror stops updating. See `tools/SHEET_SETUP.md` to regenerate the webhook URL.

### Wrangler version

Everything here is pinned to `wrangler@4` (`npx --yes wrangler@4`). Do not drop the pin —
a major-version bump changes `pages deploy` behaviour. Verified working on 4.86.0.

---

## 6. Generated blocks inside the pages

Each page contains four marker-delimited blocks. Three are generated, one is hand-written.
`DEPLOY.md` § *Re-running the injections* has the full table and the gotchas. In short:

- `paira:responsive:*` and `paira:i18n:*` / `paira:langlink:*` are **generated**. Editing
  them by hand is pointless — the next script run overwrites the change. Edit the script
  in `tools/` instead, then re-run it with `--apply`.
- `paira:seo:*` (meta description, Open Graph, Twitter card) has **no generator**. Edit it
  directly in the page. It is per-page and per-language, so it needs updating whenever a
  page's title or description changes.
- Both scripts are dry-run without `--apply`. Read their output — `inject-i18n.py` skips
  the footer language link silently-ish (it prints a `!!` line) if the footer markup it
  anchors to has changed.
- The Scorecard's `@media print` rules (the "Raporu PDF indir" / "Download PDF" feature)
  are emitted by `inject-responsive.py` for `skorkart.html` and `en/scorecard.html` only.
  If that feature needs changing, edit `PRINT_TMPL` in the script, not the page. Do not
  move those rules into the shared CSS — `body *{visibility:hidden}` would blank every
  other page's printout.
- Re-running both scripts moves the hand-maintained `paira:seo` block to after the
  generated blocks inside `<head>`. That is cosmetic; the content is verified identical
  to what is deployed.

---

## 7. Verify after every deploy

```bash
# 1. The site responds and serves the new content.
curl -sS -o /dev/null -w '%{http_code}\n' https://www.mypaira.com/

# 2. DNS and — critically — the mail records are still intact.
./check-dns.sh

# 3. The lead pipeline still writes. Submit the Scorecard form in a browser, then:
npx --yes wrangler@4 d1 execute paira_leads --remote \
  --command "SELECT created_at,source,stage,email,score_pct,tier FROM leads ORDER BY created_at DESC LIMIT 20"
```

`check-dns.sh` is read-only and safe to run at any time. It prints a red `*** ALERT ***`
if the Microsoft 365 records have drifted.

`--remote` on the D1 command is not optional. Without it wrangler queries a local
database, returns an empty result, and exits 0 — which reads as "no leads captured"
rather than "you queried the wrong database".

Do not fire many requests at the site in quick succession to "check every page" —
Cloudflare will rate-limit the source IP and every subsequent request times out, which
looks exactly like an outage and is not one.

---

## 8. Repo map

```
AGENTS.md              this file
README.md              design/content handoff (describes the ORIGINAL bundle — see its
                       top note; filenames there predate the deployment rename)
DEPLOY.md              deployment + DNS cutover runbook, rollback values, architecture
deploy.sh              the deploy command
setup-d1.sh            one-time D1 provisioning; safe to re-run
check-dns.sh           read-only DNS + mail-record verifier
wrangler.toml          Pages + D1 config
functions/api/lead.js  POST /api/lead — validation, D1 upsert, Sheet mirror
migrations/            D1 schema (0001_leads.sql)
site/                  everything that gets deployed
  index.html, *.html     Turkish pages
  en/*.html              English pages
  support.js             compiled runtime — DO NOT EDIT
  assets/                images (webp)
  _headers               cache + security headers
  _redirects             301s from the old .dc.html URLs
tools/
  inject-i18n.py         canonical/hreflang/router/langlink generator
  inject-responsive.py   mobile CSS generator
  sheet-webhook.gs       Google Apps Script that receives leads
  SHEET_SETUP.md         how to provision the Sheet and get SHEET_WEBHOOK_URL
original_assets/       pre-optimisation source images (not deployed)
node_modules/          wrangler cache only — no dependencies
```

---

## 9. Known sharp edges

- **`site/support.js` cannot be rebuilt from this bundle.** Back it up before any bulk
  edit that might touch it.
- **Layout is in inline `style=""` attributes.** Media queries cannot normally override
  inline styles, which is why the responsive layer uses `!important` rules matched by
  attribute-substring selectors. The runtime also normalises inline styles (`margin: 0
  auto` → `margin: 0px auto`), so a selector written against a bare `0` will silently
  fail to match.
- **Desktop above 900px is deliberately untouched** by the responsive layer. Test mobile
  changes at 640px and 900px; do not "fix" desktop through that stylesheet.
- **The Scorecard writes each visitor twice** — a `partial` row on form submit and a
  `complete` row when the score renders — upserted on the same `client_id`. Duplicate
  rows in D1 mean the `client_id` logic broke, not that a visitor submitted twice.
- **`/api/lead` fails open on email-domain checks.** A DNS resolver hiccup lets a lead
  through rather than blocking a real sign-up. That is intentional.
- **Images are cached for 30 days and filenames are not content-hashed.** Replacing an
  image in place will not reach visitors who already cached it. Change the filename.
- **Cloudflare Pages is supported but no longer Cloudflare's recommended platform.** There
  is no deprecation notice and no announced end-of-life — this deploy path works and has
  no known expiry. But Cloudflare's docs now steer new projects to Workers, and their own
  Pages-to-Workers migration guide calls the move "often a straightforward process". Keep
  shipping this as-is; if the site is ever rebuilt, target Workers Static Assets rather
  than a new Pages project.
