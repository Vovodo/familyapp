# 🚀 DevOps, Canlıya Alma ve Android Derleme (Deployment Guide)

Bu doküman, **Ailem** uygulamasının Docker, Coolify, VPS sunucu dağıtımı, Android APK derleme ve OTA (Over-the-Air) canlı güncelleme adımlarını içerir.

---

## 1. Coolify & Docker ile Canlıya Alma (VPS Deployment)

Proje kök dizinindeki `docker-compose.yml` dosyası Coolify ile %100 uyumludur.

### Mimari Bileşenler:
* **Backend Konteyneri:** Python 3.12, Uvicorn (Port 8000).
* **Frontend Konteyneri:** Nginx üzerinde optimize edilmiş SPA (Port 80).
* **Coolify Helper / Reverse Proxy:** Otomatik Let's Encrypt SSL ve alan adı yönlendirmesi.

### Çevre Değişkenleri (.env):
```env
# Database & Secrets
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SECRET_KEY=supersecretjwtkeyforproduction

# Supabase Storage & Auth
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey...
STORAGE_BUCKET_NAME=family-media

# Storage Quota & Retention
TOTAL_STORAGE_CAPACITY_BYTES=2147483648
CHAT_QUOTA_PERCENT=50
IMAGE_QUOTA_PERCENT=40
AUDIO_QUOTA_PERCENT=10

# Resend Email Integration
RESEND_API_KEY=re_...
EMAIL_FROM=Ailem <bildirim@rfqcollector.com>
```

---

## 2. Android APK Derleme Adımları (Gradle Build)

APK derlemek için yerel bilgisayarda Java (JDK) ve Android SDK bulunmalıdır.

### Adım Adım Komutlar:

```bash
# 1. Frontend dizinine geçin
cd frontend

# 2. Production build alın (TypeScript + Vite + OTA paketi oluşturulur)
npm run build

# 3. Web çıktılarını Android projesine senkronize edin
npx cap sync android

# 4. Android klasörüne geçin ve Gradle ile APK derleyin
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleDebug
```

Üretilen APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### Backend Static Dağıtımı:
Üretilen APK, backend'in `backend/app/static/ailem.apk` dizinine kopyalanarak kullanıcıların uygulama içindeki **"APK İndir"** butonundan doğrudan en güncel sürümü indirebilmesi sağlanır.

---

## 3. Canlı Güncellemeler (Live Update / OTA)

Uygulamanın web katmanında yapılan UI değişiklikleri için yeni bir APK yükletmeye gerek yoktur:
1. `npm run build` komutu otomatik olarak `node scripts/build-ota.js` çalıştırır.
2. `frontend/public/live-updates/bundle.zip` ve `version.json` üretilir.
3. Uygulama bir sonraki açılışta güncellemeyi arka planda çekerek anında uygular.
