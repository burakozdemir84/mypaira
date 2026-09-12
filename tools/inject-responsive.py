#!/usr/bin/env python3
"""Inject a responsive CSS layer into every PAIRA page.

Layout lives in inline style="" attributes. An !important stylesheet rule beats a
non-!important inline style, so the rules below match the literal inline
declarations with attribute substring selectors.

Idempotent: re-running replaces the previous block rather than stacking copies.
Dry run by default; pass --apply to write.
"""
import re, sys, pathlib

# Repo-relative: tools/ -> repo root -> site/.
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
START = "<!-- paira:responsive:start -->"
END = "<!-- paira:responsive:end -->"

CSS = """
<style data-paira-responsive>
/* Mobile layer. Desktop (>900px) is untouched. */
img,video{max-width:100%;height:auto}

@media (max-width:900px){
  html,body{overflow-x:hidden}

  /* The header is pinned with position:sticky - on some pages directly on
     <header>, on others via a wrapper div. Once the nav wraps to two rows that
     would permanently occupy ~25% of a phone screen, so on mobile it scrolls
     away instead. Both shapes are covered here. */
  header{position:static!important}
  div[style*="position: sticky"]:has(header){position:static!important}

  /* Header collapses to stacked rows instead of one overflowing line */
  header > div{flex-wrap:wrap!important;justify-content:center!important;
    gap:10px!important;padding:14px 20px!important}
  header nav{flex-wrap:wrap!important;justify-content:center!important;
    gap:12px 15px!important;width:100%!important}

  /* 3- and 4-up card grids drop to 2 */
  [style*="grid-template-columns: 1fr 1fr 1fr 1fr"],
  [style*="grid-template-columns: 1fr 1fr 1fr"]{
    grid-template-columns:repeat(2,minmax(0,1fr))!important}

  /* Asymmetric hero/feature splits stack immediately */
  [style*="grid-template-columns: 7fr 5fr"],
  [style*="grid-template-columns: 5fr 7fr"],
  [style*="grid-template-columns: 6fr 5fr"],
  [style*="grid-template-columns: 5fr 6fr"],
  [style*="grid-template-columns: 1fr auto 1fr"]{
    grid-template-columns:minmax(0,1fr)!important}

  [style*="max-width: 1240px"]{padding-left:22px!important;padding-right:22px!important}
  [style*="gap: 72px"]{gap:34px!important}
  [style*="gap: 48px"]{gap:26px!important}

  /* Wide content must scroll inside itself, never widen the page */
  table{display:block;overflow-x:auto;max-width:100%}
}
/*PRINT_SLOT*/
@media (max-width:640px){
  /* Everything to a single column */
  [style*="grid-template-columns"]{grid-template-columns:minmax(0,1fr)!important}
  [style*="max-width: 1240px"]{padding-left:18px!important;padding-right:18px!important}

  /* Section rhythm tightens so pages aren't endless on a phone */
  [style*="padding: 96px 32px"],[style*="padding: 88px 32px"]{
    padding-top:46px!important;padding-bottom:42px!important}
  [style*="padding: 80px 32px"],[style*="padding: 72px 32px"]{
    padding-top:42px!important;padding-bottom:38px!important}
  [style*="padding: 48px 32px"]{padding-top:32px!important;padding-bottom:26px!important}

  /* Display type scaled to phone widths */
  [style*="font-size: 96px"]{font-size:40px!important;line-height:1.1!important}
  [style*="font-size: 64px"]{font-size:34px!important;line-height:1.15!important}
  [style*="font-size: 60px"]{font-size:32px!important;line-height:1.15!important}
  [style*="font-size: 54px"],[style*="font-size: 52px"]{font-size:30px!important;line-height:1.18!important}
  [style*="font-size: 50px"],[style*="font-size: 48px"]{font-size:28px!important;line-height:1.2!important}
  [style*="font-size: 46px"],[style*="font-size: 44px"]{font-size:26px!important;line-height:1.2!important}
  [style*="font-size: 40px"]{font-size:25px!important;line-height:1.22!important}
  [style*="font-size: 38px"]{font-size:24px!important;line-height:1.25!important}
  [style*="font-size: 36px"]{font-size:23px!important;line-height:1.25!important}
  [style*="font-size: 34px"]{font-size:22px!important;line-height:1.3!important}
  [style*="font-size: 31px"],[style*="font-size: 30px"]{font-size:21px!important;line-height:1.3!important}
  [style*="font-size: 28px"]{font-size:20px!important;line-height:1.35!important}

  /* Input + button rows stack so neither gets crushed */
  form > div[style*="display: flex"],
  div[style*="display: flex"][style*="gap: 10px"]{flex-wrap:wrap!important}
  input[type="email"],input[type="text"],input[type="tel"],select,textarea{
    min-width:0!important;width:100%!important;box-sizing:border-box!important}

  /* Footer: brand block stacks above the link columns, which then wrap 2-up
     instead of squeezing three columns into a phone width. */
  footer div[style*="justify-content: space-between"]{flex-direction:column!important;gap:28px!important}
  footer div[style*="gap: 56px"]{flex-wrap:wrap!important;gap:20px 36px!important}
}
</style>
"""

# Print rules for the Scorecard only. `body *{visibility:hidden}` would blank every
# other page's printout, so this is injected per page rather than into the shared CSS.
# It lives inside the generated block on purpose: previously it was hand-added there and
# every run of this script silently deleted it, breaking "Raporu PDF indir".
PRINT_TMPL = """
@media print {
  /* Printing (and "%(label)s") should output just the result report card. */
  body *{visibility:hidden}
  #sc-report,#sc-report *{visibility:visible}
  #sc-report{position:absolute;left:0;top:0;width:100%%}
}
"""
PRINT_PAGES = {"skorkart.html": "Raporu PDF indir", "en/scorecard.html": "Download PDF"}

apply = "--apply" in sys.argv
pages = sorted(SITE.rglob("*.html"))
changed = []

for p in pages:
    rel = p.relative_to(SITE).as_posix()
    t = p.read_text(encoding="utf-8")
    # strip previous injection (idempotency)
    t2 = re.sub(re.escape(START) + r".*?" + re.escape(END), "", t, flags=re.S)
    if "</head>" not in t2:
        print(f"  !! no </head> in {p.name} — SKIPPED")
        continue
    extra = (PRINT_TMPL % {"label": PRINT_PAGES[rel]}).strip("\n") if rel in PRINT_PAGES else ""
    block = START + CSS.replace("/*PRINT_SLOT*/", extra) + END
    t2 = t2.replace("</head>", block + "\n</head>", 1)
    if t2 != t:
        changed.append(p.relative_to(SITE).as_posix())
        if apply:
            p.write_text(t2, encoding="utf-8")

print(("APPLIED to " if apply else "WOULD APPLY to ") + f"{len(changed)}/{len(pages)} pages")
for c in changed:
    print("   ", c)
if not apply:
    print("\nDry run. Re-run with --apply.")
