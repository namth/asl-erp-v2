import base64
import os
from typing import Union
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from backend.app.core.config import settings

def get_master_key() -> bytes:
    key_b64 = settings.DATA_ENCRYPTION_MASTER_KEY
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise ValueError(f"DATA_ENCRYPTION_MASTER_KEY phải là 32 bytes (AES-256), nhận {len(key)} bytes")
    return key

def encrypt_aes_gcm(plaintext: str) -> bytes:
    """Mã hoá dữ liệu nhạy cảm bằng AES-256-GCM.
    
    Đầu ra: nonce (12 bytes) || ciphertext + auth tag (16 bytes).
    """
    key = get_master_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    data = plaintext.encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return nonce + ciphertext

def decrypt_aes_gcm(encrypted_data: Union[bytes, memoryview]) -> str:
    """Giải mã dữ liệu AES-256-GCM từ nonce (12 bytes) || ciphertext + tag."""
    raw_bytes = bytes(encrypted_data)
    if len(raw_bytes) < 28:
        raise ValueError("Dữ liệu mã hoá AES-GCM không đủ độ dài tối thiểu 28 bytes (12 bytes nonce + 16 bytes tag)")
    key = get_master_key()
    aesgcm = AESGCM(key)
    nonce = raw_bytes[:12]
    ciphertext = raw_bytes[12:]
    decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted_bytes.decode("utf-8")
