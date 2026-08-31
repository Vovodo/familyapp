import json
import os
from typing import List, Optional
from loguru import logger
from sqlalchemy.orm import Session
from backend.app.models.models import DeviceToken

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
    HAS_FIREBASE_ADMIN = True
except ImportError:
    HAS_FIREBASE_ADMIN = False

HEART_CHANNEL_ID = "family_heart_channel"
GENERAL_CHANNEL_ID = "family_general_channel"

class PushNotificationService:
    def __init__(self):
        self.is_initialized = False
        self._initialize_firebase()

    def _initialize_firebase(self):
        if not HAS_FIREBASE_ADMIN:
            logger.warning("firebase-admin package is not installed. Push notifications via FCM will be disabled.")
            return

        if len(firebase_admin._apps) > 0:
            self.is_initialized = True
            return

        # 1. Check for service account JSON file path or inline JSON
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "backend/firebase_service_account.json")
        inline_json = os.getenv("FIREBASE_CREDENTIALS_JSON")

        try:
            if inline_json:
                cred_dict = json.loads(inline_json)
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)
                self.is_initialized = True
                logger.info("Firebase Admin SDK initialized successfully via FIREBASE_CREDENTIALS_JSON.")
            elif os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                self.is_initialized = True
                logger.info(f"Firebase Admin SDK initialized successfully via file: {cred_path}")
            elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and os.path.exists(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")):
                cred = credentials.Certificate(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
                firebase_admin.initialize_app(cred)
                self.is_initialized = True
                logger.info("Firebase Admin SDK initialized successfully via GOOGLE_APPLICATION_CREDENTIALS.")
            else:
                logger.info("No Firebase Service Account JSON found. FCM push notifications are in standby mode.")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase Admin SDK: {e}")

    async def send_heart_push(
        self,
        db: Session,
        device_tokens: List[DeviceToken],
        sender_name: str,
        sender_id: str,
        family_id: str,
        event_id: str,
        custom_message: Optional[str] = None
    ) -> int:
        """
        Sends high-priority FCM push notification to target device tokens with vibration pattern & heads-up.
        Works even when app is killed or device is asleep.
        """
        if not device_tokens:
            logger.info("PUSH_SEND: 0 active tokens found for family recipients.")
            return 0

        title = "❤️ Aileden bir kalp"
        body = custom_message if custom_message else f"{sender_name} size bir kalp gönderdi ❤️"

        tokens = [dt.token for dt in device_tokens if dt.token]
        if not tokens:
            return 0

        logger.info(f"PUSH_SEND_STARTED: Target tokens count: {len(tokens)}, Event ID: {event_id}")

        if not self.is_initialized:
            # Re-check in case credentials were added at runtime
            self._initialize_firebase()

        if not self.is_initialized:
            logger.info("FCM not configured yet (no firebase_service_account.json). Realtime/Local listeners will handle if app is open.")
            return len(tokens)

        # Vibration timings: [0, 500, 200, 500, 200, 500, 200, 500] in milliseconds
        # In FCM AndroidNotification: list of milliseconds as integers
        vibrate_pattern = [0, 500, 200, 500, 200, 500, 200, 500]

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                channel_id=HEART_CHANNEL_ID,
                sound="default",
                priority="max",
                visibility="public",
                default_vibrate_timings=False,
                vibrate_timings_millis=vibrate_pattern,
                tag=f"heart_{event_id}",
                click_action="OPEN_HEART"
            ),
            data={
                "type": "heart",
                "heart_id": event_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "family_id": family_id,
                "message": body
            }
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=title,
                body=body
            ),
            data={
                "type": "heart",
                "heart_id": event_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "family_id": family_id,
                "message": body
            },
            android=android_config
        )

        try:
            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM Multicast result: {response.success_count} success, {response.failure_count} failure")

            # Clean up invalid tokens
            if response.failure_count > 0:
                failed_indices = [idx for idx, resp in enumerate(response.responses) if not resp.success]
                failed_tokens = [tokens[idx] for idx in failed_indices]
                if failed_tokens:
                    logger.warning(f"Deactivating {len(failed_tokens)} stale FCM tokens.")
                    db.query(DeviceToken).filter(DeviceToken.token.in_(failed_tokens)).update(
                        {"is_active": False}, synchronize_session=False
                    )
                    db.commit()

            return response.success_count
        except Exception as e:
            logger.error(f"FCM send_each_for_multicast failed: {e}")
            return 0

push_service = PushNotificationService()
