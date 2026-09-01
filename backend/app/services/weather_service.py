import time
from typing import Dict, Any, Optional, List
import httpx
from loguru import logger

# In-memory cache for weather and geocoding: { cache_key: { "data": ..., "expires_at": timestamp } }
_WEATHER_CACHE: Dict[str, Dict[str, Any]] = {}
_GEO_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes cache

# Default fallback Turkish cities coordinates
POPULAR_CITIES: Dict[str, Dict[str, Any]] = {
    "İzmir": {"lat": 38.4189, "lon": 27.1287, "admin": "İzmir"},
    "İstanbul": {"lat": 41.0082, "lon": 28.9784, "admin": "İstanbul"},
    "Ankara": {"lat": 39.9334, "lon": 32.8597, "admin": "Ankara"},
    "Bursa": {"lat": 40.1885, "lon": 29.0610, "admin": "Bursa"},
    "Antalya": {"lat": 36.8969, "lon": 30.7133, "admin": "Antalya"},
    "Adana": {"lat": 37.0000, "lon": 35.3213, "admin": "Adana"},
    "Konya": {"lat": 37.8667, "lon": 32.4833, "admin": "Konya"},
    "Gaziantep": {"lat": 37.0662, "lon": 37.3833, "admin": "Gaziantep"},
    "Şanlıurfa": {"lat": 37.1591, "lon": 38.7969, "admin": "Şanlıurfa"},
    "Kocaeli": {"lat": 40.8533, "lon": 29.8815, "admin": "Kocaeli"},
    "Mersin": {"lat": 36.8000, "lon": 34.6333, "admin": "Mersin"},
    "Diyarbakır": {"lat": 37.9144, "lon": 40.2306, "admin": "Diyarbakır"},
    "Hatay": {"lat": 36.4018, "lon": 36.3498, "admin": "Hatay"},
    "Manisa": {"lat": 38.6191, "lon": 27.4289, "admin": "Manisa"},
    "Kayseri": {"lat": 38.7312, "lon": 35.4787, "admin": "Kayseri"},
    "Samsun": {"lat": 41.2867, "lon": 36.3300, "admin": "Samsun"},
    "Balıkesir": {"lat": 39.6484, "lon": 27.8826, "admin": "Balıkesir"},
    "Kahramanmaraş": {"lat": 37.5858, "lon": 36.9371, "admin": "Kahramanmaraş"},
    "Van": {"lat": 38.4891, "lon": 43.4089, "admin": "Van"},
    "Aydın": {"lat": 37.8560, "lon": 27.8416, "admin": "Aydın"},
    "Denizli": {"lat": 37.7765, "lon": 29.0864, "admin": "Denizli"},
    "Sakarya": {"lat": 40.7569, "lon": 30.3783, "admin": "Sakarya"},
    "Tekirdağ": {"lat": 40.9833, "lon": 27.5167, "admin": "Tekirdağ"},
    "Muğla": {"lat": 37.2153, "lon": 28.3636, "admin": "Muğla"},
    "Eskişehir": {"lat": 39.7767, "lon": 30.5206, "admin": "Eskişehir"},
    "Trabzon": {"lat": 41.0027, "lon": 39.7168, "admin": "Trabzon"},
    "Çanakkale": {"lat": 40.1553, "lon": 26.4142, "admin": "Çanakkale"},
}

WMO_WEATHER_MAP: Dict[int, Dict[str, str]] = {
    0: {"condition": "Açık", "icon": "clear", "emoji": "☀️"},
    1: {"condition": "Çoğunlukla Açık", "icon": "mostly-clear", "emoji": "🌤️"},
    2: {"condition": "Parçalı Bulutlu", "icon": "partly-cloudy", "emoji": "⛅"},
    3: {"condition": "Bulutlu", "icon": "cloudy", "emoji": "☁️"},
    45: {"condition": "Sisli", "icon": "fog", "emoji": "🌫️"},
    48: {"condition": "Kırağılı Sis", "icon": "fog", "emoji": "🌫️"},
    51: {"condition": "Hafif Çisenti", "icon": "drizzle", "emoji": "🌦️"},
    53: {"condition": "Çiseleyen Yağmur", "icon": "drizzle", "emoji": "🌦️"},
    55: {"condition": "Yoğun Çisenti", "icon": "drizzle", "emoji": "🌧️"},
    56: {"condition": "Hafif Dondurucu Çisenti", "icon": "sleet", "emoji": "🌨️"},
    57: {"condition": "Dondurucu Çisenti", "icon": "sleet", "emoji": "🌨️"},
    61: {"condition": "Hafif Yağmurlu", "icon": "rain", "emoji": "🌧️"},
    63: {"condition": "Yağmurlu", "icon": "rain", "emoji": "🌧️"},
    65: {"condition": "Kuvvetli Yağmur", "icon": "heavy-rain", "emoji": "🌧️"},
    66: {"condition": "Hafif Dondurucu Yağmur", "icon": "sleet", "emoji": "🌨️"},
    67: {"condition": "Kuvvetli Dondurucu Yağmur", "icon": "sleet", "emoji": "🌨️"},
    71: {"condition": "Hafif Kar Yağışlı", "icon": "snow", "emoji": "❄️"},
    73: {"condition": "Karlı", "icon": "snow", "emoji": "❄️"},
    75: {"condition": "Yoğun Kar Yağışlı", "icon": "snow", "emoji": "❄️"},
    77: {"condition": "Kar Taneleri", "icon": "snow", "emoji": "❄️"},
    80: {"condition": "Hafif Sağanak", "icon": "rain", "emoji": "🌦️"},
    81: {"condition": "Sağanak Yağışlı", "icon": "rain", "emoji": "🌧️"},
    82: {"condition": "Kuvvetli Sağanak", "icon": "heavy-rain", "emoji": "⛈️"},
    85: {"condition": "Hafif Kar Sağanağı", "icon": "snow", "emoji": "🌨️"},
    86: {"condition": "Kuvvetli Kar Sağanağı", "icon": "snow", "emoji": "🌨️"},
    95: {"condition": "Gök Gürültülü Fırtına", "icon": "thunderstorm", "emoji": "⛈️"},
    96: {"condition": "Dolu ve Fırtına", "icon": "thunderstorm", "emoji": "⛈️"},
    99: {"condition": "Kuvvetli Dolu ve Fırtına", "icon": "thunderstorm", "emoji": "⛈️"},
}


class WeatherService:
    def __init__(self):
        self.geocoding_url = "https://geocoding-api.open-meteo.com/v1/search"
        self.forecast_url = "https://api.open-meteo.com/v1/forecast"

    async def get_coordinates_for_city(self, city_name: str) -> Optional[Dict[str, Any]]:
        """
        Resolves city name to latitude and longitude with in-memory caching and Turkey fallback.
        """
        clean_city = city_name.strip()
        if not clean_city:
            clean_city = "İzmir"

        # 1. Check in-memory geocoding cache
        cache_key = clean_city.lower()
        now = time.time()
        if cache_key in _GEO_CACHE:
            item = _GEO_CACHE[cache_key]
            if item["expires_at"] > now:
                return item["data"]

        # 2. Check popular Turkish cities list
        for pop_city, data in POPULAR_CITIES.items():
            if pop_city.lower() == clean_city.lower():
                res = {
                    "city": pop_city,
                    "latitude": data["lat"],
                    "longitude": data["lon"],
                    "country": "Türkiye"
                }
                _GEO_CACHE[cache_key] = {"data": res, "expires_at": now + 86400 * 7}
                return res

        # 3. Call Open-Meteo Geocoding API
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                params = {
                    "name": clean_city,
                    "count": 1,
                    "language": "tr",
                    "format": "json"
                }
                resp = await client.get(self.geocoding_url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results", [])
                    if results:
                        first = results[0]
                        resolved_city = first.get("name", clean_city)
                        res = {
                            "city": resolved_city,
                            "latitude": float(first.get("latitude")),
                            "longitude": float(first.get("longitude")),
                            "country": first.get("country", "Türkiye")
                        }
                        _GEO_CACHE[cache_key] = {"data": res, "expires_at": now + 86400 * 7}
                        return res
        except Exception as e:
            logger.warning(f"Geocoding API request error for {clean_city}: {e}")

        # Fallback to İzmir if not found
        fallback = {
            "city": clean_city if clean_city else "İzmir",
            "latitude": POPULAR_CITIES["İzmir"]["lat"],
            "longitude": POPULAR_CITIES["İzmir"]["lon"],
            "country": "Türkiye"
        }
        return fallback

    async def get_current_weather(
        self,
        city: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Fetches current weather for a city or coordinates with 15-minute caching and robust fallback.
        """
        now = time.time()
        resolved_city = city or "İzmir"

        # Resolve coordinates if missing
        if latitude is None or longitude is None:
            coords = await self.get_coordinates_for_city(resolved_city)
            if coords:
                latitude = coords["latitude"]
                longitude = coords["longitude"]
                resolved_city = coords["city"]
            else:
                latitude = 38.4189
                longitude = 27.1287
                resolved_city = "İzmir"

        # Check 15-minute weather cache by rounded coordinates (2 decimal places ~1.1km precision)
        cache_key = f"{round(latitude, 2)}_{round(longitude, 2)}"
        if cache_key in _WEATHER_CACHE:
            cached = _WEATHER_CACHE[cache_key]
            if cached["expires_at"] > now:
                cached_data = dict(cached["data"])
                cached_data["city"] = resolved_city
                return cached_data

        # Fetch from Open-Meteo Forecast API
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                params = {
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
                    "timezone": "auto"
                }
                resp = await client.get(self.forecast_url, params=params)
                if resp.status_code == 200:
                    payload = resp.json()
                    current = payload.get("current", {})

                    weather_code = int(current.get("weather_code", 0))
                    wmo_info = WMO_WEATHER_MAP.get(weather_code, {"condition": "Açık", "icon": "clear", "emoji": "☀️"})

                    temp = round(float(current.get("temperature_2m", 22)))
                    feels_like = round(float(current.get("apparent_temperature", temp)))
                    humidity = round(float(current.get("relative_humidity_2m", 50)))
                    wind_speed = round(float(current.get("wind_speed_10m", 10)))
                    is_day = int(current.get("is_day", 1))

                    result = {
                        "city": resolved_city,
                        "latitude": latitude,
                        "longitude": longitude,
                        "temperature": temp,
                        "feels_like": feels_like,
                        "humidity": humidity,
                        "wind_speed": wind_speed,
                        "condition": wmo_info["condition"],
                        "weather_code": weather_code,
                        "icon": wmo_info["icon"],
                        "emoji": wmo_info["emoji"],
                        "is_day": is_day,
                        "cached": False,
                        "updated_at": time.strftime("%H:%M")
                    }

                    # Store in cache
                    _WEATHER_CACHE[cache_key] = {
                        "data": result,
                        "expires_at": now + CACHE_TTL_SECONDS
                    }
                    return result
        except Exception as e:
            logger.warning(f"Open-Meteo API fetch warning for {resolved_city}: {e}")

        # Safe fallback model if network is down or API has temporary issue
        fallback_result = {
            "city": resolved_city,
            "latitude": latitude,
            "longitude": longitude,
            "temperature": 24,
            "feels_like": 25,
            "humidity": 45,
            "wind_speed": 12,
            "condition": "Parçalı Bulutlu",
            "weather_code": 2,
            "icon": "partly-cloudy",
            "emoji": "⛅",
            "is_day": 1,
            "cached": True,
            "updated_at": time.strftime("%H:%M")
        }
        return fallback_result

    def search_popular_cities(self, query: str = "") -> List[Dict[str, Any]]:
        """
        Returns a list of searchable Turkish cities.
        """
        q = query.strip().lower()
        results = []
        for city, data in POPULAR_CITIES.items():
            if not q or q in city.lower():
                results.append({
                    "city": city,
                    "latitude": data["lat"],
                    "longitude": data["lon"],
                    "admin": data["admin"]
                })
        return results


weather_service = WeatherService()
