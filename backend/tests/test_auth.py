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
    # Test 1-click onboarding
    res = client.post(
        "/api/v1/auth/quick-join",
        json={
            "full_name": "Can Yılmaz",
            "nickname": "Baba",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["full_name"] == "Can Yılmaz"
    assert "family_id" in data
    assert data["family_name"]

