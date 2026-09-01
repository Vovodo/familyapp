# 🗄️ Veritabanı Şeması ve Modeller (Database Schema)

Bu doküman, **Ailem** uygulamasının PostgreSQL / SQLite veritabanı şemasını, model alanlarını, ilişkileri (Foreign Keys), indeksleri ve migrasyon stratejisini detaylandırır.

---

## 1. Veritabanı Varlık-İlişki Diyagramı (ERD)

```
┌──────────────────┐          ┌──────────────────────┐          ┌──────────────────┐
│     profiles     │ 1      * │    family_members    │ *      1 │     families     │
│──────────────────│──────────│──────────────────────│──────────│──────────────────│
│ id (PK)          │          │ id (PK)              │          │ id (PK)          │
│ email            │          │ family_id (FK)       │          │ name             │
│ full_name        │          │ user_id (FK)         │          │ invite_code (UQ) │
│ role             │          │ role (admin/member)  │          │ cloud_backup_en. │
│ avatar_url       │          │ nickname             │          │ last_backup_at   │
└────────┬─────────┘          └──────────────────────┘          └────────┬─────────┘
         │                                                               │
         │ 1                                                           1 │
         ├─────────────────────────────────────────┐                     │
         ▼ *                                       ▼ *                   ▼ *
┌──────────────────┐                      ┌──────────────────┐  ┌──────────────────┐
│     messages     │                      │ storage_objects  │  │      notes       │
│──────────────────│                      │──────────────────│  │──────────────────│
│ id (PK)          │                      │ id (PK)          │  │ id (PK)          │
│ family_id (FK)   │                      │ family_id (FK)   │  │ family_id (FK)   │
│ sender_id (FK)   │                      │ user_id (FK)     │  │ user_id (FK)     │
│ content          │                      │ message_id (FK)  │  │ title, content   │
│ media_url        │                      │ category         │  │ is_secret (🔒)   │
│ client_msg_id    │                      │ file_size (byte) │  └──────────────────┘
└──────────────────┘                      │ checksum (SHA256)│
                                          │ status, backed_up│
                                          └──────────────────┘
```

---

## 2. Tablo Tanımları ve Model Detayları

### 1. `profiles` (Kullanıcı Profilleri)
* `id`: VARCHAR(36) [PK, UUID]
* `email`: VARCHAR(255) [UNIQUE, INDEX, NOT NULL]
* `full_name`: VARCHAR(100) [NOT NULL]
* `hashed_password`: VARCHAR(255) [NOT NULL]
* `role`: VARCHAR(20) [DEFAULT: 'user'] ('admin' veya 'user')
* `avatar_url`: VARCHAR(500) [NULLABLE]
* `phone`: VARCHAR(30) [NULLABLE]
* `is_active`: BOOLEAN [DEFAULT: TRUE]
* `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE

### 2. `families` (Aile Grupları)
* `id`: VARCHAR(36) [PK, UUID]
* `name`: VARCHAR(100) [NOT NULL]
* `invite_code`: VARCHAR(20) [UNIQUE, INDEX, NOT NULL] (Örn: `AILE-874291`)
* `created_by`: VARCHAR(36) [NULLABLE]
* `is_public`: BOOLEAN [DEFAULT: FALSE]
* `cloud_chat_backup_enabled`: BOOLEAN [DEFAULT: FALSE] (Yalnızca Admin kontrolü)
* `last_chat_backup_at`: TIMESTAMP WITH TIME ZONE [NULLABLE]
* `chat_backup_size_bytes`: BIGINT [DEFAULT: 0]
* `chat_backup_message_count`: INTEGER [DEFAULT: 0]
* `chat_backup_media_count`: INTEGER [DEFAULT: 0]
* `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE

### 3. `family_members` (Aile Üyelikleri)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE]
* `user_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `role`: VARCHAR(20) [DEFAULT: 'member'] ('admin' veya 'member')
* `nickname`: VARCHAR(50) [NULLABLE]
* `joined_at`: TIMESTAMP WITH TIME ZONE
* *Kısıt:* `UniqueConstraint("family_id", "user_id")`

### 4. `messages` (Sohbet Mesajları)
* `id`: VARCHAR(36) [PK, UUID]
* `client_message_id`: VARCHAR(100) [INDEX, NULLABLE] (İstemci tekilleştirme anahtarı)
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `sender_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `content`: TEXT [NULLABLE]
* `media_url`: TEXT [NULLABLE]
* `media_thumbnail_url`: VARCHAR(500) [NULLABLE]
* `media_type`: VARCHAR(50) [NULLABLE] (Örn: `image/jpeg`, `audio/webm`, `poll`)
* `is_edited`: BOOLEAN [DEFAULT: FALSE]
* `created_at`: TIMESTAMP WITH TIME ZONE
* `updated_at`: TIMESTAMP WITH TIME ZONE
* *İndeks:* `idx_messages_family_created (family_id, created_at)`

### 5. `storage_objects` (Depolama & Kota Metadata Tablosu)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `message_id`: VARCHAR(36) [FK $\rightarrow$ messages.id ON DELETE SET NULL, NULLABLE]
* `user_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `storage_path`: TEXT [NOT NULL, INDEX]
* `public_url`: TEXT [NOT NULL]
* `category`: VARCHAR(20) [NOT NULL, INDEX] (`CHAT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`)
* `file_size`: BIGINT [NOT NULL, DEFAULT: 0] (Bayt cinsinden dosya boyutu)
* `mime_type`: VARCHAR(100) [NULLABLE]
* `checksum`: VARCHAR(64) [INDEX, NULLABLE] (SHA-256 Hash Deduplication)
* `status`: VARCHAR(30) [DEFAULT: 'backed_up', INDEX] (`pending`, `backed_up`, `marked_for_deletion`, `deleted`)
* `is_protected`: BOOLEAN [DEFAULT: FALSE] (Favori/Sabitlenmiş koruma)
* `created_at`, `backed_up_at`: TIMESTAMP WITH TIME ZONE
* `deleted_at`: TIMESTAMP WITH TIME ZONE [NULLABLE]
* *İndeksler:*
  * `idx_storage_family_category_status (family_id, category, status)`
  * `idx_storage_retention_order (category, status, backed_up_at)`
  * `idx_storage_family_backed_up (family_id, backed_up_at)`
  * `idx_storage_checksum (family_id, checksum)`

### 6. `storage_cleanup_jobs` (Retention & Temizlik Denetim Logları)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, NULLABLE]
* `category`: VARCHAR(20) [NOT NULL] (`CHAT`, `IMAGE`, `AUDIO`, `GLOBAL`)
* `trigger_reason`: VARCHAR(100) [NOT NULL] (`preflight_incoming_backup`, `manual_cleanup`, `reconciliation`)
* `required_bytes`: BIGINT [DEFAULT: 0]
* `freed_bytes`: BIGINT [DEFAULT: 0]
* `deleted_messages_count`: INTEGER [DEFAULT: 0]
* `deleted_storage_objects_count`: INTEGER [DEFAULT: 0]
* `status`: VARCHAR(30) [DEFAULT: 'completed'] (`in_progress`, `completed`, `failed`)
* `error_message`: TEXT [NULLABLE]
* `started_at`, `completed_at`: TIMESTAMP WITH TIME ZONE

### 7. `notes` (Aile Notları)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `user_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `title`: VARCHAR(200) [NOT NULL]
* `content`: TEXT [NOT NULL]
* `color`: VARCHAR(20) [DEFAULT: '#FEF3C7']
* `is_pinned`: BOOLEAN [DEFAULT: FALSE]
* `is_secret`: BOOLEAN [DEFAULT: FALSE] (🔒 Yalnızca yazara özel gizli not)
* `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE

### 8. `task_items` (Görevler & To-Do)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `created_by`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `assigned_to`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE SET NULL, NULLABLE]
* `title`: VARCHAR(200) [NOT NULL]
* `description`: TEXT [NULLABLE]
* `status`: VARCHAR(20) [DEFAULT: 'pending'] (`pending`, `in_progress`, `completed`)
* `priority`: VARCHAR(20) [DEFAULT: 'medium'] (`low`, `medium`, `high`, `urgent`)
* `due_date`: TIMESTAMP WITH TIME ZONE [NULLABLE]
* `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE

### 9. `shopping_items` (Alışveriş Listesi)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `created_by`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `completed_by`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE SET NULL, NULLABLE]
* `title`: VARCHAR(200) [NOT NULL]
* `quantity`: VARCHAR(50) [DEFAULT: '1 adet']
* `category`: VARCHAR(50) [DEFAULT: 'Genel'] (`Market`, `Manav`, `Kasap`, `Eczane`, `Ev`)
* `is_completed`: BOOLEAN [DEFAULT: FALSE, INDEX]
* `completed_at`: TIMESTAMP WITH TIME ZONE [NULLABLE]
* `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE

### 10. `budget_items` (Bütçe & Harcamalar)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `user_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `type`: VARCHAR(10) [NOT NULL] (`income` veya `expense`)
* `amount`: NUMERIC(12, 2) [NOT NULL]
* `category`: VARCHAR(50) [NOT NULL] (`Market`, `Fatura`, `Kira`, `Eğlence`, `Sağlık`, `Maaş` vb.)
* `description`: VARCHAR(255) [NULLABLE]
* `date`: TIMESTAMP WITH TIME ZONE [NOT NULL]
* `created_at`: TIMESTAMP WITH TIME ZONE

### 11. `reminders` (Hatırlatıcılar & Randevular)
* `id`: VARCHAR(36) [PK, UUID]
* `family_id`: VARCHAR(36) [FK $\rightarrow$ families.id ON DELETE CASCADE, INDEX]
* `user_id`: VARCHAR(36) [FK $\rightarrow$ profiles.id ON DELETE CASCADE]
* `title`: VARCHAR(200) [NOT NULL]
* `due_date`: TIMESTAMP WITH TIME ZONE [NOT NULL]
* `category`: VARCHAR(50) [DEFAULT: 'Genel'] (`Randevu`, `İlaç`, `Fatura`, `Doğum Günü`)
* `is_completed`: BOOLEAN [DEFAULT: FALSE]
* `repeat_type`: VARCHAR(20) [DEFAULT: 'none'] (`none`, `daily`, `weekly`, `monthly`)
* `created_at`: TIMESTAMP WITH TIME ZONE

### 12. `polls` ve `poll_votes` (Sohbet İçi Anketler)
* `polls`: `id`, `family_id`, `creator_id`, `message_id`, `question`, `options` (JSON list), `duration_hours`, `expires_at`, `is_closed`.
* `poll_votes`: `id`, `poll_id`, `user_id`, `option_index`, `created_at`. *Kısıt:* `UniqueConstraint("poll_id", "user_id")`

---

## 3. Güvenli Canlı Migrasyon Mekanizması

Uygulama açılışında `backend/app/main.py` içindeki `run_safe_migrations()` fonksiyonu çalışır:
1. `Base.metadata.create_all(bind=engine)` ile eksik tablolar oluşturulur.
2. PostgreSQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` komutları çalıştırılarak mevcut aile veya kullanıcı verileri bozulmadan şema canlı olarak güncellenir.
