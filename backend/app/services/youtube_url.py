"""YouTube URL çözümleme. Video indirilmez; yalnızca 11 haneli kimlik çıkarılır."""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}

_TIME_TOKEN_RE = re.compile(
    r"^(?:(?P<h>\d+)h)?(?:(?P<m>\d+)m)?(?:(?P<s>\d+)s)?$|(?P<raw>\d+)$"
)


def extract_youtube_video_id(raw: str) -> Optional[str]:
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip()
    if YOUTUBE_ID_RE.match(text):
        return text

    if "://" not in text:
        text = "https://" + text

    try:
        parsed = urlparse(text)
    except Exception:
        return None

    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host_key = host
    else:
        host_key = host
    if host_key not in HOSTS:
        return None

    path = parsed.path or ""
    parts = [p for p in path.split("/") if p]
    query = parse_qs(parsed.query or "")

    if host_key in {"youtu.be", "www.youtu.be"} and parts:
        candidate = parts[0][:11]
        return candidate if YOUTUBE_ID_RE.match(candidate) else None

    if "v" in query:
        candidate = (query.get("v") or [""])[0][:11]
        if YOUTUBE_ID_RE.match(candidate):
            return candidate

    if len(parts) >= 2 and parts[0] in {"embed", "shorts", "live", "v", "e"}:
        candidate = parts[1][:11]
        if YOUTUBE_ID_RE.match(candidate):
            return candidate

    if len(parts) >= 1 and YOUTUBE_ID_RE.match(parts[0][:11]) and parts[0] not in {"watch", "playlist"}:
        return parts[0][:11]

    return None


def parse_start_ms(raw: str) -> int:
    """URL'deki t= / start= değerini milisaniyeye çevirir (yoksa 0)."""
    if not raw:
        return 0
    text = str(raw).strip()
    if "://" not in text:
        text = "https://" + text
    try:
        parsed = urlparse(text)
        query = parse_qs(parsed.query or "")
    except Exception:
        return 0

    token = (query.get("t") or query.get("start") or [None])[0]
    if not token:
        fragment = parsed.fragment or ""
        if fragment.startswith("t="):
            token = fragment[2:]
    if not token:
        return 0
    return _token_to_ms(str(token))


def _token_to_ms(token: str) -> int:
    token = token.strip().lower()
    match = _TIME_TOKEN_RE.match(token)
    if not match:
        return 0
    if match.group("raw") is not None:
        return max(0, int(match.group("raw")) * 1000)
    hours = int(match.group("h") or 0)
    minutes = int(match.group("m") or 0)
    seconds = int(match.group("s") or 0)
    return max(0, ((hours * 3600) + (minutes * 60) + seconds) * 1000)


def canonical_youtube_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"
