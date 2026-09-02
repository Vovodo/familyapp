from typing import Any
import os

import sentry_sdk
from backend.app.core.config import settings


def _traces_sampler(sampling_context: dict[str, Any]) -> float:
    asgi_scope = sampling_context.get("asgi_scope") or {}
    path = str(asgi_scope.get("path") or "")
    if path.startswith("/api/v1/health") or path in ("/", "/docs", "/redoc", "/openapi.json"):
        return 0.0
    if settings.DEBUG or settings.ENVIRONMENT.lower() in {"development", "local"}:
        return 1.0
    return 0.2


def init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=os.getenv("SENTRY_ENVIRONMENT") or settings.ENVIRONMENT,
        release="ailem-backend@1.0.0",
        send_default_pii=False,
        traces_sampler=_traces_sampler,
        enable_logs=True,
        attach_stacktrace=True,
    )
