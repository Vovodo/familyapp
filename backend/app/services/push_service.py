import os
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict
from loguru import logger
from sqlalchemy.orm import Session
from backend.app.models.models import DeviceToken, Message, User, Family

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
    HAS_FIREBASE_ADMIN = True
except ImportError:
    HAS_FIREBASE_ADMIN = False

HEART_CHANNEL_ID = "family_heart_channel_v2"
GENERAL_CHANNEL_ID = "family_general_channel"
REMINDERS_CHANNEL_ID = "family_reminders_channel"
POKE_CHANNEL_ID = "family_poke_channel_v2"
TEA_CHANNEL_ID = "family_tea_channel_v2"
CAR_CHANNEL_ID = "family_car_channel_v2"
MEAL_CHANNEL_ID = "family_meal_channel_v2"

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
            self._initialize_firebase()

        if not self.is_initialized:
            logger.warning("FCM not configured! (FIREBASE_CREDENTIALS_JSON or firebase_service_account.json missing on server).")
            return len(tokens)

        vibrate_pattern = [0, 500, 200, 500, 200, 500, 200, 500]

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                channel_id=HEART_CHANNEL_ID,
                sound="heart",
                priority="max",
                visibility="public",
                color="#E11D48",
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
            logger.info(f"FCM Heart Multicast result: {response.success_count} success, {response.failure_count} failure")

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

    async def send_chat_push(
        self,
        db: Session,
        device_tokens: List[DeviceToken],
        sender_name: str,
        sender_id: str,
        family_id: str,
        message_id: str,
        content: Optional[str] = None,
        media_type: Optional[str] = None,
        sender_avatar: Optional[str] = None
    ) -> int:
        """
        Sends high-priority WhatsApp-like push notification for new chat messages with sender avatar.
        """
        if not device_tokens:
            return 0

        tokens = [dt.token for dt in device_tokens if dt.token]
        if not tokens:
            return 0

        if not self.is_initialized:
            self._initialize_firebase()

        if not self.is_initialized:
            logger.warning("FCM not configured! (FIREBASE_CREDENTIALS_JSON or firebase_service_account.json missing on server).")
            return len(tokens)

        # Build WhatsApp-style Stacked Multi-Message Preview (InboxStyle)
        family_name = "Aile Sohbeti"
        try:
            fam = db.query(Family).filter(Family.id == family_id).first()
            if fam and fam.name:
                family_name = fam.name

            cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
            recent_msgs = (
                db.query(Message, User)
                .outerjoin(User, Message.sender_id == User.id)
                .filter(Message.family_id == family_id, Message.created_at >= cutoff)
                .order_by(Message.created_at.desc())
                .limit(4)
                .all()
            )
            recent_msgs.reverse()

            if len(recent_msgs) > 1:
                lines = []
                for m, u in recent_msgs:
                    u_display = u.full_name.split()[0] if u and u.full_name else "Biri"
                    if m.content:
                        m_text = m.content
                    elif m.media_type and "audio" in m.media_type:
                        m_text = "🎤 Sesli Mesaj"
                    elif m.media_type and "image" in m.media_type:
                        m_text = "📷 Fotoğraf"
                    else:
                        m_text = "📎 Medya"
                    lines.append(f"{u_display}: {m_text}")
                body = "\n".join(lines)
                title = f"{family_name} ({len(lines)} mesaj)"
            else:
                title = sender_name
                if content:
                    body = content
                elif media_type and "audio" in media_type:
                    body = "🎤 Sesli Mesaj"
                elif media_type and "image" in media_type:
                    body = "📷 Fotoğraf"
                else:
                    body = "📎 Medya"
        except Exception as e:
            logger.warning(f"Error compiling stacked chat preview: {e}")
            title = sender_name
            body = content or "Yeni bir mesajınız var"

        # Validate avatar URL format
        valid_avatar = sender_avatar if sender_avatar and sender_avatar.startswith("http") else None

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                channel_id=GENERAL_CHANNEL_ID,
                sound="default",
                priority="high",
                visibility="public",
                color="#2563EB",
                image=valid_avatar,
                tag=f"chat_{family_id}"
            ),
            data={
                "type": "chat",
                "message_id": message_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "content": body
            }
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=title,
                body=body,
                image=valid_avatar
            ),
            data={
                "type": "chat",
                "message_id": message_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "content": body
            },
            android=android_config
        )

        try:
            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM Chat Multicast result: {response.success_count} success, {response.failure_count} failure")

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
            logger.error(f"FCM send_chat_push failed: {e}")
            return 0

    async def send_reminder_push(
        self,
        db: Session,
        device_tokens: List[DeviceToken],
        creator_name: str,
        family_id: str,
        reminder_id: str,
        title: str,
        description: Optional[str] = None
    ) -> int:
        """
        Sends VIP / High-Priority Alarm Push Notification for Reminders.
        """
        if not device_tokens:
            return 0

        tokens = [dt.token for dt in device_tokens if dt.token]
        if not tokens:
            return 0

        if not self.is_initialized:
            self._initialize_firebase()

        if not self.is_initialized:
            return len(tokens)

        notif_title = f"⏰ Hatırlatıcı: {title}"
        notif_body = description or f"{creator_name} tarafından planlanan hatırlatma zamanı geldi!"

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=notif_title,
                body=notif_body,
                channel_id=REMINDERS_CHANNEL_ID,
                sound="default",
                priority="max",
                visibility="public",
                color="#F59E0B",
                tag=f"reminder_{reminder_id}"
            ),
            data={
                "type": "reminder",
                "reminder_id": reminder_id,
                "title": title,
                "description": description or "",
                "family_id": family_id,
                "creator_name": creator_name
            }
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=notif_title,
                body=notif_body
            ),
            data={
                "type": "reminder",
                "reminder_id": reminder_id,
                "title": title,
                "description": description or "",
                "family_id": family_id,
                "creator_name": creator_name
            },
            android=android_config
        )

        try:
            response = messaging.send_each_for_multicast(message)
            return response.success_count
        except Exception as e:
            logger.error(f"FCM send_reminder_push failed: {e}")
            return 0

    async def send_poke_push(
        self,
        db: Session,
        device_tokens: List[DeviceToken],
        sender_name: str,
        sender_id: str,
        family_id: str,
        poke_id: str,
        sender_avatar: Optional[str] = None
    ) -> int:
        """
        Sends a visually-distinct 'poke' push notification.
        Uses orange color + rapid vibration pattern to stand out from chat messages.
        """
        if not device_tokens:
            return 0

        tokens = [dt.token for dt in device_tokens if dt.token]
        if not tokens:
            return 0

        if not self.is_initialized:
            self._initialize_firebase()
        if not self.is_initialized:
            return len(tokens)

        title = "👉 Dürtme!"
        body = f"{sender_name} sizi dürtüyor!"
        valid_avatar = sender_avatar if sender_avatar and sender_avatar.startswith("http") else None

        # Rapid triple vibration for poke — distinctly different from heart's long vibration
        poke_vibrate = [0, 150, 80, 150, 80, 150]

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                channel_id=POKE_CHANNEL_ID,
                sound="poke",
                priority="high",
                visibility="public",
                color="#FF6B2B",   # Orange — visually distinct from heart (red) and chat (blue)
                image=valid_avatar,
                default_vibrate_timings=False,
                vibrate_timings_millis=poke_vibrate,
                tag=f"poke_{family_id}",  # Each family has one grouped poke notification
                click_action="OPEN_CHAT"
            ),
            data={
                "type": "poke",
                "poke_id": poke_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "message": body
            }
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=title,
                body=body,
                image=valid_avatar
            ),
            data={
                "type": "poke",
                "poke_id": poke_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "message": body
            },
            android=android_config
        )

        try:
            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM Poke Multicast: {response.success_count} success, {response.failure_count} failure")
            if response.failure_count > 0:
                failed_indices = [idx for idx, resp in enumerate(response.responses) if not resp.success]
                failed_tokens = [tokens[idx] for idx in failed_indices]
                if failed_tokens:
                    db.query(DeviceToken).filter(DeviceToken.token.in_(failed_tokens)).update(
                        {"is_active": False}, synchronize_session=False
                    )
                    db.commit()
            return response.success_count
        except Exception as e:
            logger.error(f"FCM send_poke_push failed: {e}")
            return 0

    async def send_status_action_push(
        self,
        db: Session,
        device_tokens: List[DeviceToken],
        action_type: str,
        title: str,
        body: str,
        sender_name: str,
        sender_id: str,
        family_id: str,
        action_id: str,
        sender_avatar: Optional[str] = None
    ) -> int:
        """
        Sends specialized family status push (tea, coming_home, meal, heart) with unique color and tags.
        """
        if not device_tokens:
            return 0

        tokens = [dt.token for dt in device_tokens if dt.token]
        if not tokens:
            return 0

        if not self.is_initialized:
            self._initialize_firebase()
        if not self.is_initialized:
            return len(tokens)

        # Color, channel and sound customization based on action type
        color_map = {
            "tea": "#D97706",         # Amber/brown
            "coming_home": "#2563EB", # Vibrant blue/indigo
            "meal": "#059669",        # Emerald green
            "heart": "#E11D48"        # Rose red
        }
        channel_map = {
            "tea": TEA_CHANNEL_ID,
            "coming_home": CAR_CHANNEL_ID,
            "meal": MEAL_CHANNEL_ID,
            "heart": HEART_CHANNEL_ID,
        }
        sound_map = {
            "tea": "tea",
            "coming_home": "car_horn",
            "meal": "meal",
            "heart": "heart",
        }
        notif_color = color_map.get(action_type, "#4F46E5")
        target_channel = channel_map.get(action_type, GENERAL_CHANNEL_ID)
        target_sound = sound_map.get(action_type, "default")

        vibrate_pattern = [0, 200, 100, 200, 100, 200]
        valid_avatar = sender_avatar if sender_avatar and sender_avatar.startswith("http") else None

        android_config = messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                channel_id=target_channel,
                sound=target_sound,
                priority="high",
                visibility="public",
                color=notif_color,
                image=valid_avatar,
                default_vibrate_timings=False,
                vibrate_timings_millis=vibrate_pattern,
                tag=f"action_{action_type}_{family_id}",
                click_action="OPEN_HOME"
            ),
            data={
                "type": action_type,
                "action_id": action_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "message": body
            }
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=title,
                body=body,
                image=valid_avatar
            ),
            data={
                "type": action_type,
                "action_id": action_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "sender_avatar": valid_avatar or "",
                "family_id": family_id,
                "message": body
            },
            android=android_config
        )

        try:
            response = messaging.send_each_for_multicast(message)
            logger.info(f"FCM Status Action ({action_type}) Multicast: {response.success_count} success, {response.failure_count} failure")
            if response.failure_count > 0:
                failed_indices = [idx for idx, resp in enumerate(response.responses) if not resp.success]
                failed_tokens = [tokens[idx] for idx in failed_indices]
                if failed_tokens:
                    db.query(DeviceToken).filter(DeviceToken.token.in_(failed_tokens)).update(
                        {"is_active": False}, synchronize_session=False
                    )
                    db.commit()
            return response.success_count
        except Exception as e:
            logger.error(f"FCM send_status_action_push failed: {e}")
            return 0

push_service = PushNotificationService()
