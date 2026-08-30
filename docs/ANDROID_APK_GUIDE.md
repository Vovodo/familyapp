# Android APK Oluşturma ve Kurulum Kılavuzu

Bu rehber, React tabanlı Aile Uygulamasını **Capacitor** kullanarak bağımsız bir **Android APK** dosyasına dönüştürme adımlarını anlatır.

---

## 1. Ön Gereksinimler

- **Node.js** (v18+) ve **npm**
- **Java JDK 17 veya 21**
- **Android Studio** (Android SDK & Platform Tools kurulu olmalıdır)

---

## 2. APK Oluşturma Adımları

### Adım 1: Frontend Üretim Derlemesi (Build)
Uygulamanın production API adresini `frontend/.env` dosyasına yazın:
```env
VITE_API_URL=https://api-aile.alanadiniz.com/api/v1
```

Ardından derleyin:
```bash
cd frontend
npm run build
```

### Adım 2: Capacitor Android Platformunu Ekleyin (İlk Seferlik)
```bash
npx cap add android
```

### Adım 3: Değişiklikleri Android Projesine Senkronize Edin
```bash
npx cap sync android
```

---

## 3. Komut Satırından Hızlı Debug APK Derleme

Android Studio açmadan doğrudan terminalden APK üretmek için:

**Windows PowerShell:**
```powershell
cd frontend/android
.\gradlew.bat assembleDebug
```

**Linux / macOS:**
```bash
cd frontend/android
./gradlew assembleDebug
```

### Üretilen APK Dosyası Yolu:
Derleme tamamlandığında APK dosyanız şurada hazır olacaktır:
📁 `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

Bu `.apk` dosyasını telefonunuza WhatsApp, Telegram veya USB kablosu ile gönderip doğrudan **Yükle / Install** diyerek telefonunuza kurabilirsiniz.

---

## 4. Android Studio Arayüzü ile Çalıştırma & APK Çıkarma

1. Android Studio'yu başlatmak için:
   ```bash
   cd frontend
   npx cap open android
   ```
2. Android Studio açıldıktan sonra:
   - **Fiziksel Cihazda Çalıştırma**: Telefonunuzu USB hata ayıklama moduyla bağlayın ve üstteki yeşil **Run (▶)** butonuna basın.
   - **İmzalı Release APK Çıkarmak İçin**: **Build** > **Generate Signed Bundle / APK** menüsünden `APK` seçin ve yönergeleri takip edin.

---

## 5. Android İzinleri ve Yapılandırma

`android/app/src/main/AndroidManifest.xml` dosyasında aşağıdaki izinler Capacitor tarafından otomatik olarak desteklenir:
- `android.permission.INTERNET` (Sunucu iletişimi ve canlı sohbet)
- `android.permission.CAMERA` (Fotoğraf çekme ve anı paylaşımı)
- `android.permission.POST_NOTIFICATIONS` (Android 13+ bildirimleri)
- `android.permission.SCHEDULE_EXACT_ALARM` (Hatırlatıcı yerel alarmları)
