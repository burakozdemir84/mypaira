#!/usr/bin/env python3
"""Add hreflang/canonical tags, soft language routing, and a footer language link.

Idempotent: re-running replaces the previous injection instead of stacking.
Dry run by default; pass --apply to write.
"""
import re, sys, pathlib

# Repo-relative: tools/ -> repo root -> site/.
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
BASE = "https://www.mypaira.com"
HEAD_START, HEAD_END = "<!-- paira:i18n:start -->", "<!-- paira:i18n:end -->"
FOOT_START, FOOT_END = "<!-- paira:langlink:start -->", "<!-- paira:langlink:end -->"

# (tr file, en file, tr url, en url)
PAIRS = [
    ("index.html",             "en/index.html",           "/",                  "/en/"),
    ("skorkart.html",          "en/scorecard.html",       "/skorkart",          "/en/scorecard"),
    ("danismanlik.html",       "en/consulting.html",      "/danismanlik",       "/en/consulting"),
    ("egitimler.html",         "en/trainings.html",       "/egitimler",         "/en/trainings"),
    ("etkinlikler.html",       "en/events.html",          "/etkinlikler",       "/en/events"),
    ("manifesto.html",         "en/manifesto.html",       "/manifesto",         "/en/manifesto"),
    ("hakkimizda.html",        "en/about.html",           "/hakkimizda",        "/en/about"),
    ("paira-notes.html",       "en/paira-notes.html",     "/paira-notes",       "/en/paira-notes"),
    ("vibe-legal.html",        "en/vibe-legal.html",      "/vibe-legal",        "/en/vibe-legal"),
    ("iletisim.html",          "en/contact.html",         "/iletisim",          "/en/contact"),
    ("aydinlatma-metni.html",  "en/privacy-policy.html",  "/aydinlatma-metni",  "/en/privacy-policy"),
]

# Injected in <head> so any redirect happens before first paint.
ROUTER_TMPL = """<script>
(function(){try{
  var K='paira-lang', p=location.pathname, isEN=%(is_en)s, ALT='%(alt)s';
  // Never auto-route a crawler: Googlebot must be able to reach the Turkish home.
  if(/bot|crawl|spider|slurp|bingpreview|googlebot|yandex|duckduck/i.test(navigator.userAgent||'')) return;
  // ?lang=tr / ?lang=en is an explicit override: remembered, and honoured by
  // jumping to this page's counterpart when it disagrees with the current one.
  var q=(location.search.match(/[?&]lang=(tr|en)/i)||[])[1];
  if(q){
    q=q.toLowerCase(); localStorage.setItem(K,q);
    if((q==='en')!==isEN){location.replace(ALT);return;}
  } else {
    var stored=localStorage.getItem(K);
    // Only the bare Turkish home auto-routes, and only for a first-time visitor.
    if(p==='/'&&!stored){
      var nav=((navigator.languages&&navigator.languages[0])||navigator.language||'').toLowerCase();
      if(nav.indexOf('tr')!==0){localStorage.setItem(K,'en');location.replace('/en/');return;}
    }
    // Otherwise remember whichever language they are actually reading.
    localStorage.setItem(K,isEN?'en':'tr');
  }
}catch(e){}})();
</script>"""

apply = "--apply" in sys.argv
files = {}
for tr_file, en_file, tr_url, en_url in PAIRS:
    files[tr_file] = (tr_url, tr_url, en_url, "tr")
    files[en_file] = (en_url, tr_url, en_url, "en")

changed = []
for rel, (self_url, tr_url, en_url, lang) in files.items():
    p = SITE / rel
    if not p.exists():
        print(f"  !! missing {rel}"); continue
    t = orig = p.read_text(encoding="utf-8")

    # strip previous injections (idempotency)
    t = re.sub(re.escape(HEAD_START) + r".*?" + re.escape(HEAD_END), "", t, flags=re.S)
    t = re.sub(re.escape(FOOT_START) + r".*?" + re.escape(FOOT_END), "", t, flags=re.S)

    # head tags + router
    router = ROUTER_TMPL % {
        "is_en": "true" if lang == "en" else "false",
        "alt": tr_url if lang == "en" else en_url,
    }
    head = (
        f'{HEAD_START}\n'
        f'<link rel="canonical" href="{BASE}{self_url}">\n'
        f'<link rel="alternate" hreflang="tr" href="{BASE}{tr_url}">\n'
        f'<link rel="alternate" hreflang="en" href="{BASE}{en_url}">\n'
        f'<link rel="alternate" hreflang="x-default" href="{BASE}{tr_url}">\n'
        f'{router}\n{HEAD_END}'
    )
    if "</head>" not in t:
        print(f"  !! no </head> in {rel}"); continue
    t = t.replace("</head>", head + "\n</head>", 1)

    # footer language link
    anchor = '<div style="display: flex; gap: 18px">'
    n = t.count(anchor)
    if n != 1:
        print(f"  !! footer anchor appears {n}x in {rel} — skipped link")
    else:
        label = "English" if lang == "tr" else "Türkçe"
        target = en_url if lang == "tr" else tr_url
        link = (f'{FOOT_START}<a href="{target}" hreflang="{"en" if lang=="tr" else "tr"}" '
                f'style="font-size: 12px; color: #5C6B82; text-decoration: none" '
                f'style-hover="color: #ABD4EC">{label}</a>{FOOT_END}')
        t = t.replace(anchor, anchor + link, 1)

    if t != orig:
        changed.append(rel)
        if apply:
            p.write_text(t, encoding="utf-8")

print(("APPLIED to " if apply else "WOULD APPLY to ") + f"{len(changed)}/{len(files)} pages")
if not apply:
    print("Dry run. Re-run with --apply.")
