// Paragraph layout shared by the NDA template builder (tools/nda) and the
// runtime filler (lib/nda-pdf.js), so both typeset text the same way.
//
// A paragraph is a list of runs: [{ t: "text", b: true|false }].
// Tabs advance to the next tab stop; spaces stretch on justified lines.

export function tokenize(runs) {
  const items = [];
  let word = null;
  const flush = () => { if (word) { items.push(word); word = null; } };
  for (const run of runs) {
    const parts = run.t.split(/(\t| +)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === "\t") { flush(); items.push({ type: "tab" }); }
      else if (/^ +$/.test(part)) { flush(); if (items.length && items[items.length - 1].type !== "space") items.push({ type: "space" }); }
      else {
        if (!word) word = { type: "word", pieces: [] };
        word.pieces.push({ t: part, b: !!run.b });
      }
    }
  }
  flush();
  while (items.length && items[0].type === "space") items.shift();
  while (items.length && items[items.length - 1].type === "space") items.pop();
  return items;
}

// measure(text, bold) -> width in points at the current size.
// Returns lines: [{ pieces: [{ t, b, x }] }] with x relative to the left edge.
export function layout(items, measure, opts) {
  const width = opts.width;
  const tabStop = opts.tabStop || 36;
  const align = opts.align || "justify";
  const spaceW = measure(" ", false);
  const wordW = (w) => w.pieces.reduce((s, p) => s + measure(p.t, p.b), 0);

  // Break into lines of item ranges.
  const lines = [];
  let cur = [];
  let x = 0;
  for (const it of items) {
    if (it.type === "space") { if (cur.length) cur.push(it); continue; }
    if (it.type === "tab") {
      const nx = Math.floor(x / tabStop + 1e-6) * tabStop + tabStop;
      cur.push({ type: "tab", w: nx - x });
      x = nx;
      continue;
    }
    const w = wordW(it);
    const needSpace = cur.length && cur[cur.length - 1].type === "space";
    const add = (needSpace ? spaceW : 0) + w;
    if (cur.length && x + add > width + 0.01 && cur.some((c) => c.type === "word")) {
      while (cur.length && cur[cur.length - 1].type === "space") cur.pop();
      lines.push(cur);
      cur = [{ type: "word", pieces: it.pieces, w }];
      x = w;
    } else {
      cur.push({ type: "word", pieces: it.pieces, w });
      x += add;
    }
  }
  while (cur.length && cur[cur.length - 1].type === "space") cur.pop();
  if (cur.length) lines.push(cur);

  return lines.map((line, li) => {
    const last = li === lines.length - 1;
    let natural = 0;
    let stretchable = 0;
    let afterTab = !line.some((c) => c.type === "tab");
    for (const c of line) {
      if (c.type === "tab") { natural += c.w; afterTab = true; }
      else if (c.type === "space") { natural += spaceW; if (afterTab) stretchable++; }
      else natural += c.w;
    }
    let extra = 0;
    if (align === "justify" && !last && stretchable > 0) extra = Math.max(0, (width - natural) / stretchable);
    let xx = align === "center" ? Math.max(0, (width - natural) / 2) : 0;
    const pieces = [];
    let seenTab = !line.some((c) => c.type === "tab");
    for (const c of line) {
      if (c.type === "tab") { xx += c.w; seenTab = true; }
      else if (c.type === "space") xx += spaceW + (seenTab ? extra : 0);
      else {
        for (const p of c.pieces) {
          pieces.push({ t: p.t, b: p.b, x: xx });
          xx += measure(p.t, p.b);
        }
      }
    }
    return { pieces };
  });
}
