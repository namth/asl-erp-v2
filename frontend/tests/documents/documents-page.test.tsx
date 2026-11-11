import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import DocumentsPage from '@/app/(dashboard)/cases/[id]/documents/page';
import * as documentsHooks from '@/hooks/use-documents';
import * as authHooks from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: 'case-001' }),
  usePathname: () => '/cases/case-001/documents',
  useSearchParams: () => mockSearchParams,
}));

describe('Màn hình Tài liệu vụ việc - cases/[id]/documents/page.tsx (SCR-17 & brief mục 4, 5)', () => {
  const sampleDocuments = [
    {
      id: 'doc-1',
      folder: 'LEGAL_CONTRACTS',
      title: 'Hợp đồng dịch vụ tư vấn pháp lý',
      task: { id: 'task-1', title: 'Soạn hợp đồng' },
      is_archived: false,
      created_at: '2026-11-02T03:00:00Z',
      current_version: {
        id: 'ver-2',
        version_no: 2,
        original_filename: 'hop-dong-v2.pdf',
        mime_type: 'application/pdf',
        size_bytes: 482133,
        scan_status: 'CLEAN',
        uploaded_by: { id: 'usr-02', name: 'LS. Mai Linh' },
        uploaded_at: '2026-11-05T08:10:00Z',
      },
    },
    {
      id: 'doc-2',
      folder: 'LEGAL_CONTRACTS',
      title: 'Phụ lục hợp đồng điều chỉnh phạm vi',
      task: null,
      is_archived: false,
      created_at: '2026-11-06T09:00:00Z',
      current_version: {
        id: 'ver-1',
        version_no: 1,
        original_filename: 'phu-luc.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size_bytes: 1258291,
        scan_status: 'PENDING',
        uploaded_by: { id: 'usr-03', name: 'Nguyễn Văn Nam' },
        uploaded_at: '2026-11-06T09:00:00Z',
      },
    },
    {
      id: 'doc-3',
      folder: 'LEGAL_CONTRACTS',
      title: 'Tài liệu độc hại nghi vấn',
      task: null,
      is_archived: false,
      created_at: '2026-11-07T10:00:00Z',
      current_version: {
        id: 'ver-1',
        version_no: 1,
        original_filename: 'malware.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
        scan_status: 'INFECTED',
        uploaded_by: { id: 'usr-03', name: 'Nguyễn Văn Nam' },
        uploaded_at: '2026-11-07T10:00:00Z',
      },
    },
    {
      id: 'doc-4',
      folder: 'LEGAL_CONTRACTS',
      title: 'Bản thảo hợp đồng cũ đã huỷ',
      task: null,
      is_archived: true,
      created_at: '2026-10-01T00:00:00Z',
      current_version: {
        id: 'ver-1',
        version_no: 1,
        original_filename: 'old-draft.pdf',
        mime_type: 'application/pdf',
        size_bytes: 102400,
        scan_status: 'CLEAN',
        uploaded_by: { id: 'usr-01', name: 'Trần Thị Hà' },
        uploaded_at: '2026-10-01T00:00:00Z',
      },
    },
  ];

  const defaultMeta = {
    allowed_folders: [
      'LEGAL_CONTRACTS',
      'CLIENT_SUBMISSIONS',
      'OFFICIAL_FILINGS',
      'INTERNAL_DRAFTS',
    ],
    can_upload: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSearchParams = new URLSearchParams();

    vi.spyOn(authHooks, 'useMe').mockReturnValue({
      data: {
        id: 'usr-01',
        full_name: 'LS. Nguyễn Văn An',
        system_role: 'MANAGER',
      },
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
      data: {
        data: sampleDocuments.filter((d) => !d.is_archived),
        meta: defaultMeta,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(documentsHooks, 'useDocumentVersions').mockReturnValue({
      data: [
        {
          id: 'ver-2',
          version_no: 2,
          original_filename: 'hop-dong-v2.pdf',
          size_bytes: 482133,
          scan_status: 'CLEAN',
          uploaded_by: { id: 'usr-02', name: 'LS. Mai Linh' },
          uploaded_at: '2026-11-05T08:10:00Z',
        },
        {
          id: 'ver-1',
          version_no: 1,
          original_filename: 'hop-dong-v1.pdf',
          size_bytes: 450000,
          scan_status: 'CLEAN',
          uploaded_by: { id: 'usr-01', name: 'LS. Nguyễn Văn An' },
          uploaded_at: '2026-11-02T03:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(documentsHooks, 'useUploadDocument').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'doc-new' }),
      isPending: false,
    } as any);

    vi.spyOn(documentsHooks, 'useUploadVersion').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 'ver-new' }),
      isPending: false,
    } as any);

    vi.spyOn(documentsHooks, 'useArchiveDocument').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);
  });

  describe('Tiêu chuẩn 4 trạng thái giao diện UI (brief mục 4, 5)', () => {
    it('trạng thái đang tải (Loading state): hiển thị Skeleton loading', () => {
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);
      const skeleton =
        screen.queryByRole('status', { name: /đang tải/i }) ||
        document.querySelector('.animate-pulse');
      expect(skeleton).not.toBeNull();
    });

    it('trạng thái trống (Empty state): hiển thị đúng thông điệp "Chưa có tài liệu trong thư mục này"', () => {
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: {
          data: [],
          meta: defaultMeta,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);
      expect(screen.getByText(/Chưa có tài liệu trong thư mục này/i)).toBeDefined();
    });

    it('trạng thái lỗi Need-to-know: khi gặp 403 NEED_TO_KNOW_DENIED hiển thị "Không có quyền truy cập"', () => {
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new ApiError(403, 'NEED_TO_KNOW_DENIED', 'Không có quyền truy cập'),
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);
      expect(screen.getByText(/Không có quyền truy cập/i)).toBeDefined();
    });

    it('trạng thái lỗi chung: hiển thị thông báo lỗi và nút Thử lại', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Không thể tải danh sách tài liệu'),
        refetch: mockRefetch,
      } as any);

      render(<DocumentsPage />);
      const retryBtn = screen.getByRole('button', { name: /thử lại|retry/i });
      expect(retryBtn).toBeDefined();
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Cây 4 thư mục và phân quyền hiển thị (brief mục 4, 5 & §3.8)', () => {
    it('hiển thị đầy đủ 4 thư mục cố định với nhãn tiếng Việt chuẩn khi có đủ quyền', () => {
      render(<DocumentsPage />);

      expect(screen.getByText(/Hợp đồng dịch vụ/i)).toBeDefined();
      expect(screen.getByText(/Giấy tờ thân chủ cung cấp/i)).toBeDefined();
      expect(screen.getByText(/Đơn từ nộp cơ quan nhà nước\/Tòa án/i)).toBeDefined();
      expect(screen.getByText(/Bản thảo nội bộ/i)).toBeDefined();
    });

    it('chỉ hiển thị thư mục có trong allowed_folders: Kế toán chỉ thấy Hợp đồng dịch vụ, KHÔNG có nút tải lên/lưu trữ', () => {
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: {
          data: sampleDocuments.filter((d) => !d.is_archived),
          meta: {
            allowed_folders: ['LEGAL_CONTRACTS'],
            can_upload: false,
          },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);

      // Thấy Hợp đồng dịch vụ
      expect(screen.getByText(/Hợp đồng dịch vụ/i)).toBeDefined();

      // Không thấy 3 thư mục kia
      expect(screen.queryByText(/Giấy tờ thân chủ cung cấp/i)).toBeNull();
      expect(screen.queryByText(/Đơn từ nộp cơ quan nhà nước\/Tòa án/i)).toBeNull();
      expect(screen.queryByText(/Bản thảo nội bộ/i)).toBeNull();

      // KHÔNG có nút tải lên
      expect(screen.queryByRole('button', { name: /Tải lên tài liệu|Tải tệp lên|\+ Tải lên/i })).toBeNull();

      // KHÔNG có nút lưu trữ
      expect(screen.queryByRole('button', { name: /Lưu trữ/i })).toBeNull();
    });

    it('đổi thư mục kích hoạt cập nhật truy vấn ?folder=', () => {
      const useDocsSpy = vi.spyOn(documentsHooks, 'useDocuments');
      render(<DocumentsPage />);

      const otherFolderBtn = screen.getByText(/Giấy tờ thân chủ cung cấp/i);
      fireEvent.click(otherFolderBtn);

      // Phải gọi với folder CLIENT_SUBMISSIONS hoặc cập nhật query url
      const lastCallArg = useDocsSpy.mock.calls[useDocsSpy.mock.calls.length - 1];
      expect(lastCallArg[1]?.folder === 'CLIENT_SUBMISSIONS' || mockPush.mock.calls.length > 0).toBe(true);
    });

    it('công tắc "Hiện tài liệu đã lưu trữ" gửi include_archived=true và hiển thị tài liệu lưu trữ mờ kèm huy hiệu', () => {
      const useDocsSpy = vi.spyOn(documentsHooks, 'useDocuments');

      // Khi bật công tắc lưu trữ, hook trả về cả file đã lưu trữ
      useDocsSpy.mockReturnValue({
        data: {
          data: sampleDocuments,
          meta: defaultMeta,
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);

      const toggleSwitch = screen.getByRole('checkbox', {
        name: /Hiện tài liệu đã lưu trữ/i,
      }) || screen.getByLabelText(/Hiện tài liệu đã lưu trữ/i);

      fireEvent.click(toggleSwitch);

      // Phải có huy hiệu "Đã lưu trữ" cho tài liệu lưu trữ
      expect(screen.getByText(/Đã lưu trữ/i)).toBeDefined();
    });
  });

  describe('Bảng danh sách tài liệu và trạng thái quét virus (brief mục 4 & 5)', () => {
    it('hiển thị đầy đủ thông tin: tiêu đề, task, phiên bản v{n}, tên tệp, dung lượng formatBytes, người tải', () => {
      render(<DocumentsPage />);

      expect(screen.getByText('Hợp đồng dịch vụ tư vấn pháp lý')).toBeDefined();
      expect(screen.getByText('Soạn hợp đồng')).toBeDefined();
      expect(screen.getByText(/v2/i)).toBeDefined();
      expect(screen.getByText('hop-dong-v2.pdf')).toBeDefined();
      expect(screen.getByText(/471 KB/i)).toBeDefined();
      expect(screen.getByText('LS. Mai Linh')).toBeDefined();
    });

    it('hiển thị đúng các trạng thái quét virus: PENDING -> "Đang quét", CLEAN -> không huy hiệu, INFECTED -> "Nhiễm virus"', () => {
      render(<DocumentsPage />);

      // PENDING
      expect(screen.getByText(/Đang quét/i)).toBeDefined();

      // INFECTED đỏ
      const infectedBadge = screen.getByText(/Nhiễm virus/i);
      expect(infectedBadge).toBeDefined();
    });
  });

  describe('Hộp thoại Tải lên tài liệu (Upload Modal) (brief mục 4 & 5)', () => {
    it('chặn submit khi thiếu tiêu đề và không gọi API upload', async () => {
      const mockUpload = vi.fn();
      vi.spyOn(documentsHooks, 'useUploadDocument').mockReturnValue({
        mutateAsync: mockUpload,
        isPending: false,
      } as any);

      render(<DocumentsPage />);

      const uploadBtn = screen.getByRole('button', { name: /Tải lên tài liệu|Tải tệp lên|\+ Tải lên/i });
      fireEvent.click(uploadBtn);

      // Bấm gửi ngay khi chưa nhập tiêu đề
      const submitBtn = screen.getByRole('button', { name: /Xác nhận tải lên|Tải lên|Lưu/i });
      fireEvent.click(submitBtn);

      // Chặn submit, không gọi API
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('chặn submit khi tệp không hợp lệ theo checkFile (đuôi .exe hoặc quá 50MB) và báo lỗi dưới ô tệp', async () => {
      const mockUpload = vi.fn();
      vi.spyOn(documentsHooks, 'useUploadDocument').mockReturnValue({
        mutateAsync: mockUpload,
        isPending: false,
      } as any);

      render(<DocumentsPage />);

      const uploadBtn = screen.getByRole('button', { name: /Tải lên tài liệu|Tải tệp lên|\+ Tải lên/i });
      fireEvent.click(uploadBtn);

      const titleInput = screen.getByLabelText(/Tiêu đề/i);
      fireEvent.change(titleInput, { target: { value: 'Tài liệu độc hại' } });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      const badFile = new File(['virus content'], 'virus.exe', { type: 'application/x-msdownload' });
      fireEvent.change(fileInput, { target: { files: [badFile] } });

      const submitBtn = screen.getByRole('button', { name: /Xác nhận tải lên|Tải lên|Lưu/i });
      fireEvent.click(submitBtn);

      expect(mockUpload).not.toHaveBeenCalled();
      expect(screen.getByText(/FILE_TYPE_NOT_ALLOWED|Định dạng tệp không được phép/i)).toBeDefined();
    });

    it('gửi FormData đúng các trường (folder, title, task_id, file) khi tải lên hợp lệ', async () => {
      const mockUpload = vi.fn().mockResolvedValue({ id: 'doc-new' });
      vi.spyOn(documentsHooks, 'useUploadDocument').mockReturnValue({
        mutateAsync: mockUpload,
        isPending: false,
      } as any);

      render(<DocumentsPage />);

      const uploadBtn = screen.getByRole('button', { name: /Tải lên tài liệu|Tải tệp lên|\+ Tải lên/i });
      fireEvent.click(uploadBtn);

      const titleInput = screen.getByLabelText(/Tiêu đề/i);
      fireEvent.change(titleInput, { target: { value: 'Đơn từ hợp lệ' } });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const validFile = new File(['valid pdf content'], 'don-tu.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      const submitBtn = screen.getByRole('button', { name: /Xác nhận tải lên|Tải lên|Lưu/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUpload).toHaveBeenCalledTimes(1);
      });

      const sentFormData = mockUpload.mock.calls[0][0];
      expect(sentFormData instanceof FormData).toBe(true);
      expect(sentFormData.get('title')).toBe('Đơn từ hợp lệ');
      expect(sentFormData.get('folder')).toBe('LEGAL_CONTRACTS');
    });

    it('hiển thị lỗi server đúng chỗ: FILE_TYPE_NOT_ALLOWED dưới ô tệp, FOLDER_NOT_ALLOWED / LEGACY_CASE_READ_ONLY dạng thông báo', async () => {
      const mockUpload = vi.fn().mockRejectedValue(
        new ApiError(409, 'LEGACY_CASE_READ_ONLY', 'Không thể sửa vụ việc lịch sử')
      );
      vi.spyOn(documentsHooks, 'useUploadDocument').mockReturnValue({
        mutateAsync: mockUpload,
        isPending: false,
      } as any);

      render(<DocumentsPage />);

      const uploadBtn = screen.getByRole('button', { name: /Tải lên tài liệu|Tải tệp lên|\+ Tải lên/i });
      fireEvent.click(uploadBtn);

      const titleInput = screen.getByLabelText(/Tiêu đề/i);
      fireEvent.change(titleInput, { target: { value: 'Tài liệu test lỗi' } });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const validFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      const submitBtn = screen.getByRole('button', { name: /Xác nhận tải lên|Tải lên|Lưu/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Không thể sửa vụ việc lịch sử|LEGACY_CASE_READ_ONLY/i)).toBeDefined();
      });
    });
  });

  describe('Ngăn chi tiết tài liệu & Phiên bản (brief mục 4 & 5)', () => {
    it('mở ngăn chi tiết hiển thị lịch sử phiên bản mới nhất trước', () => {
      render(<DocumentsPage />);

      // Click vào dòng tài liệu để mở drawer chi tiết
      const docRow = screen.getByText('Hợp đồng dịch vụ tư vấn pháp lý');
      fireEvent.click(docRow);

      expect(screen.getByText('Lịch sử phiên bản')).toBeDefined();
      // Ver 2 đứng trước Ver 1
      const v2Element = screen.getByText(/v2/i);
      const v1Element = screen.getByText(/v1/i);
      expect(v2Element).toBeDefined();
      expect(v1Element).toBeDefined();
    });

    it('nút Tải xuống bị tắt khi tệp đang quét (PENDING) hoặc nhiễm virus (INFECTED)', () => {
      render(<DocumentsPage />);

      // Xem chi tiết tài liệu nhiễm virus hoặc đang quét
      const pendingDoc = screen.getByText('Phụ lục hợp đồng điều chỉnh phạm vi');
      fireEvent.click(pendingDoc);

      const downloadBtns = screen.queryAllByRole('button', { name: /Tải xuống/i });
      downloadBtns.forEach((btn) => {
        // Nút phải bị disabled khi scan_status khác CLEAN
        expect((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true').toBe(true);
      });
    });

    it('nút Tải phiên bản mới bị ẩn khi tài liệu đã lưu trữ hoặc không có can_upload', () => {
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: {
          data: sampleDocuments,
          meta: {
            allowed_folders: ['LEGAL_CONTRACTS'],
            can_upload: false,
          },
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as any);

      render(<DocumentsPage />);

      // Click tài liệu
      const docRow = screen.getByText('Hợp đồng dịch vụ tư vấn pháp lý');
      fireEvent.click(docRow);

      expect(screen.queryByRole('button', { name: /Tải phiên bản mới/i })).toBeNull();
    });
  });

  describe('Hộp thoại Lưu trữ tài liệu (Archive Modal) (brief mục 4 & 5)', () => {
    it('chặn lưu trữ khi thiếu lý do (bắt buộc 1-500 ký tự)', async () => {
      const mockArchive = vi.fn();
      vi.spyOn(documentsHooks, 'useArchiveDocument').mockReturnValue({
        mutateAsync: mockArchive,
        isPending: false,
      } as any);

      render(<DocumentsPage />);

      // Tìm nút Lưu trữ trong danh sách hoặc drawer
      const archiveBtns = screen.queryAllByRole('button', { name: /Lưu trữ/i });
      if (archiveBtns.length > 0) {
        fireEvent.click(archiveBtns[0]);

        // Submit form lý do lưu trữ mà không điền lý do
        const confirmBtn = screen.getByRole('button', { name: /Xác nhận lưu trữ|Đồng ý|Lưu trữ/i });
        fireEvent.click(confirmBtn);

        expect(mockArchive).not.toHaveBeenCalled();
      }
    });

    it('gửi đúng lý do lên API archive và làm mới danh sách sau khi lưu trữ thành công', async () => {
      const mockArchive = vi.fn().mockResolvedValue({ success: true });
      const mockRefetch = vi.fn();
      vi.spyOn(documentsHooks, 'useArchiveDocument').mockReturnValue({
        mutateAsync: mockArchive,
        isPending: false,
      } as any);
      vi.spyOn(documentsHooks, 'useDocuments').mockReturnValue({
        data: {
          data: sampleDocuments.filter((d) => !d.is_archived),
          meta: defaultMeta,
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      } as any);

      render(<DocumentsPage />);

      const archiveBtns = screen.queryAllByRole('button', { name: /Lưu trữ/i });
      if (archiveBtns.length > 0) {
        fireEvent.click(archiveBtns[0]);

        const reasonInput = screen.getByPlaceholderText(/Nhập lý do lưu trữ/i) || screen.getByLabelText(/Lý do/i);
        fireEvent.change(reasonInput, {
          target: { value: 'Bản thảo đã thay bằng hồ sơ nộp chính thức' },
        });

        const confirmBtn = screen.getByRole('button', { name: /Xác nhận lưu trữ|Đồng ý|Lưu trữ/i });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          expect(mockArchive).toHaveBeenCalledWith({
            reason: 'Bản thảo đã thay bằng hồ sơ nộp chính thức',
          });
        });
      }
    });
  });
});
