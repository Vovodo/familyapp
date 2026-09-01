# 🔔 Bildirimler, Ses Motoru ve İzin Yönetimi (Notifications & Permissions)

Bu doküman, **Ailem** uygulamasının anlık push bildirimleri (FCM), yerel zamanlanmış alarmları (Local Notifications), Web Audio API ses motorunu ve izin yönetim panelini açıklar.

---

## 1. Bildirim Türleri ve Mimarisi

```
                          BİLDİRİM KAYNAKLARI
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
     UZAKTAN PUSH BİLDİRİMİ                    YEREL ALARM BİLDİRİMİ
  (Firebase Cloud Messaging)               (Capacitor Local Notifications)
              │                                         │
• Yeni sohbet mesajı                      • Randevu saatinden 15 dk önce
• Yeni görev atandı                       • İlaç vakti hatırlatması
• "Eve geliyorum / Yemek hazır"           • Fatura son ödeme günü
              │                                         │
              ▼                                         ▼
   Cihaz Kapalıyken / Arka Planda           İnternetsiz Ortamda Dahi
   Sesli ve Titreşimli Uyarı                Cihaz Donanımından Çalar
```

---

## 2. WhatsApp Tarzı Mesaj Gruplama ve Profil Fotoğrafı

Android durum çubuğunda üst üste gelen mesajların tek bir bildirim balonunda toplanması:
1. **Bildirim Grubu (`group: "ailem_chat"`):** Gelen her yeni mesaj aynı balon içinde birikir (`InboxStyle`).
2. **Sağ Ok ile Genişletme:** Kullanıcı balonu aşağı kaydırdığında son mesajların tamamını kronolojik olarak okuyabilir.
3. **Gönderen Profil Fotoğrafı (`LargeIcon`):** Bildirim balonunda mesajı gönderen aile bireyinin profil avatarı ve ismi net olarak gösterilir.

---

## 3. Dahili Ses Motoru (`soundService.ts`)

Uygulama, harici ses dosyası indirme bağımlılığı olmadan saf **Web Audio API** osilatörleri ile yüksek kaliteli sesler üretir:
* **`playSendSound()`:** Mesaj gönderim pıtırtısı (2 frekanslı yumuşak ton).
* **`playReceiveSound()`:** Yeni mesaj gelişi (Do-Sol akoru).
* **`playActionSound(type)`:**
  * *"Eve geliyorum"* $\rightarrow$ Dinamik melodi.
  * *"Yemek hazır"* $\rightarrow$ Mutfak zili tonu.
  * *"Çay koydum"* $\rightarrow$ Sıcak çay daveti tonu.
  * *"Kalp gönder"* $\rightarrow$ Kalp atışı bas efekti.

---

## 4. İzin Yönetimi ve Asistan (`PermissionAssistantModal.tsx`)

Android'de arka planda sesli bildirimlerin aksamaması için kullanıcının onaylaması gereken 4 kritik izin tek bir panelden yönetilir:

| İzin | Amaç | Gerekli Android Seviyesi |
|---|---|---|
| **Bildirim İzni** | Mesaj ve hatırlatıcıların durum çubuğuna düşmesi | Android 13+ (API 33) |
| **Tam Zamanlı Alarm (Exact Alarm)** | Randevu ve ilaç alarmlarının tam dakikasında çalması | Android 12+ (API 31) |
| **Pil Optimizasyonu Muafiyeti** | Uygulama kapalıyken işletim sisteminin bildirimleri uyutmaması | Tüm Android Sürümleri |
| **Kamera & Galeri İzni** | Fotoğraf çekme ve anı albümüne resim yükleme | Tüm Sürümler |

Kullanıcı `Aile Ayarları` $\rightarrow$ `İzinler & Bildirim Durumu` menüsünden eksik olan izinleri tek tıkla inceleyebilir ve sistem ayarlarına yönlendirilebilir.
