# ☁️ Bulut Senkronizasyonu ve Yedekleme (Cloud Backup & Sync)

Bu doküman, **Ailem** uygulamasının **Zorunlu Bulut Senkronizasyonu**, **Opsiyonel Toplu & Artımlı Sohbet Yedeklemesi** ve **Yeni Cihazda Geri Yükleme Motoru (Restore Engine)** mimarisini açıklar.

---

## 1. Zorunlu Bulut Senkronizasyonu (Mandatory Data Sync)

### Kural:
> Sohbet dışındaki tüm yapısal veriler (Notlar, Görevler, Bütçe & Gider kayıtları, Alışveriş listeleri, Hatırlatıcılar ve Ayarlar) kullanıcıya sorulmaksızın **kesinlikle bulutta tutulur ve cihazlar arasında anında senkronize edilir.**

### İşleyiş:
1. Kullanıcı uygulamayı açtığında veya yeni bir cihazdan giriş yaptığında `FamilyContext.tsx` otomatik olarak `syncService.syncMandatoryData(familyId)` metodunu çağırır.
2. Backend'deki `GET /api/v1/sync/mandatory-data` endpoint'i tek bir atomik istekte tüm bu kategorileri JSON formatında döner.
3. İstemci tarafında `cacheService` 0ms bellek önbelleğine yazılır; kullanıcı internet kesilse dahi tüm geçmiş notlarına ve listelerine anında ulaşır.

---

## 2. Opsiyonel Toplu & Artımlı Sohbet Yedeklemesi (Batch Incremental Chat Backup)

### Kural:
> Sohbet ve medya verileri performans, kota ve gizlilik nedeniyle varsayılan olarak cihazda tutulur (**Offline-First**). Bulut yedeklemesi sadece **Aile Yöneticisi** tarafından Aile Ayarları'ndan açılabilir.

```
                    İSTEMCİ MESAJ GÖNDERİMİ
                              │
                              ▼
                 1. Yerel Diske / SQLite Yaz
                 2. Ekranda Anında Göster (0ms)
                              │
                ┌─────────────┴─────────────┐
                │                           │
       [Bulut Yedek Kapalı]        [Bulut Yedek Aktif]
                │                           │
                ▼                           ▼
            Yerelde Kalır         Dirty Queue'ya Ekle
                                (localStorage: pending_backup)
                                            │
                                ┌───────────┴───────────┐
                                │                       │
                         20 Saniye Doldu        Kuyrukta 8+ Mesaj
                                │                       │
                                └───────────┬───────────┘
                                            │
                                            ▼
                                   POST /api/v1/sync/chat-backup
                                   (Tek Seferde Toplu Gönderim)
                                            │
                                            ▼
                                   Pre-flight Quota Denetimi
                                   Deduplication (client_message_id)
                                            │
                                            ▼
                                   Buluta Yaz ve Onayla
```

### Tekilleştirme (Deduplication):
* Her mesaj oluşturulduğunda benzersiz bir `client_message_id` alır (Örn: `msg_1788290000000_abc123`).
* Ağ kesintisi veya mükerrer gönderimlerde backend aynı `client_message_id` veya `id`ye sahip mesajları tespit eder ve ikinci kez kaydetmez (Idempotent).

---

## 3. Yeni Cihazda Geri Yükleme Motoru (Interactive Restore Engine)

Bir kullanıcı yeni bir telefona geçtiğinde veya uygulamayı sıfırdan kurduğunda:

```
                  UYGULAMA AÇILIŞI (Yeni Cihaz)
                              │
                              ▼
                   Zorunlu Veriler Çekildi
                              │
                              ▼
           Bulut Sohbet Yedeklemesi Aktif mi?
           (Family.cloud_chat_backup_enabled == true)
                              │
               ┌──────────────┴──────────────┐
               │                             │
             [EVET]                        [HAYIR]
               │                             │
               ▼                             ▼
    CloudRestorePromptModal Açılır      Normal Kullanım
    "Sohbet geçmişi yüklensin mi?"
               │
    ┌──────────┴──────────┐
    │                     │
 [Evet, Yükle]       [Hayır, Atla]
    │                     │
    ▼                     ▼
Parça Parça İndir    Sohbet boş başlar.
İlerleme: %78        (Daha sonra ayarlardan
Mesajlar: 150/150    tekrar yüklenebilir)
Medya: 12/12
    │
    ▼
Yerel Diske Yaz
(localMediaVault)
    │
    ▼
Tamamlandı!
```

### Restore Motoru Arayüzü (`CloudRestorePromptModal.tsx`):
* Canlı ilerleme çubuğu (`Progress Bar`)
* Yüzde sayacı (`%0` $\rightarrow$ `%100`)
* Aşama açıklamaları (*"Mesaj geçmişi alınıyor...", "Fotoğraf ve ses kayıtları yerel kasaya indiriliyor..."*)
* Öğe sayaçları (*Mesajlar: 240/240*, *Medya: 18/18*).
