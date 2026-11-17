#!/usr/bin/env python3
"""Mobile menu for every page that uses the standard PAIRA header.

Two edits per page, both idempotent:
  1. a burger <label> (with a hidden checkbox inside) right before the header <nav>;
  2. a CSS block between paira:mobilenav markers before </head>.
Below 900px the header becomes one sticky row (logo + burger); the nav opens as a
full-width panel when the checkbox is checked. Desktop is untouched.
Dry run by default; pass --apply to write.
"""
import re, sys, pathlib
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
START, END = "<!-- paira:mobilenav:start -->", "<!-- paira:mobilenav:end -->"
NAV = '<nav style="display: flex; align-items: center; gap: 22px">'
BURGER = ('<label data-paira-burger aria-label="%s" style="display: none">'
          '<input type="checkbox" data-paira-navt aria-label="%s">'
          '<span></span><span></span><span></span></label>\n      ')
CSS = """
<style data-paira-mobilenav>
/* The runtime host div is viewport-high, which caps how far a sticky header can travel.
   Letting it grow with the page keeps the header pinned on every screen size. */
#dc-root > .sc-host{height:auto!important;min-height:100%}
@media (max-width:900px){
  /* overflow-x:hidden on body (responsive layer) turns it into a scroll box and breaks
     sticky; clip hides the same overflow without that side effect. */
  html,body{overflow-x:clip!important}
  div[style*="position: sticky"]:has(header){position:sticky!important;top:0!important;z-index:60!important}
  header{position:sticky!important;top:0!important;z-index:60!important}
  header > div{flex-wrap:wrap!important;justify-content:space-between!important;align-items:center!important;gap:0!important;padding:10px 20px!important}
  [data-paira-burger]{display:flex!important;position:relative;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;margin-right:-10px;cursor:pointer}
  [data-paira-burger] span{display:block;width:22px;height:2px;margin:0 auto;background:#15233E;border-radius:2px;transition:transform .2s,opacity .2s}
  [data-paira-burger] input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
  [data-paira-burger]:has(input:focus-visible){outline:2px solid #2E6FB0;outline-offset:2px;border-radius:6px}
  [data-paira-burger]:has(input:checked) span:nth-of-type(1){transform:translateY(7px) rotate(45deg)}
  [data-paira-burger]:has(input:checked) span:nth-of-type(2){opacity:0}
  [data-paira-burger]:has(input:checked) span:nth-of-type(3){transform:translateY(-7px) rotate(-45deg)}
  header nav{display:none!important;width:100%!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;padding:6px 0 14px!important}
  header:has([data-paira-navt]:checked) nav{display:flex!important}
  header nav > a{font-size:16px!important;padding:13px 2px!important;border-top:1px solid #E6ECF2}
  header nav > div{align-self:flex-start;margin:12px 2px 4px}
  header nav > a:last-child{text-align:center;border-top:0;margin-top:10px;padding:14px 22px!important}
}
</style>
"""
apply = "--apply" in sys.argv
changed = []
for p in sorted(SITE.rglob("*.html")):
    t = p.read_text(encoding="utf-8")
    if t.count(NAV) != 1 or "<header" not in t:
        continue
    en = "/en/" in p.as_posix()
    lab = ("Menu", "Open menu") if en else ("Menü", "Menüyü aç")
    t2 = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", t, flags=re.S)
    if "data-paira-burger" not in t2:
        t2 = t2.replace(NAV, BURGER % lab + NAV, 1)
    t2 = t2.replace("</head>", START + CSS + END + "\n</head>", 1)
    if t2 != t:
        changed.append(p.relative_to(SITE).as_posix())
        if apply:
            p.write_text(t2, encoding="utf-8")
print(("APPLIED to " if apply else "WOULD APPLY to ") + f"{len(changed)} pages")
for c in changed: print("   ", c)
