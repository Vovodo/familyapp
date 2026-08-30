# Coolify & Ubuntu VPS Dağıtım Rehberi

Bu kılavuz, **Aile Uygulaması (React + FastAPI + PostgreSQL / Supabase)** projesinin Coolify veya bağımsız Docker Compose kullanılarak Ubuntu VPS üzerinde production ortamına nasıl kurulacağını anlatır.

---

## 1. Mimari ve Domain Yapılandırması

Tavsiye edilen domain yapısı:
- **Frontend / Mobil Web**: `https://aile.alanadiniz.com`
- **Backend API**: `https://api-aile.alanadiniz.com`

---

## 2. Coolify ile Adım Adım Kurulum

### Adım 1: Yeni Bir Servis Ekleyin
1. Coolify kontrol panelinize giriş yapın.
2. İlgili projenizin içinde **+ New Resource** butonuna tıklayın.
3. **Docker Compose** seçeneğini seçin.

### Adım 2: Docker Compose Kodunu Yapıştırın
Repository kökündeki `docker-compose.yml` içeriğini Coolify editörüne yapıştırın:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: aile_backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - DEBUG=False
      - PROJECT_NAME=Aile Uygulaması
      - DATABASE_URL=${DATABASE_URL}
      - SECRET_KEY=${SECRET_KEY}
      - CORS_ORIGINS=${CORS_ORIGINS}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
    volumes:
      - uploads_data:/app/uploads

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: aile_frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    environment:
      - VITE_API_URL=https://api-aile.alanadiniz.com/api/v1
    depends_on:
      - backend

volumes:
  uploads_data:
```

### Adım 3: Environment Variables (Çevre Değişkenleri)
Coolify arayüzünden aşağıdaki değişkenleri tanımlayın:

| Değişken | Örnek Değer | Açıklama |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:sifre@db-host:5432/aile_db` | PostgreSQL veya Supabase bağlantı adresi |
| `SECRET_KEY` | `uzun_ve_rastgele_64_karakter_guvenlik_anahtari` | JWT şifreleme anahtarı |
| `CORS_ORIGINS` | `https://aile.alanadiniz.com,capacitor://localhost,http://localhost` | İzin verilen istemci adresleri |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | (Opsiyonel) Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJh...` | (Opsiyonel) Supabase Service Role Key |
| `SUPABASE_JWT_SECRET` | `supabase_jwt_secret` | (Opsiyonel) Supabase JWT Secret |
| `VITE_API_URL` | `https://api-aile.alanadiniz.com/api/v1` | Frontend'in erişeceği API endpoint |

### Adım 4: Domain & Otomatik SSL Yapılandırması
- Backend servisi için domain: `https://api-aile.alanadiniz.com` (Port: `8000`)
- Frontend servisi için domain: `https://aile.alanadiniz.com` (Port: `3000` / Nginx `80`)
- Coolify (Traefik) Let's Encrypt SSL sertifikasını otomatik olarak oluşturacaktır.

### Adım 5: Deploy (Dağıtımı Başlat)
**Deploy** butonuna tıklayın. Docker build tamamlandıktan sonra uygulama yayına alınacaktır.
Sağlık kontrolünü `https://api-aile.alanadiniz.com/api/v1/health/` adresinden doğrulayabilirsiniz.
