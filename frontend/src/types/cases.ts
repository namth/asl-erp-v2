export type CaseStatus =
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'TERMINATED'
  | 'CLOSED';

export type WorkflowMode = 'STRICT' | 'FLEXIBLE';

export type RoleInCase =
  | 'CASE_MANAGER'
  | 'SUPERVISOR'
  | 'EXECUTOR'
  | 'ASSISTANT'
  | (string & {});

export type StageStatus =
  | 'LOCKED'
  | 'ACTIVE'
  | 'WAITING_PAYMENT'
  | 'WAITING_APPROVAL'
  | 'COMPLETED';

export interface StageTaskCounts {
  todo: number;
  in_progress: number;
  waiting_approval: number;
  completed: number;
}

export interface BlockingMilestone {
  id: string;
  name: string;
  status: string;
  amount?: string;
}

export interface CaseStage {
  id: string;
  name: string;
  order_index: number;
  status: StageStatus;
  requires_approval: boolean;
  blocking_milestone_id?: string | null;
  blocking_milestone?: BlockingMilestone | null;
  task_counts?: StageTaskCounts;
}

export interface CaseAssignment {
  user_id: string;
  full_name?: string;
  role_in_case: RoleInCase;
  email?: string;
}

export interface CaseClient {
  id: string;
  name: string;
  tax_code?: string;
  identity_no?: string;
}

export interface BillingMilestone {
  id: string;
  name: string;
  amount: string;
  status: string;
}

export interface CaseListItem {
  id: string;
  case_code: string;
  title: string;
  client_name?: string;
  status: CaseStatus;
  workflow_mode: WorkflowMode;
  current_stage?: {
    id: string;
    name: string;
    status: StageStatus;
  } | null;
  progress_pct: number;
  due_at_nearest?: string | null;
  my_role_in_case?: RoleInCase | null;
  created_at?: string;
}

export interface CaseDetail {
  id: string;
  case_code: string;
  title: string;
  status: CaseStatus;
  workflow_mode: WorkflowMode;
  is_legacy: boolean;
  contract_value?: string;
  client?: CaseClient;
  current_stage?: {
    id: string;
    name: string;
    order_index?: number;
    status: StageStatus;
    blocking_milestone_id?: string | null;
  } | null;
  progress_pct: number;
  assignments?: CaseAssignment[];
  custom_data?: Record<string, unknown>;
  billing_milestones?: BillingMilestone[];
  created_at?: string;
  updated_at?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export interface CaseListResponse {
  items: CaseListItem[];
  meta: PaginationMeta;
}

export interface CaseListFilters {
  q?: string;
  status?: string;
  department_id?: string;
  mine?: boolean;
  page?: number;
  limit?: number;
}

export interface SetAssignmentsPayload {
  assignments: {
    user_id: string;
    role_in_case: RoleInCase;
  }[];
}

export interface ChangeStatusPayload {
  status: CaseStatus;
  reason?: string;
}
