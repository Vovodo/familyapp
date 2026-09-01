# 🌐 Backend API Referansı (REST API Reference)

Tüm endpoint'ler `/api/v1` ön eki ile sunulmaktadır. İsteklerde `Authorization: Bearer <JWT_TOKEN>` başlığı zorunludur (Auth ve Health hariç).

---

## 1. Kimlik Doğrulama & Profil (`/api/v1/auth`)

| Metot | Endpoint | Açıklama | İstek / Yanıt |
|---|---|---|---|
| `POST` | `/auth/register` | Yeni kullanıcı kaydı | Body: `{ email, password, full_name, phone? }` $\rightarrow$ `UserResponse` |
| `POST` | `/auth/login` | Giriş & JWT alma | Body: `{ email, password }` $\rightarrow$ `{ access_token, token_type, user }` |
| `GET` | `/auth/me` | Giriş yapmış kullanıcı bilgisi | $\rightarrow$ `UserResponse` |
| `PUT` | `/auth/profile` | Profil bilgilerini güncelleme | Body: `{ full_name?, phone?, avatar_url? }` $\rightarrow$ `UserResponse` |

---

## 2. Aile Yönetimi (`/api/v1/families`)

| Metot | Endpoint | Açıklama | İstek / Yanıt |
|---|---|---|---|
| `POST` | `/families/create` | Yeni aile grubu oluşturma | Body: `{ name }` $\rightarrow$ `FamilyResponse` |
| `POST` | `/families/join` | Katılım kodu ile katılma | Body: `{ invite_code }` $\rightarrow$ `FamilyResponse` |
| `GET` | `/families/my-family` | Kullanıcının aktif ailesi | $\rightarrow$ `FamilyResponse` (Üyeler ve Ayarlar dahil) |
| `PUT` | `/families/settings` | [Admin] Aile ayarları güncelleme | Body: `{ name?, is_public?, cloud_chat_backup_enabled? }` |
| `DELETE` | `/families/members/{user_id}` | [Admin] Üye gruptan çıkarma | $\rightarrow$ `{ status: "success" }` |
| `POST` | `/families/leave` | Aile grubundan ayrılma | $\rightarrow$ `{ status: "success" }` |

---

## 3. Bulut Senkronizasyonu & Yedekleme (`/api/v1/sync`)

| Metot | Endpoint | Açıklama | İstek / Yanıt |
|---|---|---|---|
| `GET` | `/sync/mandatory-data` | **Zorunlu Senkronizasyon:** Notlar, Görevler, Bütçe, Alışveriş, Hatırlatıcılar | $\rightarrow$ `MandatoryDataSyncResponse` |
| `GET` | `/sync/status` | Ailenin yedekleme ve boyut istatistikleri | $\rightarrow$ `SyncStatusResponse` |
| `POST` | `/sync/family-backup-toggle` | [Admin] Bulut sohbet yedeğini aç/kapa | Body: `{ enabled: boolean }` $\rightarrow$ `SyncStatusResponse` |
| `POST` | `/sync/chat-backup` | İstemci kuyruğundaki mesajları toplu yedekleme | Body: `{ messages: [...] }` $\rightarrow$ `BatchChatBackupResponse` |
| `GET` | `/sync/chat-restore` | Yeni cihaz için sayfalama ile sohbet indirme | Query: `limit=300&offset=0` $\rightarrow$ `ChatRestoreResponse` |
| `GET` | `/sync/storage-breakdown` | Chat (%50), Image (%40), Audio (%10) kota dökümü | $\rightarrow$ `StorageQuotaBreakdown` |
| `POST` | `/sync/storage-reconcile` | [Admin] Storage mutabakatı & yetim dosya temizliği | $\rightarrow$ `StorageReconciliationResponse` |
| `GET` | `/sync/cleanup-history` | [Admin] Geçmiş temizlik işlemleri denetim logu | Query: `limit=20` $\rightarrow$ `List[CleanupJobLogResponse]` |

---

## 4. Sohbet & Anketler (`/api/v1/messages`)

| Metot | Endpoint | Açıklama | İstek / Yanıt |
|---|---|---|---|
| `GET` | `/messages/` | Sohbet geçmişini listeleme | Query: `limit=50&offset=0` $\rightarrow$ `List[MessageResponse]` |
| `POST` | `/messages/` | Yeni mesaj / medya gönderme | Body: `{ content?, media_url?, media_type?, client_message_id? }` |
| `DELETE` | `/messages/{id}` | Mesaj silme (Herkes için) | $\rightarrow$ `{ status: "success" }` |
| `POST` | `/messages/poll` | Sohbet içinde anket başlatma | Body: `{ question, options: [...], duration_hours? }` |
| `POST` | `/messages/poll/{id}/vote` | Ankete oy verme | Body: `{ option_index: number }` |

---

## 5. Medya & Dosya Yükleme (`/api/v1/media`)

| Metot | Endpoint | Açıklama | İstek / Yanıt |
|---|---|---|---|
| `POST` | `/media/upload` | Fotoğraf yükleme (Pre-flight + Thumbnail) | Multipart: `file`, `caption?` $\rightarrow$ `MediaResponse` |
| `POST` | `/media/upload-audio` | Sesli not yükleme (Pre-flight kota denetimli) | Multipart: `file` $\rightarrow$ `{ url, path, media_type }` |
| `POST` | `/media/upload-avatar` | Profil fotoğrafı yükleme & boyutlandırma | Multipart: `file` $\rightarrow$ `{ avatar_url }` |
| `GET` | `/media/` | Aile fotoğraf albümünü listeleme | $\rightarrow$ `List[MediaResponse]` |

---

## 6. Notlar, Görevler, Alışveriş, Bütçe, Hatırlatıcılar

* **Notlar (`/api/v1/notes`):**
  * `GET /notes/` : Notları listele (Gizli notlar filtrelenir).
  * `POST /notes/` : Yeni not oluştur (`title`, `content`, `color`, `is_secret`).
  * `PUT /notes/{id}` & `DELETE /notes/{id}` : Notu güncelle veya sil.
* **Görevler (`/api/v1/tasks`):**
  * `GET /tasks/`, `POST /tasks/`, `PATCH /tasks/{id}/toggle`, `DELETE /tasks/{id}`.
* **Alışveriş (`/api/v1/shopping`):**
  * `GET /shopping/`, `POST /shopping/`, `PATCH /shopping/{id}/toggle`, `DELETE /shopping/{id}`.
* **Bütçe (`/api/v1/budget`):**
  * `GET /budget/`, `POST /budget/`, `GET /budget/summary` (Aylık gelir, gider ve bakiye).
* **Hatırlatıcılar (`/api/v1/reminders`):**
  * `GET /reminders/`, `POST /reminders/`, `PATCH /reminders/{id}/toggle`.

---

## 7. Sistem & Yönetici (`/api/v1/admin` & `/downloads`)

* `GET /api/v1/admin/integrations`: [Admin] Supabase, Veritabanı, Storage ve E-posta sağlık durumu.
* `POST /api/v1/admin/test-email`: [Admin] Resend API üzerinden test e-postası tetikler.
* `GET /api/v1/downloads/apk`: Canlı Android Debug APK (`ailem.apk`) dosyasını indirir.
* `GET /api/v1/health`: Sunucu liveness kontrolü.
