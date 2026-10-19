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

// Question-and-answer layout of the notification, mirroring the form.
// Each question lists its fields; a field left empty shows "Yanıtlanmadı".
const SECTIONS = [
  ["A. İş akışı ve otomasyon ihtiyacı", [
    ["1. Hangi hukuki iş sürecini otomatikleştirmek istiyorsunuz?", [["q1_process", null]], "q1_later"],
    ["2. Bu süreçte kimler, hangi aşamalarda görev alıyor?", [["q2_roles", null]], "q2_later"],
    ["3. Sürecin iş yükü ve harcanan zaman nedir?", [
      ["q3_volume", "Aylık işlem / dosya sayısı"],
      ["q3_time", "Bir işlemin aktif çalışma süresi"],
      ["q3_bottleneck", "En çok zaman alan veya tekrar eden adımlar"]], "q3_later"],
    ["4. Süreçte kullanılan örnek belgeler ve şablonlar hazır mı?", [
      ["q4_ready", "Hazır olanlar"], ["q4_note", "Not"]]],
  ]],
  ["B. Mevcut teknoloji ve entegrasyon", [
    ["5. Bu süreçte hangi yazılım ve sistemleri kullanıyorsunuz?", [
      ["q5_systems", "İşaretlenenler"],
      ["q5_other", "Ürün adları ve diğer yazılımlar"],
      ["q5_owner", "Sistemleri ve lisansları kim yönetiyor?"]]],
    ["6. Teknik altyapınızın entegrasyon imkanları nelerdir?", [
      ["q6_azure", "Aktif bir Microsoft Azure aboneliğiniz var mı?"],
      ["q6_api", "Mevcut sistemlerinizin API veya başka entegrasyon imkanı var mı?"],
      ["q6_cloud_limits", "Bulut tabanlı AI hizmetleri için teknik veya kurumsal bir kısıtınız var mı?"],
      ["q6_note", "Açıklama"]]],
  ]],
  ["C. Hedef çözüm ve başarı kriterleri", [
    ["7. Otomasyon sonunda nasıl bir çalışma biçimi bekliyorsunuz?", [["q7_target", null]], "q7_later"],
    ["8. Projenin başarılı olduğunu nasıl ölçeceğiz?", [
      ["q8_success", "Başarı ölçütleri"],
      ["q8_golive", "Hedeflenen kullanıma alma zamanı"],
      ["q8_pilot", "Pilota katılabilecek kişiler"]]],
  ]],
  ["D. Proje ekonomisi ve karar süreci", [
    ["9. Bu sürecin bugünkü maliyetini yaklaşık olarak hesaplayabilir miyiz?", [["q9_cost", null]], "q9_verbal"],
    ["10. Projeye kimler karar verecek ve zamanlama beklentiniz nedir?", [
      ["q10_decision", "Karar vericiler ve onay süreci"],
      ["q10_budget", "Bütçe çerçevesi"],
      ["q10_reps", "İş birimi / IT temsilcileri"]]],
  ]],
];

const TRI = { var: "Var", yok: "Yok", bilmiyorum: "Bilmiyorum" };
function fmt(v) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (v === true) return "Evet";
  if (Array.isArray(v)) return v.join(", ");
  return TRI[v] || String(v);
}
const EMPTY = `<span style="color:${MUTE};font-style:italic">Yanıtlanmadı</span>`;
const val = (v) => (v == null ? EMPTY : esc(v));

function qaHtml(answers) {
  let html = "";
  let blanks = [];
  for (const [title, questions] of SECTIONS) {
    html += `<p style="margin:26px 0 6px;color:${NAVY};font-weight:bold;font-size:16px;border-bottom:2px solid ${LINE};padding-bottom:6px">${esc(title)}</p>`;
    for (const [q, fields, later] of questions) {
      html += `<p style="margin:16px 0 6px;font-weight:bold">${esc(q)}</p>`;
      const laterOn = later && answers[later] === true;
      const single = fields.length === 1 && fields[0][1] == null;
      if (single) {
        const v = fmt(answers[fields[0][0]]);
        if (v == null && !laterOn) blanks.push(q.split(".")[0]);
        html += `<p style="margin:0;white-space:pre-wrap">${v == null && laterOn ? "" : val(v)}</p>`;
      } else {
        html += `<ul style="margin:0;padding-left:20px">`;
        for (const [k, label] of fields) {
          const v = fmt(answers[k]);
          if (v == null) blanks.push(q.split(".")[0] + " (" + label + ")");
          html += `<li style="margin:3px 0;white-space:pre-wrap"><span style="color:${MUTE}">${esc(label)}${label.endsWith("?") ? "" : ":"}</span> ${val(v)}</li>`;
        }
        html += `</ul>`;
      }
      if (laterOn) {
        const note = later === "q9_verbal" ? "Bu bilgileri toplantıda sözlü paylaşmayı tercih ediyor." : "Bu başlığı toplantıda konuşmak istiyor.";
        html += `<p style="margin:6px 0 0;color:${MUTE};font-style:italic">${note}</p>`;
      }
    }
  }
  const other = fmt(answers.q_other);
  html += `<p style="margin:22px 0 6px;font-weight:bold">Ek not</p><p style="margin:0;white-space:pre-wrap">${other == null ? `<span style="color:${MUTE}">Yok</span>` : esc(other)}</p>`;
  return { html, blanks };
}

export function submittedNotify(r, answers, updated, adminUrl) {
  const filler = [fmt(answers.filled_by), fmt(answers.filled_role)].filter(Boolean).join(", ");
  const { html: qa, blanks } = qaHtml(answers);
  const html = shell(`
<p style="margin-top:0"><b>${esc(r.org)}</b> ön hazırlık formunu ${updated ? "güncelledi" : "gönderdi"}.</p>
${rows([["İletişim kişisi", r.contact_name], ["E-posta", r.contact_email], ["Formu dolduran", filler || null]])}
${qa}
${blanks.length ? `<p style="margin:24px 0 0;padding:12px 14px;background:${SKY};border-radius:8px;font-size:14px"><b>Boş kalan başlıklar:</b> ${esc(blanks.join(", "))}. Toplantıda sorulacaklar listesi olarak kullanılabilir.</p>` : ""}
${button(adminUrl, "Yönetim sayfasını aç")}`);
  return { to: "burak@mypaira.com", subject: `Ön hazırlık formu ${updated ? "güncellendi" : "gönderildi"}: ${r.org}`, html };
}
