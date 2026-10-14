# Skorkart lead bildirimleri

Skorkartı dolduran herkes artık üç şey üretir: Burak'a anlık bir bildirim, kişiye kendi raporu ve CRM'de bir kayıt. Site tarafı (Cloudflare) skoru, lead ısısını ve iki e-postanın HTML'ini hazırlar; Make.com yalnızca teslim eder.

```
Skorkart tamamlandı ─► /api/lead ─► D1 (leads) ─► LEAD_WEBHOOK_URL (Make)
                                                    ├─ Outlook: bildirim  → burak@mypaira.com
                                                    ├─ Outlook: rapor     → kişinin e-postası
                                                    └─ Notion: CRM kaydı

Make zamanlayıcı (saatte 1) ─► POST /api/leads/abandoned ─► aynı webhook (yarım kalanlar)
```

## Lead ısısı

| Isı | Kural |
|---|---|
| SICAK | "Evet, benimle iletişime geçin" dedi, **veya** ICP profili + yapay zekayı acil öncelik görüyor |
| ILIK | ICP profili, **veya** acil öncelik, **veya** karar verici + planlıyor |
| SOĞUK | Diğerleri (ör. yönetici olmayan avukat, sadece takip ediyor) |
| YARIM KALDI | Bilgilerini bıraktı, 60 dakikadır değerlendirmeyi bitirmedi |

ICP profili: büro yöneticisi ve 16+ avukat (ICP-1), şirket hukuk yöneticisi ve 6+ kişilik ekip (ICP-2). Kurallar `lib/lead-intel.js` içinde `analyze()`; gerçek dönüşüm verisi geldikçe ayarlanmalı.

"Açık kapılar": kişinin "Hayır, ama önceliğim" dediği sorular. Satış görüşmesinin en iyi açılış noktası bunlardır. Ekim 2026 öncesi kayıtlarda bu bilgi yoktur.

## Uç noktalar

Hepsi `X-PAIRA-KEY` başlığı ister: değer `LEADS_KEY` (yalnızca lead uç noktaları, skorkart Make hesabı) veya `PAIRA_AUTOMATION_KEY` olabilir. Cloudflare secret'ları sonradan okunamaz; değerin asıl kopyası 1Password'dedir.

| Uç nokta | Ne yapar |
|---|---|
| `GET /api/leads?source=scorecard&format=csv` | Tüm lead'leri ısı, skor ve açık kapılarla CSV olarak verir (`since=2026-09-01`, `stage=complete` filtreleri) |
| `POST /api/leads/abandoned` | Yarım kalanları bulur, her birini bir kez webhook'a yollar (`?dry=1` sadece listeler, `?days=60` geçmişe bakar) |
| `POST /api/leads/replay` | Bildirim gitmemiş tamamlanmış skorkartları geriye dönük yollar. Varsayılan: kişiye rapor **gitmez**. Gövde: `{"since":"2026-09-01","dry":true}` |

Her olay `lead_events` tablosunda kayıtlıdır; aynı kişi için aynı bildirim iki kez gitmez. Webhook başarısız olursa kayıt silinir ve bir sonraki denemede tekrar gönderilir.

## Kurulum (bir kez)

### 1. Make senaryosu: "Skorkart lead"

1. **Webhooks > Custom webhook** ekleyin, adresini kopyalayın.
2. Cloudflare > Pages > `mypaira-pages` > Settings > Variables and Secrets: `LEAD_WEBHOOK_URL` = bu adres (Production, tür: Secret). Kaydettikten sonra yeni bir deploy gerekir (main'e herhangi bir push veya panelden "Retry deployment").
3. Webhook'un veri yapısını öğrenmesi için skorkartı bir kez kendiniz doldurun (veya `replay` ile `dry` olmadan tek bir eski kayıt yollayın).
4. **Router** ekleyin, üç kol:
   - **Kol 1, bildirim:** Microsoft 365 Email > Send an email. To: `{{emails.notify.to}}`, Subject: `{{emails.notify.subject}}`, Body type: HTML, Content: `{{emails.notify.html}}`.
   - **Kol 2, rapor:** Filtre: `emails.report.to` *exists*. Microsoft 365 Email > Send an email. To: `{{emails.report.to}}`, Subject: `{{emails.report.subject}}`, Body type: HTML, Content: `{{emails.report.html}}`. Gönderen burak@mypaira.com olduğu için kişi yanıtladığında doğrudan size döner.
   - **Kol 3, CRM:** Notion > Create a database item (Kişiler / CRM tablosu). Önerilen eşleme: Ad `lead.name`, E-posta `lead.email`, Kurum `lead.org`, Unvan `lead.title`, Telefon `lead.phone`, Kaynak "Skorkart", Isı `intel.heat_label`, Skor `intel.score_pct`, Kademe `intel.tier`, Not `intel.summary_line` + `intel.open_doors`. İsterseniz önce e-postaya göre arayıp varsa güncelleyin.
5. İsteğe bağlı: SICAK olanlar için telefona anlık bildirim (Filtre `intel.heat` = `hot`; Teams mesajı veya Make mobil uygulaması bildirimi).

### 2. Make senaryosu: "Skorkart yarım kalanlar"

1. Tetikleyici: saatte bir çalışan zamanlayıcı.
2. **HTTP > Make a request**: `POST https://www.mypaira.com/api/leads/abandoned`, başlık `X-PAIRA-KEY` = mevcut `PAIRA_AUTOMATION_KEY` (iyzico senaryosundaki ile aynı).
3. Bu senaryo kendisi e-posta atmaz; yarım kalanlar ilk senaryonun webhook'una `scorecard.abandoned` olarak düşer ve yalnızca Kol 1 ile Kol 3 çalışır (rapor yoktur).

### 3. Geçmiş kayıtları içeri alma

Webhook çalıştıktan sonra bir kez:

```
POST https://www.mypaira.com/api/leads/replay      {"dry": true}       → listeyi görün
POST https://www.mypaira.com/api/leads/replay      {}                  → bildirim + CRM, kişiye e-posta yok
POST https://www.mypaira.com/api/leads/abandoned?days=90               → eski yarım kalanlar
```

Bunu Make'te tek seferlik bir HTTP modülüyle çalıştırmak yeterli.

## Webhook gövdesi (özet)

```json
{
  "event": "scorecard.completed | scorecard.abandoned",
  "replay": false,
  "lead":   { "name", "email", "org", "title", "phone", "lang", "country", "kvkk_ok", "news_ok", "created_at" },
  "intel":  { "heat": "hot|warm|cold|abandoned", "heat_label", "reasons": [], "score_pct", "tier",
              "segment_label", "size", "priority", "wants_contact", "categories": [], "open_doors": [], "summary_line" },
  "emails": { "notify": { "to", "subject", "html", "draft": { "subject", "body" } },
              "report": { "to", "subject", "html" } | null }
}
```

## Hukuki not

Skorkart formundaki zorunlu onay metni "raporumun hazırlanıp tarafıma sunulması ve talebim doğrultusunda benimle iletişim kurulması" amacını zaten kapsar: rapor e-postası ve iletişim isteyenlere kişisel dönüş bu kapsamdadır. Bülten ve tanıtım içerikli otomatik diziler ise yalnızca `news_ok = true` olanlara gönderilmelidir.
