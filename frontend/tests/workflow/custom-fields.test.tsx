import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CustomFieldsEditor } from '@/components/workflow/custom-fields-editor';
import * as workflowHooks from '@/hooks/use-workflows';

describe('Trường Động Loại Vụ Việc - Custom Fields (§3.3a & brief mục 4, 5)', () => {
  const matterTypeId = 'mt-shtt-01';

  const initialFields = [
    {
      key: 'so_don_dang_ky',
      label: 'Số đơn đăng ký',
      type: 'text' as const,
      required: true,
    },
    {
      key: 'hinh_thuc_nop',
      label: 'Hình thức nộp đơn',
      type: 'select' as const,
      required: false,
      options: ['Trực tiếp', 'Trực tuyến'],
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(workflowHooks, 'useCustomFields').mockReturnValue({
      data: initialFields,
      isLoading: false,
      isError: false,
    } as any);

    vi.spyOn(workflowHooks, 'useSaveCustomFields').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true }),
      isPending: false,
    } as any);
  });

  it('hiển thị danh sách các trường động hiện có với key, nhãn và loại trường', () => {
    render(<CustomFieldsEditor matterTypeId={matterTypeId} readOnly={false} />);

    expect(screen.getByText(/Số đơn đăng ký/i)).toBeDefined();
    expect(screen.getByText(/so_don_dang_ky/i)).toBeDefined();
    expect(screen.getByText(/Hình thức nộp đơn/i)).toBeDefined();
    expect(screen.getByText(/hinh_thuc_nop/i)).toBeDefined();
  });

  it('thêm trường động mới và kiểm tra quy tắc định dạng key: snake_case duy nhất', async () => {
    render(<CustomFieldsEditor matterTypeId={matterTypeId} readOnly={false} />);

    const addBtn = screen.getByRole('button', { name: /thêm trường( động)?/i });
    fireEvent.click(addBtn);

    // Điền key không phải snake_case (VD: có dấu cách hoặc camelCase)
    const keyInput = screen.getByPlaceholderText(/VD: so_giay_phep|key_truong/i) || screen.getByLabelText(/mã trường|key/i);
    fireEvent.change(keyInput, { target: { value: 'soGiayPhepKhongHopLe' } });

    const labelInput = screen.getByPlaceholderText(/nhãn hiển thị/i) || screen.getByLabelText(/tên trường|nhãn/i);
    fireEvent.change(labelInput, { target: { value: 'Số giấy phép' } });

    const saveFieldBtn = screen.getByRole('button', { name: /lưu trường|xác nhận/i });
    fireEvent.click(saveFieldBtn);

    // Hệ thống chặn và báo lỗi snake_case
    expect(
      screen.getByText(/key phải ở dạng snake_case|chỉ chứa chữ thường và dấu gạch dưới/i)
    ).toBeDefined();

    // Điền key trùng với trường đã có
    fireEvent.change(keyInput, { target: { value: 'so_don_dang_ky' } });
    fireEvent.click(saveFieldBtn);

    // Hệ thống chặn và báo lỗi trùng key
    expect(
      screen.getByText(/key đã tồn tại|mã trường bị trùng/i)
    ).toBeDefined();
  });

  it('loại trường "select" bắt buộc phải có ít nhất 1 lựa chọn (options >= 1)', async () => {
    render(<CustomFieldsEditor matterTypeId={matterTypeId} readOnly={false} />);

    const addBtn = screen.getByRole('button', { name: /thêm trường( động)?/i });
    fireEvent.click(addBtn);

    const keyInput = screen.getByPlaceholderText(/VD: so_giay_phep|key_truong/i) || screen.getByLabelText(/mã trường|key/i);
    fireEvent.change(keyInput, { target: { value: 'loai_tai_san' } });

    const typeSelect = screen.getByLabelText(/loại dữ liệu|kiểu trường/i);
    fireEvent.change(typeSelect, { target: { value: 'select' } });

    // Không thêm options nào và bấm lưu
    const saveFieldBtn = screen.getByRole('button', { name: /lưu trường|xác nhận/i });
    fireEvent.click(saveFieldBtn);

    // Bị chặn vì thiếu lựa chọn
    expect(
      screen.getByText(/select bắt buộc có ít nhất 1 lựa chọn|cần nhập ít nhất một tuỳ chọn/i)
    ).toBeDefined();
  });

  it('lưu toàn bộ danh sách trường động gọi PUT /workflows/matter-types/{id}/custom-fields', async () => {
    const mockSave = vi.fn().mockResolvedValue({ success: true });
    vi.spyOn(workflowHooks, 'useSaveCustomFields').mockReturnValue({
      mutateAsync: mockSave,
      isPending: false,
    } as any);

    render(<CustomFieldsEditor matterTypeId={matterTypeId} readOnly={false} />);

    const saveAllBtn = screen.getByRole('button', { name: /lưu danh sách trường|lưu cấu hình/i });
    fireEvent.click(saveAllBtn);

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith({
        matterTypeId,
        fields: initialFields,
      });
    });
  });

  it('ở chế độ readOnly (khi người xem là MANAGER): ẩn các nút thêm, sửa, xoá và lưu', () => {
    render(<CustomFieldsEditor matterTypeId={matterTypeId} readOnly={true} />);

    expect(screen.queryByRole('button', { name: /thêm trường/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /lưu danh sách trường/i })).toBeNull();
  });
});
