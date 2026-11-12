export type ReportTab = 'revenue' | 'commissions' | 'operations';

export type ReportScope = 'FIRM' | 'DEPARTMENT' | 'SELF';

export interface DepartmentMeta {
  id: string;
  name: string;
}

export interface ReportMeta {
  scope: ReportScope;
  departments: DepartmentMeta[];
  from: string;
  to: string;
}

export interface RevenueSummary {
  received_total: string;
  contract_value_total: string;
  collection_rate_pct: string;
  payment_count: number;
}

export interface RevenueByPeriod {
  period: string;
  received_total: string;
}

export interface RevenueByDepartment {
  department: {
    id: string;
    name: string;
  };
  received_total: string;
}

export interface RevenueByMatterType {
  matter_type: {
    code: string;
    name: string;
  };
  received_total: string;
  contract_value_total: string;
}

export interface RevenueReportData {
  summary: RevenueSummary;
  by_period: RevenueByPeriod[];
  by_department: RevenueByDepartment[];
  by_matter_type: RevenueByMatterType[];
  meta: ReportMeta;
}

export interface RevenueReportParams {
  from?: string;
  to?: string;
  department_id?: string;
  group_by?: 'month' | 'quarter';
}

export interface CommissionsSummary {
  total_amount: string;
  accumulated_amount: string;
  disbursed_amount: string;
}

export interface CommissionUserRoleBreakdown {
  ORIGINATOR?: string;
  SUPERVISOR?: string;
  CASE_MANAGER?: string;
  EXECUTOR?: string;
  ASSISTANT?: string;
  [key: string]: string | undefined;
}

export interface CommissionByUser {
  user: {
    id: string;
    full_name: string;
    department_name?: string;
  };
  total_amount: string;
  accumulated_amount: string;
  disbursed_amount: string;
  by_role: CommissionUserRoleBreakdown;
}

export interface CommissionsReportData {
  summary: CommissionsSummary;
  by_user: CommissionByUser[];
  meta: ReportMeta;
}

export interface CommissionsReportParams {
  from?: string;
  to?: string;
  department_id?: string;
  payout_status?: 'ACCUMULATED' | 'DISBURSED';
}

export interface CasesByStatus {
  INITIALIZING: number;
  ACTIVE: number;
  PAUSED: number;
  CLOSED: number;
  TERMINATED: number;
  [key: string]: number;
}

export interface OverdueTaskItem {
  task_id: string;
  title: string;
  case: {
    id: string;
    case_code: string;
  };
  assignee: {
    full_name: string;
  };
  due_date: string;
  days_overdue: number;
}

export interface OverdueTasks {
  count: number;
  items: OverdueTaskItem[];
}

export interface StageDuration {
  stage_name: string;
  completed_count: number;
  avg_days: string;
}

export interface OpportunityConversion {
  created_count: number;
  won_count: number;
  converted_count: number;
  conversion_rate_pct: string;
}

export interface OperationsReportData {
  cases_by_status: CasesByStatus;
  overdue_tasks: OverdueTasks;
  stage_durations: StageDuration[];
  opportunity_conversion: OpportunityConversion;
  meta: ReportMeta;
}

export interface OperationsReportParams {
  from?: string;
  to?: string;
  department_id?: string;
}

