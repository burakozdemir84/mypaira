// E-mails for the pre-meeting discovery flow. The site prepares subject and
// HTML; Make (DISCOVERY_WEBHOOK_URL) only delivers them through Outlook, the
// same split the scorecard uses.

const NAVY = "#15233E", INK = "#22324B", MUTE = "#5C6B82", LINE = "#D7E0EA", SKY = "#E9F2F9";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shell(inner) {
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#F6F9FC;font-family:Arial,Helvetica,sans-serif;color:${INK};font-size:15px;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F9FC;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px">
<tr><td style="background:${NAVY};padding:18px 28px;border-radius:12px 12px 0 0;color:#FFFFFF;font-size:20px;font-weight:bold;letter-spacing:.04em">PAIRA</td></tr>
<tr><td style="padding:28px">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href, label) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${esc(label)}</a></p>`;
}

export function customerEmail(r, formUrl) {
  const name = (r.contact_name || "").trim();
  const html = shell(`
<p style="margin-top:0">${name ? "Merhaba " + esc(name) + "," : "Merhaba,"}</p>
<p>PAIRA ile yapacağımız toplantı öncesinde paylaştığınız bilgiler için teşekkür ederiz.</p>
<p>OD Etüd ve Müşavirlik Ltd. Şti. (PAIRA) tarafından imzalanmış <b>Proje Hazırlık Gizlilik Taahhüdü ve Sözleşmesi</b> ekte yer alıyor.</p>
<p>Ön hazırlık formunuza aşağıdaki bağlantıdan toplantıya kadar istediğiniz zaman dönebilirsiniz. Bağlantı size özeldir; yalnızca ilgili ekip arkadaşlarınızla paylaşmanızı rica ederiz.</p>
${button(formUrl, "Ön hazırlık formunu aç")}
<p>Sorularınız için bu e-postayı yanıtlamanız yeterli.</p>
<p style="margin-bottom:0">Saygılarımla,<br>Burak Özdemir<br><span style="color:${MUTE}">PAIRA</span></p>`);
  return {
    to: r.contact_email,
    toName: name,
    subject: "PAIRA | Gizlilik sözleşmeniz ve ön hazırlık formunuz",
    html,
  };
}

function rows(pairs) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">` +
    pairs.filter(([, v]) => v != null && v !== "").map(([k, v]) =>
      `<tr><td style="padding:7px 10px 7px 0;border-bottom:1px solid ${LINE};color:${MUTE};vertical-align:top;width:170px">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};white-space:pre-wrap">${esc(v)}</td></tr>`
    ).join("") + `</table>`;
}

export function startedNotify(r, adminUrl) {
  const html = shell(`
<p style="margin-top:0"><b>${esc(r.org)}</b> ön hazırlık sürecini başlattı ve gizlilik sözleşmesini aldı.</p>
${rows([["Kişi", [r.contact_name, r.contact_title].filter(Boolean).join(", ")], ["E-posta", r.contact_email], ["Telefon", r.phone], ["Adres", r.address]])}
${button(adminUrl, "Yönetim sayfasını aç")}`);
  return { to: "burak@mypaira.com", subject: `Ön hazırlık başladı: ${r.org}`, html };
}

const LABELS = [
  ["filled_by", "Dolduran"], ["filled_role", "Rol"],
  ["q1_process", "1. Süreç"], ["q1_later", "1. Toplantıda konuşalım"],
  ["q2_roles", "2. Roller"], ["q2_later", "2. Toplantıda konuşalım"],
  ["q3_volume", "3. Aylık hacim"], ["q3_time", "3. İşlem süresi"], ["q3_bottleneck", "3. Zaman alan adımlar"], ["q3_later", "3. Toplantıda konuşalım"],
  ["q4_ready", "4. Hazır belgeler"], ["q4_note", "4. Not"],
  ["q5_systems", "5. Sistemler"], ["q5_other", "5. Diğer yazılımlar"], ["q5_owner", "5. Yöneten"],
  ["q6_azure", "6. Azure"], ["q6_api", "6. API"], ["q6_cloud_limits", "6. Bulut kısıtı"], ["q6_note", "6. Not"],
  ["q7_target", "7. Hedef işleyiş"], ["q7_later", "7. Toplantıda konuşalım"],
  ["q8_success", "8. Başarı ölçütü"], ["q8_golive", "8. Kullanıma alma"], ["q8_pilot", "8. Pilot ekip"],
  ["q9_cost", "9. Maliyet"], ["q9_verbal", "9. Sözlü paylaşım"],
  ["q10_decision", "10. Karar süreci"], ["q10_budget", "10. Bütçe"], ["q10_reps", "10. Temsilciler"],
  ["q_other", "Ek not"],
];

export function submittedNotify(r, answers, updated, adminUrl) {
  const pairs = LABELS.map(([k, label]) => {
    const v = answers[k];
    if (v == null) return [label, null];
    return [label, v === true ? "Evet" : Array.isArray(v) ? v.join(", ") : v];
  });
  const html = shell(`
<p style="margin-top:0"><b>${esc(r.org)}</b> ön hazırlık formunu ${updated ? "güncelledi" : "gönderdi"}.</p>
${rows([["Kişi", r.contact_name], ["E-posta", r.contact_email]])}
<p style="margin:22px 0 8px;color:${NAVY};font-weight:bold">Yanıtlar</p>
${pairs.some(([, v]) => v != null) ? rows(pairs) : `<p style="color:${MUTE}">Yanıt alanları boş.</p>`}
${button(adminUrl, "Yönetim sayfasını aç")}`);
  return { to: "burak@mypaira.com", subject: `Ön hazırlık formu ${updated ? "güncellendi" : "gönderildi"}: ${r.org}`, html };
}
