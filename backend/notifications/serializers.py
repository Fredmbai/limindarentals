from rest_framework import serializers
from .models import Notification, LandlordSettings

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Notification
        fields = ["id", "title", "message", "notification_type", "is_read", "created_at"]
        read_only_fields = ["id", "created_at"]

class LandlordSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LandlordSettings
        fields = [
            # M-Pesa global destination
            "mpesa_type", "paybill_number", "till_number", "mpesa_account",
            # Card
            "card_enabled",
            # Bank
            "bank_account_name", "bank_name", "bank_account", "bank_branch",
            # Rent rules
            "rent_due_day", "grace_period_days",
            "penalty_type", "penalty_value",
        ]