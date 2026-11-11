import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { FloorplanData } from '@/types/floorplan';

export { useFloorplanLive } from './use-floorplan-live';
export type { UseFloorplanLiveOptions, UseFloorplanLiveReturn } from './use-floorplan-live';

export interface UseFloorplanOptions {
  enabled?: boolean;
}

export function useFloorplan(
  departmentId?: string,
  options?: UseFloorplanOptions
) {
  const queryKey = departmentId
    ? ['operations', 'floorplan', departmentId]
    : ['operations', 'floorplan'];

  const endpoint = departmentId
    ? `/operations/floorplan?department_id=${encodeURIComponent(departmentId)}`
    : '/operations/floorplan';

  return useQuery<FloorplanData>({
    queryKey,
    queryFn: () => apiFetch<FloorplanData>(endpoint),
    enabled: options?.enabled !== undefined ? options.enabled : true,
    retry: false,
  });
}
