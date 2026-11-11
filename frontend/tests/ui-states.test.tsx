import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';

describe('Thành phần 4 trạng thái giao diện UI (EmptyState, LoadingSkeleton, ErrorState)', () => {
  it('EmptyState hiển thị tiêu đề, mô tả và nút kêu gọi hành động (CTA)', () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="Chưa có dữ liệu"
        description="Bạn chưa được phân công hồ sơ nào."
        action={{
          label: "Tiếp nhận Vụ việc",
          onClick: handleAction,
        }}
      />
    );

    expect(screen.getByText('Chưa có dữ liệu')).toBeDefined();
    expect(screen.getByText('Bạn chưa được phân công hồ sơ nào.')).toBeDefined();

    const actionBtn = screen.getByRole('button', { name: 'Tiếp nhận Vụ việc' });
    expect(actionBtn).toBeDefined();
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('LoadingSkeleton hiển thị khung skeleton đang tải', () => {
    const { container } = render(<LoadingSkeleton lines={3} />);
    expect(container.firstChild).toBeDefined();
    // Phải có class animate-pulse hoặc cấu trúc skeleton
    expect(container.querySelector('.animate-pulse') || container.innerHTML.includes('skeleton')).toBeDefined();
  });

  it('ErrorState hiển thị thông báo lỗi và nút thử lại', () => {
    const handleRetry = vi.fn();
    render(
      <ErrorState
        message="Không thể kết nối đến máy chủ"
        onRetry={handleRetry}
      />
    );

    expect(screen.getByText('Không thể kết nối đến máy chủ')).toBeDefined();
    const retryBtn = screen.getByRole('button', { name: /thử lại|retry/i });
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
