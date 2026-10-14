// Lead intelligence for the Readiness Scorecard (/skorkart, /en/scorecard).
//
// Pure functions, no I/O. Used by functions/api/lead.js (live notifications)
// and functions/api/leads/* (export, abandoned sweep, replay).
//
// Input is a row from the D1 `leads` table. Output:
//   analyze(row)           -> intel object (scores, heat, reasons, open doors)
//   buildEvent(row, opts)  -> webhook payload for Make.com, including ready to
//                             send HTML for the internal notification and the
//                             lead's report e-mail.
//
// The scoring rules mirror resultContent() / scoreData() in the scorecard
// pages. If those pages change, change this file in the same commit.
//
// Brand rules apply to every string here: no em dashes, "zeka" without hat,
// formal "siz".

const SITE = "https://www.mypaira.com";
const CALENDLY = "https://calendly.com/burakoz-demir/30min-1";
const NOTIFY_TO = "burak@mypaira.com";

const CAT_MAX = [6, 7, 5];
const TOTAL_MAX = 18;

const T = {
  tr: {
    cats: ["Verimlilik ve Kapasite", "Risk ve Uyum", "Rekabet ve Konumlanma"],
    tiers: ["Gözlemci", "Uygulayıcı", "Öncü"],
    segments: {
      A: "Hukuk bürosu ortağı / yöneticisi",
      B: "Şirket içi hukuk yöneticisi",
      D: "Avukat / hukuk profesyoneli (yönetici değil)",
    },
    size: {
      A: ["1-4 avukat", "5-15 avukat", "16-30 avukat", "30+ avukat"],
      B: ["Tek kişilik departman", "2-5 kişilik departman", "6-15 kişilik departman", "15+ kişilik departman"],
    },
    priority: ["Acil bir öncelik", "Planlıyoruz ama takvim yok", "Sadece takip ediyoruz"],
    contact: ["Evet, benimle iletişime geçin", "Şimdilik sadece raporumu almak istiyorum"],
  },
  en: {
    cats: ["Efficiency and Capacity", "Risk and Compliance", "Competition and Positioning"],
    tiers: ["Observer", "Practitioner", "Pioneer"],
    segments: {
      A: "Law firm partner / manager",
      B: "In-house legal manager",
      D: "Lawyer / legal professional (non-managing)",
    },
    size: {
      A: ["1-4 lawyers", "5-15 lawyers", "16-30 lawyers", "30+ lawyers"],
      B: ["Just me", "2-5 people", "6-15 people", "15+ people"],
    },
    priority: ["An urgent priority", "We are planning but have no timeline", "We are only following the topic"],
    contact: ["Yes, contact me", "For now I just want my report"],
  },
};

const HEAT_LABEL = { hot: "SICAK", warm: "ILIK", cold: "SOĞUK" };
const HEAT_COLOR = { hot: "#A8842C", warm: "#2E6FB0", cold: "#8A98AC" };

function langOf(row) {
  return row && row.lang === "en" ? "en" : "tr";
}

function parseAnswers(row) {
  if (!row || !row.answers_json) return [];
  try {
    const a = JSON.parse(row.answers_json);
    return Array.isArray(a) ? a : [];
  } catch (_e) {
    return [];
  }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export function analyze(row) {
  const lang = langOf(row);
  const t = T[lang];
  const seg = row.segment || null;
  const setKey = seg === "B" ? "B" : "A";
  const answers = parseAnswers(row);

  const scored = answers.slice(0, 12);
  const catScore = [0, 0, 0];
  let total = 0;
  scored.forEach((a) => {
    if (a && typeof a.points === "number" && a.cat >= 0 && a.cat <= 2) {
      catScore[a.cat] += a.points;
      total += a.points;
    }
  });
  const complete = answers.length >= 15;
  const pct =
    row.score_pct != null && row.score_pct !== ""
      ? Number(row.score_pct)
      : complete
      ? Math.round((total / TOTAL_MAX) * 100)
      : null;
  const tierIdx = pct == null ? null : pct <= 35 ? 0 : pct <= 75 ? 1 : 2;
  const tier = row.tier || (tierIdx == null ? null : t.tiers[tierIdx]);

  const catPct = catScore.map((s, i) => s / CAT_MAX[i]);
  let hi = 0;
  let lo = 0;
  catPct.forEach((v, i) => {
    if (v > catPct[hi]) hi = i;
    if (v < catPct[lo]) lo = i;
  });

  const q = (i) => (answers[i] && typeof answers[i].qual === "number" ? answers[i].qual : null);
  const sizeIdx = q(12);
  const prioIdx = q(13);
  const contactIdx = q(14);

  // Questions answered "No, but it is my priority" (opt 2). Only recorded by
  // scorecard versions from Oct 2026 on; older rows simply have none.
  const openDoors = scored
    .filter((a) => a && a.opt === 2 && a.q)
    .map((a) => ({ cat: t.cats[a.cat] || "", catIdx: a.cat, question: a.q }));
  const gaps = scored
    .filter((a) => a && a.opt === 1 && a.q)
    .map((a) => ({ cat: t.cats[a.cat] || "", question: a.q }));

  // Heat. Deliberately simple and explainable; tune with real conversion data.
  const reasons = [];
  const wantsContact = contactIdx === 0;
  const decisionMaker = seg === "A" || seg === "B";
  const bigEnough = sizeIdx != null && sizeIdx >= 2; // A: 16+ lawyers, B: 6+ people
  const icpFit = decisionMaker && bigEnough;
  const urgent = prioIdx === 0;

  if (wantsContact) reasons.push("Görüşme talep etti");
  if (icpFit) reasons.push(seg === "A" ? "ICP-1 profili (büro yöneticisi, 16+ avukat)" : "ICP-2 profili (şirket hukuk yöneticisi, 6+ kişilik ekip)");
  else if (decisionMaker && sizeIdx != null) reasons.push("Karar verici, ekip ICP eşiğinin altında");
  else if (seg === "D") reasons.push("Karar verici rolünde değil");
  if (urgent) reasons.push("Yapay zekayı acil öncelik görüyor");
  else if (prioIdx === 1) reasons.push("Planlıyor, takvim yok");
  if (openDoors.length) reasons.push(openDoors.length + " konuyu önceliği olarak işaretledi");

  let heat = "cold";
  if (!complete) heat = decisionMaker || seg == null ? "warm" : "cold";
  else if (wantsContact || (icpFit && urgent)) heat = "hot";
  else if (icpFit || urgent || (decisionMaker && prioIdx === 1)) heat = "warm";

  return {
    lang,
    complete,
    segment: seg,
    segmentLabel: T.tr.segments[seg] || "",
    size: sizeIdx == null ? null : T.tr.size[setKey][sizeIdx],
    priority: prioIdx == null ? null : T.tr.priority[prioIdx],
    wantsContact,
    contactAnswer: contactIdx == null ? null : T.tr.contact[contactIdx],
    pct,
    tier,
    tierIdx,
    catScores: T.tr.cats.map((name, i) => ({
      name,
      nameLocal: t.cats[i],
      score: catScore[i],
      max: CAT_MAX[i],
      pct: Math.round(catPct[i] * 100),
    })),
    strongest: hi,
    weakest: lo,
    openDoors,
    gaps,
    heat,
    heatLabel: HEAT_LABEL[heat],
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Report content for the lead (mirrors resultContent() on the page)
// ---------------------------------------------------------------------------

function reportCopy(row, intel) {
  const lang = intel.lang;
  const t = T[lang];
  const en = lang === "en";
  const seg = intel.segment;
  const hiName = t.cats[intel.strongest];
  const loName = t.cats[intel.weakest];
  const trn = en ? SITE + "/en/trainings" : SITE + "/egitimler";
  const notes = en ? SITE + "/en/paira-notes" : SITE + "/paira-notes";
  const events = en ? SITE + "/en/events" : SITE + "/etkinlikler";
  const answers = parseAnswers(row);
  const prio = answers[13] && typeof answers[13].qual === "number" ? answers[13].qual : null;

  let text, p, s;
  if (intel.tierIdx === 0) {
    text = en
      ? "You are at the observation stage, and that is a perfectly natural starting point: a significant share of your colleagues are exactly here. What matters is taking the first step from the right place. The best start for you is one of our step-by-step trainings."
      : "Gözlem aşamasındasınız ve bu son derece doğal bir başlangıç noktası: meslektaşlarınızın önemli bir kısmı tam olarak burada. Önemli olan, ilk adımı doğru yerden atmak. Sizin için en doğru başlangıç, adım adım ilerleyen eğitimlerimiz.";
    p = [en ? "Access the trainings" : "Eğitimlere erişin", trn];
    s = [en ? "Subscribe to PAIRA Notes" : "PAIRA Notes'a kaydolun", notes];
  } else if (intel.tierIdx === 1) {
    text = en
      ? "You have a solid foundation. Your strongest area is " + hiName + ": it shows the right reflexes are forming in your team. " + loName + " is your highest-impact area; with the right steps, this is where your score rises fastest."
      : "Sağlam bir temeliniz var. En güçlü alanınız " + hiName + ": bu, ekibinizde doğru reflekslerin oluştuğunu gösteriyor. " + loName + " ise en yüksek etki potansiyeli taşıyan alanınız; doğru adımlarla skorunuzu en hızlı burada yükseltirsiniz.";
    const edu = seg === "B"
      ? (en ? 'Explore the "Legal in the Loop" program' : '"Legal in the Loop" programını inceleyin')
      : (en ? 'Explore the "AI for Lawyers" program' : '"AI for Lawyers" programını inceleyin');
    const call = en ? "Schedule an AI Adoption call" : "AI Adoption görüşmesi planlayın";
    const ws = en ? "Join the Foundations Workshop list" : "Temel Atölye listesine katılın";
    const nl = en ? "Subscribe to PAIRA Notes" : "PAIRA Notes'a kaydolun";
    if (seg === "D") { p = [ws, trn]; s = [nl, notes]; }
    else if (prio === 0) { p = [call, CALENDLY]; s = [edu, trn]; }
    else if (prio === 1) { p = [edu, trn]; s = [call, CALENDLY]; }
    else { p = [ws, trn]; s = [nl, notes]; }
  } else {
    text = en
      ? 'Your score places you among the pioneers. For you the question is not "should we start" but "how do we scale". Your score qualifies you for the advanced programs we open to a limited number of professionals: AI Governance, AI Leadership Roundtable and Understanding AI Regulations.'
      : 'Skorunuz sizi öncüler arasına yerleştiriyor. Sizin için soru "başlamalı mıyız" değil, "nasıl ölçekleriz". Skorunuz, sınırlı sayıda profesyonele açtığımız ileri seviye programlara uygun: AI Governance, AI Leadership Roundtable ve Understanding AI Regulations.';
    p = [en ? "Apply to the advanced programs" : "İleri seviye programlara başvurun", trn + "#ileri-seviye"];
    s = [en ? "Get Bridge Summit priority" : "Bridge Summit önceliği alın", events];
  }
  return { text, primary: p, secondary: s };
}

// ---------------------------------------------------------------------------
// HTML building blocks (table based, inline styles, Outlook safe)
// ---------------------------------------------------------------------------

const F_SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const F_SANS = "'Outfit', 'Segoe UI', Arial, sans-serif";

function shell(inner, preheader) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#F4F6F9">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader || "") + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden">' +
    '<tr><td style="background:#15233E;padding:22px 32px;font-family:' + F_SANS + ';font-size:15px;letter-spacing:0.32em;font-weight:600;color:#FFFFFF">P A I R A</td></tr>' +
    inner +
    '<tr><td style="padding:18px 32px;border-top:1px solid #E6ECF2;font-family:' + F_SANS + ';font-size:11px;line-height:1.6;color:#8A98AC">PAIRA · mypaira.com</td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

function bars(intel, local) {
  return intel.catScores
    .map((c, i) => {
      const color = i === intel.weakest && intel.tierIdx === 1 ? "#A8842C" : "#2E6FB0";
      const w = Math.max(2, c.pct);
      return (
        '<tr><td style="padding:6px 0 2px;font-family:' + F_SANS + ';font-size:13px;color:#22324B">' + esc(local ? c.nameLocal : c.name) +
        '<span style="float:right;color:#5C6B82">' + c.score + " / " + c.max + "</span></td></tr>" +
        '<tr><td style="padding:0 0 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td width="' + w + '%" style="background:' + color + ';height:6px;font-size:0;line-height:0;border-radius:3px">&nbsp;</td>' +
        (w < 100 ? '<td style="background:#E6ECF2;height:6px;font-size:0;line-height:0">&nbsp;</td>' : "") +
        "</tr></table></td></tr>"
      );
    })
    .join("");
}

function button(label, href, dark) {
  const bg = dark ? "#15233E" : "#FFFFFF";
  const fg = dark ? "#FFFFFF" : "#15233E";
  return (
    '<a href="' + esc(href) + '" style="display:inline-block;background:' + bg + ";color:" + fg +
    ";border:1px solid #15233E;font-family:" + F_SANS + ';font-size:14px;font-weight:500;text-decoration:none;padding:11px 20px;border-radius:8px;margin:4px 8px 4px 0">' +
    esc(label) + "</a>"
  );
}

// ---------------------------------------------------------------------------
// E-mail 1: the lead's report
// ---------------------------------------------------------------------------

export function buildReportEmail(row, intel) {
  const en = intel.lang === "en";
  const fn = firstName(row.name);
  const copy = reportCopy(row, intel);
  const subject = en
    ? "Your AI Readiness Score: " + intel.pct + "% (" + intel.tier + ")"
    : "Yapay Zeka Hazırlık Skorunuz: %" + intel.pct + " (" + intel.tier + ")";
  const hello = en ? (fn ? "Dear " + fn + "," : "Hello,") : (row.name ? "Sayın " + String(row.name).trim() + "," : "Merhaba,");
  const intro = en
    ? "Thank you for completing the AI Readiness Scorecard" + (row.org ? " for " + row.org : "") + ". Here is your personal report, so you can come back to it whenever you need."
    : "Yapay Zeka Hazırlık Skoru'nu" + (row.org ? " " + row.org + " için" : "") + " tamamladığınız için teşekkür ederim. Kişisel raporunuzu, ihtiyaç duyduğunuzda yeniden dönebilmeniz için aşağıda paylaşıyorum.";
  const scoreLabel = en ? "Your score" : "Skorunuz";
  const tierLabel = en ? "Your level" : "Kademeniz";
  const nextLabel = en ? "Suggested next step" : "Önerilen sonraki adım";
  const closing = intel.wantsContact
    ? (en
        ? "You mentioned you would like to discuss this for your team. I will be in touch personally within two business days; if you prefer, you can also pick a time that suits you below."
        : "Bu konuları ekibiniz özelinde konuşmak istediğinizi belirttiniz. İki iş günü içinde size bizzat ulaşacağım; dilerseniz aşağıdan size uygun bir zamanı da seçebilirsiniz.")
    : (en
        ? "If you would like to talk through what this means for your team, simply reply to this e-mail."
        : "Bu sonucun ekibiniz için ne anlama geldiğini konuşmak isterseniz bu e-postayı yanıtlamanız yeterli.");
  const sign = en ? "Warm regards," : "Saygılarımla,";
  const role = en ? "Founder, PAIRA" : "Kurucu, PAIRA";

  const ctas =
    button(copy.primary[0], copy.primary[1], true) +
    button(copy.secondary[0], copy.secondary[1], false) +
    (intel.wantsContact && copy.primary[1] !== CALENDLY && copy.secondary[1] !== CALENDLY
      ? button(en ? "Pick a time" : "Görüşme zamanı seçin", CALENDLY, false)
      : "");

  const inner =
    '<tr><td style="padding:30px 32px 6px;font-family:' + F_SANS + ';font-size:15px;line-height:1.6;color:#22324B">' +
    "<p style=\"margin:0 0 12px\">" + esc(hello) + "</p><p style=\"margin:0\">" + esc(intro) + "</p></td></tr>" +
    '<tr><td style="padding:18px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15233E;border-radius:10px"><tr><td style="padding:24px 26px">' +
    '<div style="font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#A8842C">' + esc(scoreLabel) + "</div>" +
    '<div style="font-family:' + F_SERIF + ';font-size:52px;line-height:1.1;font-weight:600;color:#FFFFFF">%' + intel.pct + "</div>" +
    '<div style="font-family:' + F_SERIF + ';font-style:italic;font-size:22px;color:#ABD4EC">' + esc(tierLabel) + ": " + esc(intel.tier) + "</div>" +
    "</td></tr></table></td></tr>" +
    '<tr><td style="padding:4px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + bars(intel, true) + "</table></td></tr>" +
    '<tr><td style="padding:12px 32px 4px;font-family:' + F_SANS + ';font-size:15px;line-height:1.65;color:#22324B">' + esc(copy.text) + "</td></tr>" +
    '<tr><td style="padding:16px 32px 6px"><div style="font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#2E6FB0;margin-bottom:8px">' + esc(nextLabel) + "</div>" + ctas + "</td></tr>" +
    '<tr><td style="padding:16px 32px 28px;font-family:' + F_SANS + ';font-size:15px;line-height:1.6;color:#22324B">' +
    "<p style=\"margin:0 0 16px\">" + esc(closing) + "</p>" +
    "<p style=\"margin:0\">" + esc(sign) + "<br><strong>Burak Özdemir</strong><br><span style=\"color:#5C6B82\">" + esc(role) + "</span></p></td></tr>";

  return {
    to: row.email,
    toName: row.name || "",
    subject,
    html: shell(inner, en ? "Your personal AI readiness report" : "Kişisel yapay zeka hazırlık raporunuz"),
  };
}

// ---------------------------------------------------------------------------
// E-mail 2: internal notification to Burak (always Turkish)
// ---------------------------------------------------------------------------

function draftReply(row, intel) {
  const fn = firstName(row.name);
  // Draft language for Burak's personal first message: Turkish by default.
  // English only when the lead used the English scorecard AND connected from
  // outside Türkiye (many Turkish speakers land on /en/ via browser language).
  const en = intel.lang === "en" && !!row.country && row.country !== "TR";
  const focusIdx = intel.openDoors[0] ? intel.openDoors[0].catIdx : intel.weakest;
  const focus = (en ? T.en.cats : T.tr.cats)[focusIdx] || "";
  const tier = (intel.tierIdx != null ? (en ? T.en.tiers : T.tr.tiers)[intel.tierIdx] : null) || intel.tier || "";
  const subject = en ? "Your AI Readiness Score, a short follow-up" : "Yapay Zeka Hazırlık Skorunuz üzerine";
  const body = en
    ? (fn ? "Dear " + fn + ",\n\n" : "Hello,\n\n") +
      "Thank you for completing the scorecard. Your result (" + intel.pct + "%, " + tier + ") points to " + focus +
      " as the area where a few concrete steps would make the biggest difference for " + (row.org || "your team") + ".\n\n" +
      "Would a 30 minute conversation next week be useful? We could look at one workflow together and see what an agent supported version would look like.\n\n" +
      "You can pick a time here: " + CALENDLY + "\n\nWarm regards,\nBurak"
    : (row.name ? "Sayın " + String(row.name).trim() + ",\n\n" : "Merhaba,\n\n") +
      "Skorkartı tamamladığınız için teşekkür ederim. Sonucunuz (%" + intel.pct + ", " + tier + "), " + (row.org || "ekibiniz") +
      " için birkaç somut adımın en büyük farkı " + focus + " alanında yaratacağını gösteriyor.\n\n" +
      "Önümüzdeki hafta 30 dakikalık bir görüşme işinize yarar mı? Tek bir iş akışınızı birlikte ele alıp ajan destekli versiyonunun nasıl görüneceğine bakabiliriz.\n\n" +
      "Size uygun zamanı buradan seçebilirsiniz: " + CALENDLY + "\n\nSaygılarımla,\nBurak";
  return {
    subject,
    body,
    mailto: "mailto:" + encodeURIComponent(row.email || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body),
  };
}

function kv(label, value) {
  if (value == null || value === "") return "";
  return (
    '<tr><td style="padding:5px 0;width:150px;vertical-align:top;font-family:' + F_SANS + ';font-size:12px;color:#5C6B82">' + esc(label) +
    '</td><td style="padding:5px 0;font-family:' + F_SANS + ';font-size:14px;color:#22324B">' + value + "</td></tr>"
  );
}

function list(items) {
  if (!items.length) return "";
  return (
    '<ul style="margin:6px 0 0;padding-left:18px;font-family:' + F_SANS + ';font-size:14px;line-height:1.55;color:#22324B">' +
    items.map((i) => "<li style=\"margin-bottom:4px\">" + i + "</li>").join("") +
    "</ul>"
  );
}

export function buildNotifyEmail(row, intel, kind, meta) {
  const m = meta || {};
  const abandoned = kind === "abandoned";
  const who = (row.name || row.email || "İsimsiz") + (row.org ? " (" + row.org + ")" : "");
  const subject = (m.replay ? "[GEÇMİŞ] " : "") + (abandoned
    ? "[YARIM KALDI] " + who + " skorkartı bitirmedi"
    : "[" + intel.heatLabel + "] " + who + " · %" + intel.pct + " " + (intel.tier || ""));
  const reply = draftReply(row, intel);

  const head =
    '<tr><td style="padding:26px 32px 8px">' +
    '<span style="display:inline-block;background:' + (abandoned ? "#8A98AC" : HEAT_COLOR[intel.heat]) +
    ';color:#FFFFFF;font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;font-weight:600;padding:5px 10px;border-radius:4px">' +
    (abandoned ? "YARIM KALDI" : esc(intel.heatLabel) + " LEAD") + "</span>" +
    '<div style="font-family:' + F_SERIF + ';font-size:28px;font-weight:600;color:#15233E;margin-top:12px">' + esc(row.name || row.email) + "</div>" +
    '<div style="font-family:' + F_SANS + ';font-size:14px;color:#5C6B82">' + esc([row.title, row.org].filter(Boolean).join(" · ")) + "</div>" +
    "</td></tr>";

  const contact =
    '<tr><td style="padding:8px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    kv("E-posta", row.email ? '<a href="mailto:' + esc(row.email) + '" style="color:#2E6FB0">' + esc(row.email) + "</a>" : "") +
    kv("Telefon", row.phone ? '<a href="tel:' + esc(row.phone.replace(/\s+/g, "")) + '" style="color:#2E6FB0">' + esc(row.phone) + "</a>" : "") +
    kv("Rol", esc(intel.segmentLabel)) +
    kv("Ekip büyüklüğü", esc(intel.size)) +
    kv("Öncelik", esc(intel.priority)) +
    kv("İletişim talebi", esc(intel.contactAnswer)) +
    kv("Dil / ülke", esc([row.lang, row.country].filter(Boolean).join(" / "))) +
    kv("Bülten izni", row.news_ok ? "Var" : "Yok") +
    kv("Tarih (UTC)", esc(row.updated_at || row.created_at)) +
    "</table></td></tr>";

  let body = "";
  if (abandoned) {
    body =
      '<tr><td style="padding:10px 32px 4px;font-family:' + F_SANS + ';font-size:14px;line-height:1.6;color:#22324B">' +
      "Bilgilerini bıraktı, " + (intel.segment ? "rolünü seçti, " : "") +
      "ancak değerlendirmeyi tamamlamadı. Raporu yok; kısa ve kişisel bir not ilgiyi geri kazanmanın en kolay yolu." +
      "</td></tr>";
  } else {
    body =
      '<tr><td style="padding:14px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;border-radius:8px"><tr><td style="padding:16px 20px">' +
      '<div style="font-family:' + F_SERIF + ';font-size:34px;font-weight:600;color:#15233E">%' + intel.pct +
      ' <span style="font-style:italic;font-weight:400;font-size:22px;color:#2E6FB0">' + esc(intel.tier) + "</span></div>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + bars(intel, false) + "</table>" +
      "</td></tr></table></td></tr>" +
      '<tr><td style="padding:14px 32px 0;font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#2E6FB0">Neden ' + esc(intel.heatLabel.toLowerCase()) + "</td></tr>" +
      '<tr><td style="padding:0 32px">' + list(intel.reasons.map(esc)) + "</td></tr>" +
      (intel.openDoors.length
        ? '<tr><td style="padding:14px 32px 0;font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#A8842C">Açık kapılar: "Hayır, ama önceliğim" dedikleri</td></tr>' +
          '<tr><td style="padding:0 32px">' + list(intel.openDoors.map((d) => "<strong>" + esc(d.cat) + ":</strong> " + esc(d.question))) + "</td></tr>"
        : "") +
      (intel.gaps.length
        ? '<tr><td style="padding:14px 32px 0;font-family:' + F_SANS + ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#5C6B82">"Hayır" dedikleri</td></tr>' +
          '<tr><td style="padding:0 32px">' + list(intel.gaps.map((d) => "<strong>" + esc(d.cat) + ":</strong> " + esc(d.question))) + "</td></tr>"
        : "");
  }

  const actions =
    '<tr><td style="padding:20px 32px 6px">' +
    (row.email ? button("Hazır taslakla yanıtla", reply.mailto, true) : "") +
    button("Calendly linki", CALENDLY, false) +
    "</td></tr>" +
    '<tr><td style="padding:4px 32px 26px;font-family:' + F_SANS + ';font-size:12px;line-height:1.55;color:#8A98AC">' +
    "Taslak, kişinin en zayıf alanına veya önceliğim dediği konuya göre hazırlanır; göndermeden önce kişiselleştirin." +
    (m.reportSent ? " Kişiye rapor e-postası otomatik gönderildi." : abandoned ? "" : " Kişiye bu kez rapor e-postası gönderilmedi.") +
    "</td></tr>";

  return {
    to: NOTIFY_TO,
    subject,
    html: shell(head + contact + body + actions, subject),
    draft: { subject: reply.subject, body: reply.body },
  };
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

// kind: "completed" | "abandoned"
// opts.withReport: include the lead-facing report e-mail (default true for completed)
export function buildEvent(row, kind, opts) {
  const o = opts || {};
  const intel = analyze(row);
  const withReport = kind === "completed" && o.withReport !== false && !!row.email && intel.pct != null;
  return {
    event: "scorecard." + kind,
    replay: !!o.replay,
    sent_at: new Date().toISOString(),
    lead: {
      id: row.id,
      client_id: row.client_id,
      name: row.name || "",
      email: row.email || "",
      org: row.org || "",
      title: row.title || "",
      phone: row.phone || "",
      lang: intel.lang,
      country: row.country || "",
      kvkk_ok: !!row.kvkk_ok,
      news_ok: !!row.news_ok,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    intel: {
      heat: kind === "abandoned" ? "abandoned" : intel.heat,
      heat_label: kind === "abandoned" ? "YARIM KALDI" : intel.heatLabel,
      reasons: intel.reasons,
      score_pct: intel.pct,
      tier: intel.tier,
      segment: intel.segment,
      segment_label: intel.segmentLabel,
      size: intel.size,
      priority: intel.priority,
      wants_contact: intel.wantsContact,
      categories: intel.catScores.map((c) => ({ name: c.name, score: c.score, max: c.max, pct: c.pct })),
      open_doors: intel.openDoors.map((d) => d.cat + ": " + d.question),
      summary_line:
        kind === "abandoned"
          ? "Skorkartı yarıda bıraktı"
          : [intel.heatLabel, "%" + intel.pct + " " + (intel.tier || "")].concat(intel.reasons).join(" · "),
    },
    emails: {
      notify: buildNotifyEmail(row, intel, kind, { replay: !!o.replay, reportSent: withReport }),
      report: withReport ? buildReportEmail(row, intel) : null,
    },
  };
}
