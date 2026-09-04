"""Paylaşılan Firebase Admin başlatma: FCM ve ses kanalı custom token."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger

from backend.app.core.config import settings

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_DEFAULT_CRED_PATH = _BACKEND_DIR / "firebase_service_account.json"

try:
    import firebase_admin
    from firebase_admin import credentials

    HAS_FIREBASE_ADMIN = True
except ImportError:
    firebase_admin = None  # type: ignore
    HAS_FIREBASE_ADMIN = False


def ensure_firebase_app() -> bool:
    if not HAS_FIREBASE_ADMIN:
        return False
    if firebase_admin._apps:
        return True

    inline_json = (settings.FIREBASE_CREDENTIALS_JSON or "").strip()
    cred_path = (
        Path(settings.FIREBASE_CREDENTIALS_PATH.strip())
        if settings.FIREBASE_CREDENTIALS_PATH
        else _DEFAULT_CRED_PATH
    )
    options: Dict[str, str] = {}
    if settings.FIREBASE_DATABASE_URL:
        options["databaseURL"] = settings.FIREBASE_DATABASE_URL

    try:
        if inline_json:
            cred = credentials.Certificate(json.loads(inline_json))
        elif cred_path.is_file():
            cred = credentials.Certificate(str(cred_path))
        else:
            gac = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
            if gac and Path(gac).is_file():
                cred = credentials.Certificate(gac)
            else:
                return False
        firebase_admin.initialize_app(cred, options or None)
        return True
    except Exception as exc:
        logger.error(f"Firebase Admin başlatılamadı: {exc}")
        return False


def create_voice_custom_token(user_id: str, family_id: str) -> Optional[str]:
    """Aile id'sini custom claim olarak taşıyan kısa ömürlü Firebase token."""
    if not ensure_firebase_app():
        return None
    try:
        from firebase_admin import auth

        token = auth.create_custom_token(user_id, {"family_id": family_id, "voice": True})
        if isinstance(token, bytes):
            return token.decode("utf-8")
        return str(token)
    except Exception as exc:
        logger.warning(f"Firebase custom token üretilemedi: {exc}")
        return None


def firebase_web_config() -> Dict[str, str]:
    return {
        "apiKey": settings.FIREBASE_WEB_API_KEY,
        "authDomain": settings.FIREBASE_AUTH_DOMAIN,
        "databaseURL": settings.FIREBASE_DATABASE_URL,
        "projectId": settings.FIREBASE_PROJECT_ID,
        "storageBucket": settings.FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": settings.FIREBASE_MESSAGING_SENDER_ID,
        "appId": settings.FIREBASE_APP_ID,
    }


def ice_servers_payload() -> List[Dict[str, Any]]:
    servers: List[Dict[str, Any]] = [
        {
            "urls": [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
            ]
        }
    ]
    urls = [item.strip() for item in (settings.TURN_URLS or "").split(",") if item.strip()]
    if urls and settings.TURN_USERNAME and settings.TURN_CREDENTIAL:
        servers.append(
            {
                "urls": urls,
                "username": settings.TURN_USERNAME,
                "credential": settings.TURN_CREDENTIAL,
            }
        )
    return servers
