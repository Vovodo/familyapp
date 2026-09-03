"""
Video sağlayıcı soyutlaması.

İlk sürüm YouTube embed kimliği çıkarır; video indirilmez / proxy edilmez.
Yeni sağlayıcı eklemek için VideoProviderProtocol uygulayıp REGISTRY'ye kaydedin.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Protocol

from backend.app.services.youtube_url import (
    canonical_youtube_url,
    extract_youtube_video_id,
    parse_start_ms,
)


@dataclass(frozen=True)
class ParsedVideo:
    provider: str
    video_id: str
    canonical_url: str
    start_ms: int = 0


class VideoProviderProtocol(Protocol):
    name: str

    def parse(self, raw_url: str) -> Optional[ParsedVideo]:
        ...


class YouTubeVideoProvider:
    name = "youtube"

    def parse(self, raw_url: str) -> Optional[ParsedVideo]:
        video_id = extract_youtube_video_id(raw_url)
        if not video_id:
            return None
        return ParsedVideo(
            provider=self.name,
            video_id=video_id,
            canonical_url=canonical_youtube_url(video_id),
            start_ms=parse_start_ms(raw_url),
        )


PROVIDER_REGISTRY: Dict[str, VideoProviderProtocol] = {
    "youtube": YouTubeVideoProvider(),
}


def parse_video_url(raw_url: str, provider: str = "youtube") -> ParsedVideo:
    key = (provider or "youtube").strip().lower()
    impl = PROVIDER_REGISTRY.get(key)
    if not impl:
        raise ValueError(f"unsupported_provider:{key}")
    parsed = impl.parse(raw_url)
    if not parsed:
        raise ValueError("invalid_video_url")
    return parsed


def supported_providers() -> tuple[str, ...]:
    return tuple(PROVIDER_REGISTRY.keys())
