function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultRange(today: Date): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  const qStart = new Date(year, quarterStartMonth, 1);
  return {
    from: formatYmd(qStart),
    to: formatYmd(today),
  };
}

export function validateRange(
  from: string,
  to: string
): null | 'Ngày bắt đầu phải trước ngày kết thúc' | 'Khoảng thời gian tối đa 366 ngày' {
  const [y1, m1, d1] = from.split('-').map((v) => parseInt(v, 10));
  const [y2, m2, d2] = to.split('-').map((v) => parseInt(v, 10));
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);

  if (utc1 > utc2) {
    return 'Ngày bắt đầu phải trước ngày kết thúc';
  }

  const diffDays = Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 366) {
    return 'Khoảng thời gian tối đa 366 ngày';
  }

  return null;
}

export function formatVnd(s: string | null | undefined): string {
  if (s === null || s === undefined) return '0 ₫';
  const str = String(s).trim();
  if (!str || str === '0') return '0 ₫';
  const isNegative = str.startsWith('-');
  const clean = str.replace(/^[+-]/, '').replace(/\D/g, '');
  if (!clean) return '0 ₫';
  const formatted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}${formatted} ₫`;
}

export function formatPct(s: string | null | undefined): string {
  if (s === null || s === undefined) return '0,00%';
  const str = String(s).trim();
  if (!str) return '0,00%';
  if (str.includes('.')) {
    return `${str.replace('.', ',')}%`;
  }
  return `${str}%`;
}

export function barWidths(values: string[]): number[] {
  if (!values || values.length === 0) return [];
  const bigInts = values.map((v) => {
    try {
      const cleaned = String(v).trim().replace(/\D/g, '');
      return cleaned ? BigInt(cleaned) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  });

  let max = BigInt(0);
  for (const b of bigInts) {
    if (b > max) max = b;
  }

  if (max === BigInt(0)) {
    return bigInts.map(() => 0);
  }

  return bigInts.map((b) => {
    return Math.round(Number((b * 10000n) / max) / 100);
  });
}

export function exportFilename(name: string, from: string, to: string): string {
  return `bao-cao-${name}-${from}-${to}.xlsx`;
}
