from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.conf import settings as django_settings
from .models import Notification, PushSubscription
from .serializers import NotificationSerializer, LandlordSettingsSerializer
from .models import LandlordSettings
from accounts.permissions import IsLandlord


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/
    GET /api/notifications/?unread=true
    Returns logged-in user's notifications, newest first.
    """
    serializer_class   = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(
            user=self.request.user
        ).order_by("-created_at")[:50]   # latest 50 only

        unread = self.request.query_params.get("unread")
        if unread == "true":
            qs = Notification.objects.filter(
                user=self.request.user, is_read=False
            ).order_by("-created_at")
        return qs


class MarkNotificationReadView(APIView):
    """PATCH /api/notifications/:id/read/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notif = Notification.objects.get(id=pk, user=request.user)
            notif.mark_read()
            return Response({"detail": "Marked as read."})
        except Notification.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)


class MarkAllReadView(APIView):
    """PATCH /api/notifications/read-all/"""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({"detail": "All notifications marked as read."})


class UnreadCountView(APIView):
    """GET /api/notifications/unread-count/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"count": count})


class LandlordSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsLandlord]
    serializer_class   = LandlordSettingsSerializer

    def get_object(self):
        obj, _ = LandlordSettings.objects.get_or_create(
            landlord=self.request.user
        )
        return obj
    
class LandlordSendNotificationView(APIView):
    """
    POST /api/landlord/notify/
    Landlord sends manual notification to selected tenants/caretakers.
    """
    permission_classes = [IsLandlord]

    def post(self, request):
        from accounts.models import User
        from tenancies.models import Tenancy
        from .service import notify

        title        = (request.data.get("title")   or "").strip()
        message      = (request.data.get("message") or "").strip()
        property_id  = request.data.get("property_id")   # None = all properties
        tenant_ids   = request.data.get("tenant_ids", []) # [] = all in property
        send_sms     = bool(request.data.get("send_sms", False))

        if not title or not message:
            return Response(
                {"detail": "Title and message are required."},
                status=400,
            )

        # Build recipient list
        recipients = []

        if tenant_ids:
            # Specific tenants selected
            tenancies = Tenancy.objects.filter(
                id__in   = tenant_ids,
                landlord = request.user,
                status   = "active",
            ).select_related("tenant")
            recipients = [t.tenant for t in tenancies if t.tenant is not None]

        elif property_id:
            # All tenants in a specific property
            tenancies = Tenancy.objects.filter(
                unit__property__id = property_id,
                landlord           = request.user,
                status             = "active",
            ).select_related("tenant")
            recipients = [t.tenant for t in tenancies if t.tenant is not None]

        else:
            # All tenants across all properties
            tenancies = Tenancy.objects.filter(
                landlord = request.user,
                status   = "active",
            ).select_related("tenant")
            recipients = [t.tenant for t in tenancies if t.tenant is not None]

        if not recipients:
            return Response(
                {"detail": "No active tenants found for the selected scope."},
                status=400,
            )

        # Deduplicate (tenant in multiple units would appear twice)
        seen = set()
        unique_recipients = []
        for r in recipients:
            if r.id not in seen:
                seen.add(r.id)
                unique_recipients.append(r)

        # Send to all
        sent_count = 0
        for user in unique_recipients:
            try:
                notify(
                    user              = user,
                    title             = title,
                    message           = message,
                    notification_type = "general",
                    send_sms_flag     = send_sms,
                )
                sent_count += 1
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to notify {user.full_name}: {e}")

        return Response({
            "detail": f"Notification sent to {sent_count} tenant{sent_count != 1 and 's' or ''}.",
            "sent_to": [u.full_name for u in unique_recipients],
            "count":   sent_count,
        })


class PushSubscribeView(APIView):
    """
    POST /api/push/subscribe/   — save or update a push subscription for this device.
    DELETE /api/push/subscribe/ — remove the subscription (user unsubscribed or logged out).
    Also exposes GET /api/push/vapid-key/ to return the public VAPID key to the frontend.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the VAPID public key so the frontend can subscribe."""
        return Response({"vapid_public_key": django_settings.VAPID_PUBLIC_KEY})

    def post(self, request):
        endpoint = request.data.get("endpoint", "").strip()
        keys     = request.data.get("keys", {})
        p256dh   = keys.get("p256dh", "").strip()
        auth_key = keys.get("auth", "").strip()

        if not all([endpoint, p256dh, auth_key]):
            return Response({"detail": "Invalid subscription payload."}, status=400)

        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={"user": request.user, "p256dh": p256dh, "auth": auth_key},
        )
        return Response({"detail": "Subscribed."}, status=201)

    def delete(self, request):
        endpoint = request.data.get("endpoint", "").strip()
        if endpoint:
            PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({"detail": "Unsubscribed."}, status=204)