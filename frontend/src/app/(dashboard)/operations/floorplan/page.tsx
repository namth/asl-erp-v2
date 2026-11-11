'use client';

import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMe } from '@/hooks/use-auth';
import { useDepartments } from '@/hooks/use-admin';
import { useFloorplan, useFloorplanLive } from '@/hooks/use-floorplan';
import { splitSeats } from '@/lib/floorplan';
import type { FloorplanUser } from '@/types/floorplan';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ExecutiveDesk } from '@/components/floorplan/executive-desk';
import { ApprovalLane } from '@/components/floorplan/approval-lane';
import { WorkstationGrid } from '@/components/floorplan/workstation-grid';
import { StaffDrawer } from '@/components/floorplan/staff-drawer';

export default function FloorplanPage() {
  const searchParams = useSearchParams();
  const initialDeptFromUrl = searchParams.get('department_id') || '';

  const { data: currentUser } = useMe();
  const isManager = currentUser?.system_role === 'MANAGER';
  const isExecutive = Boolean(currentUser?.is_executive);

  const { data: departments = [] } = useDepartments();

  const [selectedDeptId, setSelectedDeptId] = useState<string>(initialDeptFromUrl);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState<FloorplanUser | null>(null);

  // Chọn phòng ban hiệu dụng
  const activeDeptId = useMemo(() => {
    if (!isExecutive) return undefined;
    if (selectedDeptId) return selectedDeptId;
    if (departments.length > 0) return departments[0].id;
    return undefined;
  }, [isExecutive, selectedDeptId, departments]);

  const {
    data: floorplanData,
    isLoading,
    isError,
    error,
    refetch,
  } = useFloorplan(activeDeptId, {
    enabled: isManager,
  });

  const { isConnected, reconnect } = useFloorplanLive({
    departmentId: activeDeptId,
    enabled: liveSyncEnabled && isManager,
  });

  // Nếu không phải Manager
  if (!isManager) {
    return (
      <div className="p-8">
        <ErrorState
          title="Không có quyền truy cập"
          message="Bạn cần vai trò Quản lý để xem phân hệ Văn phòng số trực quan."
        />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl w-1/3 animate-pulse" />
        <LoadingSkeleton lines={8} />
      </div>
    );
  }

  // Error state
  if (isError) {
    const errorMsg =
      error instanceof Error ? error.message : 'Có lỗi xảy ra khi tải dữ liệu văn phòng số.';
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorState
          title="Thông báo lỗi"
          message={errorMsg}
          onRetry={() => {
            refetch();
          }}
        />
      </div>
    );
  }

  const stats = floorplanData?.stats || {
    total_staff: 0,
    working_count: 0,
    resting_count: 0,
    pending_approvals_count: 0,
  };
  const department = floorplanData?.department || {
    id: activeDeptId || '',
    name: 'Phòng ban',
    leader: { id: '', name: '', title: '' },
  };

  const hasNoWorkstations =
    !floorplanData || !floorplanData.workstations || floorplanData.workstations.length === 0;

  const { queue, desks } = splitSeats(
    floorplanData || {
      department,
      stats,
      approval_queue: [],
      workstations: [],
    }
  );

  const totalStaff = stats.total_staff || 0;
  const workingCount = stats.working_count || 0;
  const pendingApprovalsCount = stats.pending_approvals_count || 0;
  const occupancyRate =
    totalStaff > 0 ? Math.round((workingCount / totalStaff) * 100) : 0;

  const currentQueueItem = selectedUser && floorplanData?.approval_queue
    ? floorplanData.approval_queue.find((q) => q.user.id === selectedUser.id)
    : undefined;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Banner cảnh báo mất kết nối thời gian thực */}
      {liveSyncEnabled && !isConnected && (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
            <div>
              <h4 className="text-xs font-bold">Mất kết nối thời gian thực</h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Không thể nhận các cập nhật trực tiếp từ máy chủ. Dữ liệu có thể chưa mới nhất.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reconnect}
            className="px-3 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200 hover:bg-amber-300 dark:bg-amber-800 dark:hover:bg-amber-700 rounded-xl transition-colors shadow-sm"
          >
            Kết nối lại
          </button>
        </div>
      )}

      {/* Header bar: Tiêu đề, chọn phòng ban, Live sync toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
            Văn Phòng Số Trực Quan
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Trung tâm quan sát và chỉ huy hoạt động làm việc thời gian thực
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Dropdown phòng ban dành cho Giám đốc */}
          {isExecutive && (
            <div className="flex items-center space-x-2">
              <label
                htmlFor="department-select"
                className="text-xs font-bold text-slate-600 dark:text-slate-400"
              >
                Phòng ban:
              </label>
              <select
                id="department-select"
                value={activeDeptId || ''}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Công tắc Live Sync */}
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-700">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer flex items-center space-x-2">
              <input
                type="checkbox"
                checked={liveSyncEnabled}
                onChange={(e) => setLiveSyncEnabled(e.target.checked)}
                className="rounded border-slate-300 text-[#0082B4] focus:ring-[#0082B4] cursor-pointer"
              />
              <span>Đồng bộ thời gian thực</span>
            </label>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tổng nhân sự</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-1">
              {totalStaff}
            </h3>
          </div>
          <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm">
            NV
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tỷ lệ đang làm việc</p>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {occupancyRate}%
            </h3>
          </div>
          <span className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-300 font-bold text-sm">
            TL
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Hồ sơ chờ duyệt</p>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {pendingApprovalsCount}
            </h3>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-300 font-bold text-sm">
            CD
          </span>
        </div>
      </div>

      {/* Khu vực phòng làm việc 2.5D Isometric hoặc EmptyState */}
      {hasNoWorkstations ? (
        <EmptyState
          title="Chưa có nhân sự nào được phân công vào phòng ban này"
          description="Phòng làm việc hiện chưa có dữ liệu nhân sự hoặc bàn làm việc được kích hoạt."
        />
      ) : (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-6 shadow-inner relative overflow-hidden">
          {/* Bàn Trưởng Phòng */}
          <ExecutiveDesk
            leader={department.leader}
            departmentName={department.name}
          />

          {/* Vạch hàng chờ trình duyệt */}
          <ApprovalLane
            queue={queue}
            onSelectUser={(u) => setSelectedUser(u)}
          />

          {/* Các dãy bàn nhân viên */}
          <WorkstationGrid
            desks={desks}
            onSelectUser={(u) => setSelectedUser(u)}
          />
        </div>
      )}

      {/* Side Drawer chi tiết nhân sự */}
      {selectedUser && (
        <StaffDrawer
          user={selectedUser}
          queueItem={currentQueueItem}
          onClose={() => setSelectedUser(null)}
          onDecideSuccess={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}
