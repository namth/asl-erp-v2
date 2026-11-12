export type ActorType = 'USER' | 'SYSTEM';

export interface AuditActor {
  id?: string;
  full_name?: string;
  email?: string;
}

export interface AuditLogItem {
  id: number;
  created_at: string;
  actor_type: ActorType;
  actor: AuditActor | null;
  action: string;
  entity_name: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address?: string;
  user_agent?: string;
  row_hash: string;
}

export interface AuditLogMeta {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export type ListMeta = AuditLogMeta;

export interface AuditLogsResponse {
  data: AuditLogItem[];
  meta: AuditLogMeta;
}

export interface AuditLogsFilter {
  actor_id?: string;
  actor_type?: ActorType;
  action?: string;
  entity_name?: string;
  entity_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export type IntegrityStatus = 'OK' | 'BROKEN' | 'NEVER_CHECKED';

export interface AuditIntegrityResponse {
  status: IntegrityStatus;
  checked_rows: number;
  verified_at: string | null;
  first_broken_id?: number | null;
}
