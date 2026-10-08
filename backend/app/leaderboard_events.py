"""Small persisted counters work across API processes and submission workers."""
import asyncio
import json
import time

from sqlalchemy.dialects.sqlite import insert

from .database import SessionLocal
from .models import LeaderboardRevision

POLL_SECONDS = 2
HEARTBEAT_SECONDS = 15


def bump_leaderboard_revision(db, split):
    # Called in finish_job's transaction: a notification cannot precede the score.
    statement = insert(LeaderboardRevision).values(split=split, version=1)
    db.execute(statement.on_conflict_do_update(
        index_elements=[LeaderboardRevision.split],
        set_={"version": LeaderboardRevision.version + 1},
    ))


def read_leaderboard_revision(split):
    # Never keep a SQLite transaction open during a long-lived HTTP connection.
    with SessionLocal() as db:
        row = db.get(LeaderboardRevision, split)
        return row.version if row else 0


def event_frame(name, version):
    return f"id: {version}\nevent: {name}\ndata: {json.dumps({'version': version})}\n\n"


async def leaderboard_event_stream(request, split):
    version = await asyncio.to_thread(read_leaderboard_revision, split)
    yield "retry: 2000\n" + event_frame("ready", version)
    last_sent = time.monotonic()
    while not await request.is_disconnected():
        await asyncio.sleep(POLL_SECONDS)
        if await request.is_disconnected():
            return
        current = await asyncio.to_thread(read_leaderboard_revision, split)
        if current != version:
            version = current
            yield event_frame("leaderboard-change", version)
            last_sent = time.monotonic()
        elif time.monotonic() - last_sent >= HEARTBEAT_SECONDS:
            yield ": heartbeat\n\n"
            last_sent = time.monotonic()
