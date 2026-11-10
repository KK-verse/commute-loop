from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

_is_sqlite = config.DATABASE_URL.startswith("sqlite")
engine = create_engine(
    config.DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _):  # enforce foreign keys in dev SQLite
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables. On PostgreSQL also enable PostGIS and add geography columns + GiST indexes."""
    from . import models  # noqa: F401  (register models)
    if not _is_sqlite:
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
    Base.metadata.create_all(engine)
    if not _is_sqlite:
        sql_path = config.BASE_DIR.parent / "db" / "postgis_extras.sql"
        if sql_path.exists():
            with engine.begin() as conn:
                conn.exec_driver_sql(sql_path.read_text())
