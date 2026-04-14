import africastalking
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def init_africastalking():
    africastalking.initialize(
        username = settings.AT_USERNAME,
        api_key  = settings.AT_API_KEY,
    )
    return africastalking.SMS

def send_sms(phone: str, message: str) -> bool:
    """
    Send SMS via Africa's Talking.
    Phone must be in +254XXXXXXXXX format.
    Returns True if sent, False if failed.
    Fails silently — SMS is never critical path.
    """
    try:
        if not phone.startswith("+"):
            if phone.startswith("254"):
                phone = f"+{phone}"
            elif phone.startswith("0"):
                phone = f"+254{phone[1:]}"

        sms = init_africastalking()
        response = sms.send(
            message    = message,
            recipients = [phone],
            sender_id  = settings.AT_SENDER_ID,
        )
        logger.info(f"SMS sent to {phone}: {response}")
        return True
    except Exception as e:
        logger.error(f"SMS failed to {phone}: {e}")
        return False