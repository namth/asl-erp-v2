import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import {
  AuditLogsFilter,
  AuditLogsResponse,
  AuditIntegrityResponse,
} from '@/types/audit';

function buildAuditLogsUrl(filters?: AuditLogsFilter): string {
  if (!filters) {
    return '/audit-logs';
  }

  const searchParams = new URLSearchParams();

  const keys: (keyof AuditLogsFilter)[] = [
    'actor_id',
    'actor_type',
    'action',
    'entity_name',
    'entity_id',
    'from',
    'to',
    'page',
    'limit',
  ];

  for (const key of keys) {
    const val = filters[key];
    if (val !== undefined && val !== null && val !== '') {
      searchParams.set(key, String(val));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `/audit-logs?${queryString}` : '/audit-logs';
}

export function useAuditLogs(filters?: AuditLogsFilter) {
  return useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch<AuditLogsResponse>(buildAuditLogsUrl(filters)),
  });
}

export function useAuditIntegrity() {
  return useQuery<AuditIntegrityResponse>({
    queryKey: ['audit-integrity'],
    queryFn: () => apiFetch<AuditIntegrityResponse>('/audit-logs/integrity'),
  });
}

export function useRecheckIntegrity() {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async () => {
    setIsPending(true);
    try {
      const data = await apiFetch<AuditIntegrityResponse>('/audit-logs/integrity?recheck=true');
      return data;
    } finally {
      setIsPending(false);
    }
  }, []);

  return {
    mutateAsync,
    isPending,
  };
}
