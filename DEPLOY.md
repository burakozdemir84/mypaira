# PAIRA — Deployment & DNS Cutover Runbook

## Current status

| Item | Value |
|---|---|
| Host | Cloudflare Pages (free tier) |
| Cloudflare account | `60153cf9393ce1866334788c1357bb53` (Burakozdemir84@hotmail.com) |
| Project name | `paira` |
| Live preview URL | https://paira-2hm.pages.dev |
| Custom domain registered | `www.mypaira.com` (status: pending DNS) |
| Registrar + DNS | GoDaddy (`ns65/ns66.domaincontrol.com`) |
| Email | Microsoft 365 via GoDaddy — **must not be disturbed** |

Redeploy after editing files in `site/`:

```bash
export CLOUDFLARE_API_TOKEN='your-token'
./deploy.sh
```

---

## ROLLBACK SNAPSHOT — capture of DNS before any change

If anything goes wrong, restoring these two records puts the Wix site back exactly as it was.

| Record | Type | Value | TTL |
|---|---|---|---|
| `@` (mypaira.com) | A | `185.230.63.107` | 3600 |
| `www` | CNAME | `pointing.wixdns.net` | 3600 |

**Records that must NOT be touched** (these are Microsoft 365 email — changing them breaks mail):

| Record | Type | Value |
|---|---|---|
| `@` | MX | `mypaira-com.mail.protection.outlook.com` (priority 0) |
| `@` | TXT | `v=spf1 include:secureserver.net -all` |
| `@` | TXT | `NETORGFT20378724.onmicrosoft.com` |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` |
| `autodiscover` | CNAME | `autodiscover.outlook.com` |
| `msoid` | CNAME | `clientconfig.microsoftonline-p.net` |
| `lyncdiscover` | CNAME | `webdir.online.lync.com` |
| `email` | CNAME | `email.secureserver.net` |
| `_domainconnect` | CNAME | `_domainconnect.gd.domaincontrol.com` |

Only `@` (A) and `www` (CNAME) change. Everything above stays exactly as-is.

---

## Cutover procedure

### Step 0 — (do this ~1 hour early) Lower the TTLs

Optional. Both records currently have a 1-hour TTL, so a mistake takes up to an hour to
undo. Before cutting over, edit the `@` A record and the `www` CNAME and set **TTL to
600 seconds (10 minutes)** without changing their values. Wait one hour so the old
1-hour TTL expires everywhere. Cutover and rollback then both resolve in ~10 min.

### Step 1 — Point `www` at Cloudflare Pages

GoDaddy → **Domain Portfolio** → `mypaira.com` → **DNS** → **Manage DNS**.

Find the existing `www` CNAME and **edit** it:

| Field | New value |
|---|---|
| Type | CNAME |
| Name | `www` |
| Value | `paira-2hm.pages.dev` |
| TTL | 600 |

Save. (This replaces `pointing.wixdns.net`.)

### Step 2 — Wait for the SSL certificate

Cloudflare issues the certificate for `www.mypaira.com` automatically once it sees the
CNAME. This usually takes 2–15 minutes. Until it completes, `https://www.mypaira.com`
may show a certificate warning — this is expected and self-resolves.

Check progress:

```bash
./check-dns.sh
```

Do not proceed to Step 3 until that script reports the certificate is active.

### Step 3 — Redirect the bare domain to `www`

GoDaddy DNS **cannot** point a bare/apex domain at Cloudflare Pages — apex records must
be `A` records, and Pages only supports `CNAME` for externally-hosted DNS. So the apex
becomes a redirect instead.

GoDaddy → `mypaira.com` → **Domain Settings** → **Forwarding** → **Add Forwarding**:

| Field | Value |
|---|---|
| Forward to | `https://www.mypaira.com` |
| Redirect type | **Permanent (301)** |
| Forward settings | **Forward only** (NOT "Forward with masking") |

Saving this replaces the apex `A` record (`185.230.63.107`) automatically.

> **Do not use "Forward with masking."** Masking serves your site inside a hidden frame,
> which breaks the Scorecard's URL handling, destroys SEO, and prevents the Contact page
> from reading its `?topic=` parameter.

**Result:** `mypaira.com` → 301 → `https://www.mypaira.com` (the canonical URL).

### Step 4 — Verify

```bash
./check-dns.sh
```

Then load `https://www.mypaira.com` in a browser and confirm:
- TR home renders with the correct serif headings
- TR/EN language pill switches to `/en/Home.dc`
- The Scorecard "Skorunuzu Öğrenin" flow starts
- **Send yourself a test email** to confirm M365 mail still delivers

---

## Rollback

If the site is wrong or email breaks, in GoDaddy DNS:

1. Delete the Forwarding rule (Domain Settings → Forwarding).
2. Recreate the apex `A` record: `@` → `185.230.63.107`.
3. Edit the `www` CNAME back to `pointing.wixdns.net`.

The Wix site returns within one TTL (10 min if you did Step 0, otherwise up to 1 hour).

---

## URL structure

Pages were renamed to clean slugs and every internal reference rewritten to an
absolute path, so there are no `.dc.html` URLs and no redirect hops.

| Turkish | English |
|---|---|
| `/` | `/en/` |
| `/skorkart` | `/en/scorecard` |
| `/danismanlik` | `/en/consulting` |
| `/egitimler` | `/en/trainings` |
| `/etkinlikler` | `/en/events` |
| `/manifesto` | `/en/manifesto` |
| `/hakkimizda` | `/en/about` |
| `/paira-notes` | `/en/paira-notes` |
| `/vibe-legal` | `/en/vibe-legal` |
| `/iletisim` | `/en/contact` |
| `/aydinlatma-metni` | `/en/privacy-policy` |

`_redirects` 301s all the old `.dc.html` / `.dc` URLs to these, so previously shared
links keep working.

**Note on the runtime:** `support.js` derives its component name from the URL
(`dcNameFromPath`) and registers the parsed document under that same derived name, so
each page is self-consistent regardless of filename. That is what makes the rename safe,
and it is why `support.js` itself must not be modified.

## Images

All images were converted to WebP and capped at 2560px on the long edge (still 2x the
1240px maximum layout width, so they are pixel-identical on any screen including
retina). Total image weight went from **29.3MB to 3.5MB — an 89% reduction**.

Original full-resolution files are preserved in `original_assets/` at the repo root.
That folder is outside `site/`, so it is never deployed.

`_headers` caches `/assets/*` for 30 days. The filenames are not content-hashed, so if
you replace an image and need it live immediately, change its filename too.

### Unused assets

Four images in the original handoff are referenced by nothing. They were converted along
with everything else and are still present; they can be deleted safely:
`anil-akbas.webp`, `selma-toktas.webp`, `selma-toktas-sq.webp`, `yuzucu-havuz.webp`.

The Scorecard hero was also duplicated — the root `skorkart-hero-tr.png` was
byte-identical to `assets/yuzucu-havuz-en.png`. Both pages now share one file,
`assets/skorkart-hero.webp`.

---

## Mobile / responsive layer

The original handoff had **no media queries at all** and 327px of horizontal
overflow on a phone. The layout lives in inline `style=""` attributes, which media
queries normally cannot override — but a stylesheet rule carrying `!important` does
beat a non-`!important` inline style, so the fix targets those declarations via
attribute-substring selectors.

Injected into every page between `<!-- paira:responsive:start -->` and
`<!-- paira:responsive:end -->`. Breakpoints at 900px and 640px.
**Desktop above 900px is completely untouched.**

Two things to know if you edit it:
- The runtime **normalises inline styles** (`margin: 0 auto` becomes `margin: 0px auto`).
  Never write a selector matching a bare `0` value — it will silently not match.
- The sticky header is on `<header>` on inner pages but on a wrapper `<div>` on the
  home pages. Both shapes are handled.

## Language routing (hreflang + auto-detect)

Injected between `<!-- paira:i18n:start -->` / `<!-- paira:i18n:end -->`:

- **`canonical`** on every page pointing at `www.mypaira.com` — without this, Google
  could index the `paira-2hm.pages.dev` copy as duplicate content.
- **`hreflang`** tr / en / x-default, reciprocal across all 11 page pairs.
- **Soft router**: only the bare `/` auto-redirects, only for a first-time visitor
  whose browser language isn't Turkish. Any stored choice always wins afterwards.
  Crawlers (Googlebot, bingbot, yandex, duckduck) are explicitly excluded so the
  Turkish home stays indexable.
- **`?lang=tr` / `?lang=en`** forces a language, is remembered, and jumps to that
  page's counterpart.
- **Footer language link** ("English" / "Türkçe") on every page.

To disable the auto-redirect, delete the `<script>` inside the i18n block; the
hreflang tags are independent and should stay.

## Re-running the injections

Every page carries four marker-delimited blocks. Three are generated by two scripts; the
fourth is hand-written.

| Block | Owner | Contents |
|---|---|---|
| `paira:responsive:start/end` | `tools/inject-responsive.py` | mobile CSS layer |
| `paira:i18n:start/end` | `tools/inject-i18n.py` | canonical, hreflang, soft language router |
| `paira:langlink:start/end` | `tools/inject-i18n.py` | footer "English" / "Türkçe" link |
| `paira:seo:start/end` | hand-maintained (no script) | meta description, Open Graph, Twitter card |

Both scripts are idempotent — each strips its own previous block before re-inserting, so
re-running replaces rather than stacks. Both are **dry-run by default**; `--apply` is
required to write. Both resolve `site/` relative to their own location, so they run from
anywhere.

```bash
python3 tools/inject-responsive.py            # preview
python3 tools/inject-responsive.py --apply    # write

python3 tools/inject-i18n.py                  # preview
python3 tools/inject-i18n.py --apply          # write
```

After applying, redeploy with `./deploy.sh`.

**Scope.** `inject-responsive.py` walks every `*.html` under `site/`, so a new page is
picked up automatically. `inject-i18n.py` works from a hardcoded `PAIRS` list of 11
TR/EN page pairs near the top of the file — **adding a page means adding a row there**,
otherwise it gets no canonical, no hreflang and no language link.

**Both scripts insert before `</head>`.** A page without a `</head>` is reported and
skipped, not silently modified.

**The footer language link is fragile.** `inject-i18n.py` anchors it to the literal
string `<div style="display: flex; gap: 18px">` and requires it to appear exactly once
per page. If a footer edit changes that markup or duplicates it, the script prints
`!! footer anchor appears Nx in <page> — skipped link` and the rest of the injection
still succeeds. Read the script output; do not assume silence means success.

**The Scorecard print rules are generated too.** `skorkart.html` and `en/scorecard.html`
carry an `@media print` block that makes "Raporu PDF indir" / "Download PDF" output only
the report card. It was originally hand-added *inside* the responsive block, so every run
of `inject-responsive.py` silently deleted it and broke the PDF download. It is now
emitted by the script (`PRINT_TMPL` / `PRINT_PAGES`) for those two pages only —
`body *{visibility:hidden}` would blank every other page's printout.

**Re-running reorders `<head>`.** Both scripts insert their block immediately before
`</head>`, so the hand-maintained `paira:seo` block ends up after them. Nothing is lost —
it is `<head>` metadata and order does not matter — but the resulting diff touches all 22
pages. Verified: after a full `--apply` run of both scripts, every page's content is
identical to what is deployed today.

Rules:
- Do not hand-edit content inside a generated block (`responsive`, `i18n`, `langlink`) —
  the next run overwrites it. Change the script instead.
- The `paira:seo` block has no generator; edit it directly in the page.
- Do not delete the marker comments.

## Lead capture (Scorecard)

The Scorecard submits leads to a real backend. Architecture:

```
Scorecard page (client_id per visitor)
   → POST /api/lead   (Cloudflare Pages Function, functions/api/lead.js)
        → D1 database "paira_leads", table `leads` (binding: DB) — source of truth
        → Google Sheet, best-effort (Apps Script webhook, secret: SHEET_WEBHOOK_URL)
```

- The Scorecard fires the request **twice** per visitor, both times with the same
  `client_id`: a `partial` write when the lead-capture form is submitted (name, email,
  org, consent, etc.), and a `complete` write once the score result is shown (adds
  `segment`, `answers`, `score_pct`, `tier`). Both writes upsert on `client_id`, in D1
  (`ON CONFLICT(client_id) DO UPDATE`) and in the Sheet (row lookup by ClientID column)
  — so each visitor ends up as one row, not two.
- The Google Sheet mirror is **best-effort only**: if `SHEET_WEBHOOK_URL` is unset, or
  the webhook call fails, `/api/lead` still succeeds because the write already landed in
  D1. See `tools/SHEET_SETUP.md` to provision the Sheet and get that secret.
- The personalized report is **not emailed**. It renders on-screen at the end of the
  Scorecard flow and is downloadable as a PDF via the browser's print dialog.

**Wired up (live):**
- Scorecard lead form + result → D1 + Sheet mirror, as above.

**Fast-follow (backend not yet built, same pattern will apply):**
- Contact form.
- Newsletter / "notify me" signups (PairaNotes, Trainings, Home footer, Events).

**Deferred (no backend planned yet):**
- Trainings program sign-ups beyond the "notify me" capture.
- VibeLegal community application.

**Viewing captured leads:**

```bash
wrangler d1 execute paira_leads --remote --command "SELECT created_at,source,stage,name,email,org,score_pct,tier FROM leads ORDER BY created_at DESC LIMIT 50"
```

Or open the Google Sheet directly (see `tools/SHEET_SETUP.md`) for a non-technical view.
