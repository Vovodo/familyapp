# 🔐 Kimlik Doğrulama, Yetkilendirme ve Güvenlik (Auth & Security)

Bu doküman, **Ailem** uygulamasının JWT tabanlı kimlik doğrulama, rol bazlı yetkilendirme (RBAC), grup bazlı veri izolasyonu ve şifreleme mekanizmalarını açıklar.

---

## 1. Kimlik Doğrulama Akışı (Authentication Flow)

```
[ İstemci (Web / Android) ]
        │
        ▼ 1. POST /api/v1/auth/login (email + password)
[ Backend Auth Router ]
        │
        ▼ 2. bcrypt.checkpw(password, user.hashed_password)
        │
        ▼ 3. JWT Access Token Üretimi (HS256, 30 Günlük)
        │
        ▼ 4. Yanıt: { access_token, token_type: "bearer", user: {...} }
[ İstemci ]
        │
        ▼ 5. Token Saklama: localStorage & Capacitor Preferences
        │
        ▼ 6. Gelecek tüm isteklerde: "Authorization: Bearer <token>"
```

### Güvenlik Ayarları (`backend/app/core/config.py`):
* **Algoritma:** `HS256`
* **Geçerlilik Süresi:** `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30` (30 gün)
* **Şifreleme:** `bcrypt` hash (12 salt round)

---

## 2. Rol Bazlı Yetkilendirme (RBAC)

Uygulamada iki katmanlı rol hiyerarşisi bulunur:

### A. Sistem Seviyesi Roller (`User.role`):
1. **`admin` (Sistem Yöneticisi):**
   * Tüm entegrasyonların sağlık durumunu (`/admin/integrations`), e-posta gönderim testini (`/admin/test-email`) ve global storage mutabakatını yönetir.
2. **`user` (Normal Kullanıcı):**
   * Standart aile üyesi.

### B. Aile Grubu Seviyesi Roller (`FamilyMember.role`):
1. **`admin` (Aile Yöneticisi / Kurucu):**
   * Aile ayarlarını düzenleme, davet kodunu kopyalama/yenileme.
   * **Bulut Sohbet Yedeklemesini Açma / Kapatma:** Yalnızca aile yöneticisi açıp kapatabilir (`toggle_family_backup`).
   * Üye çıkarma (Kick) ve grubu silme yetkisi.
   * Grubun depolama mutabakatını (`storage-reconcile`) ve geçmiş temizlik raporlarını (`cleanup-history`) inceleme.
2. **`member` (Aile Üyesi):**
   * Mesajlaşma, not oluşturma, görev tamamlama, alışveriş listesi ve bütçe kayıtları ekleme.

---

## 3. Aile Katılım Kodu (Invite Code) Mimarisi

* **Format:** `AILE-XXXXXX` (Örn: `AILE-924183`)
* **Benzersizlik:** Veritabanında `families.invite_code` alanı üzerinde `UNIQUE` indeks bulunur.
* **Akış:**
  * Yeni aile oluşturan kullanıcı otomatik olarak `admin` rolüyle kaydedilir.
  * Diğer aile bireyleri `POST /api/v1/families/join` endpoint'ine katılım kodunu girerek anında gruba dahil olur.

---

## 4. Grup İzolasyonu (Multi-Tenancy & Data Isolation)

Uygulamanın en kritik güvenlik kuralı: **Hiçbir grup diğer grubun verilerine erişemez veya müdahale edemez.**

### Backend Seviyesinde Garanti:
Her endpoint `backend/app/api/deps.py` içerisindeki dependency fonksiyonlarını kullanır:
```python
# 1. Kullanıcıyı token üzerinden doğrular
current_user: User = Depends(get_current_user)

# 2. Kullanıcının aktif aile üyeliğini doğrular (Yetkisizse HTTP 403 / 404 döner)
member: FamilyMember = Depends(get_current_family_member)

# 3. Yalnızca aile yöneticisine izin verir
admin_member: FamilyMember = Depends(get_current_admin_member)
```

Tüm SQL sorguları ve storage retention filtreleri `family_id == member.family_id` parametresi ile kısıtlanır. Frontend'den gelen `family_id` parametresine asla doğrudan güvenilmez.

---

## 5. Gizli Notlar (🔒 Private Encrypted Notes)

* Notlar tablosunda `is_secret = True` olan kayıtlar kişiye özeldir.
* Sorgularda:
  `filter((Note.family_id == family_id) & ((Note.is_secret == False) | (Note.user_id == current_user.id)))`
  kuralı uygulanır; böylece ailenin diğer üyeleri gizli notun varlığından dahi haberdar olamaz.
