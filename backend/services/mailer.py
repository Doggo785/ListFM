"""The mails ListFM sends: a link to confirm an address, a link to reset a password. Nothing else."""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from config import get_settings

logger = logging.getLogger(__name__)


def _send(message: EmailMessage) -> None:
    settings = get_settings()
    with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


async def send_mail(to: str, subject: str, body: str) -> bool:
    """Plain text, no tracking. False when it could not leave: the caller still answers as if it did.

    Without SMTP the mail is printed, so a local setup can follow its links. Production never prints
    one: its links open an account.
    """
    settings = get_settings()
    if not settings.smtp_host:
        if settings.cookie_secure:
            logger.error("No SMTP configured: a mail to an account could not be sent")
            return False
        print(f"\n--- mail to {to}: {subject}\n{body}---\n", flush=True)
        return True
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        await asyncio.to_thread(_send, message)
    except (smtplib.SMTPException, OSError) as exc:
        # The class only: an SMTP error can quote the address or the server's reply.
        logger.error("Mail could not be sent: %s", type(exc).__name__)
        return False
    return True


def confirm_address_mail(link: str) -> tuple[str, str]:
    body = (
        "Welcome to ListFM.\n\n"
        f"Open this link to confirm your address and finish creating your account:\n{link}\n\n"
        "It works for 24 hours. If you didn't sign up, ignore this mail: the account is erased after 7 days.\n"
    )
    return "Confirm your email for ListFM", body


def reset_password_mail(link: str) -> tuple[str, str]:
    body = (
        "Someone asked to reset the password of your ListFM account.\n\n"
        f"Open this link to choose a new one:\n{link}\n\n"
        "It works for one hour, once. If it wasn't you, ignore this mail: your password stays as it is.\n"
    )
    return "Reset your ListFM password", body
