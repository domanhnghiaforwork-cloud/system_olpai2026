import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(320), unique=True, index=True, nullable=False)
    role = Column(String(20), default="user") # "admin" or "user"
    team_name = Column(String(100), default="KMA AI Team")
    password = Column(String(255), nullable=True, default="olpai2026@kma")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")
    chatbot_provision_jobs = relationship("ChatbotProvisionJob", cascade="all, delete-orphan")
    training_notebooks = relationship("TrainingNotebook", back_populates="user", cascade="all, delete-orphan")


class LeaderboardRevision(Base):
    """Shared notification counter, committed atomically with a scored submission."""
    __tablename__ = "leaderboard_revisions"

    split = Column(String(10), primary_key=True)
    version = Column(Integer, nullable=False, default=0)


class ChatbotProvisionJob(Base):
    """Committed with a new account; retained until chatbot acknowledges it."""
    __tablename__ = "chatbot_provision_jobs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    email = Column(String(320), nullable=False)
    role = Column(String(20), nullable=False)
    password_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    next_attempt_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    last_error = Column(String(50), nullable=True)

class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    category = Column(String(20), default="CV", nullable=False) # Only "CV" or "NLP"
    short_description = Column(String(300), nullable=True)
    description = Column(Text, nullable=True) # Optional extra notes
    pdf_filename = Column(String(255), nullable=True)
    metric = Column(String(50), default="F1-Score")
    deadline = Column(String(50), default="2026-11-30 23:59:59")
    max_daily_submissions = Column(Integer, default=5)
    max_public_submissions = Column(Integer, default=5)
    max_private_submissions = Column(Integer, default=2)
    is_locked = Column(Boolean, default=False)
    unlock_at = Column(DateTime, nullable=True)
    public_is_locked = Column(Boolean, default=False)
    public_unlock_at = Column(DateTime, nullable=True)
    private_is_locked = Column(Boolean, default=False)
    private_unlock_at = Column(DateTime, nullable=True)
    evaluation_config = Column(String(100), nullable=True) # e.g. "eval_1_cv_hico" or None
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    submissions = relationship("Submission", back_populates="problem", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="problem", cascade="all, delete-orphan")
    training_notebooks = relationship("TrainingNotebook", back_populates="problem", cascade="all, delete-orphan")

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(200), nullable=False)
    filename = Column(String(100), nullable=False)
    size_str = Column(String(50), default="12.5 MB")
    category = Column(String(50), default="train") # "train", "test", "sample"
    download_url = Column(String(300), default="#")
    description = Column(String(500), nullable=True)
    is_locked = Column(Boolean, default=False)
    unlock_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    problem = relationship("Problem", back_populates="datasets")

class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_quota", "user_id", "problem_id", "submission_type", "status"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(200), nullable=False)
    stored_path = Column(String(300), nullable=True)
    submission_type = Column(String(30), default="public") # "public" or "private"
    status = Column(String(30), default="SUCCESS") # SUCCESS, INVALID_FORMAT, FAILED
    score = Column(Float, nullable=True)
    description = Column(String(255), nullable=True)
    logs = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")
    job = relationship("SubmissionJob", back_populates="submission", uselist=False, cascade="all, delete-orphan")


class TrainingNotebook(Base):
    """One immutable training notebook per student/problem/public-private split."""
    __tablename__ = "training_notebooks"
    __table_args__ = (UniqueConstraint("user_id", "problem_id", "submission_type",
                                      name="uq_training_notebook_student_problem_split"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_type = Column(String(10), nullable=False)
    filename = Column(String(255), nullable=False)
    stored_path = Column(Text, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    user = relationship("User", back_populates="training_notebooks")
    problem = relationship("Problem", back_populates="training_notebooks")


class SubmissionJob(Base):
    """Durable queue entry committed with the reserved submission attempt."""
    __tablename__ = "submission_jobs"
    __table_args__ = (
        UniqueConstraint("user_id", "client_request_id", name="uq_submission_job_client"),
        Index("ix_submission_jobs_claim", "state", "lease_until", "id"),
    )

    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("submissions.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_request_id = Column(String(36), nullable=False)
    payload_sha256 = Column(String(64), nullable=False)
    original_filename = Column(String(255), nullable=False)
    evaluation_config = Column(String(100), nullable=False)
    state = Column(String(20), default="QUEUED", nullable=False)
    claim_token = Column(String(36), nullable=True)
    lease_until = Column(DateTime, nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    result_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    submission = relationship("Submission", back_populates="job", lazy="joined")
