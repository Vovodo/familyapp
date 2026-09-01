# 🏛️ Sistem Mimarisi (System Architecture)

Bu doküman, **Ailem** uygulamasının mimari prensiplerini, katmanlar arası veri akışını, **Offline-First** felsefesini ve hibrit bulut-yerel depolama modelini ayrıntılı olarak açıklamaktadır.

---

## 1. Genel Mimari Şeması

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (İSTEMCİ KATMANI)                      │
│                                                                        │
│  React 19 + TypeScript + Vite + Tailwind CSS + Capacitor 7 Native Bridge│
│                                                                        │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ │
│  │    Contexts API    │ │  cacheService (SWR)│ │  Local File Vault  │ │
│  │ (Auth/Family State)│ │ (0ms Bellek Önbellek)│ │(Capacitor Data/..) │ │
│  └─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘ │
└────────────┼──────────────────────┼──────────────────────┼─────────────┘
             │                      │                      │
             │ HTTPS (REST API)     │ Toplu Yedekleme      │ Medya İndir/Yükle
             ▼                      ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (SERVİS KATMANI)                        │
│                                                                        │
│                    FastAPI (Python 3.12 Asynchronous)                  │
│                                                                        │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ │
│  │  BackupSyncService │ │ QuotaRetentionEng  │ │   StorageService   │ │
│  │ (Mandatory + Batch)│ │ (Preflight+Cleanup)│ │  (Supabase / Disk) │ │
│  └─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘ │
└────────────┼──────────────────────┼──────────────────────┼─────────────┘
             │                      │                      │
             ▼                      ▼                      ▼
┌──────────────────────────┐                   ┌─────────────────────────┐
│   PostgreSQL / SQLite    │                   │ Supabase Object Storage │
│                          │                   │                         │
│ • Kullanıcılar & Aileler │                   │ • family-media Bucket   │
│ • Notlar, Görevler, Bütçe│                   │ • Fotoğraflar (JPEG)    │
│ • Alışveriş, Hatırlatıcı │                   │ • Ses Kayıtları (WebM)  │
│ • storage_objects Meta   │                   │ • Küçük Resimler (Thumb)│
└──────────────────────────┘                   └─────────────────────────┘
```

---

## 2. Temel Mimari Prensipler

### A. Offline-First ve 0ms Yanıt Süresi
Uygulamanın ana felsefesi kesintisiz çalışmadır:
1. Kullanıcı bir not oluşturduğunda, alışveriş listesini güncellediğinde veya sohbeti açtığında ağ beklemesi (network spinner) olmadan anında yerel bellek (`cacheService`) ve yerel disk güncellenir.
2. Ağ bağlantısı mevcut olduğunda arka planda sessizce REST API ile senkronize edilir (SWR - Stale While Revalidate).
3. İnternet kesintilerinde UI kilitlenmez; yerel diskten okuma ve yazma devam eder.

### B. Hibrit Bulut & Yerel Veri Modeli
Uygulama verileri iki ayrı stratejiyle yönetilir:

```
                                UYGULAMA VERİLERİ
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
    ZORUNLU BULUT VERİLERİ                              OPSİYONEL SOHBET & MEDYA
(Mandatory Cloud Synchronized)                            (Offline-First + Cloud Backup)
             │                                                     │
• Notlar (Ortak / Gizli)                              • Sohbet Mesajları
• Görevler (To-Do)                                    • Ses Kayıtları (Voice Notes)
• Alışveriş Listeleri                                 • Fotoğraflar & Anılar
• Bütçe & Gider Kayıtları                             • Sohbet İçi Anketler
• Hatırlatıcılar (Randevu/İlaç)                                    │
• Aile & Kullanıcı Ayarları                                        ▼
             │                                        Varsayılan: Yalnızca Cihaz Diski
             ▼                                        Admin Açarsa: Buluta Artımlı Yedek
Otomatik, Kesintisiz, Çoklu Cihaz                     Akıllı Kota & Retention Korumalı
```

---

## 3. Katmanlar ve Sorumluluklar

### 1. İstemci (Frontend) Katmanı:
* **`frontend/src/contexts/AuthContext.tsx`:** Kullanıcı oturumu, JWT token saklama (`localStorage` + Preferences), rol kontrolü.
* **`frontend/src/contexts/FamilyContext.tsx`:** Aktif aile grubu, üye listesi, mandatory sync tetikleyicisi, yeni cihaz restore tespit motoru.
* **`frontend/src/services/localMediaVault.ts`:** Fotoğraf ve ses dosyalarını cihazın fiziksel diskine (`Directory.Data/family/images`, `Directory.Data/family/audio`) kaydeden güvenli dosya kasası.
* **`frontend/src/services/syncService.ts`:** İstemci tarafı toplu yedekleme kuyruğu (`ailem_pending_backup_*`) ve geri yükleme motoru.

### 2. Sunucu (Backend API) Katmanı:
* **`backend/app/api/v1/`:** RESTful endpoint'ler.
* **`backend/app/services/quota_retention_service.py`:** 2 GB storage limitini %50 Chat, %40 Image, %10 Audio olarak yöneten, atomik pre-flight ve retention çalıştıran motor.
* **`backend/app/services/backup_service.py`:** Zorunlu veri senkronizasyonu ve tekilleştirilmiş (deduplicated) sohbet yedekleme servisi.
* **`backend/app/services/storage_service.py`:** Supabase Storage ve yerel disk yedekli dosya I/O yöneticisi.

### 3. Kalıcı Veri (Persistence) Katmanı:
* **PostgreSQL / Supabase:** İlişkisel veriler, indeksler, ACID işlemleri.
* **Supabase Storage:** S3 uyumlu genel nesne depolama (`family-media` bucket).

---

## 4. Gerçek Zamanlı (Realtime) & Bildirim Mimarisi

* **Anlık Mesajlaşma & Bildirimler:**
  1. Sunucu tarafında `events.py` ve `notifications.py` üzerinden SSE / WebSocket bağlantıları.
  2. Cihaz arka plandayken veya kapalıyken **Capacitor Push Notifications (FCM)** ve **Local Notifications** ile sesli bildirim uyarısı.
  3. Mesaj balonunda kimin mesaj attığı, profil fotoğrafı ve içeriği içeren WhatsApp tarzı gruplama.
