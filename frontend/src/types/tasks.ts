export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'COMPLETED';

export interface UserSummary {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
}

export interface Task {
  id: string;
  stage_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  assigned_to?: UserSummary | null;
  due_at?: string | null;
  sla_business_days: number;
  complexity_weight: number;
  requires_approval: boolean;
  is_ad_hoc: boolean;
  depends_on: string[];
  blocked_by?: string[];
}

export interface TaskStateContext {
  stageStatus: string;
  caseStatus: string;
  isLegacy?: boolean;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: UserSummary;
  body: string;
  created_at: string;
}

export interface ChangeRequestProposal {
  stage_id: string;
  title: string;
  assigned_to?: string;
  due_at?: string;
  complexity_weight?: number;
}

export interface ChangeRequest {
  id: string;
  case_id: string;
  kind: 'ADD_TASK';
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  proposal: ChangeRequestProposal;
  requested_by: UserSummary;
  created_at: string;
}

export type ApprovalType = 'TASK' | 'STAGE_GATE' | 'CHANGE_REQUEST';

export interface Approval {
  id: string;
  type: ApprovalType;
  case: {
    id: string;
    case_code: string;
    title: string;
  };
  subject: {
    id: string;
    title: string;
  };
  requested_by: UserSummary;
  requested_at: string;
  note?: string | null;
}
