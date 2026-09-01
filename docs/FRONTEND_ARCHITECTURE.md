# 💻 Frontend Mimarisi ve İstemci Durum Yönetimi (Frontend Architecture)

Bu doküman, **Ailem** uygulamasının istemci tarafı (React 19, TypeScript, Tailwind CSS, Capacitor) mimarisini, durum yönetimini, yerel dosya kasasını ve bileşen yapısını açıklar.

---

## 1. Teknoloji Yığını ve Dizin Yapısı

* **Framework:** React 19.x & Vite
* **Dil:** TypeScript (Strict Mode)
* **Stil:** Tailwind CSS v4 & Lucide Icons
* **Mobil Köprü:** Capacitor 7 (Camera, Filesystem, Local Notifications, Preferences, Haptics, Live Update)

### Dizin Ağacı (`frontend/src/`):
```
frontend/src/
├── components/           # Yeniden kullanılabilir UI bileşenleri
│   ├── chat/             # Sohbet balonları, ses çalar, anket kartı
│   ├── common/           # Restore modalı, İzin asistanı, APK indirme
│   ├── layout/           # Alt navigasyon çubuğu, üst başlık
│   └── notes/            # Not kartları, gizli not modalları
├── contexts/             # Global durum sağlayıcıları
│   ├── AuthContext.tsx   # Oturum, token, profil yönetimi
│   └── FamilyContext.tsx # Aile grubu, üyeler, sync tetikleyicisi
├── pages/                # Sayfa görünümleri
│   ├── admin/            # Yönetici paneli
│   ├── auth/             # Giriş & Kayıt
│   ├── chat/             # Aile sohbeti & anketler
│   ├── notes/            # Not defteri
│   ├── tasks/            # Görevler (To-Do)
│   ├── shopping/         # Alışveriş listesi
│   ├── budget/           # Bütçe & Harcamalar
│   ├── reminders/        # Hatırlatıcılar & Randevular
│   ├── gallery/          # Fotoğraf albümü & Anılar
│   └── family/           # Aile ayarları & Bulut yedekleme
├── services/             # API, depolama ve donanım servisleri
│   ├── api.ts            # Axios instance (JWT Interceptor)
│   ├── cacheService.ts   # 0ms SWR bellek önbelleği
│   ├── localMediaVault.ts# Capacitor Filesystem yerel medya kasası
│   ├── localChatStorage.ts# Yerel mesaj deposu & tekilleştirme
│   ├── notificationService.ts # Bildirim & alarm yöneticisi
│   ├── permissionService.ts   # İzin kontrol ve talep motoru
│   ├── soundService.ts   # Web Audio API ses efektleri
│   └── syncService.ts    # Bulut yedekleme ve restore motoru
└── types/                # TypeScript tip tanımları
```

---

## 2. İstemci Durum Yönetimi ve Önbellek (SWR Cache)

Uygulamada sunucu yanıtlarını bekletmeden arayüzü anında güncellemek için **Stale-While-Revalidate (SWR)** yaklaşımı kullanılır:

```
Kullanıcı Sayfayı Açar (Örn: Notlar)
               │
               ▼
1. cacheService.get("notes_familyId")
               │
      ┌────────┴────────┐
    [VAR]             [YOK]
      │                 │
      ▼                 ▼
0ms Ekrana Bas    Skeleton/Loading Göster
      │                 │
      └────────┬────────┘
               │
               ▼
2. Arka Planda API İsteği (GET /api/v1/notes)
               │
               ▼
3. Yeni Veri Geldiğinde Ekranı Sessizce Güncelle
4. cacheService.set("notes_familyId", data)
```

---

## 3. Yerel Medya Kasası (`localMediaVault.ts`)

Fotoğraf ve ses kayıtları ağdan her seferinde indirilmez. Cihazın yerel diskinde saklanır:
* **Android / iOS:** `@capacitor/filesystem` kullanılarak `Directory.Data/family/images` ve `Directory.Data/family/audio` klasörlerinde tutulur.
* **Web:** `IndexedDB` tabanlı ikili veri (Blob) saklama mekanizmasına geri düşer (fallback).
* **Akıllı URL Çözümleyici (`resolveMediaUrl`):**
  1. Dosya cihaz diskinde varsa `Capacitor.convertFileSrc(localPath)` döner (0ms, internet gerektirmez).
  2. Yoksa Supabase Storage URL'sini döner ve arka planda diske indirme işlemini başlatır.

---

## 4. Canlı Güncellemeler (Live Updates / OTA)

Uygulama, kod değişikliklerinin yeni bir APK kurmaya gerek kalmadan kullanıcılara anında dağıtılabilmesi için `@capawesome/capacitor-live-update` eklentisini kullanır:
* Derleme script'i `scripts/build-ota.js` web çıktısını (`dist/`) sıkıştırarak `bundle.zip` ve `version.json` üretir.
* Uygulama açılışında `liveUpdate.ts` sunucudaki sürümü kontrol eder ve arka planda güncellemeyi indirip bir sonraki açılışta etkinleştirir.
