from __future__ import annotations

import re
from backend.app.services.ai.pii_redactor import PiiRedactor

# Khớp phần đuôi có thể là đầu của mã giả: K, KH, KH-, KH-\d{1,3}
TAIL_PATTERN = re.compile(r"(?:\b|(?<=\W))(K|KH|KH-|KH-\d{1,3})$")


class StreamRestorer:
    """Bộ đệm phục hồi PII khi stream:

    Giữ lại đuôi có thể là đầu của mã giả KH-xxx bị cắt vụn qua các mảnh stream,
    chỉ phát ra phần an toàn đã phục hồi tên thật.
    Bảo đảm: ghép mọi đầu ra == redactor.restore(toàn bộ chữ vào).
    """

    def __init__(self, redactor: PiiRedactor) -> None:
        self.redactor = redactor
        self.buffer = ""

    def _restore_text(self, text: str) -> str:
        return self.redactor.restore(text) if text else ""

    def feed(self, text: str) -> str:
        if not text:
            return ""
        self.buffer += text
        m = TAIL_PATTERN.search(self.buffer)
        if m:
            tail = m.group(1)
            safe_part = self.buffer[:-len(tail)]
            self.buffer = tail
        else:
            safe_part = self.buffer
            self.buffer = ""
        return self._restore_text(safe_part)

    def flush(self) -> str:
        rem = self.buffer
        self.buffer = ""
        return self._restore_text(rem)
