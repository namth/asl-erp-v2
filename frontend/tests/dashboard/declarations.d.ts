declare module '@/app/(dashboard)/settings/page' {
  import type React from 'react';
  const SettingsPage: React.ComponentType;
  export default SettingsPage;
}

declare module '@/hooks/use-my-tasks' {
  export interface MyTaskItem {
    id: string;
    title: string;
    status: string;
    due_at?: string | null;
    is_overdue?: boolean;
    case?: {
      id: string;
      case_code: string;
      title: string;
    };
    stage?: {
      name: string;
      status: string;
    };
    blocked_by_count?: number;
  }

  export interface MyTasksSummary {
    todo: number;
    in_progress: number;
    waiting_approval: number;
    overdue: number;
  }

  export interface MyTasksFilters {
    due?: 'overdue' | 'today' | 'week' | string;
    status?: string;
    page?: number;
    limit?: number;
  }

  export interface MyTasksResponse {
    items: MyTaskItem[];
    summary: MyTasksSummary;
    meta?: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }

  export function useMyTasks(filters?: MyTasksFilters): {
    data?: MyTasksResponse;
    isLoading: boolean;
    isError: boolean;
    error?: any;
    refetch: () => Promise<any> | any;
  };
}

declare module '@/hooks/use-settings' {
  export interface CommissionDefaultItem {
    matter_type_id: string;
    name: string;
    code: string;
    default_originator_rate: string;
    default_management_rate: string;
    default_supervisor_share_pct: string;
    default_execution_rate: string;
  }

  export function useCommissionDefaults(): {
    data?: CommissionDefaultItem[];
    isLoading: boolean;
    isError: boolean;
    error?: any;
    refetch: () => Promise<any> | any;
  };

  export function useUpdateCommissionDefaults(): {
    mutate: (payload: CommissionDefaultItem[]) => void;
    mutateAsync: (payload: CommissionDefaultItem[]) => Promise<any>;
    isPending: boolean;
    isError: boolean;
    error?: any;
  };
}
