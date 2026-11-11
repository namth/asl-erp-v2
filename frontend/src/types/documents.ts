export type DocumentFolder =
  | 'LEGAL_CONTRACTS'
  | 'CLIENT_SUBMISSIONS'
  | 'OFFICIAL_FILINGS'
  | 'INTERNAL_DRAFTS';

export const FOLDER_LABELS: Record<DocumentFolder, string> = {
  LEGAL_CONTRACTS: 'Hợp đồng dịch vụ',
  CLIENT_SUBMISSIONS: 'Giấy tờ thân chủ cung cấp',
  OFFICIAL_FILINGS: 'Đơn từ nộp cơ quan nhà nước/Tòa án',
  INTERNAL_DRAFTS: 'Bản thảo nội bộ',
};

export const ALL_FOLDERS: DocumentFolder[] = [
  'LEGAL_CONTRACTS',
  'CLIENT_SUBMISSIONS',
  'OFFICIAL_FILINGS',
  'INTERNAL_DRAFTS',
];

export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED';

export interface DocumentVersion {
  id: string;
  version_no: number;
  original_filename: string;
  mime_type?: string;
  size_bytes: number;
  scan_status: ScanStatus;
  uploaded_by: {
    id: string;
    name: string;
  };
  uploaded_at: string;
}

export interface DocumentItem {
  id: string;
  folder: DocumentFolder;
  title: string;
  task?: {
    id: string;
    title: string;
  } | null;
  is_archived: boolean;
  created_at: string;
  current_version: DocumentVersion;
}

export interface DocumentsMeta {
  allowed_folders: DocumentFolder[];
  can_upload: boolean;
}

export interface DocumentsResponse {
  data: DocumentItem[];
  meta: DocumentsMeta;
}
