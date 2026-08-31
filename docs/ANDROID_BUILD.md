# Ailem Mobil — Android APK ve Build Rehberi

Bu belge, **Ailem** uygulamasının Android APK ve Google Play AAB (Android App Bundle) derleme süreçlerini adım adım açıklamaktadır.

---

## 🏛️ 1. Mimari Genel Bakış

* **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS (`dist/` klasörüne derlenir).
* **Mobil Köprü:** Capacitor 7 Android Platformu (`frontend/android/`).
* **Backend API (Bulut):** `https://familyapi.rfqcollector.com/api/v1` (FastAPI).
* **Veritabanı & Realtime:** Supabase PostgreSQL + Supabase Realtime WebSocket.
* **Medya Depolama:** Supabase Storage (`family-media` bucket).

> [!IMPORTANT]
> **Mimari Kuralı:** FastAPI backend APK içine gömülmez. APK, cihazdan HTTPS (`https://familyapi.rfqcollector.com`) ve WSS (`wss://rcttkxlqrboraknixddp.supabase.co`) üzerinden canlı sunuculara bağlanır.

---

## 🛠️ 2. Gereksinimler ve Ortam Kurulumu

1. **Node.js:** v18+ veya v20+
2. **JDK (Java Development Kit):** OpenJDK 17 veya 21 (Android Studio ile birlikte gelen `jbr` klasörü kullanılabilir: `C:\Program Files\Android\Android Studio\jbr`).
3. **Android SDK:** API Level 34 / 35 (`C:\Users\<Kullanıcı>\AppData\Local\Android\Sdk`).
4. **Android Studio:** (İsteğe bağlı, görsel arayüz ve emülatör için).

---

## 🚀 3. Hızlı Derleme Komutları

### A) Web Kodlarını Derleme ve Capacitor ile Senkronize Etme:
```bash
cd frontend
npm run build
npx cap sync android
```

### B) Debug APK Üretme:
```bash
cd frontend/android
# Windows PowerShell:
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

**Üretilen Debug APK Dosyası:**
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📦 4. Release APK ve Google Play AAB Üretimi

### A) Release APK:
```bash
cd frontend/android
.\gradlew.bat assembleRelease
```
Çıktı: `frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk`

### B) Google Play Store İçin AAB (App Bundle):
```bash
cd frontend/android
.\gradlew.bat bundleRelease
```
Çıktı: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

---

## 🔑 5. Release İmzalaması (Keystore)

Release APK'yı imzalamak için:
```bash
# 1. Yeni Keystore Oluşturma (Tek seferlik):
keytool -genkey -v -keystore aile-release-key.jks -alias ailem -keyalg RSA -keysize 2048 -validity 10000

# 2. APK'yı İmzalamak (apksigner ile):
apksigner sign --ks aile-release-key.jks --out app-release-signed.apk frontend/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

---

## 📱 6. Telefona Yükleme ve Test

1. Telefonunuzda **Geliştirici Seçenekleri**'ni ve **USB Hata Ayıklama**'yı açın.
2. Bilgisayara bağlayıp şu komutu çalıştırın:
   ```bash
   adb install frontend/android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. Veya `app-debug.apk` dosyasını WhatsApp / Google Drive üzerinden telefonunuza gönderip doğrudan dokunarak kurun.
