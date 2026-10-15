Vendored, unmodified builds (the site has no build step or package.json):

- pdf-lib 1.17.1 (MIT) — dist/pdf-lib.esm.min.js
- @pdf-lib/fontkit 1.1.1 (MIT) — dist/fontkit.es.min.js; its `import "pako"` is rewritten to `./pako.esm.mjs`
- pako 2.1.0 (MIT + Zlib) — dist/pako.esm.mjs

Fonts: Liberation Serif Regular and Bold (SIL OFL 1.1, Times-metric compatible), from the
fonts-liberation package, used to typeset the NDA PDF with Turkish characters.
