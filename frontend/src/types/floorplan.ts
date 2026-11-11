export interface FloorplanUser {
  id: string;
  name: string;
  title: string;
  avatar_url?: string;
}

export interface FloorplanDepartment {
  id: string;
  name: string;
  leader: FloorplanUser;
}

export interface FloorplanStats {
  total_staff: number;
  working_count: number;
  resting_count: number;
  pending_approvals_count: number;
}

export interface ApprovalRequestItem {
  id: string;
  case_code: string;
  title: string;
  requested_at: string;
}

export interface ApprovalQueueItem {
  user: FloorplanUser;
  pending_count: number;
  requests: ApprovalRequestItem[];
}

export interface WorkstationDesk {
  desk_index: number;
  user: FloorplanUser;
  in_progress_count: number;
  todo_count: number;
  is_idle: boolean;
  is_in_queue: boolean;
}

export interface FloorplanData {
  department: FloorplanDepartment;
  stats: FloorplanStats;
  approval_queue: ApprovalQueueItem[];
  workstations: WorkstationDesk[];
}

export type TaskStatusUpdatedPayload = {
  user_id: string;
  in_progress_count: number;
  todo_count: number;
};

export type ApprovalSubmittedPayload = {
  user_id: string;
  request: ApprovalRequestItem;
};

export type ApprovalDecidedPayload = {
  user_id: string;
  request_id: string;
};

export type FloorplanEvent =
  | {
      type: 'EVENT_TASK_STATUS_UPDATED';
      payload: TaskStatusUpdatedPayload;
    }
  | {
      type: 'EVENT_APPROVAL_SUBMITTED';
      payload: ApprovalSubmittedPayload;
    }
  | {
      type: 'EVENT_APPROVAL_DECIDED';
      payload: ApprovalDecidedPayload;
    };

