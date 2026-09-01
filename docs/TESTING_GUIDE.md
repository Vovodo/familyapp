# 🧪 Test ve Kalite Güvencesi Rehberi (Testing Guide)

Bu doküman, **Ailem** uygulamasının otomatik test mimarisini, test dosyalarını, 12 spesifik depolama retention senaryosunu ve regresyon testlerini çalıştırma talimatlarını içerir.

---

## 1. Test Mimarisi ve Altyapı

* **Test Framework:** `pytest`, `pytest-asyncio`, `FastAPI TestClient`
* **Test Veritabanı:** SQLite In-Memory (`sqlite:///:memory:`)
* **Bağlantı Havuzu:** `create_engine(..., poolclass=StaticPool, connect_args={"check_same_thread": False})`
  * Bu yapı sayesinde eşzamanlı multi-threading testlerinde dahi veritabanı bağlantısı kopmaz ve her test fonksiyonu izole bir şema üzerinde temiz başlar.

---

## 2. Test Paketini Çalıştırma

Tüm testleri terminalden tek komutla çalıştırmak için:

```bash
# Proje kök dizininde:
python -m pytest backend/tests/ -v
```

---

## 3. Test Dosyaları ve Kapsamı

### A. Depolama Kota & Retention Testleri (`backend/tests/test_quota_retention.py`):
1. **`test_1_normal_backup_under_quota`:** Kota altında kalan backup doğrudan gerçekleşir, cleanup tetiklenmez.
2. **`test_2_retention_cleans_exact_required_oldest_data`:** Kota aşıldığında en eski yedeklenmiş verilerden gereken kadar (minimal) temizlenir, yeni backup başarıyla yazılır.
3. **`test_3_failsafe_insufficient_space_aborts_without_data_loss`:** Gerekli alan eski verilerle açılamıyorsa işlem iptal edilir ve **0 byte veri silinir** (Fail-Safe).
4. **`test_4_image_quota_retention_isolation`:** Resim kotası dolduğunda ses kayıtlarına dokunulmaz, sadece resimler temizlenir.
5. **`test_5_audio_quota_retention`:** Ses kotası dolduğunda sadece ses kayıtları temizlenir.
6. **`test_6_chat_quota_retention`:** Sohbet kotası dolduğunda en eski mesajlar temizlenir.
7. **`test_7_unbacked_data_never_deleted`:** `status == 'pending'` olan yerel veriler **kesinlikle retention tarafından silinmez**.
8. **`test_8_checksum_deduplication`:** SHA-256 hash ile aynı binary içerik tekrar yüklenmez.
9. **`test_9_batch_backup_quota_integration`:** Toplu mesaj kuyruğu pre-flight kontrolü ile entegre çalışır.
10. **`test_10_concurrency_lock_safety`:** Eşzamanlı 5 iş parçacığı yarış durumu olmadan çalışır.
11. **`test_11_12_storage_reconciliation_and_orphan_detection`:** Storage mutabakatı ve yetim dosya tespiti doğrulanır.

### B. Senkronizasyon ve Backup Testleri (`backend/tests/test_sync_and_backup.py`):
* **`test_backup_sync_service_unit`:** Zorunlu veri çekme, admin toggle ve deduplication.
* **`test_api_sync_endpoints`:** REST API seviyesinde `/mandatory-data`, `/status`, `/chat-backup`, `/chat-restore` testleri.

---

## 4. Geliştirme Sonrası Regresyon Kontrol Listesi

Her yeni özellik eklendiğinde şu alanların çalıştığı doğrulanmalıdır:
* [x] Giriş / Kayıt / Şifre kontrolü
* [x] Aile oluşturma / Katılım kodu ile katılma
* [x] Sohbet mesajı gönderme & silme
* [x] Fotoğraf çekme & albüme yükleme
* [x] Sesli not kaydetme & dinleme
* [x] Zorunlu bulut senkronizasyonu (Notlar, Görevler, Bütçe, Alışveriş, Hatırlatıcılar)
* [x] Yeni cihazda sohbet geri yükleme (Restore Engine)
* [x] Supabase Storage kota ve retention kontrolleri
* [x] `npm run build` ile TypeScript tip doğrulaması
