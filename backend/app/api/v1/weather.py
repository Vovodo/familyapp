from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, Depends
from backend.app.services.weather_service import weather_service

router = APIRouter()


@router.get("/current")
async def get_current_weather(
    city: Optional[str] = Query(None, description="Şehir ismi (örn: İzmir, İstanbul)"),
    latitude: Optional[float] = Query(None, description="Enlem"),
    longitude: Optional[float] = Query(None, description="Boylam")
):
    """
    Returns normalized live current weather for given city or coordinates.
    Includes 15-minute in-memory caching and graceful fallback.
    """
    return await weather_service.get_current_weather(
        city=city,
        latitude=latitude,
        longitude=longitude
    )


@router.get("/search-city")
def search_city(
    q: Optional[str] = Query("", description="Arama terimi")
):
    """
    Returns a list of matching popular Turkish cities with coordinates.
    """
    return weather_service.search_popular_cities(query=q or "")
