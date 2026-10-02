import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    role = Column(String(20), default="user") # "admin" or "user"
    team_name = Column(String(100), default="KMA AI Team")
    password = Column(String(100), nullable=True, default="olpai2026@kma")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")

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
    evaluation_config = Column(String(100), nullable=True) # e.g. "eval_1_cv_hico" or None
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    submissions = relationship("Submission", back_populates="problem", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="problem", cascade="all, delete-orphan")

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
