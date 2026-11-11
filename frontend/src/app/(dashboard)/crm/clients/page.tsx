'use client';

import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useClients, useCreateClient } from '@/hooks/use-crm';
import { useMe } from '@/hooks/use-auth';
import { ClientType, ClientCategoryGroup, ClientWarning } from '@/types/crm';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ApiError } from '@/lib/api-client';

const CATEGORY_LABELS: Record<ClientCategoryGroup, string> = {
  NEW: 'Mới',
  POTENTIAL: 'Tiềm năng',
  RETURNING: 'Quay lại',
  STRATEGIC: 'Chiến lược',
  VIP: 'VIP',
};

export default function ClientsPage() {
  const router = useRouter();
  const { data: currentUser } = useMe();
  const isAccountant = currentUser?.system_role === 'ACCOUNTANT';

  // Search, filter & pagination state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      flushSync(() => {
        setDebouncedQuery(searchInput);
        setCurrentPage(1);
      });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch } = useClients({
    q: debouncedQuery || undefined,
    category_group: selectedCategory || undefined,
    page: currentPage,
    limit: 20,
  });

  const createClientMutation = useCreateClient();

  // Create modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientType, setClientType] = useState<ClientType>('ENTERPRISE');
  const [name, setName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [identityNo, setIdentityNo] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [categoryGroup, setCategoryGroup] = useState<ClientCategoryGroup>('NEW');

  // Form errors and warnings
  const [validationTaxError, setValidationTaxError] = useState('');
  const [validationIdentityError, setValidationIdentityError] = useState('');
  const [apiConflictWarnings, setApiConflictWarnings] = useState<ClientWarning[]>([]);

  const resetForm = () => {
    setClientType('ENTERPRISE');
    setName('');
    setTaxCode('');
    setIdentityNo('');
    setRepresentativeName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCategoryGroup('NEW');
    setValidationTaxError('');
    setValidationIdentityError('');
    setApiConflictWarnings([]);
  };

  const handleOpenModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationTaxError('');
    setValidationIdentityError('');
    setApiConflictWarnings([]);

    // Client-side validations
    if (clientType === 'ENTERPRISE') {
      const cleanTax = taxCode.trim();
      const isValidTaxLength = cleanTax.length === 10 || cleanTax.length === 13;
      const isDigitsOnly = /^\d+$/.test(cleanTax);
      if (!isValidTaxLength || !isDigitsOnly) {
        setValidationTaxError('Mã số thuế phải gồm 10 hoặc 13 chữ số');
        return;
      }
    } else if (clientType === 'INDIVIDUAL') {
      const cleanIdentity = identityNo.trim();
      if (!cleanIdentity) {
        setValidationIdentityError('Vui lòng nhập số CCCD hoặc hộ chiếu');
        return;
      }
    }

    try {
      const payload = {
        client_type: clientType,
        name: name.trim(),
        tax_code: clientType === 'ENTERPRISE' ? taxCode.trim() : undefined,
        identity_no: clientType === 'INDIVIDUAL' ? identityNo.trim() : undefined,
        representative_name: representativeName.trim() || undefined,
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim(),
        category_group: categoryGroup,
      };

      const result = await createClientMutation.mutateAsync(payload);

      if (result.warnings && result.warnings.length > 0) {
        setApiConflictWarnings(result.warnings);
      } else {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_TAX_CODE') {
          setValidationTaxError(err.message || 'Mã số thuế này đã tồn tại trên hệ thống');
        } else if (err.code === 'DUPLICATE_IDENTITY_NO') {
          setValidationIdentityError(err.message || 'Số định danh cá nhân này đã tồn tại trên hệ thống');
        } else {
          setValidationTaxError(err.message);
        }
      } else if (err instanceof Error) {
        setValidationTaxError(err.message);
      }
    }
  };

  const totalPages = data?.meta?.total_pages || 1;
  const totalRecords = data?.meta?.total_records || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Quản lý Khách hàng
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Danh bạ khách hàng doanh nghiệp và cá nhân của Hãng luật ASL LAW
          </p>
        </div>

        {/* Create button hidden for ACCOUNTANT */}
        {!isAccountant && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:opacity-95 shadow-sm transition-all"
          >
            Tạo khách hàng mới
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên hoặc mã số thuế..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
          >
            <option value="">Tất cả phân nhóm</option>
            <option value="NEW">Mới</option>
            <option value="POTENTIAL">Tiềm năng</option>
            <option value="RETURNING">Quay lại</option>
            <option value="STRATEGIC">Chiến lược</option>
            <option value="VIP">Khách hàng đặc biệt</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <LoadingSkeleton lines={6} />
        </div>
      ) : isError ? (
        <ErrorState
          title="Thông báo hệ thống"
          message={error?.message || 'Có lỗi xảy ra'}
          onRetry={() => refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Chưa có khách hàng"
          description="Hiện chưa có dữ liệu nào trong danh bạ."
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Tên khách hàng</th>
                    <th className="px-6 py-4 font-semibold">Phân loại</th>
                    <th className="px-6 py-4 font-semibold">MST / Định danh</th>
                    <th className="px-6 py-4 font-semibold">Số điện thoại</th>
                    <th className="px-6 py-4 font-semibold">Nhóm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.items.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/crm/clients/${client.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                        {client.name}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {client.client_type === 'ENTERPRISE'
                          ? 'Doanh nghiệp'
                          : client.client_type === 'INDIVIDUAL'
                          ? 'Cá nhân'
                          : 'Quốc tế'}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {client.tax_code || client.identity_no || '-'}
                      </td>
                      <td className="px-6 py-4">{client.phone}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
                          {CATEGORY_LABELS[client.category_group] || client.category_group}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 gap-3">
              <div>
                Tổng số: <span className="font-semibold text-slate-900 dark:text-slate-100">{totalRecords}</span> khách hàng (Trang {currentPage} / {totalPages})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Tiếp theo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal tạo mới khách hàng */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Tạo thông tin khách hàng mới
              </h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-semibold"
              >
                Đóng
              </button>
            </div>

            {/* Cảnh báo xung đột lợi ích nếu có */}
            {apiConflictWarnings.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 space-y-2">
                <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  Cảnh báo xung đột lợi ích phát hiện
                </h4>
                {apiConflictWarnings.map((w, idx) => (
                  <div key={idx} className="text-xs text-amber-700 dark:text-amber-400">
                    Trùng thông tin với bên đối tụng trong các vụ việc:{' '}
                    <span className="font-mono font-bold">
                      {w.case_codes?.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleCreateClient} noValidate className="space-y-4">
              {/* Loại khách hàng */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Loại khách hàng
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      value="ENTERPRISE"
                      checked={clientType === 'ENTERPRISE'}
                      onChange={() => setClientType('ENTERPRISE')}
                      className="text-[#0082B4] focus:ring-[#0082B4]"
                    />
                    Doanh nghiệp
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      value="INDIVIDUAL"
                      checked={clientType === 'INDIVIDUAL'}
                      onChange={() => setClientType('INDIVIDUAL')}
                      className="text-[#0082B4] focus:ring-[#0082B4]"
                    />
                    Cá nhân
                  </label>
                </div>
              </div>

              {/* Tên khách hàng */}
              <div>
                <label
                  htmlFor="client-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tên khách hàng / Tên công ty
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Công ty Cổ phần Alpha Gate"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                />
              </div>

              {/* MST nếu Doanh nghiệp */}
              {clientType === 'ENTERPRISE' ? (
                <div>
                  <label
                    htmlFor="client-tax"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Mã số thuế (MST)
                  </label>
                  <input
                    id="client-tax"
                    type="text"
                    value={taxCode}
                    onChange={(e) => setTaxCode(e.target.value)}
                    placeholder="10 hoặc 13 số"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                  />
                  {validationTaxError && (
                    <p className="mt-1 text-xs text-red-600 font-medium">
                      {validationTaxError}
                    </p>
                  )}
                </div>
              ) : (
                /* CCCD / Hộ chiếu nếu Cá nhân */
                <div>
                  <label
                    htmlFor="client-identity"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    CCCD / Căn cước / Hộ chiếu
                  </label>
                  <input
                    id="client-identity"
                    type="text"
                    value={identityNo}
                    onChange={(e) => setIdentityNo(e.target.value)}
                    placeholder="Số thẻ căn cước hoặc hộ chiếu"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                  />
                  {validationIdentityError && (
                    <p className="mt-1 text-xs text-red-600 font-medium">
                      {validationIdentityError}
                    </p>
                  )}
                </div>
              )}

              {/* Số điện thoại */}
              <div>
                <label
                  htmlFor="client-phone"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Số điện thoại
                </label>
                <input
                  id="client-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                />
              </div>

              {/* Địa chỉ */}
              <div>
                <label
                  htmlFor="client-address"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Địa chỉ
                </label>
                <input
                  id="client-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Số nhà, đường phố, quận huyện, tỉnh thành"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                />
              </div>

              {/* Phân nhóm */}
              <div>
                <label
                  htmlFor="client-group"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Phân nhóm khách hàng
                </label>
                <select
                  id="client-group"
                  value={categoryGroup}
                  onChange={(e) => setCategoryGroup(e.target.value as ClientCategoryGroup)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0082B4]"
                >
                  <option value="NEW">Mới</option>
                  <option value="POTENTIAL">Tiềm năng</option>
                  <option value="RETURNING">Quay lại</option>
                  <option value="STRATEGIC">Chiến lược</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>

              {/* Nút submit */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={createClientMutation.isPending}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#002D54] to-[#0082B4] hover:opacity-95 disabled:opacity-50 transition-all shadow-sm"
                >
                  {createClientMutation.isPending ? 'Đang lưu...' : 'Xác nhận tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
