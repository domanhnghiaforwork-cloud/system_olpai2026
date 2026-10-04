from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models import User
from ..schemas import UserResponse, LoginResponse
from ..auth_utils import (
    create_access_token,
    verify_password,
    get_current_user,
    get_current_user_optional,
    require_admin
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Chỉ Quản trị viên mới được phép xem danh sách người dùng đầy đủ."""
    return db.query(User).all()

@router.get("/me", response_model=Optional[UserResponse])
def get_current_user_info(
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Lấy thông tin tài khoản đang đăng nhập từ JWT Token."""
    return current_user

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    username_clean = request.username.strip()
    
    # Khớp theo username hoặc email
    user = db.query(User).filter(
        (User.username.ilike(username_clean)) | (User.email.ilike(username_clean))
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=400, 
            detail="Tài khoản hoặc email không tồn tại trên hệ thống."
        )
    
    # Kiểm tra mật khẩu an toàn
    if not verify_password(request.password, user.password or ""):
        raise HTTPException(
            status_code=400, 
            detail="Mật khẩu không chính xác. Vui lòng kiểm tra lại."
        )
        
    access_token = create_access_token(data={
        "sub": str(user.id),
        "username": user.username,
        "role": user.role
    })

    return LoginResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        team_name=user.team_name,
        created_at=user.created_at,
        access_token=access_token,
        token_type="bearer"
    )

@router.post("/logout")
def logout():
    return {"message": "Đã đăng xuất thành công"}

@router.post("/switch-user/{user_id}", response_model=LoginResponse)
def switch_active_user(
    user_id: int, 
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Chỉ Admin mới có quyền chuyển đổi tài khoản (dành cho mục đích kiểm thử)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    
    token = create_access_token(data={
        "sub": str(user.id),
        "username": user.username,
        "role": user.role
    })
    return LoginResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        team_name=user.team_name,
        created_at=user.created_at,
        access_token=token,
        token_type="bearer"
    )
