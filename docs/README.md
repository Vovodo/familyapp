# 📚 Ailem Uygulaması Dokümantasyon Merkezi (Docs Hub)

Hoş geldiniz! Bu dokümantasyon merkezi, **Ailem** (Kişisel & Aile İçi Mobil / Web Uygulaması) projesinin tüm mimarisini, veritabanı şemasını, API referansını, bulut yedekleme/senkronizasyon mekanizmalarını, depolama kota motorunu ve dağıtım süreçlerini en ince ayrıntısına kadar açıklar.

Gelecekte projeye dahil olacak tüm geliştiriciler ve yapay zeka asistanları, geliştirme yapmadan önce bu dokümanları referans almalıdır.

---

## 🗺️ Dokümantasyon Haritası

| Doküman | Açıklama |
| :--- | :--- |
| **[1. Sistem Mimarisi (`SYSTEM_ARCHITECTURE.md`)](./SYSTEM_ARCHITECTURE.md)** | Genel sistem mimarisi, teknoloji yığını, Offline-First felsefesi ve katmanlar arası veri akışı. |
| **[2. Veritabanı Şeması (`DATABASE_SCHEMA.md`)](./DATABASE_SCHEMA.md)** | PostgreSQL/SQLite tabloları, ilişkiler, Foreign Key'ler, indeksler ve güvenli migrasyonlar. |
| **[3. Kimlik Doğrulama & Güvenlik (`AUTHENTICATION_AND_SECURITY.md`)](./AUTHENTICATION_AND_SECURITY.md)** | JWT auth akışı, roller (Admin/Üye), 6 haneli katılım kodu (`AILE-XXXXXX`), grup izolasyonu. |
| **[4. Bulut Senkronizasyonu & Yedekleme (`CLOUD_BACKUP_AND_SYNC.md`)](./CLOUD_BACKUP_AND_SYNC.md)** | Zorunlu bulut senkronizasyonu, toplu artımlı sohbet kuyruğu ve yeni cihaz geri yükleme motoru. |
| **[5. Storage Kota & Retention Engine (`STORAGE_QUOTA_AND_RETENTION.md`)](./STORAGE_QUOTA_AND_RETENTION.md)** | Akıllı Supabase Storage kotası (%50 Chat, %40 Image, %10 Audio), atomik pre-flight, mutabakat. |
| **[6. Frontend Mimarisi & Durum Yönetimi (`FRONTEND_ARCHITECTURE.md`)](./FRONTEND_ARCHITECTURE.md)** | React 19, TypeScript, Context API, SWR önbellek, yerel medya kasası (`localMediaVault`), OTA. |
| **[7. Backend API Referansı (`API_REFERENCE.md`)](./API_REFERENCE.md)** | Tüm REST API endpoint'leri, istek/yanıt şemaları, query parametreleri ve hata kodları. |
| **[8. Bildirimler, İzinler & Ses Motoru (`NOTIFICATIONS_AND_PERMISSIONS.md`)](./NOTIFICATIONS_AND_PERMISSIONS.md)** | Capacitor Local Notifications, Push bildirimleri (FCM), özel ses efektleri ve izin asistanı. |
| **[9. DevOps, Coolify & Android APK (`DEVOPS_AND_DEPLOYMENT.md`)](./DEVOPS_AND_DEPLOYMENT.md)** | Docker Compose, Coolify canlıya alma, SSL, Android Studio/Gradle APK üretimi ve Live Updates. |
| **[10. Test & Kalite Güvencesi (`TESTING_GUIDE.md`)](./TESTING_GUIDE.md)** | Pytest test paketi, SQLite StaticPool, 13 senaryolu retention testleri ve regresyon rehberi. |
| **[11. Tema Sistemi & Tema Mağazası (`THEME_SYSTEM.md`)](./THEME_SYSTEM.md)** | 12 özel renk teması, dinamik CSS değişkenleri mimarisi, değişmez sabit hızlı butonlar kuralı. |
| **[12. Canlı Hava Durumu (`LIVE_WEATHER.md`)](./LIVE_WEATHER.md)** | Open-Meteo backend entegrasyonu, 15 dk önbellek, Türkiye il/ilçe seçicisi ve konum tespiti. |

---

## ⚡ Hızlı Genel Bakış

* **Uygulama Adı:** Ailem ❤️
* **Amaç:** Aile üyeleri arasında güvenli, sade, reklamsız, hızlı ve offline-first çalışan ortak yaşam platformu.
* **Ana Modüller:**
  1. 💬 **Sohbet & Medya:** Anlık mesajlaşma, sesli notlar, fotoğraflar, anketler, mesaj silme.
  2. 📝 **Aile Notları:** Ortak not defteri ve kişiye özel şifreli (🔒) gizli notlar.
  3. ✅ **Görevler & To-Do:** Ortak yapılacaklar, kişi atama ve tamamlanma takibi.
  4. 🛒 **Alışveriş Listesi:** Kategori bazlı (Market, Eczane, Manav vb.) ortak alışveriş listesi.
  5. 💰 **Bütçe & Harcamalar:** Gelir/gider takibi, kategori dağılımı ve aylık finansal özet.
  6. ⏰ **Hatırlatıcılar:** Randevu, ilaç, fatura ve doğum günü bildirimleri (Cihaz içi alarmlar).
  7. 🖼️ **Anılar & Fotoğraf Albümü:** Optimize edilmiş aile albümü.
  8. 🛡️ **Aile Yönetimi & İzinler:** Benzersiz katılım kodu, rol yönetimi ve bildirim izin paneli.

---

## 🛠️ Temel Teknoloji Özeti

```
[ Frontend (React 19 + TypeScript + Vite + Tailwind CSS) ]
                        │
       Capacitor 7 Mobile Bridge (Android APK / Web)
                        │
               REST API / WebSocket
                        │
         [ Backend API (Python 3.12 + FastAPI) ]
           ├── SQLAlchemy 2.0 ORM
           ├── Pydantic V2 Validation
           ├── Pytest Test Automation
           └── Pillow Image Processing
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
[ PostgreSQL / Supabase DB ]   [ Supabase Object Storage / S3 ]
 (Kullanıcılar, Notlar,         (Fotoğraflar, Ses Kayıtları,
  Görevler, Mesajlar vb.)        Küçük Resimler (Thumbnails))
```
