"""Alışveriş listesi: ekleme, silme, alındı işareti ve aile izolasyonu."""
import uuid


def _register(client, name="Üye"):
    email = f"shop_{uuid.uuid4().hex[:10]}@aile.com"
    res = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": "Password123!"},
    )
    assert res.status_code in (200, 201), res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _family_with_two(client):
    host = _register(client, "Ege")
    fam = client.post("/api/v1/families/", json={"name": "Alışveriş Ailesi"}, headers=host)
    assert fam.status_code == 201, fam.text
    family = fam.json()
    host["x-family-id"] = family["id"]

    guest = _register(client, "Test")
    joined = client.post(
        "/api/v1/families/join",
        json={"invite_code": family["invite_code"], "nickname": "Test"},
        headers=guest,
    )
    assert joined.status_code == 200, joined.text
    guest["x-family-id"] = family["id"]
    return host, guest


def test_shopping_add_complete_stays_completed_and_delete_syncs(client):
    host, guest = _family_with_two(client)

    created = client.post(
        "/api/v1/shopping/",
        json={"title": "Süt", "quantity": "1 litre", "category": "Market"},
        headers=host,
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    assert created.json()["is_completed"] is False

    marked = client.patch(
        f"/api/v1/shopping/{item_id}",
        json={"is_completed": True},
        headers=guest,
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["is_completed"] is True
    assert marked.json()["completed_by_name"]

    host_list = client.get("/api/v1/shopping/", headers=host).json()
    guest_list = client.get("/api/v1/shopping/", headers=guest).json()
    assert len(host_list) == 1
    assert len(guest_list) == 1
    assert host_list[0]["is_completed"] is True
    assert guest_list[0]["is_completed"] is True
    assert host_list[0]["id"] == guest_list[0]["id"] == item_id

    extra = client.post(
        "/api/v1/shopping/",
        json={"title": "Ekmek", "quantity": "1 adet", "category": "Fırın"},
        headers=guest,
    ).json()

    deleted = client.delete(f"/api/v1/shopping/{item_id}", headers=host)
    assert deleted.status_code == 200

    after_host = client.get("/api/v1/shopping/", headers=host).json()
    after_guest = client.get("/api/v1/shopping/", headers=guest).json()
    assert [i["id"] for i in after_host] == [extra["id"]]
    assert [i["id"] for i in after_guest] == [extra["id"]]
    assert after_host[0]["is_completed"] is False


def test_shopping_isolation_between_families(client):
    host, _ = _family_with_two(client)
    other = _register(client, "Yabancı")
    fam = client.post("/api/v1/families/", json={"name": "Başka Aile"}, headers=other)
    other["x-family-id"] = fam.json()["id"]

    item = client.post(
        "/api/v1/shopping/",
        json={"title": "Gizli", "quantity": "1", "category": "Ev"},
        headers=host,
    ).json()

    listed = client.get("/api/v1/shopping/", headers=other).json()
    assert listed == []

    spoof = {**other, "x-family-id": host["x-family-id"]}
    blocked = client.patch(f"/api/v1/shopping/{item['id']}", json={"is_completed": True}, headers=spoof)
    assert blocked.status_code == 403
