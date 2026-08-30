# Ailem ❤️ — Kişisel ve Aile İçi Mobil Uygulama

4 kişilik aile (ve ileride genişletilebilir) için tasarlanmış, sade, güvenli, büyük dokunma hedeflerine sahip, Türkçe öncelikli, Android APK olarak kurulabilen modern Full-Stack aile uygulaması.

---

## 📱 Temel Özellikler

* 💬 **Aile Sohbeti**: Gerçek zamanlı aile içi mesajlaşma, fotoğraf gönderme, mesaj silme ve kronolojik akış.
* 🛒 **Ortak Alışveriş Listesi**: Kategori bazlı (Market, Manav, Eczane vb.) ihtiyaç ekleme, tek tıkla tamamlandı işaretleme, kimin aldığını görme.
* 🔔 **Hatırlatıcılar**: Randevu, doktor ve ilaç takipleri; Capacitor Local Notifications ile cihaz içi zamanlı bildirimler.
* 📝 **Aile Notları**: Ortak aile notları veya kişiye özel gizli (🔒) not defteri, renkli etiketleme ve anında arama.
* 📷 **Fotoğraf & Anılar**: Aile fotoğraflarının otomatik sıkıştırılarak (Pillow) ve küçük resim (thumbnail) oluşturularak saklandığı güvenli albüm.
* ❤️ **Aile Yönetimi**: Benzersiz 6 haneli Katılım Kodu (`AILE-XXXXXX`), yönetici/üye rolleri ve profil düzenleme.
* 🌐 **Çevrimdışı / İnternet Uyarısı**: Ağ kesintilerinde kullanıcıyı bilgilendiren akıllı durum çubuğu.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknolojiler |
| :--- | :--- |
| **Frontend / Web** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, TanStack Query, Axios |
| **Mobil Köprü** | Capacitor 7 (Android, Camera, Local Notifications, Network, Preferences) |
| **Backend API** | Python 3.12, FastAPI, Pydantic V2, SQLAlchemy 2.0, Loguru, Bcrypt, Pillow |
| **Veritabanı / Auth** | PostgreSQL / Supabase, Supabase Auth, Row Level Security (RLS) uyumlu mimari |
| **Depolama (Storage)** | Supabase Storage / S3 uyumlu Object Storage (Yerel disk yedekli) |
| **Dağıtım (DevOps)** | Docker, Docker Compose, Coolify, Nginx, Ubuntu VPS |

---

## 🚀 Hızlı Başlangıç (Yerel Geliştirme)

### 1. Backend Kurulumu & Çalıştırma
```bash
# Bağımlılıkları yükleyin
pip install -r backend/requirements.txt

# Çevre değişkenlerini hazırlayın
copy backend\.env.example backend\.env

# Backend'i başlatın (http://localhost:8000)
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
API Dokümantasyonu (Swagger): `http://localhost:8000/docs`

### 2. Frontend Kurulumu & Çalıştırma
```bash
cd frontend

# Bağımlılıkları yükleyin
npm install

# Çevre değişkenlerini hazırlayın
copy .env.example .env

# Geliştirme sunucusunu başlatın (http://localhost:5173)
npm run dev
```

---

## 📱 Android APK Oluşturma

Detaylı rehber için: **[`docs/ANDROID_APK_GUIDE.md`](./docs/ANDROID_APK_GUIDE.md)**

```bash
cd frontend

# 1. Production build alın
npm run build

# 2. Android platformunu ekleyin (ilk seferlik)
npx cap add android

# 3. Web çıktılarını Android projesine senkronize edin
npx cap sync android

# 4. Hızlı Debug APK üretin (Terminalden)
cd android
.\gradlew.bat assembleDebug
```
Üretilen APK dosyası: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## ☁️ Coolify & VPS Canlıya Alma (Deployment)

Detaylı rehber için: **[`docs/DEPLOYMENT_COOLIFY.md`](./docs/DEPLOYMENT_COOLIFY.md)**

Proje kökündeki `docker-compose.yml` dosyası Coolify ile %100 uyumludur. Tek tıkla backend ve frontend konteynerlerinizi otomatik SSL (Let's Encrypt) ile ayağa kaldırabilirsiniz.

```bash
# Docker Compose ile tek komutla yerel veya sunucuda çalıştırmak için:
docker-compose up --build -d
```

---

## 🧪 Testleri Çalıştırma

Backend birim, yetkilendirme ve aile veri izolasyonu testlerini çalıştırmak için:

```bash
python -m pytest backend/tests -v
```

---

## 🔒 Güvenlik ve Aile İzolasyonu Prensibi

* **Katı `family_id` İzolasyonu**: Hiçbir kullanıcı üyesi olmadığı bir ailenin mesajlarına, fotoğraflarına, notlarına veya alışveriş listesine erişemez. Bu kontrol frontend'e bırakılmaksızın FastAPI `get_current_family_member` middleware katmanında zorlanır.
* **Görsel Güvenliği**: Yüklenen her fotoğraf backend'de MIME tipi ve boyut sınırları denetlenerek Pillow ile güvenli JPEG formatına dönüştürülür ve optimize edilir.
