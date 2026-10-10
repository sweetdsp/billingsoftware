"""Shared domain enums (single source of truth, mirrors the PRP shared contract).

Every enum is a ``str`` enum whose values are the lowercase strings stored in the
database (``VARCHAR`` + CHECK constraint, ``native_enum=False``) and sent over the API.
"""

import enum


class BillingFrequency(str, enum.Enum):
    """How often a billing plan generates a bill."""

    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class PlanStatus(str, enum.Enum):
    """Lifecycle state of a billing plan."""

    ACTIVE = "active"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class BillStatus(str, enum.Enum):
    """Lifecycle state of a bill / invoice."""

    DRAFT = "draft"
    SENT = "sent"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentMethod(str, enum.Enum):
    """How a payment was made."""

    ONLINE = "online"
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"
    OTHER = "other"


class PaymentProvider(str, enum.Enum):
    """Who recorded the payment (payment gateway or manual entry)."""

    DODO = "dodo"
    MANUAL = "manual"


class PaymentStatus(str, enum.Enum):
    """Outcome of a payment."""

    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"


class FilePurpose(str, enum.Enum):
    """Why a file was uploaded / stored."""

    LOGO = "logo"
    ATTACHMENT = "attachment"
    BILL_PDF = "bill_pdf"


class EmailTemplate(str, enum.Enum):
    """Transactional email templates."""

    VERIFY_EMAIL = "verify_email"
    RESET_PASSWORD = "reset_password"  # noqa: S105 - template name, not a secret
    WELCOME = "welcome"
    BILL_SENT = "bill_sent"
    REMINDER = "reminder"
    RECEIPT = "receipt"


class EmailStatus(str, enum.Enum):
    """Delivery state of an outgoing email."""

    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
