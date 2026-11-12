export type MilestoneStatus =
  | 'AWAITING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID_CONFIRMED'
  | 'CANCELLED';

export type CommissionRole =
  | 'ORIGINATOR'
  | 'SUPERVISOR'
  | 'CASE_MANAGER'
  | 'EXECUTOR';

export interface MilestonePayment {
  received_amount: string;
  misa_invoice_no: string;
  bank_ref_code: string;
  confirmed_at: string;
  confirmed_by?: {
    full_name: string;
  };
}

export interface AccountingInboxItem {
  milestone_id: string;
  case: {
    id: string;
    case_code: string;
    title: string;
    client_name: string;
  };
  name: string;
  amount: string;
  received_total: string;
  remaining: string;
  status: MilestoneStatus;
  awaiting_since: string;
  payments: MilestonePayment[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export type ListMeta = PaginationMeta;

export interface AccountingInboxResponse {
  data: AccountingInboxItem[];
  meta: PaginationMeta;
}

export interface AccountingInboxFilters {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface ConfirmPaymentPayload {
  milestone_id: string;
  misa_invoice_no: string;
  bank_ref_code: string;
  received_amount: string;
  notes?: string;
  idempotency_key?: string;
}

export interface CommissionRoleItem {
  user_id: string;
  role_type: CommissionRole;
  amount: string;
  task_id?: string;
}

export interface ConfirmPaymentResponse {
  success: boolean;
  data: {
    milestone_status: MilestoneStatus;
    received_total: string;
    remaining: string;
    stage_unblocked: boolean;
    commissions: CommissionRoleItem[];
    execution_carried_forward: string;
  };
  warnings?: Array<{ code: string; message: string }>;
}

export interface CommissionTransaction {
  id: string;
  case: {
    id?: string;
    case_code: string;
  };
  milestone: {
    id?: string;
    name: string;
  };
  user: {
    id: string;
    full_name: string;
  };
  role_type: CommissionRole;
  task?: {
    id?: string;
    title: string;
  } | null;
  base_amount: string;
  rate_pct: string;
  amount: string;
  created_at: string;
  disbursed_at?: string | null;
}

export interface CommissionsSummary {
  total_amount: string;
  by_role: {
    ORIGINATOR?: string;
    SUPERVISOR?: string;
    CASE_MANAGER?: string;
    EXECUTOR?: string;
    [key: string]: string | undefined;
  };
}

export interface CommissionsResponse {
  data: CommissionTransaction[];
  summary: CommissionsSummary;
  meta: PaginationMeta;
}

export interface CommissionsFilters {
  case_id?: string;
  user_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface CaseMilestone {
  id: string;
  order_index: number;
  name: string;
  amount: string;
  received_total: string;
  status: MilestoneStatus;
  triggered_by_task?: {
    title: string;
  } | null;
}

export interface CommissionPolicy {
  originator_rate: string;
  management_rate: string;
  supervisor_share_pct: string;
  execution_rate: string;
  locked_at: string | null;
}

export interface UpdateCommissionPolicyPayload {
  originator_rate: string;
  management_rate: string;
  supervisor_share_pct: string;
  execution_rate: string;
}
