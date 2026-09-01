import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.weather_service import weather_service

client = TestClient(app)


@pytest.mark.asyncio
async def test_weather_service_direct():
    # 1. Test coordinate resolution
    coords = await weather_service.get_coordinates_for_city("İzmir")
    assert coords is not None
    assert coords["city"] == "İzmir"
    assert "latitude" in coords
    assert "longitude" in coords

    # 2. Test weather fetch
    weather = await weather_service.get_current_weather(city="İzmir")
    assert weather is not None
    assert weather["city"] == "İzmir"
    assert "temperature" in weather
    assert "feels_like" in weather
    assert "condition" in weather
    assert "icon" in weather
    assert "emoji" in weather

    # 3. Test caching behavior
    cached_weather = await weather_service.get_current_weather(city="İzmir")
    assert cached_weather["temperature"] == weather["temperature"]

    # 4. Test popular cities search
    cities = weather_service.search_popular_cities("İzm")
    assert len(cities) >= 1
    assert cities[0]["city"] == "İzmir"


def test_weather_api_endpoints():
    # 1. GET /api/v1/weather/current
    resp = client.get("/api/v1/weather/current?city=Ankara")
    assert resp.status_code == 200
    data = resp.json()
    assert data["city"] == "Ankara"
    assert "temperature" in data
    assert "humidity" in data
    assert "wind_speed" in data
    assert "condition" in data

    # 2. GET /api/v1/weather/search-city
    resp = client.get("/api/v1/weather/search-city?q=İstan")
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) >= 1
    assert any("İstanbul" in r["city"] for r in results)
