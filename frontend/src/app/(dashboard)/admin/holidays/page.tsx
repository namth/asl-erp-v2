'use client';

import React, { useState, useEffect } from 'react';
import { useMe } from '@/hooks/use-auth';
import { useHolidays, useSaveHolidays } from '@/hooks/use-workflows';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import type { HolidayDay } from '@/types/workflow';

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export default function HolidaysPage() {
  const { data: currentUser } = useMe();
  const isAdmin = currentUser?.system_role === 'ADMIN';
  const isManager = currentUser?.system_role === 'MANAGER';
  const hasAccess = isAdmin || isManager;

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [days, setDays] = useState<HolidayDay[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    data: holidaysData,
    isLoading,
    isError,
    refetch,
  } = useHolidays(selectedYear);

  const saveMutation = useSaveHolidays();

  useEffect(() => {
    if (holidaysData?.days) {
      setDays(holidaysData.days);
    }
  }, [holidaysData]);

  if (!hasAccess && currentUser) {
    return (
      <div className="p-8">
        <ErrorState
          title="Không có quyền truy cập"
          message="Vui lòng liên hệ Quản trị viên để được cấp quyền."
        />
      </div>
    );
  }

  const handleOpenAdd = () => {
    setNewDate(`${selectedYear}-01-01`);
    setNewName('');
    setErrorMessage(null);
    setIsAdding(true);
  };

  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedDate = newDate.trim();
    const trimmedName = newName.trim();

    if (!trimmedDate) {
      setErrorMessage('Vui lòng chọn ngày nghỉ');
      return;
    }

    if (!trimmedName) {
      setErrorMessage('Vui lòng nhập tên dịp lễ');
      return;
    }

    // Kiểm tra trùng ngày
    if (days.some((d) => d.date === trimmedDate)) {
      setErrorMessage('Ngày nghỉ đã tồn tại trong danh sách');
      return;
    }

    setDays([...days, { date: trimmedDate, name: trimmedName }].sort((a, b) => a.date.localeCompare(b.date)));
    setIsAdding(false);
  };

  const handleDeleteDay = (dateToDelete: string) => {
    if (!isAdmin) return;
    setDays(days.filter((d) => d.date !== dateToDelete));
  };

  const handleSaveHolidays = async () => {
    if (!isAdmin) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await saveMutation.mutateAsync({
        year: selectedYear,
        days,
      });
      setSuccessMessage('Đã lưu danh sách ngày nghỉ lễ thành công');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setErrorMessage('Có lỗi xảy ra khi lưu ngày nghỉ lễ');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Tiêu đề & thanh công cụ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Cấu hình ngày nghỉ lễ & lịch làm việc
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Thiết lập danh mục ngày nghỉ lễ chính thức để tự động tính thời hạn SLA ngày làm việc cho quy trình
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <label
              htmlFor="holiday-year-select"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Chọn năm áp dụng:
            </label>
            <select
              id="holiday-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-3 py-1.5 text-xs font-medium text-[#002D54] dark:text-[#0082B4] border border-[#002D54]/20 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Thêm ngày nghỉ
              </button>
              <button
                type="button"
                onClick={handleSaveHolidays}
                disabled={saveMutation.isPending}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {errorMessage}
        </div>
      )}

      {/* Modal / Form thêm ngày */}
      {isAdding && isAdmin && (
        <div className="p-4 border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 rounded-xl space-y-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Thêm ngày nghỉ lễ mới
          </h4>
          <form onSubmit={handleConfirmAdd} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="holiday-date-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Ngày nghỉ (YYYY-MM-DD)
                </label>
                <input
                  id="holiday-date-input"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>

              <div>
                <label
                  htmlFor="holiday-name-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tên dịp nghỉ lễ
                </label>
                <input
                  id="holiday-name-input"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Tên dịp lễ"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#002D54] hover:bg-[#002444] rounded-lg shadow-sm"
              >
                Xác nhận thêm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4 Trạng thái giao diện */}
      {isLoading ? (
        <LoadingSkeleton lines={5} className="mt-4" />
      ) : isError ? (
        <ErrorState
          title="Có lỗi xảy ra"
          message="Vui lòng thử lại sau giây lát."
          onRetry={refetch}
        />
      ) : days.length === 0 ? (
        <EmptyState
          title="Chưa có ngày nghỉ nào"
          description={`Vui lòng thêm các ngày nghỉ lễ cho năm ${selectedYear}.`}
        />
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <span>Danh sách ngày nghỉ năm {selectedYear}</span>
            <span>Tổng cộng: <strong className="text-slate-800 dark:text-slate-200">{days.length} ngày</strong></span>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Ngày nghỉ</th>
                <th className="px-4 py-2.5">Tên dịp lễ</th>
                {isAdmin && <th className="px-4 py-2.5 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {days.map((day) => (
                <tr
                  key={day.date}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-medium text-[#002D54] dark:text-[#0082B4]">
                    {day.date}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                    {day.name}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteDay(day.date)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium"
                      >
                        Xoá
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
