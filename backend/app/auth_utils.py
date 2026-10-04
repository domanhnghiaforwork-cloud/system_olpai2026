import os
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY", 
    "olpai2026-kma-secret-key-security-hardening-2026-production-jwt"
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "48"))

security_scheme = HTTPBearer(auto_error=False)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Tạo JWT access token có hạn dùng."""
    to_encode = data.copy()
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        expire = now_utc + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire, "iat": now_utc})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Giải mã và xác thực chữ ký JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None


def get_password_hash(password: str) -> str:
    """Băm mật khẩu an toàn sử dụng PBKDF2-HMAC-SHA256 chuẩn tiêu chuẩn."""
    salt = secrets.token_hex(16)
    iterations = 100_000
    derived_key = hashlib.pbkdf2_hmac(
        "sha256", 
        password.encode("utf-8"), 
        salt.encode("utf-8"), 
        iterations
    )
    return f"pbkdf2:sha256:{iterations}${salt}${derived_key.hex()}"


def verify_password(plain_password: str, hashed_or_stored_password: str) -> bool:
    """
    Kiểm tra mật khẩu, hỗ trợ cả mật khẩu băm PBKDF2 và mật khẩu cũ (plaintext)
    nhằm đảm bảo không làm gián đoạn tài khoản của người dùng hiện có.
    """
    if not hashed_or_stored_password or not plain_password:
        return False

    clean_plain = plain_password.strip()
    stored = hashed_or_stored_password.strip()

    if stored.startswith("pbkdf2:sha256:"):
        try:
            parts = stored.split("$")
            meta = parts[0].split(":")
            iterations = int(meta[2])
            salt = parts[1]
            expected_hex = parts[2]

            derived = hashlib.pbkdf2_hmac(
                "sha256",
                clean_plain.encode("utf-8"),
                salt.encode("utf-8"),
                iterations
            )
            return hmac.compare_digest(derived.hex(), expected_hex)
        except Exception:
            return False

    # So sánh an toàn tránh Timing Attack cho các tài khoản đang lưu chuỗi thường
    return hmac.compare_digest(clean_plain.encode("utf-8"), stored.encode("utf-8"))


from fastapi import Depends, HTTPException, Query, status

def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Lấy thông tin người dùng từ Header Authorization Bearer token hoặc Query param ?token=...
    Nếu không có token hoặc token không hợp lệ, trả về None thay vì quăng lỗi ngay.
    """
    raw_token = None
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
    elif token_query:
        raw_token = token_query.strip()

    if not raw_token:
        return None

    payload = decode_access_token(raw_token)
    if not payload:
        return None

    user_id_raw = payload.get("sub")
    if not user_id_raw:
        return None

    try:
        user_id = int(user_id_raw)
    except (ValueError, TypeError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    return user



def get_current_user(
    user: Optional[User] = Depends(get_current_user_optional)
) -> User:
    """Yêu cầu người dùng phải đăng nhập hợp lệ với JWT token."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(
    user: User = Depends(get_current_user)
) -> User:
    """Yêu cầu người dùng phải là Quản trị viên (Admin)."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện thao tác này. Chức năng chỉ dành cho Quản trị viên."
        )
    return user
