from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str
    full_name: str
    email: str
    role: str = "user"
    team_name: Optional[str] = "KMA AI Team"

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Problem Schemas
class ProblemBase(BaseModel):
    code: str
    title: str
    category: str = "CV" # "CV" or "NLP"
    short_description: Optional[str] = None
    description: Optional[str] = None
    pdf_filename: Optional[str] = None
    metric: str = "F1-Score"
    deadline: str = "2026-11-30 23:59:59"
    max_daily_submissions: int = 5
    max_public_submissions: int = 5
    max_private_submissions: int = 2
    is_locked: bool = False
    unlock_at: Optional[datetime] = None
    evaluation_config: Optional[str] = None

class ProblemCreate(ProblemBase):
    pass

class ProblemUpdate(BaseModel):
    code: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None # "CV" or "NLP"
    metric: Optional[str] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
    max_public_submissions: Optional[int] = None
    max_private_submissions: Optional[int] = None
    is_locked: Optional[bool] = None
    unlock_at: Optional[datetime] = None
    evaluation_config: Optional[str] = None

class EvaluatorInfo(BaseModel):
    id: str
    name: str
    description: str
    metric: str

class ProblemResponse(ProblemBase):
    id: int
    pdf_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Dataset Schemas
class DatasetBase(BaseModel):
    problem_id: Optional[int] = None
    title: str
    filename: Optional[str] = "link"
    size_str: Optional[str] = ""
    category: Optional[str] = "train"
    download_url: str = "#"
    description: Optional[str] = None
    is_locked: bool = False
    unlock_at: Optional[datetime] = None

class DatasetCreate(BaseModel):
    problem_id: int
    title: str
    download_url: str
    size_str: Optional[str] = ""
    category: Optional[str] = "train"
    description: Optional[str] = None
    filename: Optional[str] = "link"
    is_locked: Optional[bool] = False
    unlock_at: Optional[datetime] = None

class DatasetUpdate(BaseModel):
    title: Optional[str] = None
    download_url: Optional[str] = None
    size_str: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_locked: Optional[bool] = None
    unlock_at: Optional[datetime] = None

class DatasetResponse(DatasetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Submission Schemas
class SubmissionCreate(BaseModel):
    problem_id: int
    description: Optional[str] = ""

class SubmissionResponse(BaseModel):
    id: int
    user_id: int
    problem_id: int
    user_name: Optional[str] = None
    username: Optional[str] = None
    team_name: Optional[str] = None
    problem_title: Optional[str] = None
    problem_code: Optional[str] = None
    filename: str
    stored_path: Optional[str] = None
    file_exists: Optional[bool] = None
    file_size_str: Optional[str] = None
    submission_type: str = "public"
    status: str
    score: Optional[float] = None
    description: Optional[str] = None
    logs: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Leaderboard Item
class LeaderboardItem(BaseModel):
    rank: int
    user_id: int
    full_name: str
    team_name: str
    problem_code: str
    best_score: float
    total_submissions: int
    last_submission_time: datetime
    submission_type: Optional[str] = "public"
