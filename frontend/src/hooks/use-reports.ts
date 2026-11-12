import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { exportFilename } from '@/lib/reports';
import type {
  RevenueReportData,
  RevenueReportParams,
  CommissionsReportData,
  CommissionsReportParams,
  OperationsReportData,
  OperationsReportParams,
} from '@/types/reports';

interface UseReportOptions {
  enabled?: boolean;
}

export function useRevenueReport(params: RevenueReportParams, options?: UseReportOptions) {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.department_id) searchParams.set('department_id', params.department_id);
  if (params.group_by) searchParams.set('group_by', params.group_by);

  const qs = searchParams.toString();
  const path = qs ? `/reports/revenue?${qs}` : '/reports/revenue';

  return useQuery<RevenueReportData>({
    queryKey: ['reports', 'revenue', params],
    queryFn: () => apiFetch<RevenueReportData>(path),
    enabled: options?.enabled,
    retry: false,
  });
}

export function useCommissionsReport(
  params: CommissionsReportParams,
  options?: UseReportOptions
) {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.department_id) searchParams.set('department_id', params.department_id);
  if (params.payout_status) searchParams.set('payout_status', params.payout_status);

  const qs = searchParams.toString();
  const path = qs ? `/reports/commissions?${qs}` : '/reports/commissions';

  return useQuery<CommissionsReportData>({
    queryKey: ['reports', 'commissions', params],
    queryFn: () => apiFetch<CommissionsReportData>(path),
    enabled: options?.enabled,
    retry: false,
  });
}

export function useOperationsReport(
  params: OperationsReportParams,
  options?: UseReportOptions
) {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.department_id) searchParams.set('department_id', params.department_id);

  const qs = searchParams.toString();
  const path = qs ? `/reports/operations?${qs}` : '/reports/operations';

  return useQuery<OperationsReportData>({
    queryKey: ['reports', 'operations', params],
    queryFn: () => apiFetch<OperationsReportData>(path),
    enabled: options?.enabled,
    retry: false,
  });
}

export async function exportReportExcel(
  name: string,
  params: Record<string, string | undefined>
): Promise<void> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== '') {
      searchParams.set(key, val);
    }
  });

  const qs = searchParams.toString();
  const base = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
  const url = qs ? `${base}/reports/${name}/export?${qs}` : `${base}/reports/${name}/export`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Không thể xuất báo cáo');
  }

  let filename = '';
  const disposition = response.headers.get('Content-Disposition') || '';
  if (disposition) {
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
      filename = decodeURIComponent(utf8Match[1].trim());
    } else {
      const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
      if (regularMatch && regularMatch[1]) {
        filename = regularMatch[1].trim();
      }
    }
  }

  if (!filename) {
    filename = exportFilename(name, params.from || '', params.to || '');
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
