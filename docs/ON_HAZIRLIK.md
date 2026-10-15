# Ön Hazırlık Formu (pre-meeting discovery)

Müşteriye toplantı öncesinde gönderilen, herkese açık olmayan form.

| | |
|---|---|
| Müşteri sayfası | `/on-hazirlik#t=<token>` (`site/on-hazirlik.html`) |
| Yönetim sayfası | `/on-hazirlik-yonetim` (`site/on-hazirlik-yonetim.html`) |
| API | `functions/api/discovery/form.js`, `functions/api/discovery/admin.js`, `lib/discovery.js` |
| Veri | D1 `paira_leads`, tablo `discovery_invites` (ilk istekte oluşur) |

## Erişim modeli

- Her toplantı için ayrı davet. Bağlantı 256 bit rastgele bir token taşır; token URL'nin `#` kısmındadır, bu yüzden sunucu loglarına, proxy'lere ve Referer başlığına gitmez.
- Veritabanında yalnızca tokenın SHA-256 özeti tutulur. Veritabanı sızsa bile çalışan bağlantı sızmaz.
- Varsayılan geçerlilik: toplantıdan 3 gün sonrasına kadar (toplantı tarihi yoksa 21 gün, en fazla 60 gün).
- Bağlantıya sahip herkes formu görür ve düzenler (müşteri IT ekibiyle paylaşabilsin diye bilinçli tercih). Sayfa bunu açıkça yazar.
- Yönetim: **Yeni bağlantı** (eski bağlantı ölür), **+7 gün**, **Kilitle** (salt okunur), **İptal**, **Sil**.
- İki kişi aynı anda düzenlerse sürüm kontrolü (`version`) çakışmayı yakalar, sayfa alan bazında birleştirir.
- Sunucu yalnızca tanımlı alanları kabul eder, uzunlukları keser, gövde 48 KB ile sınırlıdır. Dosya yükleme yoktur.
- Sayfalar `noindex`, `no-store`, `no-referrer`, çerçevelenemez (CSP `frame-ancestors 'none'`).
- Yönetim API'si yalnızca `PAIRA_AUTOMATION_KEY` kabul eder (skorkart için verilen `LEADS_KEY` burada geçmez).

## Ayarlar (Cloudflare Pages → mypaira-pages → Settings → Variables)

- `PAIRA_AUTOMATION_KEY`: zaten tanımlı, yönetim sayfası bununla açılır.
- `DISCOVERY_WEBHOOK_URL` (isteğe bağlı): form gönderildiğinde yanıtlar bu Make webhook'una POST edilir (`discovery_submitted` / `discovery_updated`). Tanımlı değilse bildirim gitmez, yanıtlar yönetim sayfasında görülür.
- `SITE_URL` (isteğe bağlı): bağlantılar için temel adres, varsayılan isteğin geldiği adres.

## Saklama

Süresi 180 günden uzun süre önce dolmuş davetleri silmek için:

```
POST /api/discovery/admin   X-PAIRA-KEY: ...
{"action":"purge","older_than_days":180}
```

Make'te aylık bir zamanlayıcıyla çağrılabilir.
