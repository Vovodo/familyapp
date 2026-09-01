def test_register_and_login(client):
    # 1. Register User 1
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Ege Pamukçu",
            "email": "ege@test.com",
            "password": "securepassword123",
            "nickname": "Ege",
        },
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert "access_token" in data
    assert data["user"]["full_name"] == "Ege Pamukçu"

    # 2. Login User 1
    login_res = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_phone": "ege@test.com",
            "password": "securepassword123",
        },
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # 3. Duplicate email prevention test
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Ege Duplicate",
            "email": "ege@test.com",
            "password": "anotherpassword",
        },
    )
    assert dup_res.status_code == 400
    assert "zaten kayıtlı" in dup_res.json()["detail"]


def test_user_me_profile_update(client):
    # Register and get profile
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Ayşe Yılmaz",
            "email": "ayse@test.com",
            "password": "securepassword123",
        },
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Update profile
    patch_res = client.patch(
        "/api/v1/auth/me",
        json={"phone": "05551234567"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["phone"] == "05551234567"


def test_quick_join(client):
    # 1. User 1 creates fresh Family 1
    res1 = client.post(
        "/api/v1/auth/verify-and-register",
        json={
            "email": "can@test.com",
            "password": "Password123!",
            "code": "999999",
            "full_name": "Can Yılmaz",
            "nickname": "Baba",
            "family_action": "create",
            "family_name": "Yılmaz Ailesi",
        },
    )
    assert res1.status_code == 201
    data1 = res1.json()
    token1 = data1["access_token"]

    # Get invite code of Family 1
    fam1_details = client.get("/api/v1/families/me", headers={"Authorization": f"Bearer {token1}"}).json()
    code1 = fam1_details[0]["invite_code"] if isinstance(fam1_details, list) else fam1_details["invite_code"]
    fam1_id = fam1_details[0]["id"] if isinstance(fam1_details, list) else fam1_details["id"]

    # 2. User 2 creates fresh Family 2 (Must be isolated, NOT attached to Family 1!)
    res2 = client.post(
        "/api/v1/auth/verify-and-register",
        json={
            "email": "murat@test.com",
            "password": "Password123!",
            "code": "999999",
            "full_name": "Murat Demir",
            "nickname": "Baba",
            "family_action": "create",
            "family_name": "Demir Ailesi",
        },
    )
    assert res2.status_code == 201
    data2 = res2.json()
    token2 = data2["access_token"]
    fam2_details = client.get("/api/v1/families/me", headers={"Authorization": f"Bearer {token2}"}).json()
    fam2_id = fam2_details[0]["id"] if isinstance(fam2_details, list) else fam2_details["id"]
    assert fam2_id != fam1_id

    # 3. User 3 joins Family 1 with code1
    res3 = client.post(
        "/api/v1/auth/verify-and-register",
        json={
            "email": "elif@test.com",
            "password": "Password123!",
            "code": "999999",
            "full_name": "Elif Yılmaz",
            "nickname": "Kızım",
            "family_action": "join",
            "invite_code": code1,
        },
    )
    assert res3.status_code == 201

    # 4. User 4 tries invalid code -> 404 error
    res4 = client.post(
        "/api/v1/auth/verify-and-register",
        json={
            "email": "hatali@test.com",
            "password": "Password123!",
            "code": "999999",
            "full_name": "Hatalı Kodlu Kullanıcı",
            "nickname": "Üye",
            "family_action": "join",
            "invite_code": "GEÇERSİZ-999",
        },
    )
    assert res4.status_code == 404


