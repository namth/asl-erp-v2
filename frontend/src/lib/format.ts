export function formatVnd(raw?: string | null): string {
  if (raw === null || raw === undefined) {
    return '0 ₫';
  }
  const str = String(raw).trim();
  if (!str || str === '0') {
    return '0 ₫';
  }

  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;

  // Split integer and decimal parts
  const parts = clean.split(/[.,]/);
  const integerPart = parts[0]?.replace(/^0+(?=\d)/, '') || '0';
  const decimalPart = parts[1];

  // Group integer part in thousands with dot
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const sign = isNegative ? '-' : '';

  if (decimalPart !== undefined && decimalPart !== '') {
    return `${sign}${formattedInteger},${decimalPart} ₫`;
  }

  return `${sign}${formattedInteger} ₫`;
}

/**
 * So sánh 2 chuỗi tiền tệ.
 * Trả về 1 nếu a > b, -1 nếu a < b, 0 nếu a === b.
 */
export function compareCurrencyStrings(aStr: string, bStr: string): number {
  const aClean = aStr.trim().replace(/^0+(?=\d)/, '') || '0';
  const bClean = bStr.trim().replace(/^0+(?=\d)/, '') || '0';

  const aParts = aClean.split('.');
  const bParts = bClean.split('.');

  const aWhole = aParts[0] || '0';
  const bWhole = bParts[0] || '0';

  const aDec = (aParts[1] || '').padEnd(4, '0').slice(0, 4);
  const bDec = (bParts[1] || '').padEnd(4, '0').slice(0, 4);

  const aBig = BigInt(aWhole) * 10000n + BigInt(aDec);
  const bBig = BigInt(bWhole) * 10000n + BigInt(bDec);

  if (aBig > bBig) return 1;
  if (aBig < bBig) return -1;
  return 0;
}

/**
 * Tính tổng danh sách các chuỗi tiền tệ.
 */
export function sumCurrencyStrings(items: string[]): string {
  let totalBig = 0n;
  for (const item of items) {
    const clean = item.trim().replace(/^0+(?=\d)/, '') || '0';
    if (!clean) continue;
    const parts = clean.split('.');
    const whole = parts[0] || '0';
    const dec = (parts[1] || '').padEnd(4, '0').slice(0, 4);
    totalBig += BigInt(whole) * 10000n + BigInt(dec);
  }

  const wholePart = totalBig / 10000n;
  const decPart = totalBig % 10000n;

  if (decPart === 0n) {
    return wholePart.toString();
  }

  const decStr = decPart.toString().padStart(4, '0').replace(/0+$/, '');
  return `${wholePart}.${decStr}`;
}
