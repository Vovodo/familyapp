# 💾 Akıllı Supabase Storage Quota & Retention Engine

Bu doküman, **Ailem** uygulamasının sınırlı Supabase Storage (veya S3 Object Storage) alanını bayt seviyesinde yöneten, mantıksal bölümlendirme ve otomatik **Retention (Eski Veri Temizliği)** mekanizmasını ayrıntılarıyla açıklar.

---

## 1. Mantıksal Kota Modeli (Logical Quota Partitioning)

Fiziksel 2 GB'lık depolama alanı, uygulama seviyesinde 3 temel kategoriye ayrılmıştır:

```
                          TOPLAM KAPASİTE (2 GB)
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
            SOHBET (%50)        FOTOĞRAF (%40)       SES KAYDI (%10)
               (1 GB)              (800 MB)             (200 MB)
                 │                   │                   │
                 ▼                   ▼                   ▼
           • Metin mesajları   • Albüm resimleri   • Sesli sohbet
           • JSON arşivleri    • Sohbet resimleri    notları (.webm)
           • Meta veriler      • Küçük resimler
```

### Yapılandırma (`backend/app/core/config.py`):
```python
TOTAL_STORAGE_CAPACITY_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
CHAT_QUOTA_PERCENT = 50   # 1 GB
IMAGE_QUOTA_PERCENT = 40  # 800 MB
AUDIO_QUOTA_PERCENT = 10  # 200 MB
ORPHAN_GRACE_PERIOD_HOURS = 2
```
* **Oversubscription Koruması:** `50 + 40 + 10 == 100` kuralı sistem açılışında zorunlu doğrulanır.

---

## 2. Temel İlkeler ve Güvenlik Kuralları (Invariants)

1. **Yedeklenmemiş Veri ASLA Silinmez:** `status != 'backed_up'` olan veya yalnızca yerel diskte bulunan hiçbir veri retention motoru tarafından silinemez.
2. **Gerektiği Kadar Temizlik (Minimal Cleanup):** Gerekli boş alan 80 MB ise, en eski yedeklenmiş veriler taranarak $\ge 80\text{ MB}$ alan açıldığı anda silme işlemi durur. Gereksiz 300 MB veri silinmez.
3. **Atomik Pre-Flight & Sıfır Veri Kaybı (Fail-Safe):** Yeni bir backup veya yükleme gelmeden önce pre-flight kontrolü yapılır. Eğer silinebilecek eski yedek miktarı yetersizse, **hiçbir veri silinmez ve işlem güvenle iptal edilir** (`FAILED_STORAGE_QUOTA`).
4. **Grup İzolasyonu (Group Isolation):** Bir ailenin retention işlemi asla başka bir ailenin dosyasını veya mesajını silemez (`family_id` doğrulaması).
5. **Eşzamanlılık Koruması (Concurrency Lock):** Aynı aileye gelen eşzamanlı istekler grup bazlı thread kilidi ile serileştirilir; iki işlemin aynı anda boş alan görüp kotayı aşması engellenir.
6. **Medya & Mesaj Bütünlüğü:** Retention nedeniyle silinen fotoğraflar için mesaj silinmez; kullanıcı arayüzünde kontrollü bir bilgilendirme kartı görüntülenir (*"📸 [Fotoğraf depolama kotası nedeniyle arşivlendi]"*).

---

## 3. Retention Algoritması Akış Şeması

```
1. Yeni Backup / Yükleme Geldi
   (Örn: 100 MB Fotoğraf)
             │
             ▼
2. Kategori Kullanımı Hesapla
   (Mevcut: 780 MB + 100 MB = 880 MB > 800 MB Kota)
             │
             ▼
3. Gerekli Alanı Hesapla: 80 MB
             │
             ▼
4. Ailenin Backed-up Nesnelerini Sırala:
   SELECT * FROM storage_objects
   WHERE family_id = :id AND category = 'IMAGE' AND status = 'backed_up' AND is_protected = false
   ORDER BY backed_up_at ASC
             │
             ▼
5. Silinebilir Toplam Alan >= 80 MB mi?
             │
      ┌──────┴──────┐
    [EVET]        [HAYIR]
      │             │
      │             ▼
      │        İŞLEMİ İPTAL ET (Fail-Safe)
      │        (Hiçbir veri silinmez, HTTP 413 / FAILED_STORAGE_QUOTA)
      │
      ▼
6. Sırayla Dosyaları Sil (Supabase Storage + DB status='deleted')
7. Açılan Alan >= 80 MB olduğu anda DUR!
8. Yeni 100 MB Fotoğrafı Yükle ve storage_objects'e Kaydet
9. cleanup_jobs Tablosuna Log Yaz
10. Başarılı Tamamlandı.
```

---

## 4. SHA-256 Tekilleştirme (Deduplication)

Kullanıcı aynı fotoğrafı veya ses kaydını birden fazla kez yüklerse:
* Dosya baytlarının SHA-256 özeti (`checksum`) hesaplanır.
* `storage_objects` tablosunda aynı `family_id` ve `checksum` değerine sahip aktif kayıt varsa yeni fiziksel dosya yüklenmez; mevcut dosyanın referansı kullanılır. Depolama kotasından tasarruf edilir.

---

## 5. Storage Mutabakatı (Reconciliation) & Yetim Dosya Temizliği

Veritabanı kayıtları ile Supabase Storage bucket'ı arasında oluşabilecek farkları gidermek için:
* `POST /api/v1/sync/storage-reconcile` endpoint'i çalıştırılır.
* Bucket'taki dosyalar listelenir; veritabanında aktif kaydı bulunmayan yetim (orphan) dosyalar tespit edilir.
* **Grace Period:** 2 saatten daha yeni oluşturulmuş dosyalar olası yükleme gecikmelerine karşı silinmez. 2 saatten eski yetim dosyalar fiziksel olarak silinerek depolama alanı geri kazanılır.

---

## 6. Kullanıcı Deneyimi ve Doluluk Seviyeleri

Aile Ayarları ekranında renkli progress bar'lar ile anlık takip:
* **`NORMAL` (< %70):** Mavi rozet, sistem normal çalışıyor.
* **`WARNING` (%70 - %85):** Turuncu rozet, kota uyarısı.
* **`HIGH` / `CRITICAL` (> %85):** Kırmızı rozet, retention aktif olarak devrede.
