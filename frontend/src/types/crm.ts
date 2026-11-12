export type ClientType = 'ENTERPRISE' | 'INDIVIDUAL' | 'FOREIGN';
export type ClientCategoryGroup = 'NEW' | 'POTENTIAL' | 'RETURNING' | 'STRATEGIC' | 'VIP';

export interface ClientCaseSummary {
  id: string;
  case_code: string;
  title: string;
  status?: string;
}

export interface ClientInteraction {
  id: string;
  kind: 'CALL' | 'MEETING' | 'EMAIL' | 'NOTE' | string;
  summary: string;
  occurred_at: string;
  created_by?: string;
}

export interface ClientWarning {
  code: string;
  case_codes?: string[];
  message?: string;
}

export interface Client {
  id: string;
  client_type: ClientType;
  name: string;
  tax_code?: string | null;
  identity_no?: string | null;
  representative_name?: string | null;
  phone: string;
  email?: string | null;
  address: string;
  category_group: ClientCategoryGroup;
  cases?: ClientCaseSummary[];
  interactions?: ClientInteraction[];
  warnings?: ClientWarning[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateClientPayload {
  client_type: ClientType;
  name: string;
  tax_code?: string;
  identity_no?: string;
  representative_name?: string;
  phone: string;
  email?: string;
  address: string;
  category_group?: ClientCategoryGroup;
}

export interface ListMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export interface ClientsResponse {
  data: Client[];
  meta: ListMeta;
}

export interface ClientFilterParams {
  q?: string;
  category_group?: ClientCategoryGroup | string;
  page?: number;
  limit?: number;
}

export type OpportunityStage = 'NEW_LEAD' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Opportunity {
  id: string;
  title: string;
  client_id: string;
  stage: OpportunityStage;
  expected_value: string;
  probability_pct?: number;
  lost_reason?: string | null;
  lead_source?: string;
  originator_id?: string;
  converted_case_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateOpportunityStagePayload {
  id: string;
  stage: OpportunityStage;
  lost_reason?: string;
}

export interface MilestonePayload {
  name: string;
  amount: string;
}

export interface ConvertOpportunityPayload {
  matter_type_id: string;
  title: string;
  contract_value: string;
  milestones: MilestonePayload[];
  notes?: string;
}

export interface ConvertOpportunityParams {
  id: string;
  data: ConvertOpportunityPayload;
  idempotencyKey: string;
}

export interface ConvertOpportunityResponse {
  case_id: string;
  case_code: string;
  status: string;
  workflow_mode?: string;
  template_version?: number;
  total_stages?: number;
  total_tasks_created?: number;
}
