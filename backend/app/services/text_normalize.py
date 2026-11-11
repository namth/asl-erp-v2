import re
import unicodedata

def normalize_text(text: str) -> str:
    """Chuẩn hoá chuỗi văn bản tiếng Việt để tìm kiếm và kiểm tra xung đột lợi ích.
    
    Quy tắc:
    - Thay thế chữ đ/Đ thành d
    - Bỏ toàn bộ dấu tiếng Việt (NFD decomposition)
    - Chuyển thành chữ thường
    - Bỏ các ký tự dấu câu / ký tự đặc biệt, giữ lại chữ cái, số và khoảng trắng
    - Gộp nhiều khoảng trắng liên tiếp thành một khoảng trắng và strip
    """
    if not text:
        return ""
    
    # 1. Chuyển đổi đ/Đ thành d
    s = text.replace("đ", "d").replace("Đ", "d")
    
    # 2. Phân rã ký tự tổ hợp Unicode và loại bỏ dấu thanh/dấu mũ (danh mục 'Mn')
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    
    # 3. Chữ thường
    s = s.lower()
    
    # 4. Loại bỏ dấu câu / ký tự đặc biệt (chỉ giữ ký tự từ [a-zA-Z0-9] và khoảng trắng)
    s = re.sub(r"[^\w\s]", " ", s)
    
    # 5. Gộp khoảng trắng liên tiếp và strip
    s = re.sub(r"\s+", " ", s).strip()
    return s

def normalize_identity_no(val: str) -> str:
    """Chuẩn hoá chuỗi số định danh cá nhân (CCCD/CMND/Hộ chiếu).
    
    Loại bỏ mọi khoảng trắng, dấu chấm, dấu gạch nối.
    """
    if not val:
        return ""
    return re.sub(r"[\s.-]", "", val.strip())

def mask_identity_no(val: str) -> str:
    """Che số định danh cá nhân, chỉ giữ lại 4 số cuối: ********1234."""
    if not val:
        return "********"
    clean = normalize_identity_no(val)
    if len(clean) >= 4:
        return "********" + clean[-4:]
    return "********"
