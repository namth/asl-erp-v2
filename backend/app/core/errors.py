from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        self.headers = headers

async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    content = {
        "success": False,
        "error": {
          "code": exc.code,
          "message": exc.message,
          "details": exc.details
        }
    }
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=exc.headers
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = []
    for err in exc.errors():
        loc = err.get("loc", [])
        field_name = ".".join(str(x) for x in loc if x != "body")
        fields.append({
            "field": field_name or "body",
            "message": err.get("msg", "Dữ liệu không hợp lệ")
        })
    content = {
        "success": False,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Dữ liệu đầu vào không hợp lệ",
            "details": {
                "fields": fields
            }
        }
    }
    return JSONResponse(status_code=422, content=content)

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Map common status codes to error codes
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        422: "VALIDATION_ERROR",
        423: "ACCOUNT_LOCKED",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR"
    }
    code = code_map.get(exc.status_code, "ERROR")
    message = str(exc.detail) if exc.detail else "Đã xảy ra lỗi"
    content = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": {}
        }
    }
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)
