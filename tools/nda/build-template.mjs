// Builds the NDA template PDF and its layout map.
//
//   node tools/nda/build-template.mjs
//
// Input:  tools/nda/nda-content.json  (from PAIRA_Proje_Hazirlik_NDA.docx: "Proje hazırlık
//         gizlilik taahhüdü ve sözleşmesi"; the customer's title, address and notice
//         e-mail are left as a "fields" block)
// Output: site/assets/nda/paira-nda-sablon.pdf   (typeset text, no signature)
//         lib/nda-template.js                    (positions, object numbers, glyph map)
//
// At request time lib/nda-pdf.js appends an incremental update to the template:
// the customer fields and PAIRA's signature image. That costs almost no CPU,
// which matters on Cloudflare's per-request CPU limit. Both fonts are embedded
// in full so any name or address can be drawn later. The signature image never
// lives in this (public) repo: it is uploaded once through the admin page and
// kept in D1.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, rgb } from "../../lib/vendor/pdf-lib.esm.min.js";
import fontkit from "../../lib/vendor/fontkit.es.min.js";
import { tokenize, layout } from "../../lib/nda-layout.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p));

const PAGE = [595.28, 841.89];
const MX = 70.87, MTOP = 62, MBOT = 62;   // margins
const WIDTH = PAGE[0] - 2 * MX;
const SIZE = 10.5;
const LEAD = 12.7;
const ASC = 9.4;                          // baseline offset from line top at SIZE
const PARA = 6.5;                         // space after a body paragraph
const H_BEFORE = 9, H_AFTER = 5, H_SIZE = 11.5;
const FIELD_LINES = 4;                    // reserved lines for the three customer fields
const BLACK = rgb(0, 0, 0), BLUE = rgb(0.02, 0.39, 0.76), GREY = rgb(0.42, 0.45, 0.5);
const BLANK_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooA//2Q==";

const content = JSON.parse(rd("tools/nda/nda-content.json"));
const regBytes = rd("site/assets/fonts/LiberationSerif-Regular.ttf");
const boldBytes = rd("site/assets/fonts/LiberationSerif-Bold.ttf");

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const reg = await doc.embedFont(regBytes, { subset: false });
const bold = await doc.embedFont(boldBytes, { subset: false });
doc.setTitle("Proje hazırlık gizlilik taahhüdü ve sözleşmesi");
doc.setAuthor("OD Etüd ve Müşavirlik Ltd. Şti. (PAIRA)");
doc.setCreator("mypaira.com");
doc.setProducer("mypaira.com");

const measure = (t, b) => (b ? bold : reg).widthOfTextAtSize(t, SIZE);
const pages = [];
let page, y;
const newPage = () => { page = doc.addPage(PAGE); pages.push(page); y = PAGE[1] - MTOP; };
newPage();
const room = (h) => { if (y - h < MBOT) newPage(); };
const text = (t, x, base, f, s, color = BLACK) => page.drawText(t, { x, y: base, size: s, font: f, color });

const map = { fields: null, signature: null, sigDate: null };

for (const item of content) {
  if (item.type === "gap") continue;
  if (item.type === "title") {
    const s = 16;
    text(item.t, MX + (WIDTH - bold.widthOfTextAtSize(item.t, s)) / 2, y - 14, bold, s);
    y -= 28;
    continue;
  }
  if (item.type === "heading") {
    room(H_BEFORE + 3 * LEAD);
    y -= H_BEFORE;
    text(item.t, MX, y - 10.2, bold, H_SIZE);
    y -= 14 + H_AFTER;
    continue;
  }
  if (item.type === "line") {
    room(LEAD);
    text(item.label, MX, y - ASC, reg, SIZE);
    if (item.link) {
      const x = MX + reg.widthOfTextAtSize(item.label, SIZE), w = reg.widthOfTextAtSize(item.link, SIZE);
      text(item.link, x, y - ASC, reg, SIZE, BLUE);
      page.drawLine({ start: { x, y: y - ASC - 1.3 }, end: { x: x + w, y: y - ASC - 1.3 }, thickness: 0.5, color: BLUE });
    }
    y -= LEAD;
    continue;
  }
  if (item.type === "fields") {
    room(FIELD_LINES * LEAD);
    map.fields = { page: pages.length - 1, x: MX, top: y, width: WIDTH, height: FIELD_LINES * LEAD, lines: item.lines };
    y -= FIELD_LINES * LEAD + PARA;
    continue;
  }
  if (item.type === "body") {
    const lines = layout(tokenize(item.r), measure, { width: WIDTH, align: "justify" });
    for (const ln of lines) {
      room(LEAD);
      for (const pc of ln.pieces) text(pc.t, MX + pc.x, y - ASC, pc.b ? bold : reg, SIZE);
      y -= LEAD;
    }
    y -= PARA;
    continue;
  }
  if (item.type === "signature") {
    const SIG_H = 78;
    room(item.rows.length * LEAD + SIG_H + 16);
    y -= 10;
    const colX = [MX, MX + WIDTH / 2 + 8];
    const colW = WIDTH / 2 - 12;
    item.rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        // OD's "Tarih:" is filled at request time with the date the form was started.
        if (ci === 0 && /^Tarih:/.test(cell)) {
          const label = "Tarih: ";
          text(label, colX[ci], y - ASC, reg, SIZE);
          map.sigDate = { page: pages.length - 1, x: colX[ci] + reg.widthOfTextAtSize(label, SIZE), y: y - ASC };
          return;
        }
        let t = cell;
        while (reg.widthOfTextAtSize(t, SIZE) > colW && /\.\.$/.test(t)) t = t.slice(0, -1);
        text(t, colX[ci], y - ASC, reg, SIZE);
      });
      y -= LEAD;
    });
    map.signature = { page: pages.length - 1, x: colX[0], y: y - SIG_H, w: 190, h: SIG_H };
    y -= SIG_H;
    continue;
  }
  throw new Error("unknown item " + item.type);
}

// Footer
pages.forEach((pg, i) => {
  const t = "PAIRA | " + (i + 1);
  pg.drawText(t, { x: PAGE[0] - MX - reg.widthOfTextAtSize(t, 9), y: 34, size: 9, font: reg, color: GREY });
});

// Glyph map for the runtime filler; every glyph in it is drawn off-page so it
// is listed in the fonts' width and ToUnicode tables.
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
if (!map.sigDate) throw new Error("OD Tarih line not found");
const needPages = [...new Set([map.fields.page, map.signature.page, map.sigDate.page])];
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
  fields: map.fields, signature: map.signature, sigDate: map.sigDate,
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
console.log("pages", pages.length, "bytes", bytes.length, "fields p" + (map.fields.page + 1), "signature p" + (map.signature.page + 1), "y-left", Math.round(y - MBOT));
