"""Dịch vụ mã hoá envelope và lưu trữ tệp trên NAS cho ASL LAW ERP.

Tuân thủ docs/10-env-and-security.md mục "LƯU TRỮ VĂN BẢN & MÃ HÓA (NAS)" và brief TASK-045:
- Mỗi phiên bản sinh khoá DEK 32 bytes ngẫu nhiên (AES-256-GCM).
- Tệp được mã hoá bằng DEK.
- DEK được bọc bằng FILE_ENCRYPTION_MASTER_KEY (AES-256-GCM).
- Định dạng nhị phân: b"ASLV1" + nonce_bọc(12) + DEK_bọc(48) + nonce(12) + bản_mã.
- Không bao giờ ghi bản rõ ra đĩa (kể cả tệp tạm).
"""
from __future__ import annotations

import base64
import os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.app.core.config import settings
from backend.app.core.errors import AppException

MAGIC_HEADER = b"ASLV1"
MAGIC_LEN = len(MAGIC_HEADER)
NONCE_LEN = 12
DEK_LEN = 32
WRAPPED_DEK_LEN = 48  # 32 bytes DEK + 16 bytes GCM tag
HEADER_LEN = MAGIC_LEN + NONCE_LEN + WRAPPED_DEK_LEN + NONCE_LEN  # 77 bytes


def get_master_key() -> bytes:
    """Lấy khoá chủ mã hoá tệp từ settings (đọc lúc gọi)."""
    key_b64 = settings.FILE_ENCRYPTION_MASTER_KEY
    if not key_b64:
        raise ValueError("FILE_ENCRYPTION_MASTER_KEY chưa được cấu hình")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise ValueError(f"FILE_ENCRYPTION_MASTER_KEY phải là 32 bytes (AES-256), nhận {len(key)} bytes")
    return key


def encrypt_file_envelope(plaintext: bytes) -> bytes:
    """Mã hoá dữ liệu theo mô hình phong bì (envelope encryption)."""
    master_key = get_master_key()
    dek = os.urandom(DEK_LEN)

    # 1. Bọc DEK bằng master key
    nonce_wrap = os.urandom(NONCE_LEN)
    wrapped_dek = AESGCM(master_key).encrypt(nonce_wrap, dek, None)
    if len(wrapped_dek) != WRAPPED_DEK_LEN:
        raise ValueError(f"Kích thước bọc DEK không đúng: {len(wrapped_dek)} bytes")

    # 2. Mã hoá tệp bằng DEK
    nonce_data = os.urandom(NONCE_LEN)
    ciphertext = AESGCM(dek).encrypt(nonce_data, plaintext, None)

    # 3. Ghép phong bì nhị phân
    return MAGIC_HEADER + nonce_wrap + wrapped_dek + nonce_data + ciphertext


def decrypt_file_envelope(payload: bytes) -> bytes:
    """Giải mã dữ liệu từ phong bì nhị phân."""
    if len(payload) < HEADER_LEN:
        raise ValueError(f"Dữ liệu tệp không hợp lệ: độ dài tối thiểu {HEADER_LEN} bytes")

    if not payload.startswith(MAGIC_HEADER):
        raise ValueError("Định dạng tệp mã hoá không hợp lệ (sai magic header)")

    offset = MAGIC_LEN
    nonce_wrap = payload[offset : offset + NONCE_LEN]
    offset += NONCE_LEN
    wrapped_dek = payload[offset : offset + WRAPPED_DEK_LEN]
    offset += WRAPPED_DEK_LEN
    nonce_data = payload[offset : offset + NONCE_LEN]
    offset += NONCE_LEN
    ciphertext = payload[offset:]

    # 1. Giải mã DEK từ master key
    master_key = get_master_key()
    dek = AESGCM(master_key).decrypt(nonce_wrap, wrapped_dek, None)

    # 2. Giải mã bản rõ từ ciphertext bằng DEK
    plaintext = AESGCM(dek).decrypt(nonce_data, ciphertext, None)
    return plaintext


def save_file_to_vault(case_id: str, document_id: str, version_id: str, plaintext: bytes) -> str:
    """Mã hoá bản rõ và lưu vào thư mục NAS, trả về đường dẫn tương đối (storage_path)."""
    relative_path = f"{case_id}/{document_id}/{version_id}.bin"
    mount_path = Path(settings.NAS_STORAGE_MOUNT_PATH)
    target_file = mount_path / relative_path

    target_file.parent.mkdir(parents=True, exist_ok=True)
    encrypted_bytes = encrypt_file_envelope(plaintext)
    target_file.write_bytes(encrypted_bytes)

    return relative_path


def read_file_from_vault(storage_path: str) -> bytes:
    """Đọc tệp mã hoá từ NAS và giải mã thành bản rõ trong bộ nhớ."""
    mount_path = Path(settings.NAS_STORAGE_MOUNT_PATH)
    target_file = mount_path / storage_path

    if not target_file.is_file():
        raise AppException(404, "NOT_FOUND", "Không tìm thấy tệp trên hệ thống lưu trữ")

    encrypted_bytes = target_file.read_bytes()
    return decrypt_file_envelope(encrypted_bytes)
