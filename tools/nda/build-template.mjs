// Builds the NDA template PDF and its layout map.
//
//   node tools/nda/build-template.mjs
//
// Input:  tools/nda/nda-content.json (paragraphs from PAIRA_Proje_Hazirlik_NDA.docx,
//         placeholders {{ADRES}}, {{UNVAN}}, {{TARIH}})
// Output: site/assets/nda/paira-nda-sablon.pdf   (typeset text, no signature)
//         lib/nda-template.js                    (positions, object numbers, glyph map)
//
// At request time lib/nda-pdf.js appends an incremental update to the template:
// the parties paragraph, the date and the signature image. That costs almost no
// CPU, which matters on Cloudflare's per-request CPU limit. Both fonts are
// embedded in full so any name or address can be drawn later. The signature
// image never lives in this (public) repo: it is uploaded once through the
// admin page and kept in D1.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, rgb } from "../../lib/vendor/pdf-lib.esm.min.js";
import fontkit from "../../lib/vendor/fontkit.es.min.js";
import { tokenize, layout } from "../../lib/nda-layout.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p));

const PAGE = [595.28, 841.89];
const M = 70.87;               // 25 mm margins
const WIDTH = PAGE[0] - 2 * M;
const SIZE = 11;
const LEAD = 13.6;
const ASC = 9.9;               // baseline offset from line top at 11 pt
const GAP = 8;                 // an empty paragraph in the source
const PARA = 2;                // space after every paragraph
const PARTIES_LINES = 6;       // lines reserved for the parties paragraph
const BLANK_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==";

const paragraphs = JSON.parse(rd("tools/nda/nda-content.json"));
const regBytes = rd("site/assets/fonts/LiberationSerif-Regular.ttf");
const boldBytes = rd("site/assets/fonts/LiberationSerif-Bold.ttf");

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const reg = await doc.embedFont(regBytes, { subset: false });
const bold = await doc.embedFont(boldBytes, { subset: false });
doc.setTitle("Hizmet Alımları İçin Gizlilik ve Kişisel Verilerin Korunması Sözleşmesi");
doc.setAuthor("OD Etüd ve Müşavirlik Ltd. Şti. (PAIRA)");
doc.setCreator("mypaira.com");
doc.setProducer("mypaira.com");

const DATE_SAMPLE = "00.00.0000";
const measure = (t, b) => (t === "{{TARIH}}" ? reg.widthOfTextAtSize(DATE_SAMPLE, SIZE) : (b ? bold : reg).widthOfTextAtSize(t, SIZE));

const pages = [];
let page, y;
const newPage = () => { page = doc.addPage(PAGE); pages.push(page); y = PAGE[1] - M; };
newPage();

const map = { parties: null, date: null, signature: null };
const needLines = (n) => { if (y - n * LEAD < M) newPage(); };

paragraphs.forEach((p, i) => {
  if (p.gap) { y -= GAP; return; }
  const text = p.r.map((r) => r.t).join("");
  if (text.includes("{{ADRES}}")) {
    needLines(PARTIES_LINES);
    map.parties = { page: pages.length - 1, x: M, top: y, width: WIDTH, height: PARTIES_LINES * LEAD, runs: p.r };
    y -= PARTIES_LINES * LEAD + PARA;
    return;
  }
  const lines = layout(tokenize(p.r), measure, { width: WIDTH, align: p.a === "center" ? "center" : "justify" });
  const heading = p.r.every((r) => r.b) && lines.length === 1;
  if (heading) needLines(4);
  for (const line of lines) {
    needLines(1);
    const base = y - ASC;
    for (const pc of line.pieces) {
      if (pc.t === "{{TARIH}}") { map.date = { page: pages.length - 1, x: M + pc.x, y: base }; continue; }
      page.drawText(pc.t, { x: M + pc.x, y: base, size: SIZE, font: pc.b ? bold : reg, color: rgb(0, 0, 0) });
    }
    y -= LEAD;
  }
  y -= PARA;
});

// Signature table
const HEAD = 22, BODY = 140, TABLE = HEAD + BODY;
y -= 14;
if (y - TABLE < M) newPage();
const half = WIDTH / 2;
const top = y;
const line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.75, color: rgb(0, 0, 0) });
line(M, top, M + WIDTH, top);
line(M, top - HEAD, M + WIDTH, top - HEAD);
line(M, top - TABLE, M + WIDTH, top - TABLE);
line(M, top, M, top - TABLE);
line(M + half, top, M + half, top - TABLE);
line(M + WIDTH, top, M + WIDTH, top - TABLE);
const center = (t, f, cx, by, s) => page.drawText(t, { x: cx - f.widthOfTextAtSize(t, s) / 2, y: by, size: s, font: f, color: rgb(0, 0, 0) });
center("HİZMET ALAN", bold, M + half / 2, top - 15, 10.5);
center("HİZMET VEREN", bold, M + half + half / 2, top - 15, 10.5);
center("KAŞE-İMZA", reg, M + half / 2, top - HEAD - 15, 10);
center("KAŞE-İMZA", reg, M + half + half / 2, top - HEAD - 15, 10);
map.signature = { page: pages.length - 1, x: M + half + 12, y: top - TABLE + 8, w: half - 24, h: BODY - 34 };

// Page numbers
pages.forEach((pg, i) => {
  const t = String(i + 1);
  pg.drawText(t, { x: PAGE[0] - M - reg.widthOfTextAtSize(t, 9), y: 36, size: 9, font: reg, color: rgb(0, 0, 0) });
});

// Glyph map for the runtime filler, and make sure every glyph in it is listed
// in the fonts' width and ToUnicode tables by drawing the set off-page.
const cps = [];
for (let c = 0x20; c <= 0x7e; c++) cps.push(c);
for (let c = 0xa0; c <= 0x17f; c++) cps.push(c);
for (const ch of "‘’‚“”„–—…•€₺№™") cps.push(ch.codePointAt(0));
const fkReg = fontkit.create(regBytes), fkBold = fontkit.create(boldBytes);
const glyphs = { upm: fkReg.unitsPerEm, reg: {}, bold: {} };
const usable = [];
for (const cp of cps) {
  const gr = fkReg.glyphForCodePoint(cp), gb = fkBold.glyphForCodePoint(cp);
  if (!gr.id || !gb.id) continue;
  const ch = String.fromCodePoint(cp);
  glyphs.reg[ch] = [gr.id, gr.advanceWidth];
  glyphs.bold[ch] = [gb.id, gb.advanceWidth];
  if (cp !== 0x20) usable.push(ch);
}
const charset = usable.join(" ");
pages[0].drawText(charset, { x: -9000, y: -9000, size: 1, font: reg });
pages[0].drawText(charset, { x: -9000, y: -9100, size: 1, font: bold });

// Placeholder content streams and image, rewritten per request.
const needPages = [...new Set([map.parties.page, map.date.page, map.signature.page])];
const streams = {};
for (const pi of needPages) {
  const ref = doc.context.register(doc.context.stream(" "));
  pages[pi].node.addContentStream(ref);
  streams[pi] = ref.objectNumber;
}
const img = await doc.embedJpg(new Uint8Array(Buffer.from(BLANK_JPEG, "base64")));
pages[map.signature.page].node.setXObject(PDFName.of("PairaSig"), img.ref);

const fontNames = {};
for (const pi of needPages) {
  const dict = pages[pi].node.Resources().lookup(PDFName.of("Font"));
  const names = {};
  for (const [name, ref] of dict.entries()) {
    if (ref === reg.ref) names.reg = name.asString().slice(1);
    if (ref === bold.ref) names.bold = name.asString().slice(1);
  }
  if (!names.reg || !names.bold) throw new Error("font resources missing on page " + (pi + 1));
  fontNames[pi] = names;
}

const bytes = await doc.save({ useObjectStreams: false });
const tail = Buffer.from(bytes.slice(-2048)).toString("latin1");
const trailer = tail.slice(tail.lastIndexOf("trailer"));
const pick = (re) => { const m = re.exec(trailer); if (!m) throw new Error("trailer: " + re); return m[1]; };
const tpl = {
  pageCount: pages.length,
  size: SIZE, lead: LEAD, asc: ASC,
  parties: map.parties, date: map.date, signature: map.signature,
  streams, fontNames, imageObj: img.ref.objectNumber,
  trailer: {
    size: Number(pick(/\/Size (\d+)/)),
    root: pick(/\/Root (\d+ \d+ R)/),
    info: pick(/\/Info (\d+ \d+ R)/),
    id: (/\/ID (\[[^\]]*\])/.exec(trailer) || [, ""])[1],
    startxref: Number(pick(/startxref\s+(\d+)/)),
  },
  length: bytes.length,
  glyphs,
};

fs.mkdirSync(path.join(ROOT, "site/assets/nda"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "site/assets/nda/paira-nda-sablon.pdf"), bytes);
fs.writeFileSync(
  path.join(ROOT, "lib/nda-template.js"),
  "// Generated by tools/nda/build-template.mjs. Do not edit by hand.\n" +
    "export const TEMPLATE = " + JSON.stringify(tpl) + ";\n"
);
console.log("pages", pages.length, "bytes", bytes.length, "parties p" + (map.parties.page + 1), "date p" + (map.date.page + 1), "signature p" + (map.signature.page + 1));
