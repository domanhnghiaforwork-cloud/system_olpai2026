"""Keep one active PDF per problem, with transaction-safe file replacement."""
import logging
import re
import shutil
from pathlib import Path
from uuid import uuid4

from .database import SessionLocal
from .models import Problem
from .pdf_utils import resolve_problem_pdf
from .upload_cleanup import enqueue_upload_cleanup, cleanup_pending_uploads

logger = logging.getLogger(__name__)


def superseded_pdf_paths(db, problem, pdf_directory):
    root = Path(pdf_directory).resolve()
    paths = set()
    attached = resolve_problem_pdf(problem.pdf_filename)
    if attached:
        paths.add(root / attached)
    # Match legacy versions by the longest known code prefix. Codes can contain
    # underscores, and a shorter code must not claim another problem's PDFs.
    owners = {}
    for problem_id, code in db.query(Problem.id, Problem.code).all():
        for category in ("cv", "nlp"):
            prefix = f"de_thi_{code.lower()}_{category}"
            owners.setdefault(prefix, set()).add(problem_id)
    version_pattern = re.compile(rf"de_thi_{problem.id}_[0-9a-f]{{32}}\.pdf\Z")
    if root.is_dir():
        for path in root.iterdir():
            if not path.is_file() or path.is_symlink() or not path.name.lower().endswith('.pdf'):
                continue
            if version_pattern.fullmatch(path.name):
                paths.add(path)
                continue
            matching = [prefix for prefix in owners
                        if path.name == prefix + '.pdf' or path.name.startswith(prefix + '_')]
            if matching and owners[max(matching, key=len)] == {problem.id}:
                paths.add(path)
    return paths


def queue_superseded_pdfs(db, problem, pdf_directory, keep_path=None):
    for path in superseded_pdf_paths(db, problem, pdf_directory):
        if path != keep_path:
            enqueue_upload_cleanup(db, str(path), "problem_pdf")


def cleanup_problem_pdfs():
    try:
        # Wait for another request's cleaner, then drain committed PDF retirements.
        cleanup_pending_uploads(limit=None, wait=True, upload_kind="problem_pdf")
    except Exception:
        logger.exception("Problem PDF cleanup deferred")


def save_problem_pdf(db, problem, file, pdf_directory):
    """Caller holds the SQLite writer lock; old PDFs remain until commit."""
    root = Path(pdf_directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"de_thi_{problem.id}_{uuid4().hex}.pdf"
    try:
        # Exclusive, versioned names avoid overwriting active or shared files.
        with path.open("xb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        queue_superseded_pdfs(db, problem, pdf_directory, keep_path=path)
        problem.pdf_filename = path.name
        db.commit()
    except Exception:
        db.rollback()
        try:
            path.unlink(missing_ok=True)
        except OSError:
            # Retain cleanup even when a failed upload is temporarily locked.
            with SessionLocal() as cleanup_db:
                enqueue_upload_cleanup(cleanup_db, str(path), "problem_pdf")
                cleanup_db.commit()
        raise
    cleanup_problem_pdfs()
