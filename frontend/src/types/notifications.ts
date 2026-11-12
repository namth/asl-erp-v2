export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationsMeta {
  page: number;
  page_size: number;
  total: number;
  unread_count: number;
}

export interface NotificationsResponse {
  data: NotificationItem[];
  meta: NotificationsMeta;
}

export interface NotificationLiveEvent {
  type: 'NOTIFICATION_CREATED';
  payload: NotificationItem;
}

declare module '@tanstack/query-core' {
  interface QueryOptions {
    refetchInterval?: unknown;
  }
}

