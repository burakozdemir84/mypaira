# Ön Hazırlık (pre-meeting discovery)

Müşteriye toplantı öncesinde gönderilen tek bağlantı: **https://www.mypaira.com/on-hazirlik**

## Akış

1. **Şirket bilgileri.** Müşteri unvan, adres, yetkili kişi, unvan, e-posta ve (isteğe bağlı) telefon girer.
2. **Gizlilik sözleşmesi.** Bu bilgilerle 3 sayfalık *Proje hazırlık gizlilik taahhüdü ve sözleşmesi* doldurulur (1. maddedeki müşteri unvanı, adresi ve bildirim e-postası) ve sonundaki OD imza alanına PAIRA'nın imza/kaşe görseli yerleşir; PDF olarak indirilebilir. Aynı anda Make webhook'una bildirim gider.
3. **Ön hazırlık formu.** 10 başlık; yazdıkça kaydedilir. Sayfanın adresi (`#t=...`) kişiye özeldir; aynı adresle toplantıya kadar dönülebilir ve ekip arkadaşlarıyla paylaşılabilir.

## Dosyalar

| | |
|---|---|
| Müşteri sayfası | `site/on-hazirlik.html` |
| Yönetim sayfası | `site/on-hazirlik-yonetim.html` (`/on-hazirlik-yonetim`, `DISCOVERY_ADMIN_KEY` ile) |
| API | `functions/api/discovery/start.js`, `form.js`, `nda.js`, `admin.js`; ortak kod `lib/discovery.js` |
| Sözleşme | `tools/nda/nda-content.json` (Word dosyasından), `tools/nda/build-template.mjs`, `site/assets/nda/paira-nda-sablon.pdf`, `lib/nda-template.js`, `lib/nda-pdf.js`, `lib/nda-layout.js` |
| Veri | D1 `paira_leads`: `discovery_requests`, `discovery_settings` (tablolar ilk istekte oluşur) |

## Sözleşme nasıl üretiliyor

`node tools/nda/build-template.mjs` sözleşme metnini dizip imzasız bir şablon PDF ve yerleşim haritası üretir. Her istekte `lib/nda-pdf.js` şablona küçük bir artımlı güncelleme ekler: müşteri unvanı, adresi, bildirim e-postası ve imza görseli. Şablon yeniden işlenmediği için istek başına CPU maliyeti çok düşüktür (Cloudflare'in istek başına CPU sınırı için önemli).

**Sözleşme metni değişirse:** Word dosyasındaki paragrafları `tools/nda/nda-content.json` içine aktarın (müşteri alanları `fields` bloğu olarak kalacak şekilde), `node tools/nda/build-template.mjs` çalıştırın ve üretilen iki dosyayı (`site/assets/nda/paira-nda-sablon.pdf`, `lib/nda-template.js`) birlikte commit edin.

**İmza ve kaşe görseli** repoda tutulmaz (repo herkese açık). Yönetim sayfasındaki "İmza ve kaşe görseli" alanından bir kez yüklenir ve D1'de saklanır. Yüklenene kadar sözleşme indirilemez.

## Yönetim anahtarı

Cloudflare Pages → mypaira-pages → Settings → Variables and Secrets altında **Secret** türünde `DISCOVERY_ADMIN_KEY` tanımlanır; yönetim sayfasına bu değerle girilir. Cloudflare secret değerlerini sonradan göstermez, değeri ayrıca saklayın. Yönetim API'si Make için `PAIRA_AUTOMATION_KEY` değerini de kabul eder.

## E-postalar (Make)

Cloudflare Pages → mypaira-pages → Settings → Variables and Secrets altında `DISCOVERY_WEBHOOK_URL` = `https://hook.eu1.make.com/lqplbdp9tz7mf7nh35hfe4y63btqd5oc` tanımlıdır. Site e-postaların konu ve HTML'ini hazırlar (`lib/discovery-mail.js`); Make senaryosu **PAIRA Ön hazırlık e-postaları** yalnızca Outlook (burak@mypaira.com) üzerinden teslim eder:

- `discovery_started`: müşteriye imzalı sözleşme (PDF eki, `nda.url` adresinden `X-Invite-Token` başlığıyla indirilir) ve kişiye özel form bağlantısı; Burak'a bildirim.
- `discovery_submitted` / `discovery_updated`: Burak'a yanıtların özeti.

Değişken tanımlı değilse e-posta gitmez; kayıtlar yönetim sayfasında görülür.

## Koruma

- Kişiye özel adres 256 bitlik rastgele bir tokendır; URL'nin `#` kısmında durduğu için sunucu loglarına gitmez. Veritabanında yalnızca özeti tutulur.
- Erişim 60 gün açık kalır; yönetim sayfasından "+30 gün" ile uzatılır.
- Başlangıç formunda bot tuzağı (gizli alan) ve IP başına saatte 5 kayıt sınırı var.
- Sunucu yalnızca tanımlı form alanlarını kabul eder; dosya yükleme yoktur.

## Saklama

Süresi 180 günden uzun süre önce dolmuş kayıtları silmek için:

```
POST /api/discovery/admin   X-PAIRA-KEY: ...
{"action":"purge","older_than_days":180}
```
