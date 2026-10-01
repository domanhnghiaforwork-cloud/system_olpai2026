from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User
from ..schemas import UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory tracking of active demo user ID for simple switching in prototype mode
CURRENT_USER_ID = 2 # default to 'kma_cyber_ai' user

@router.get("/users", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/me", response_model=UserResponse)
def get_current_user(db: Session = Depends(get_db)):
    global CURRENT_USER_ID
    user = db.query(User).filter(User.id == CURRENT_USER_ID).first()
    if not user:
        user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user

@router.post("/switch-user/{user_id}", response_model=UserResponse)
def switch_active_user(user_id: int, db: Session = Depends(get_db)):
    global CURRENT_USER_ID
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    CURRENT_USER_ID = user.id
    return user
