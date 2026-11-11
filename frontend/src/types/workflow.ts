export type WorkflowMode = 'STRICT' | 'FLEXIBLE';

export type WorkflowVersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export type WorkflowCaseRole = 'SUPERVISOR' | 'CASE_MANAGER' | 'EXECUTOR';

export interface WorkflowTask {
  key: string;
  title: string;
  description?: string | null;
  default_case_role: string;
  sla_business_days: number;
  complexity_weight: number;
  requires_approval: boolean;
  triggers_milestone_order: number | null;
  depends_on: string[];
}

export interface WorkflowStage {
  key: string;
  name: string;
  order_index: number;
  requires_approval: boolean;
  tasks: WorkflowTask[];
}

export interface WorkflowVersion {
  id: string;
  template_id: string;
  version_no: number;
  status: WorkflowVersionStatus;
  mode: WorkflowMode;
  stages: WorkflowStage[];
  published_at?: string | null;
  published_by?: string | null;
}

export interface WorkflowTemplate {
  id: string;
  matter_type_id: string;
  matter_type_name?: string;
  name: string;
  mode: WorkflowMode;
  is_active: boolean;
  published_version_no?: number | null;
  draft_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options?: string[];
}

export interface HolidayDay {
  date: string;
  name: string;
}

export interface HolidaysConfig {
  year: number;
  days: HolidayDay[];
}
