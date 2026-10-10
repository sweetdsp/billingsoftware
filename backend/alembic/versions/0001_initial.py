"""Initial schema: all 15 Bill Maker tables.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-10 00:00:00+00:00

Generated from ``app.models`` metadata (naming convention in ``app.database``) and reviewed.
Enums are stored as VARCHAR(32) with named CHECK constraints (``native_enum=False``).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create all tables, constraints and indexes in dependency order."""
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("oauth_provider", sa.String(length=32), nullable=True),
        sa.Column("oauth_sub", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint(
            "oauth_provider", "oauth_sub", name=op.f("uq_users_oauth_provider_oauth_sub")
        ),
    )
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "provider IN ('dodo', 'manual')", name=op.f("ck_webhook_events_provider")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_webhook_events")),
        sa.UniqueConstraint("event_id", name=op.f("uq_webhook_events_event_id")),
    )
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("billing_address", sa.Text(), nullable=True),
        sa.Column("tax_id", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_customers_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
    )
    op.create_index(op.f("ix_customers_user_id"), "customers", ["user_id"], unique=False)
    op.create_index(
        "ix_customers_user_id_is_active", "customers", ["user_id", "is_active"], unique=False
    )
    op.create_index(
        "ix_customers_user_id_lower_name",
        "customers",
        ["user_id", sa.literal_column("lower(name)")],
        unique=False,
    )
    op.create_index(
        "uq_customers_user_id_lower_email_active",
        "customers",
        ["user_id", sa.literal_column("lower(email)")],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_email_verification_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_verification_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_email_verification_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_email_verification_tokens_user_id"),
        "email_verification_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_password_reset_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_reset_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_password_reset_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_password_reset_tokens_user_id"), "password_reset_tokens", ["user_id"], unique=False
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"], unique=False)
    op.create_table(
        "uploaded_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=127), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose IN ('logo', 'attachment', 'bill_pdf')", name=op.f("ck_uploaded_files_purpose")
        ),
        sa.CheckConstraint(
            "size_bytes >= 0", name=op.f("ck_uploaded_files_size_bytes_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_uploaded_files_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_uploaded_files")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_uploaded_files_storage_key")),
    )
    op.create_index(op.f("ix_uploaded_files_user_id"), "uploaded_files", ["user_id"], unique=False)
    op.create_table(
        "billing_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("frequency", sa.String(length=32), nullable=False),
        sa.Column("interval_count", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("next_billing_date", sa.Date(), nullable=False),
        sa.Column("due_days", sa.Integer(), server_default=sa.text("7"), nullable=False),
        sa.Column(
            "tax_rate",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("auto_send", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')",
            name=op.f("ck_billing_plans_frequency"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'paused', 'cancelled')", name=op.f("ck_billing_plans_status")
        ),
        sa.CheckConstraint("due_days >= 0", name=op.f("ck_billing_plans_due_days_non_negative")),
        sa.CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name=op.f("ck_billing_plans_end_date_after_start_date"),
        ),
        sa.CheckConstraint(
            "interval_count >= 1", name=op.f("ck_billing_plans_interval_count_positive")
        ),
        sa.CheckConstraint(
            "tax_rate >= 0 AND tax_rate <= 100", name=op.f("ck_billing_plans_tax_rate_range")
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"], name=op.f("fk_billing_plans_customer_id_customers")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_billing_plans_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_billing_plans")),
    )
    op.create_index(
        op.f("ix_billing_plans_customer_id"), "billing_plans", ["customer_id"], unique=False
    )
    op.create_index(
        op.f("ix_billing_plans_next_billing_date"),
        "billing_plans",
        ["next_billing_date"],
        unique=False,
    )
    op.create_index(
        "ix_billing_plans_status_next_billing_date",
        "billing_plans",
        ["status", "next_billing_date"],
        unique=False,
    )
    op.create_index(op.f("ix_billing_plans_user_id"), "billing_plans", ["user_id"], unique=False)
    op.create_table(
        "business_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("business_name", sa.String(length=255), nullable=False),
        sa.Column("logo_file_id", sa.Integer(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("tax_id", sa.String(length=64), nullable=True),
        sa.Column("default_currency", sa.CHAR(length=3), server_default="USD", nullable=False),
        sa.Column("bill_number_prefix", sa.String(length=20), server_default="BM-", nullable=False),
        sa.Column("next_bill_number", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("default_due_days", sa.Integer(), server_default=sa.text("7"), nullable=False),
        sa.Column(
            "default_tax_rate",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "reminder_days_after_due",
            postgresql.ARRAY(sa.Integer()),
            server_default=sa.text("'{1,7,14}'"),
            nullable=False,
        ),
        sa.Column("footer_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "default_due_days >= 0", name=op.f("ck_business_profiles_default_due_days_non_negative")
        ),
        sa.CheckConstraint(
            "default_tax_rate >= 0 AND default_tax_rate <= 100",
            name=op.f("ck_business_profiles_default_tax_rate_range"),
        ),
        sa.CheckConstraint(
            "next_bill_number >= 1", name=op.f("ck_business_profiles_next_bill_number_positive")
        ),
        sa.ForeignKeyConstraint(
            ["logo_file_id"],
            ["uploaded_files.id"],
            name=op.f("fk_business_profiles_logo_file_id_uploaded_files"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_business_profiles_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_business_profiles_user_id")),
    )
    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=True),
        sa.Column("bill_number", sa.String(length=50), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "subtotal",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "tax_rate",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "tax_amount",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "total", sa.Numeric(precision=12, scale=2), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "amount_paid",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), server_default="draft", nullable=False),
        sa.Column("pdf_file_id", sa.Integer(), nullable=True),
        sa.Column("payment_link_url", sa.String(length=2048), nullable=True),
        sa.Column("dodo_checkout_id", sa.String(length=255), nullable=True),
        sa.Column("public_token", sa.String(length=64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')",
            name=op.f("ck_bills_status"),
        ),
        sa.CheckConstraint("amount_paid >= 0", name=op.f("ck_bills_amount_paid_non_negative")),
        sa.CheckConstraint("subtotal >= 0", name=op.f("ck_bills_subtotal_non_negative")),
        sa.CheckConstraint("tax_amount >= 0", name=op.f("ck_bills_tax_amount_non_negative")),
        sa.CheckConstraint(
            "tax_rate >= 0 AND tax_rate <= 100", name=op.f("ck_bills_tax_rate_range")
        ),
        sa.CheckConstraint("total >= 0", name=op.f("ck_bills_total_non_negative")),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["customers.id"], name=op.f("fk_bills_customer_id_customers")
        ),
        sa.ForeignKeyConstraint(
            ["pdf_file_id"],
            ["uploaded_files.id"],
            name=op.f("fk_bills_pdf_file_id_uploaded_files"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["billing_plans.id"],
            name=op.f("fk_bills_plan_id_billing_plans"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_bills_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bills")),
        sa.UniqueConstraint("plan_id", "period_start", name=op.f("uq_bills_plan_id_period_start")),
        sa.UniqueConstraint("public_token", name=op.f("uq_bills_public_token")),
        sa.UniqueConstraint("user_id", "bill_number", name=op.f("uq_bills_user_id_bill_number")),
    )
    op.create_index(op.f("ix_bills_customer_id"), "bills", ["customer_id"], unique=False)
    op.create_index(op.f("ix_bills_dodo_checkout_id"), "bills", ["dodo_checkout_id"], unique=False)
    op.create_index("ix_bills_status_due_date", "bills", ["status", "due_date"], unique=False)
    op.create_index(op.f("ix_bills_user_id"), "bills", ["user_id"], unique=False)
    op.create_index("ix_bills_user_id_status", "bills", ["user_id", "status"], unique=False)
    op.create_table(
        "plan_line_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column(
            "quantity",
            sa.Numeric(precision=10, scale=2),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_plan_line_items_quantity_positive")),
        sa.CheckConstraint(
            "unit_price >= 0", name=op.f("ck_plan_line_items_unit_price_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["billing_plans.id"],
            name=op.f("fk_plan_line_items_plan_id_billing_plans"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plan_line_items")),
    )
    op.create_index(
        op.f("ix_plan_line_items_plan_id"), "plan_line_items", ["plan_id"], unique=False
    )
    op.create_table(
        "bill_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("file_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["bill_id"],
            ["bills.id"],
            name=op.f("fk_bill_attachments_bill_id_bills"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["uploaded_files.id"],
            name=op.f("fk_bill_attachments_file_id_uploaded_files"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bill_attachments")),
        sa.UniqueConstraint("bill_id", "file_id", name=op.f("uq_bill_attachments_bill_id_file_id")),
    )
    op.create_index(
        op.f("ix_bill_attachments_bill_id"), "bill_attachments", ["bill_id"], unique=False
    )
    op.create_index(
        op.f("ix_bill_attachments_file_id"), "bill_attachments", ["file_id"], unique=False
    )
    op.create_table(
        "bill_line_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column(
            "quantity",
            sa.Numeric(precision=10, scale=2),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("unit_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_bill_line_items_amount_non_negative")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_bill_line_items_quantity_positive")),
        sa.CheckConstraint(
            "unit_price >= 0", name=op.f("ck_bill_line_items_unit_price_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["bill_id"],
            ["bills.id"],
            name=op.f("fk_bill_line_items_bill_id_bills"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bill_line_items")),
    )
    op.create_index(
        op.f("ix_bill_line_items_bill_id"), "bill_line_items", ["bill_id"], unique=False
    )
    op.create_table(
        "email_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=True),
        sa.Column("to_email", sa.String(length=255), nullable=False),
        sa.Column("template", sa.String(length=32), nullable=False),
        sa.Column("resend_message_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="queued", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'sent', 'failed')", name=op.f("ck_email_logs_status")
        ),
        sa.CheckConstraint(
            "template IN ('verify_email', 'reset_password', 'welcome', "
            "'bill_sent', 'reminder', 'receipt')",
            name=op.f("ck_email_logs_template"),
        ),
        sa.ForeignKeyConstraint(
            ["bill_id"], ["bills.id"], name=op.f("fk_email_logs_bill_id_bills"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_email_logs_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_logs")),
    )
    op.create_index(op.f("ix_email_logs_bill_id"), "email_logs", ["bill_id"], unique=False)
    op.create_index(op.f("ix_email_logs_user_id"), "email_logs", ["user_id"], unique=False)
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="succeeded", nullable=False),
        sa.Column(
            "paid_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "method IN ('online', 'cash', 'bank_transfer', 'cheque', 'other')",
            name=op.f("ck_payments_method"),
        ),
        sa.CheckConstraint("provider IN ('dodo', 'manual')", name=op.f("ck_payments_provider")),
        sa.CheckConstraint(
            "status IN ('succeeded', 'failed', 'refunded')", name=op.f("ck_payments_status")
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_payments_amount_positive")),
        sa.ForeignKeyConstraint(["bill_id"], ["bills.id"], name=op.f("fk_payments_bill_id_bills")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_payments_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("provider_payment_id", name=op.f("uq_payments_provider_payment_id")),
    )
    op.create_index(op.f("ix_payments_bill_id"), "payments", ["bill_id"], unique=False)
    op.create_index(op.f("ix_payments_user_id"), "payments", ["user_id"], unique=False)


def downgrade() -> None:
    """Drop everything created by ``upgrade`` in reverse dependency order."""
    op.drop_index(op.f("ix_payments_user_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_bill_id"), table_name="payments")
    op.drop_table("payments")
    op.drop_index(op.f("ix_email_logs_user_id"), table_name="email_logs")
    op.drop_index(op.f("ix_email_logs_bill_id"), table_name="email_logs")
    op.drop_table("email_logs")
    op.drop_index(op.f("ix_bill_line_items_bill_id"), table_name="bill_line_items")
    op.drop_table("bill_line_items")
    op.drop_index(op.f("ix_bill_attachments_file_id"), table_name="bill_attachments")
    op.drop_index(op.f("ix_bill_attachments_bill_id"), table_name="bill_attachments")
    op.drop_table("bill_attachments")
    op.drop_index(op.f("ix_plan_line_items_plan_id"), table_name="plan_line_items")
    op.drop_table("plan_line_items")
    op.drop_index("ix_bills_user_id_status", table_name="bills")
    op.drop_index(op.f("ix_bills_user_id"), table_name="bills")
    op.drop_index("ix_bills_status_due_date", table_name="bills")
    op.drop_index(op.f("ix_bills_dodo_checkout_id"), table_name="bills")
    op.drop_index(op.f("ix_bills_customer_id"), table_name="bills")
    op.drop_table("bills")
    op.drop_table("business_profiles")
    op.drop_index(op.f("ix_billing_plans_user_id"), table_name="billing_plans")
    op.drop_index("ix_billing_plans_status_next_billing_date", table_name="billing_plans")
    op.drop_index(op.f("ix_billing_plans_next_billing_date"), table_name="billing_plans")
    op.drop_index(op.f("ix_billing_plans_customer_id"), table_name="billing_plans")
    op.drop_table("billing_plans")
    op.drop_index(op.f("ix_uploaded_files_user_id"), table_name="uploaded_files")
    op.drop_table("uploaded_files")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_user_id"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index(
        op.f("ix_email_verification_tokens_user_id"), table_name="email_verification_tokens"
    )
    op.drop_table("email_verification_tokens")
    op.drop_index("uq_customers_user_id_lower_email_active", table_name="customers")
    op.drop_index("ix_customers_user_id_lower_name", table_name="customers")
    op.drop_index("ix_customers_user_id_is_active", table_name="customers")
    op.drop_index(op.f("ix_customers_user_id"), table_name="customers")
    op.drop_table("customers")
    op.drop_table("webhook_events")
    op.drop_table("users")
