import httpx
from typing import Optional, List, Dict, Any, Union
from backend.app.core.config import settings
from loguru import logger


class EmailService:
    def __init__(self):
        self.api_key = settings.RESEND_API_KEY
        self.from_email = settings.EMAIL_FROM
        self.api_url = "https://api.resend.com/emails"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.startswith("re_"))

    async def send_email(
        self,
        to: Union[str, List[str]],
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends an email using Resend API.
        """
        if not self.is_configured:
            logger.warning("Resend API key is not configured. Email skipped.")
            return {"status": "skipped", "detail": "Resend API key missing"}

        recipients = [to] if isinstance(to, str) else to

        payload = {
            "from": self.from_email,
            "to": recipients,
            "subject": subject,
            "html": html_content,
        }
        if text_content:
            payload["text"] = text_content

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(self.api_url, json=payload, headers=headers)
                if response.status_code in (200, 201):
                    logger.info(f"Email successfully sent to {recipients} via Resend")
                    return {"status": "success", "data": response.json()}
                else:
                    logger.error(f"Resend error ({response.status_code}): {response.text}")
                    return {"status": "error", "status_code": response.status_code, "detail": response.text}
            except Exception as e:
                logger.error(f"Failed to communicate with Resend API: {e}")
                return {"status": "error", "detail": str(e)}

    async def verify_connection(self) -> Dict[str, Any]:
        """
        Verifies if Resend API Key is valid by calling Resend API endpoint.
        """
        if not self.is_configured:
            return {"active": False, "status": "Deaktif", "detail": "RESEND_API_KEY eksik veya tanımsız"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                # Test with api-keys or domains endpoint
                res = await client.get("https://api.resend.com/api-keys", headers=headers)
                if res.status_code == 200:
                    return {"active": True, "status": "Aktif", "detail": "Resend API bağlantısı başarılı"}
                elif res.status_code == 401:
                    return {"active": False, "status": "Hatalı Anahtar", "detail": "Geçersiz RESEND_API_KEY"}
                else:
                    return {"active": True, "status": "Aktif", "detail": "Resend API anahtarı mevcut"}
            except Exception as e:
                return {"active": False, "status": "Hata", "detail": f"Bağlantı hatası: {str(e)}"}


email_service = EmailService()
