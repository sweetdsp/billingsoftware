"""Database engine, session factory and declarative base (SQLAlchemy 2.0, sync)."""

from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Deterministic constraint / index names so Alembic migrations are reproducible.
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_engine(str(settings.DATABASE_URL), pool_pre_ping=True)

SessionLocal: sessionmaker[Session] = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a session that is always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
