"""Reject oversized bodies before FastAPI spools a multipart upload to disk."""
import os
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class SubmissionBodyLimit:
    def __init__(self, app):
        self.app = app
        self.maximum = int(os.getenv("SUBMISSION_MAX_FILE_BYTES", str(95 * 1024**2))) + 1024**2
        self.notebook_maximum = 21 * 1024**2

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"].rstrip("/") not in (
            "/api/submissions", "/api/training-notebooks"
        ):
            return await self.app(scope, receive, send)
        maximum = self.notebook_maximum if scope["path"].rstrip("/") == "/api/training-notebooks" else self.maximum
        headers = dict(scope.get("headers", []))
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Content-Length không hợp lệ."}, status_code=400)(scope, receive, send)
        if length > maximum:
            return await JSONResponse({"detail": "Dữ liệu tải lên vượt giới hạn cho phép."}, status_code=413)(scope, receive, send)
        consumed = 0

        async def limited_receive():
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > maximum:
                    raise HTTPException(413, "Dữ liệu tải lên vượt giới hạn cho phép.")
            return message

        return await self.app(scope, limited_receive, send)
