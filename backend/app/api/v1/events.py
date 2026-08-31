"""
Server-Sent Events (SSE) endpoint for real-time family event streaming.
This allows native Android Foreground Services to receive events without Firebase.
"""
import asyncio
import json
import uuid
from typing import Dict, Set
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User, FamilyMember
from backend.app.api.deps import get_current_user
from loguru import logger

router = APIRouter()

# Global SSE connection registry: family_id -> set of queues
_family_connections: Dict[str, Set[asyncio.Queue]] = {}
_connections_lock = asyncio.Lock()


async def publish_to_family(family_id: str, event: dict):
    """Publish an event to all SSE subscribers of a family (excluding sender)."""
    queues = _family_connections.get(family_id, set()).copy()
    if not queues:
        return 0

    sender_id = event.get("sender_id")
    count = 0
    payload = f"data: {json.dumps(event)}\n\n"

    for q in queues:
        # Attach sender_id to each queue for filtering
        if hasattr(q, '_user_id') and q._user_id == sender_id:
            continue
        try:
            q.put_nowait(payload)
            count += 1
        except asyncio.QueueFull:
            pass

    logger.info(f"SSE_PUBLISH: Published to {count}/{len(queues)} connections for family {family_id}")
    return count


@router.get("/family/{family_id}/stream")
async def family_event_stream(
    family_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    SSE endpoint for Android Foreground Service connections.
    Streams real-time family events (heart, messages, etc.) without Firebase.
    """
    # Verify user is a member of this family
    membership = db.query(FamilyMember).filter(
        FamilyMember.family_id == family_id,
        FamilyMember.user_id == current_user.id
    ).first()

    if not membership:
        return StreamingResponse(
            iter(["data: {\"error\": \"Unauthorized\"}\n\n"]),
            media_type="text/event-stream"
        )

    # Create a queue for this connection
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    q._user_id = current_user.id  # type: ignore

    # Register queue
    if family_id not in _family_connections:
        _family_connections[family_id] = set()
    _family_connections[family_id].add(q)

    logger.info(f"SSE_CONNECT: User {current_user.id} connected to family {family_id} stream. "
                f"Total connections: {len(_family_connections[family_id])}")

    async def event_generator():
        try:
            # Send initial connection confirmation
            yield f"data: {json.dumps({'type': 'connected', 'family_id': family_id, 'user_id': current_user.id})}\n\n"

            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    # Wait for event with 30s timeout (keepalive)
                    payload = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield payload
                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                except asyncio.CancelledError:
                    break

        except Exception as e:
            logger.warning(f"SSE_ERROR: {e}")
        finally:
            # Remove queue on disconnect
            if family_id in _family_connections:
                _family_connections[family_id].discard(q)
                if not _family_connections[family_id]:
                    del _family_connections[family_id]
            logger.info(f"SSE_DISCONNECT: User {current_user.id} disconnected from family {family_id}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )
