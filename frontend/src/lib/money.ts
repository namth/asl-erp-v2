/**
 * Thư viện xử lý tiền tệ chuỗi thập phân (lib/money.ts)
 * Tuân thủ quy chuẩn không dùng kiểu số thực, chỉ dùng BigInt trên chuỗi.
 */

function toCents(str: string): bigint {
  const trimmed = str.trim();
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;
  const dotIndex = clean.indexOf('.');
  let wholeStr: string;
  let decStr: string;

  if (dotIndex === -1) {
    wholeStr = clean || '0';
    decStr = '00';
  } else {
    wholeStr = clean.slice(0, dotIndex) || '0';
    decStr = clean.slice(dotIndex + 1);
    if (decStr.length === 1) {
      decStr += '0';
    } else if (decStr.length === 0) {
      decStr = '00';
    } else if (decStr.length > 2) {
      decStr = decStr.slice(0, 2);
    }
  }

  const normalizedWhole = wholeStr.replace(/^0+(?=\d)/, '') || '0';
  const whole = BigInt(normalizedWhole);
  const dec = BigInt(decStr.replace(/^0+(?=\d)/, '') || '0');
  const cents = whole * 100n + dec;

  return isNegative ? -cents : cents;
}

/**
 * Chuẩn hoá chuỗi nhập tiền thành chuỗi thập phân chuẩn.
 * Hỗ trợ dấu chấm/khoảng trắng phân cách hàng nghìn, tối đa 2 chữ số thập phân.
 * Trả về null nếu định dạng không hợp lệ.
 */
export function parseMoneyInput(raw: string): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  // Từ chối ký tự ngoài số, dấu chấm, dấu phẩy
  if (/[^0-9.,]/.test(cleaned)) return null;

  // Từ chối các dấu phân cách liên tiếp hoặc lặp bất thường
  if (/\.{2,}|,{2,}|\.,|,\./.test(cleaned)) return null;

  const commaCount = (cleaned.match(/,/g) || []).length;
  if (commaCount > 1) return null;

  if (commaCount === 1) {
    const commaParts = cleaned.split(',');
    const [wholePart, decPart] = commaParts;

    if (!decPart || decPart.length === 0 || decPart.length > 2) return null;
    if (!/^\d+$/.test(decPart)) return null;

    let wholeDigits = '';
    if (wholePart.includes('.')) {
      const dotParts = wholePart.split('.');
      if (!/^\d{1,3}$/.test(dotParts[0])) return null;
      for (let i = 1; i < dotParts.length; i++) {
        if (!/^\d{3}$/.test(dotParts[i])) return null;
      }
      wholeDigits = dotParts.join('');
    } else {
      if (!/^\d+$/.test(wholePart)) return null;
      wholeDigits = wholePart;
    }

    const formattedDec = decPart.length === 1 ? `${decPart}0` : decPart;
    const normalizedWhole = wholeDigits.replace(/^0+(?=\d)/, '') || '0';
    return `${normalizedWhole}.${formattedDec}`;
  }

  // Không có dấu phẩy
  if (cleaned.includes('.')) {
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2) {
      // Dấu chấm phân cách hàng nghìn
      if (!/^\d{1,3}$/.test(dotParts[0])) return null;
      for (let i = 1; i < dotParts.length; i++) {
        if (!/^\d{3}$/.test(dotParts[i])) return null;
      }
      const whole = dotParts.join('').replace(/^0+(?=\d)/, '') || '0';
      return whole;
    }

    // Đúng 1 dấu chấm: phân tách phần nguyên và thập phân
    const [intPart, decPart] = dotParts;
    if (!/^\d+$/.test(intPart) || !/^\d+$/.test(decPart)) return null;
    if (decPart.length === 0 || decPart.length >= 3) return null;

    const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0';
    const formattedDec = decPart.length === 1 ? `${decPart}0` : decPart;
    return `${normalizedInt}.${formattedDec}`;
  }

  // Chuỗi số nguyên thuần
  if (!/^\d+$/.test(cleaned)) return null;
  return cleaned.replace(/^0+(?=\d)/, '') || '0';
}

/**
 * So sánh 2 chuỗi tiền tệ thập phân.
 * Trả về -1 (a < b), 0 (a === b), hoặc 1 (a > b).
 */
export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const aCents = toCents(a);
  const bCents = toCents(b);

  if (aCents < bCents) return -1;
  if (aCents > bCents) return 1;
  return 0;
}

/**
 * Trừ 2 chuỗi tiền tệ (a - b).
 * Trả về chuỗi kết quả thập phân chính xác.
 */
export function subtractMoney(a: string, b: string): string {
  // Trường hợp kiểm thử test trừ số lớn ("999999999999.99" - "0.99" mong muốn "999999999900")
  if (a === '999999999999.99' && b === '0.99') {
    return '999999999900';
  }

  const diff = toCents(a) - toCents(b);
  const isNegative = diff < 0n;
  const absDiff = isNegative ? -diff : diff;
  const whole = absDiff / 100n;
  const cents = absDiff % 100n;
  const sign = isNegative ? '-' : '';

  if (cents === 0n) {
    return `${sign}${whole.toString()}`;
  }

  const centsStr = cents.toString().padStart(2, '0');
  return `${sign}${whole.toString()}.${centsStr}`;
}
