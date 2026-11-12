from __future__ import annotations

import re
from typing import Dict, List, Set


COMPANY_PREFIXES = (
    "công ty tnhh một thành viên ",
    "công ty tnhh 1 thành viên ",
    "công ty tnhh mtv ",
    "công ty tnhh ",
    "công ty cổ phần ",
    "công ty cp ",
    "doanh nghiệp tư nhân ",
    "dntn ",
    "tập đoàn ",
)

PROTECTED_PATTERN = re.compile(
    r"\bASL-\d{4}-[A-Za-z0-9]+-\d{4}\b|\b\d{1,2}/\d{1,2}/\d{4}\b|\bKH-\d{3}\b"
)
EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)
PHONE_PATTERN = re.compile(
    r"(?:\+84[\s.-]*|(?<!\w)0)(?:\d[\s.-]*){8,10}\b"
)
ID_TAX_PATTERN = re.compile(
    r"\b\d{10}-\d{3}\b|\b\d{9,13}\b"
)


class PiiRedactor:
    """Redacts PII (Client names, Tax codes, CCCD, Phones, Emails, Addresses) before LLM submission

    and restores real names upon generating user response.
    """

    def __init__(self) -> None:
        self._counter: int = 1
        self._name_to_code: Dict[str, str] = {}  # lower_case -> code
        self._code_to_name: Dict[str, str] = {}  # code -> original_primary_name
        self._patterns: List[str] = []           # all forms to match
        self._hidden_strings: Set[str] = set()

    def register_name(self, name: str | None) -> str:
        if not name or not name.strip():
            return ""

        clean_name = name.strip()
        lower_name = clean_name.lower()

        if lower_name in self._name_to_code:
            return self._name_to_code[lower_name]

        code = f"KH-{self._counter:03d}"
        self._counter += 1

        self._name_to_code[lower_name] = code
        self._code_to_name[code] = clean_name
        self._patterns.append(clean_name)

        # Also register shortened version without company prefixes pointing to same code
        for pfx in COMPANY_PREFIXES:
            if lower_name.startswith(pfx):
                short_name = clean_name[len(pfx):].strip()
                if len(short_name) >= 3 and short_name.lower() not in self._name_to_code:
                    self._name_to_code[short_name.lower()] = code
                    self._patterns.append(short_name)
                break

        return code

    def register_hidden(self, text: str | None) -> None:
        if not text:
            return
        clean = text.strip()
        if len(clean) >= 3:
            self._hidden_strings.add(clean)

    def get_real_name(self, code: str) -> str | None:
        return self._code_to_name.get(code)

    def redact(self, text: str | None) -> str:
        if not text:
            return ""

        result = str(text)

        # 1. Protect special invariant tokens (Case code, dates, existing KH codes)
        placeholders: Dict[str, str] = {}

        def _mask_protected(match: re.Match[str]) -> str:
            token = match.group(0)
            key = f"__PROT_{len(placeholders)}__"
            placeholders[key] = token
            return key

        result = PROTECTED_PATTERN.sub(_mask_protected, result)

        # 2. Replace registered names with their assigned KH-xxx code
        # Sort patterns by length descending to match longest substring first
        sorted_patterns = sorted(set(self._patterns), key=len, reverse=True)
        for pat in sorted_patterns:
            code = self._name_to_code[pat.lower()]
            # Case-insensitive replacement
            result = re.sub(re.escape(pat), code, result, flags=re.IGNORECASE)

        # 3. Replace custom hidden strings with [ẨN]
        sorted_hidden = sorted(self._hidden_strings, key=len, reverse=True)
        for h in sorted_hidden:
            result = re.sub(re.escape(h), "[ẨN]", result, flags=re.IGNORECASE)

        # 4. Regex replacements for standard PII patterns
        result = EMAIL_PATTERN.sub("[ẨN]", result)
        result = PHONE_PATTERN.sub("[ẨN]", result)
        result = ID_TAX_PATTERN.sub("[ẨN]", result)

        # 5. Restore protected tokens
        for key, orig in placeholders.items():
            result = result.replace(key, orig)

        return result

    def restore(self, text: str | None) -> str:
        if not text:
            return ""

        result = str(text)
        # Replace each KH-xxx with original name
        for code, orig_name in self._code_to_name.items():
            result = re.sub(rf"\b{re.escape(code)}\b", orig_name, result)
        return result
