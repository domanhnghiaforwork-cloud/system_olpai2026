from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .seed_data import init_seed_data
from .routers import auth, problems, submissions, leaderboard, datasets, admin

from sqlalchemy import inspect, text

# Create tables
Base.metadata.create_all(bind=engine)

# Safe SQLite migrations
with engine.connect() as conn:
    # Older Docker volumes predate these model fields. Migrate before seed
    # queries select every Problem column; create_all does not alter tables.
    problem_columns = {column["name"] for column in inspect(conn).get_columns("problems")}
    if "category" not in problem_columns:
        conn.execute(text("ALTER TABLE problems ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'CV'"))
        conn.execute(text("UPDATE problems SET category = 'NLP' WHERE UPPER(code) LIKE 'NLP-%'"))
        conn.commit()
    if "pdf_filename" not in problem_columns:
        conn.execute(text("ALTER TABLE problems ADD COLUMN pdf_filename VARCHAR(255)"))
        conn.commit()

    for stmt in [
        "ALTER TABLE problems ADD COLUMN max_public_submissions INTEGER DEFAULT 5",
        "ALTER TABLE problems ADD COLUMN max_private_submissions INTEGER DEFAULT 2",
        "ALTER TABLE problems ADD COLUMN is_locked BOOLEAN DEFAULT 0",
        "ALTER TABLE problems ADD COLUMN unlock_at TIMESTAMP",
        "ALTER TABLE datasets ADD COLUMN is_locked BOOLEAN DEFAULT 0",
        "ALTER TABLE datasets ADD COLUMN unlock_at TIMESTAMP",
        "ALTER TABLE submissions ADD COLUMN submission_type VARCHAR(30) DEFAULT 'public'",
        "ALTER TABLE submissions ADD COLUMN logs VARCHAR(500)",
        "ALTER TABLE problems ADD COLUMN evaluation_config VARCHAR(100)",
        "ALTER TABLE submissions ADD COLUMN stored_path VARCHAR(300)",
        "ALTER TABLE users ADD COLUMN password VARCHAR(100) DEFAULT 'olpai2026@kma'"
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            pass

# Seed database on start
with SessionLocal() as db:
    init_seed_data(db)

import os

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
is_production = (ENVIRONMENT == "production")

app = FastAPI(
    title="OLP AI KMA 2026 API",
    description="Backend API phục vụ Hệ thống thi Olympic Trí tuệ Nhân tạo OLP AI KMA 2026",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(problems.router)
app.include_router(submissions.router)
app.include_router(leaderboard.router)
app.include_router(datasets.router)
app.include_router(admin.router)

@app.get("/")
def read_root():
    res = {
        "system": "OLP AI KMA 2026 Platform",
        "status": "Operational",
        "version": "1.0.0"
    }
    if not is_production:
        res["docs"] = "/docs"
    return res


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
