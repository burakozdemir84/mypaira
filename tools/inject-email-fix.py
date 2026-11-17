#!/usr/bin/env python3
"""Restore e-mail links hidden by Cloudflare's Email Address Obfuscation.

Cloudflare rewrites every address in the HTML to a placeholder ("[email protected]") and
decodes it with its own script on page load. Our pages are rendered later by the runtime,
so the placeholders inside templates are never decoded. This block decodes them after
render (and on later re-renders). If obfuscation is switched off in Cloudflare, it simply
finds nothing. Idempotent; dry run by default, --apply to write.
"""
import re, sys, pathlib
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
START, END = "<!-- paira:cfemail:start -->", "<!-- paira:cfemail:end -->"
JS = r"""
<script>
(function(){
  function dec(h){try{var k=parseInt(h.substr(0,2),16),o='';for(var i=2;i<h.length;i+=2)o+=String.fromCharCode(parseInt(h.substr(i,2),16)^k);return o;}catch(e){return '';}}
  function fix(){
    document.querySelectorAll('[data-cfemail]').forEach(function(el){
      var m=dec(el.getAttribute('data-cfemail')); if(!m) return;
      if(el.tagName==='A'){ el.removeAttribute('data-cfemail'); el.classList.remove('__cf_email__'); el.textContent=m; }
      else { el.replaceWith(document.createTextNode(m)); }
    });
    document.querySelectorAll('a[href*="/cdn-cgi/l/email-protection#"]').forEach(function(a){
      var m=dec(a.getAttribute('href').split('#')[1]||''); if(m) a.setAttribute('href','mailto:'+m);
    });
  }
  function start(){ fix(); try{ var mo=new MutationObserver(fix); mo.observe(document.body,{childList:true,subtree:true}); }catch(e){} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
</script>
"""
apply = "--apply" in sys.argv
changed = []
for p in sorted(SITE.rglob("*.html")):
    t = p.read_text(encoding="utf-8")
    if "</body>" not in t: continue
    t2 = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", t, flags=re.S)
    t2 = t2.replace("</body>", START + JS + END + "\n</body>", 1)
    if t2 != t:
        changed.append(p.relative_to(SITE).as_posix())
        if apply: p.write_text(t2, encoding="utf-8")
print(("APPLIED to " if apply else "WOULD APPLY to ") + f"{len(changed)} pages")
