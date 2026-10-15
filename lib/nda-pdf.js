// Fills the NDA template (site/assets/nda/paira-nda-sablon.pdf) for one
// company by appending a PDF incremental update: the customer's title,
// address and notice e-mail, and PAIRA's signature image.
// No parsing or recompression of the template happens here, so the work per
// request is a few string operations.

import { TEMPLATE as T } from "./nda-template.js";
import { tokenize, layout } from "./nda-layout.js";

const enc = new TextEncoder();
const fmt = (n) => (Math.round(n * 100) / 100).toString();

// Keeps the text drawable with the embedded glyph set.
export function cleanText(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/[‘’‚]/g, (c) => (T.glyphs.reg[c] ? c : "'"))
    .replace(/\s+/g, " ")
    .trim()
    .split("")
    .map((c) => (T.glyphs.reg[c] ? c : c.normalize("NFD").replace(/[̀-ͯ]/g, "")))
    .map((c) => (c.length === 1 && T.glyphs.reg[c] ? c : "?"))
    .join("");
}

function widthOf(t, b, size) {
  const map = b ? T.glyphs.bold : T.glyphs.reg;
  let w = 0;
  for (const c of t) w += (map[c] || map["?"])[1];
  return (w * size) / T.glyphs.upm;
}

function hexOf(t, b) {
  const map = b ? T.glyphs.bold : T.glyphs.reg;
  let h = "";
  for (const c of t) h += (map[c] || map["?"])[0].toString(16).padStart(4, "0");
  return h;
}

function textOps(pieces, fonts, size) {
  let ops = "BT\n0 g\n";
  let cur = null;
  for (const p of pieces) {
    const f = p.b ? fonts.bold : fonts.reg;
    if (f !== cur) { ops += `/${f} ${fmt(size)} Tf\n`; cur = f; }
    ops += `1 0 0 1 ${fmt(p.x)} ${fmt(p.y)} Tm <${hexOf(p.t, p.b)}> Tj\n`;
  }
  return ops + "ET\n";
}

function fieldsOps(values) {
  const box = T.fields;
  for (let size = T.size; size >= 7.5; size -= 0.5) {
    const lead = (T.lead * size) / T.size;
    const asc = (T.asc * size) / T.size;
    const pieces = [];
    let row = 0;
    for (const [label, key] of box.lines) {
      const items = tokenize([{ t: label + (values[key] || ""), b: false }]);
      const lines = layout(items, (t, b) => widthOf(t, b, size), { width: box.width, align: "left" });
      lines.forEach((ln) => {
        for (const p of ln.pieces) pieces.push({ t: p.t, b: p.b, x: box.x + p.x, y: box.top - row * lead - asc });
        row++;
      });
    }
    if (row * lead <= box.height + 0.01 || size <= 7.5) return textOps(pieces, T.fontNames[box.page], size);
  }
  return "";
}

// Reads width, height and colour components from a baseline/progressive JPEG.
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], comps: bytes[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

function concat(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// template: Uint8Array of paira-nda-sablon.pdf
// signature: Uint8Array JPEG
// fields: { unvan, adres, eposta }
export function fillNda(template, signature, fields) {
  if (template.length !== T.length) throw new Error("template_mismatch");
  const sig = jpegInfo(signature);
  if (!sig) throw new Error("signature_invalid");

  const perPage = {};
  const add = (page, ops) => { perPage[page] = (perPage[page] || "") + ops; };

  add(T.fields.page, fieldsOps({
    unvan: cleanText(fields.unvan),
    adres: cleanText(fields.adres),
    eposta: cleanText(fields.eposta),
  }));

  const box = T.signature;
  const scale = Math.min(box.w / sig.width, box.h / sig.height);
  const dw = sig.width * scale, dh = sig.height * scale;
  const ix = box.x + (box.w - dw) / 2, iy = box.y + (box.h - dh) / 2;
  add(box.page, `q ${fmt(dw)} 0 0 ${fmt(dh)} ${fmt(ix)} ${fmt(iy)} cm /PairaSig Do Q\n`);

  const objects = [];
  for (const [page, num] of Object.entries(T.streams)) {
    const data = enc.encode("q\n" + (perPage[page] || "") + "Q\n");
    objects.push({ num, head: `${num} 0 obj\n<< /Length ${data.length} >>\nstream\n`, data });
  }
  const cs = sig.comps === 1 ? "/DeviceGray" : sig.comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
  objects.push({
    num: T.imageObj,
    head: `${T.imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${sig.width} /Height ${sig.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${signature.length} >>\nstream\n`,
    data: signature,
  });

  const chunks = [template, enc.encode("\n")];
  let offset = template.length + 1;
  const xref = [];
  for (const o of objects) {
    const head = enc.encode(o.head);
    const tail = enc.encode("\nendstream\nendobj\n");
    xref.push([Number(o.num), offset]);
    chunks.push(head, o.data, tail);
    offset += head.length + o.data.length + tail.length;
  }
  xref.sort((a, b) => a[0] - b[0]);
  let x = "xref\n";
  for (const [num, off] of xref) x += `${num} 1\n${String(off).padStart(10, "0")} 00000 n \n`;
  const tr = T.trailer;
  x += `trailer\n<< /Size ${tr.size} /Root ${tr.root} /Info ${tr.info}${tr.id ? " /ID " + tr.id : ""} /Prev ${tr.startxref} >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(enc.encode(x));
  return concat(chunks);
}

// "15.10.2026" in Türkiye time.
export function trDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("day")}.${g("month")}.${g("year")}`;
}
