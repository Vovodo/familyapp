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

    async def send_verification_email(self, to: str, code: str) -> Dict[str, Any]:
        """
        Sends an elegant email verification code OTP.
        """
        subject = f"Ailem - Doğrulama Kodunuz: {code} ❤️"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ailem Doğrulama Kodu</title>
        </head>
        <body style="margin:0;padding:0;background-color:#FDF8F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:30px auto;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #FEE2E2;">
            <tr>
              <td style="padding:36px 32px 24px;text-align:center;background:linear-gradient(135deg, #E11D48 0%, #BE123C 100%);">
                <div style="font-size:40px;margin-bottom:8px;">❤️</div>
                <h1 style="color:#FFFFFF;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Ailem Uygulaması</h1>
                <p style="color:#FFE4E6;margin:6px 0 0;font-size:14px;">Ailenizle her an güvenle iletişimde kalın</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 28px;text-align:center;">
                <h2 style="color:#1F2937;margin:0 0 12px;font-size:18px;font-weight:700;">E-posta Doğrulama Kodunuz</h2>
                <p style="color:#4B5563;margin:0 0 24px;font-size:14px;line-height:1.5;">
                  Ailem uygulamasına kaydınızı tamamlamak için aşağıdaki 6 haneli doğrulama kodunu kullanın:
                </p>
                
                <div style="display:inline-block;background:#FFF1F2;border:2px dashed #E11D48;border-radius:16px;padding:16px 36px;margin-bottom:24px;">
                  <span style="font-family:Consolas,Monaco,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#BE123C;">{code}</span>
                </div>
                
                <p style="color:#9CA3AF;margin:0;font-size:12px;">
                  ⏳ Bu kod <strong>10 dakika</strong> boyunca geçerlidir. Eğer bu işlemi siz yapmadıysanız lütfen bu e-postayı dikkate almayın.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;text-align:center;">
                <p style="color:#9CA3AF;margin:0;font-size:11px;">
                  © 2026 Ailem Mobile • Sıcak, Güvenli ve Samimi Aile Platformu
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """
        text_content = f"Ailem Uygulaması Doğrulama Kodunuz: {code} (10 dakika geçerlidir)."
        return await self.send_email(to=to, subject=subject, html_content=html_content, text_content=text_content)

    async def send_password_reset_email(self, to: str, code: str) -> Dict[str, Any]:
        """
        Sends an OTP code for password recovery.
        """
        subject = f"Ailem - Şifre Sıfırlama Kodunuz: {code} 🔑"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ailem Şifre Sıfırlama</title>
        </head>
        <body style="margin:0;padding:0;background-color:#FDF8F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:30px auto;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #E0E7FF;">
            <tr>
              <td style="padding:36px 32px 24px;text-align:center;background:linear-gradient(135deg, #4F46E5 0%, #3730A3 100%);">
                <div style="font-size:40px;margin-bottom:8px;">🔑</div>
                <h1 style="color:#FFFFFF;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Şifre Kurtarma</h1>
                <p style="color:#E0E7FF;margin:6px 0 0;font-size:14px;">Ailem Hesabınız İçin Şifre Yenileme</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 28px;text-align:center;">
                <h2 style="color:#1F2937;margin:0 0 12px;font-size:18px;font-weight:700;">Kurtarma Kodunuz</h2>
                <p style="color:#4B5563;margin:0 0 24px;font-size:14px;line-height:1.5;">
                  Şifrenizi güvenle yenilemek için aşağıdaki 6 haneli kurtarma kodunu uygulamaya girin:
                </p>
                
                <div style="display:inline-block;background:#EEF2FF;border:2px dashed #4F46E5;border-radius:16px;padding:16px 36px;margin-bottom:24px;">
                  <span style="font-family:Consolas,Monaco,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#3730A3;">{code}</span>
                </div>
                
                <p style="color:#9CA3AF;margin:0;font-size:12px;">
                  ⏳ Bu kod <strong>10 dakika</strong> geçerlidir. Şifre sıfırlama talebinde bulunmadıysanız bu e-postayı görmezden gelebilirsiniz.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#F9FAFB;border-top:1px solid #F3F4F6;text-align:center;">
                <p style="color:#9CA3AF;margin:0;font-size:11px;">
                  © 2026 Ailem Mobile • Sıcak, Güvenli ve Samimi Aile Platformu
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """
        text_content = f"Ailem Şifre Sıfırlama Kodunuz: {code} (10 dakika geçerlidir)."
        return await self.send_email(to=to, subject=subject, html_content=html_content, text_content=text_content)


email_service = EmailService()

