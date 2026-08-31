import asyncio
from datetime import datetime, timezone, timedelta
from loguru import logger
from backend.app.db.session import SessionLocal
from backend.app.models.models import Message


async def run_periodic_cleanup_job():
    """
    Background maintenance task that runs every 12 hours.
    Purges text, audio notes, and GIF messages older than 14 days across all families.
    Preserves all family photos and gallery memories intact.
    """
    # Wait 60 seconds after startup before first run
    await asyncio.sleep(60)

    while True:
        try:
            logger.info("[Auto-Cleanup] Checking for old messages (>14 days) to purge...")
            db = SessionLocal()
            try:
                cutoff = datetime.now(timezone.utc) - timedelta(days=14)
                # Find messages older than 14 days that are not images
                old_messages = (
                    db.query(Message)
                    .filter(
                        Message.created_at < cutoff,
                        Message.media_type != "image"
                    )
                    .all()
                )
                count = len(old_messages)
                if count > 0:
                    for msg in old_messages:
                        db.delete(msg)
                    db.commit()
                    logger.info(f"[Auto-Cleanup] Successfully purged {count} old messages (>14 days). Photos preserved.")
                else:
                    logger.info("[Auto-Cleanup] No expired messages found. Storage is healthy.")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[Auto-Cleanup] Maintenance job encountered an error: {e}")

        # Sleep for 12 hours
        await asyncio.sleep(12 * 3600)
