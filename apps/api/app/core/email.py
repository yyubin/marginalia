import logging
import os

import resend
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "email")

_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
)


def _render(template_name: str, context: dict) -> str:
    return _jinja_env.get_template(template_name).render(**context)


async def send_email(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — skipping email to %s (subject: %s)", to, subject)
        return

    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info("Email sent to %s (subject: %s)", to, subject)
    except Exception:
        logger.exception("Failed to send email to %s", to)


async def send_verification_email(to: str, token: str, name: str | None = None) -> None:
    url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = _render("verify_email.html", {"name": name, "verification_url": url})
    await send_email(to, "Marginalia 이메일 인증", html)


async def send_welcome_email(to: str, name: str | None = None) -> None:
    html = _render("welcome.html", {"name": name, "app_url": settings.FRONTEND_URL})
    await send_email(to, "Marginalia에 오신 걸 환영합니다", html)


async def send_password_reset_email(to: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = _render("reset_password.html", {"reset_url": url})
    await send_email(to, "Marginalia 비밀번호 재설정", html)
