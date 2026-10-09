import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

# Database URL pointing to sqlite
DB_FILE_PATH = os.getenv("DATABASE_PATH", "./olpai2026.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 60},
    # SQLite connections are inexpensive. A bounded QueuePool can deadlock
    # synchronous request dependencies waiting for threadpool cleanup.
    poolclass=NullPool,
)


@event.listens_for(engine, "connect")
def configure_sqlite(connection, _record):
    connection.execute("PRAGMA busy_timeout=60000")
    connection.execute("PRAGMA foreign_keys=ON")


# WAL lets readers continue while the API/worker commits a short write.
with engine.connect() as connection:
    connection.exec_driver_sql("PRAGMA journal_mode=WAL")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
