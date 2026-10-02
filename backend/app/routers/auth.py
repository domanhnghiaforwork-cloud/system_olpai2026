from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models import User
from ..schemas import UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

CURRENT_USER_ID: Optional[int] = None # None until user logs in

def get_current_user_id() -> Optional[int]:
    global CURRENT_USER_ID
    return CURRENT_USER_ID

class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/users", response_model=List[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.get("/me", response_model=Optional[UserResponse])
def get_current_user(db: Session = Depends(get_db)):
    global CURRENT_USER_ID
    if not CURRENT_USER_ID:
        return None
    user = db.query(User).filter(User.id == CURRENT_USER_ID).first()
    return user

@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    global CURRENT_USER_ID
    username_clean = request.username.strip()
    
    # Match by username or email
    user = db.query(User).filter(
        (User.username.ilike(username_clean)) | (User.email.ilike(username_clean))
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=400, 
            detail="Tài khoản hoặc email không tồn tại trên hệ thống."
        )
    
    # Check password
    if user.password and user.password != request.password.strip():
        raise HTTPException(
            status_code=400, 
            detail="Mật khẩu không chính xác. Vui lòng kiểm tra lại."
        )
        
    CURRENT_USER_ID = user.id
    return user

@router.post("/logout")
def logout():
    global CURRENT_USER_ID
    CURRENT_USER_ID = None
    return {"message": "Đã đăng xuất thành công"}

@router.post("/switch-user/{user_id}", response_model=UserResponse)
def switch_active_user(user_id: int, db: Session = Depends(get_db)):
    global CURRENT_USER_ID
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    CURRENT_USER_ID = user.id
    return user

