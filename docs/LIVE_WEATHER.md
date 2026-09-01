# Canlı Hava Durumu Servisi ve Entegrasyonu (Live Weather Service)

## 1. Genel Bakış

Aile Alanı kartının hemen altında yer alan **Canlı Hava Durumu (Live Weather Widget)**, seçilen şehir veya GPS konumu için gerçek zamanlı hava durumu, sıcaklık, hissedilen sıcaklık, nem ve rüzgar bilgilerini sunar.

---

## 2. Mimari ve Sağlayıcı

- **Sağlayıcı:** [Open-Meteo](https://open-meteo.com) (Ücretsiz, API key gerektirmez, Türkiye koordinatları ve WMO hava kodlarıyla %100 uyumludur).
- **Backend Servisi:** `backend/app/services/weather_service.py`
- **API Endpoint:** `GET /api/v1/weather/current?city=İzmir` veya `GET /api/v1/weather/current?latitude=...&longitude=...`
- **Önbellek (Caching):** 15 dakikalık in-memory önbellek (`_WEATHER_CACHE`). Aynı konuma yapılan tekrarlı sorgular Open-Meteo'ya gitmeden anında önbellekten döndürülür.

---

## 3. Veri Modeli ve Normalize Edilmiş Yanıt

```json
{
  "city": "İzmir",
  "latitude": 38.4192,
  "longitude": 27.1287,
  "temperature": 27,
  "feels_like": 28,
  "humidity": 45,
  "wind_speed": 12,
  "condition": "Parçalı Bulutlu",
  "weather_code": 2,
  "icon": "partly-cloudy",
  "emoji": "⛅",
  "is_day": 1,
  "updated_at": "01:05"
}
```

---

## 4. WMO Hava Kodu Eşleme Tablosu

| WMO Kodları | Durum Açıklaması | Emoji | İkon |
|---|---|---|---|
| `0` | Açık / Güneşli | ☀️ | `clear` |
| `1, 2, 3` | Az / Parçalı Bulutlu | ⛅ / ☁️ | `partly-cloudy` |
| `45, 48` | Sisli | 🌫️ | `fog` |
| `51, 53, 55, 61, 63, 65, 80, 81, 82` | Yağmurlu | 🌧️ | `rain` |
| `71, 73, 75, 85, 86` | Karlı | ❄️ | `snow` |
| `95, 96, 99` | Gök Gürültülü Fırtına | ⛈️ | `thunderstorm` |

---

## 5. Şehir Seçimi ve GPS Konum Desteği

- **Kullanıcı Etkileşimi:** Widget'a tıklandığında modern bir Şehir Seçici modalı açılır.
- **Arama & Popüler Şehirler:** Türkiye'nin 81 ili ve popüler ilçeleri (Bodrum, Çeşme, Alanya vb.) anlık filtreleme ile aranabilir.
- **Tek Tıkla Konum Tespiti:** "Mevcut Konumumu Kullan" butonu ile cihazın Geolocation API'si üzerinden bulunulan il ve hava durumu otomatik algılanır.
- **Kalıcılık:** Tercih edilen şehir `localStorage` (`ailem_weather_city`) üzerinde saklanır.
