from django.contrib import admin
from .models import AutoPayment, Payment, PaymentMethod, Receipt, MpesaTransaction

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display    = ["tenancy", "payment_type", "method", "status", "amount_due", "amount_paid", "paid_at"]
    list_filter     = ["status", "method", "payment_type"]
    search_fields   = ["tenancy__tenant__full_name", "transaction_id"]
    readonly_fields = ["created_at", "updated_at", "paid_at"]

@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display  = ["receipt_number", "payment", "generated_at"]
    search_fields = ["receipt_number", "payment__tenancy__tenant__full_name"]

@admin.register(MpesaTransaction)
class MpesaTransactionAdmin(admin.ModelAdmin):
    list_display    = ["mpesa_receipt_number", "phone_number", "amount", "result_code", "created_at"]
    list_filter     = ["result_code"]
    readonly_fields = ["raw_response", "created_at"]


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display    = ["account_name", "landlord", "method_type", "account_number", "is_default", "is_active", "created_at"]
    list_filter     = ["method_type", "is_default", "is_active"]
    search_fields   = ["account_name", "account_number", "landlord__full_name", "landlord__phone"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(AutoPayment)
class AutoPaymentAdmin(admin.ModelAdmin):
    list_display    = ["tenant", "tenancy", "payment_method", "status", "due_day", "next_due_date", "last_triggered_at"]
    list_filter     = ["payment_method", "status"]
    search_fields   = ["tenant__email", "tenant__first_name", "tenant__last_name"]