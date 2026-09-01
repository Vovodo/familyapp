# Tema Sistemi ve Tema Mağazası Mimarisi (Theme Store Architecture)

## 1. Genel Bakış

Aile Uygulaması, kullanıcıların uygulama deneyimini kişiselleştirmelerini sağlayan kapsamlı ve dinamik bir **Tema Sistemi (Theme Store)** içerir. Tema seçimi, kullanıcı profil ayarları altından (`Görünüm & Tema Mağazası`) yönetilir.

---

## 2. Tema Kataloğu (12 Farklı Tema)

Sistemde toplam 12 adet özenle hazırlanmış renk paleti bulunmaktadır:

| # | Tema ID | Tema Adı | Mod | Açıklama |
|---|---------|----------|-----|----------|
| 1 | `midnight` | Midnight Black | Koyu | Modern koyu görünüm |
| 2 | `ocean` | Ocean Blue | Koyu | Serin ve modern mavi tonları |
| 3 | `royal` | Royal Purple | Koyu | Zarif ve premium mor tonları |
| 4 | `rose` | Rose (Varsayılan) | Açık | Sıcak ve romantik pembe tonları |
| 5 | `lavender` | Lavender | Açık | Yumuşak ve sakin leylak tonları |
| 6 | `sunset` | Sunset | Açık | Sıcak ve enerjik turuncu/gün batımı |
| 7 | `forest` | Forest | Koyu | Doğal ve huzurlu orman yeşili |
| 8 | `sky` | Sky | Açık | Ferahlık ve sadelik gök mavisi |
| 9 | `cherry` | Cherry | Koyu | Canlı ve tutkulu kiraz kırmızısı |
| 10 | `minimal` | Minimal Light | Açık | Temiz, nötr ve sade gri/beyaz |
| 11 | `amoled` | AMOLED | Koyu | Gerçek siyah (`#000000`) OLED tasarruflu |
| 12 | `coffee` | Coffee | Koyu | Sıcak ve rahat kahve tonları |

---

## 3. CSS Variable / Token Mimarisi

Temalar, React `ThemeContext` üzerinden DOM köküne (`document.documentElement`) dinamik CSS değişkenleri enjekte edilerek 0ms gecikmeyle uygulanır. Sayfanın yeniden yüklenmesine (reload) gerek yoktur.

### Enjekte Edilen Değişkenler:
- `--theme-bg`: Sayfa ana arka plan rengi.
- `--theme-surface`: Kart ve kutuların arka plan rengi.
- `--theme-surface-secondary`: Vurgulu rozetler ve ikincil kutu arka planı.
- `--theme-text-primary`: Birincil metin rengi.
- `--theme-text-secondary`: İkincil metin ve açıklama rengi.
- `--theme-border`: Kart ve bölücü sınır çizgisi rengi.
- `--theme-accent`: Birincil vurgu rengi.
- `--theme-hero-gradient`: Aile Alanı kartının degrade arka planı.
- `--theme-header-bg`: Üst başlık (Header) arka planı.
- `--theme-nav-bg`: Alt navigasyon (BottomNav) arka planı.
- `--theme-nav-active`: Aktif menü öğesi rengi.
- `--theme-nav-inactive`: Pasif menü öğesi rengi.
- `--theme-card-shadow`: Temaya özgü gölge stili.

---

## 4. 🚀 Sabit Hızlı Durum Butonları Kuralı (Immutable Quick Actions)

Ana sayfada yer alan 4 adet Hızlı Durum Butonunun renkleri **tüm temalarda kesinlikle sabit tutulur**:

1. **❤️ Kalp Gönder:** `quick-action-heart` (Rose / Red Gradient)
2. **🫖 Çay Koydum:** `quick-action-tea` (Amber / Orange Gradient)
3. **🚗 Eve Geliyorum:** `quick-action-coming-home` (Sky / Blue Gradient)
4. **🍴 Yemek Hazır:** `quick-action-meal` (Emerald / Teal Gradient)

Bu butonlar `!important` CSS kuralları ile tema değişimlerinden etkilenmez ve her temada kendi marka rengini korur.

---

## 5. Tema Önizleme ve UI

Tema Mağazası (`ThemeStoreModal`), her tema kartının içerisinde uygulamanın gerçek minyatür bir önizlemesini (`Micro-Screen`) sunar:
- Mini Header
- Mini Aile Alanı Degradesi
- Mini Canlı Hava Durumu
- Mini 4 Sabit Hızlı Buton
- Mini İçerik Kartları
- Mini Alt Menü

Seçilen tema `localStorage` (`ailem_active_theme`) üzerinde kalıcı olarak saklanır.
