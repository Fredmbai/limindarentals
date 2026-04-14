from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
import io
from django.core.files.base import ContentFile
from django.utils import timezone

# ── Brand palette ──────────────────────────────────────
NR_GREEN   = colors.HexColor("#0F6E56")
NR_GREEN2  = colors.HexColor("#085041")
NR_MINT    = colors.HexColor("#E1F5EE")
NR_MINT2   = colors.HexColor("#C3EAD8")
NR_GRAY    = colors.HexColor("#6B6B6B")
NR_LGRAY   = colors.HexColor("#F4F4F2")
NR_BORDER  = colors.HexColor("#D8D8D5")
NR_BLACK   = colors.HexColor("#1C1C1A")
WHITE      = colors.white

PAGE_W, PAGE_H = A4          # 595.27 x 841.89 pt
INNER_W        = PAGE_W - 4 * cm   # usable width


def _p(text, size=9, color=NR_BLACK, font="Helvetica", align=TA_LEFT, leading=None):
    return Paragraph(text, ParagraphStyle(
        "s", fontSize=size, textColor=color, fontName=font,
        alignment=align, leading=leading or size * 1.35,
    ))


def _bold(text, size=9, color=NR_BLACK, align=TA_LEFT):
    return _p(text, size, color, "Helvetica-Bold", align)


def generate_receipt_pdf(receipt) -> ContentFile:
    payment  = receipt.payment
    tenancy  = payment.tenancy
    tenant   = tenancy.tenant
    landlord = tenancy.landlord
    unit     = tenancy.unit
    prop     = unit.property

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=0,
        bottomMargin=2 * cm,
    )

    elements = []

    # ══════════════════════════════════════════
    # 1. HEADER BAND — full green bar
    # ══════════════════════════════════════════
    header = Table(
        [[
            _p("<b>LumindaRentals</b>", 20, WHITE, "Helvetica-Bold"),
            _p("OFFICIAL RECEIPT", 11, NR_MINT, "Helvetica-Bold", TA_RIGHT),
        ]],
        colWidths=[INNER_W * 0.6, INNER_W * 0.4],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NR_GREEN),
        ("TOPPADDING",    (0, 0), (-1, -1), 22),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 22),
        ("LEFTPADDING",   (0, 0), (0, 0),   20),
        ("RIGHTPADDING",  (-1, 0), (-1, 0), 20),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(header)

    # Thin accent line under header
    elements.append(Table(
        [[""]],
        colWidths=[INNER_W],
        rowHeights=[4],
    ))
    elements[-1].setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NR_GREEN2)]))

    elements.append(Spacer(1, 0.5 * cm))

    # ══════════════════════════════════════════
    # 2. RECEIPT META — receipt # and date side by side
    # ══════════════════════════════════════════
    gen_date = timezone.now().strftime("%d %B %Y  %H:%M")
    meta = Table(
        [[
            _bold(f"Receipt No:  {receipt.receipt_number}", 10, NR_GREEN),
            _p(f"Issued: {gen_date}", 9, NR_GRAY, align=TA_RIGHT),
        ]],
        colWidths=[INNER_W * 0.55, INNER_W * 0.45],
    )
    meta.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), NR_MINT),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (0, 0),  14),
        ("RIGHTPADDING",  (-1, 0), (-1, 0), 14),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6]),
    ]))
    elements.append(meta)
    elements.append(Spacer(1, 0.6 * cm))

    # ══════════════════════════════════════════
    # 3. AMOUNT HERO
    # ══════════════════════════════════════════
    type_labels = {
        "initial":  "Initial Payment (Deposit + Prorated Rent)",
        "monthly":  "Monthly Rent",
        "1_day":    "1-Day Rent",
        "1_week":   "1-Week Rent",
        "3_months": "3-Month Advance",
        "6_months": "6-Month Advance",
        "balance":  "Balance Payment",
    }
    amount_label = type_labels.get(payment.payment_type, payment.payment_type.replace("_", " ").title())
    amount_kes   = f"KES {int(float(payment.amount_paid)):,}"
    method_map   = {"mpesa": "M-Pesa", "card": "Card (Paystack)", "bank": "Bank Transfer"}
    method_str   = method_map.get(payment.method, payment.method)

    hero = Table(
        [[
            _bold(amount_kes, 30, NR_GREEN, TA_CENTER),
        ],[
            _p(amount_label, 10, NR_GRAY, align=TA_CENTER),
        ],[
            _p(f"via  {method_str}  ·  Ref: {payment.transaction_id or receipt.receipt_number}", 8, NR_GRAY, align=TA_CENTER),
        ]],
        colWidths=[INNER_W],
    )
    hero.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), NR_LGRAY),
        ("TOPPADDING",    (0, 0), (-1, 0),  18),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
        ("TOPPADDING",    (0, 1), (-1, -1), 4),
        ("BOX",           (0, 0), (-1, -1), 1.5, NR_MINT2),
        ("ROUNDEDCORNERS", [8]),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
    ]))
    elements.append(KeepTogether(hero))
    elements.append(Spacer(1, 0.7 * cm))

    # ══════════════════════════════════════════
    # 4. DETAILS — two column card
    # ══════════════════════════════════════════
    paid_at    = payment.paid_at.strftime("%d %b %Y, %I:%M %p") if payment.paid_at else "—"
    period_str = "—"
    if payment.period_start and payment.period_end:
        period_str = (
            f"{payment.period_start.strftime('%d %b %Y')}"
            f"  →  "
            f"{payment.period_end.strftime('%d %b %Y')}"
        )

    nid = "—"
    try:
        nid = tenancy.agreement.tenant_id_number or "—"
    except Exception:
        pass

    def section_hdr(label):
        t = Table([[_bold(label, 8, NR_GREEN)]], colWidths=[INNER_W])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), NR_MINT),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ]))
        return t

    def detail_row(label, value, last=False):
        row = [
            _p(label, 8.5, NR_GRAY),
            _bold(str(value), 8.5, NR_BLACK, TA_RIGHT),
        ]
        style = [
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (0, 0),  12),
            ("RIGHTPADDING",  (-1, 0), (-1, 0), 12),
        ]
        if not last:
            style.append(("LINEBELOW", (0, 0), (-1, 0), 0.4, NR_BORDER))
        t = Table([row], colWidths=[INNER_W * 0.42, INNER_W * 0.58])
        t.setStyle(TableStyle(style))
        return t

    # Tenant section
    elements.append(section_hdr("TENANT"))
    elements.append(detail_row("Full name",    tenant.full_name if tenant else "—"))
    elements.append(detail_row("Phone",        tenant.phone if tenant else "—"))
    elements.append(detail_row("National ID",  nid, last=True))
    elements.append(Spacer(1, 4))

    # Property section
    elements.append(section_hdr("PROPERTY"))
    elements.append(detail_row("Property",   prop.name))
    elements.append(detail_row("Unit",       f"Unit {unit.unit_number}"))
    elements.append(detail_row("Type",       unit.unit_type.replace("_", " ").title()))
    elements.append(detail_row("Landlord",   landlord.full_name, last=True))
    elements.append(Spacer(1, 4))

    # Payment section
    balance_str  = f"KES {int(float(payment.balance)):,}" if float(payment.balance) > 0 else "Nil"
    platform_fee = float(payment.platform_fee) if hasattr(payment, "platform_fee") else 0
    total_charged = int(float(payment.amount_paid)) + int(platform_fee)
    elements.append(section_hdr("PAYMENT"))
    elements.append(detail_row("Rent amount",    f"KES {int(float(payment.amount_due)):,}"))
    if platform_fee > 0:
        elements.append(detail_row("Platform fee (0.3%)", f"KES {int(platform_fee):,}"))
        elements.append(detail_row("Total charged to tenant", f"KES {total_charged:,}"))
    elements.append(detail_row("Amount paid",   f"KES {int(float(payment.amount_paid)):,}"))
    elements.append(detail_row("Balance",       balance_str))
    elements.append(detail_row("Period covered", period_str))
    elements.append(detail_row("Payment date",  paid_at, last=True))
    elements.append(Spacer(1, 0.8 * cm))

    # ══════════════════════════════════════════
    # 5. FOOTER
    # ══════════════════════════════════════════
    elements.append(HRFlowable(width="100%", thickness=0.5, color=NR_BORDER))
    elements.append(Spacer(1, 0.25 * cm))

    footer = Table(
        [[
            _p("This receipt was generated automatically by LumindaRentals and is valid without a signature.", 7.5, NR_GRAY),
            _p("LumindaRentals · Kenya", 7.5, NR_GREEN, align=TA_RIGHT),
        ]],
        colWidths=[INNER_W * 0.65, INNER_W * 0.35],
    )
    footer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(footer)

    doc.build(elements)
    buffer.seek(0)
    return ContentFile(buffer.read(), name=f"{receipt.receipt_number}.pdf")
