'use client';

import React, { useState, useEffect } from 'react';
import { useCustomFields, useSaveCustomFields } from '@/hooks/use-workflows';
import type { CustomField, CustomFieldType } from '@/types/workflow';

interface CustomFieldsEditorProps {
  matterTypeId: string;
  readOnly?: boolean;
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Văn bản (text)',
  number: 'Số (number)',
  date: 'Ngày tháng (date)',
  select: 'Lựa chọn (select)',
  boolean: 'Đúng / Sai (boolean)',
};

export function CustomFieldsEditor({
  matterTypeId,
  readOnly = false,
}: CustomFieldsEditorProps) {
  const { data: serverFields, isLoading } = useCustomFields(matterTypeId);
  const saveMutation = useSaveCustomFields();

  const [fields, setFields] = useState<CustomField[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formType, setFormType] = useState<CustomFieldType>('text');
  const [formRequired, setFormRequired] = useState(false);
  const [formOptionsText, setFormOptionsText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (serverFields) {
      setFields(serverFields);
    }
  }, [serverFields]);

  const handleOpenAdd = () => {
    setFormKey('');
    setFormLabel('');
    setFormType('text');
    setFormRequired(false);
    setFormOptionsText('');
    setErrorMessage(null);
    setIsAdding(true);
  };

  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedKey = formKey.trim();
    const trimmedLabel = formLabel.trim();

    // 1. Kiểm tra snake_case
    const snakeCaseRegex = /^[a-z0-9]+(_[a-z0-9]+)*$/;
    if (!snakeCaseRegex.test(trimmedKey)) {
      setErrorMessage('key phải ở dạng snake_case (chỉ chứa chữ thường và dấu gạch dưới)');
      return;
    }

    // 2. Kiểm tra trùng lặp key
    if (fields.some((f) => f.key === trimmedKey)) {
      setErrorMessage('key đã tồn tại trong danh sách');
      return;
    }

    // 3. Kiểm tra options nếu type là select
    let options: string[] | undefined = undefined;
    if (formType === 'select') {
      const parsedOptions = formOptionsText
        .split('\n')
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);

      if (parsedOptions.length === 0) {
        setErrorMessage('select bắt buộc có ít nhất 1 lựa chọn');
        return;
      }
      options = parsedOptions;
    }

    const finalLabel = trimmedLabel || trimmedKey;

    const newField: CustomField = {
      key: trimmedKey,
      label: finalLabel,
      type: formType,
      required: formRequired,
      options,
    };

    setFields([...fields, newField]);
    setIsAdding(false);
  };

  const handleDeleteField = (keyToDelete: string) => {
    if (readOnly) return;
    setFields(fields.filter((f) => f.key !== keyToDelete));
  };

  const handleSaveAll = async () => {
    if (readOnly) return;
    setErrorMessage(null);
    setSaveSuccessMessage(null);
    try {
      await saveMutation.mutateAsync({
        matterTypeId,
        fields,
      });
      setSaveSuccessMessage('Đã lưu cấu hình trường động thành công');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch {
      setErrorMessage('Có lỗi xảy ra khi lưu danh sách trường');
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 animate-pulse" role="status" aria-label="Đang tải dữ liệu">
        <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
        <div className="h-20 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Trường dữ liệu động theo loại vụ việc
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Khai báo các trường thông tin bổ sung đặc thù khi khởi tạo hồ sơ
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-3 py-1.5 text-xs font-medium text-[#002D54] dark:text-[#0082B4] border border-[#002D54]/20 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Thêm trường động
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#002D54] hover:bg-[#002444] rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu danh sách trường'}
            </button>
          </div>
        )}
      </div>

      {saveSuccessMessage && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
          {saveSuccessMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {errorMessage}
        </div>
      )}

      {/* Modal / Form thêm trường động */}
      {isAdding && !readOnly && (
        <div className="p-4 border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 rounded-xl space-y-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Thêm trường dữ liệu mới
          </h4>
          <form onSubmit={handleSaveField} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="field-key"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Mã trường (key)
                </label>
                <input
                  id="field-key"
                  type="text"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="VD: so_giay_phep"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>

              <div>
                <label
                  htmlFor="field-label"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Tên trường (nhãn)
                </label>
                <input
                  id="field-label"
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Nhãn hiển thị"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="field-type"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Loại dữ liệu
                </label>
                <select
                  id="field-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as CustomFieldType)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                >
                  <option value="text">Văn bản (text)</option>
                  <option value="number">Số (number)</option>
                  <option value="date">Ngày tháng (date)</option>
                  <option value="select">Lựa chọn (select)</option>
                  <option value="boolean">Đúng / Sai (boolean)</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formRequired}
                    onChange={(e) => setFormRequired(e.target.checked)}
                    className="rounded border-slate-300 text-[#002D54] focus:ring-[#002D54]"
                  />
                  <span>Bắt buộc nhập</span>
                </label>
              </div>
            </div>

            {formType === 'select' && (
              <div>
                <label
                  htmlFor="field-options"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Các lựa chọn (Mỗi dòng một lựa chọn)
                </label>
                <textarea
                  id="field-options"
                  rows={3}
                  value={formOptionsText}
                  onChange={(e) => setFormOptionsText(e.target.value)}
                  placeholder="Nhập các lựa chọn..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#002D54]"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
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
                Lưu trường
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Danh sách trường */}
      {fields.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
          Chưa có trường động nào được khai báo cho loại vụ việc này.
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5">Tên trường (Nhãn)</th>
                <th className="px-4 py-2.5">Mã (key)</th>
                <th className="px-4 py-2.5">Kiểu dữ liệu</th>
                <th className="px-4 py-2.5">Bắt buộc</th>
                <th className="px-4 py-2.5">Tuỳ chọn</th>
                {!readOnly && <th className="px-4 py-2.5 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {fields.map((field) => (
                <tr
                  key={field.key}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                    {field.label}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-500 dark:text-slate-400">
                    {field.key}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {FIELD_TYPE_LABELS[field.type] || field.type}
                  </td>
                  <td className="px-4 py-2.5">
                    {field.required ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Có
                      </span>
                    ) : (
                      <span className="text-slate-400">Không</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                    {field.options && field.options.length > 0
                      ? field.options.join(', ')
                      : '—'}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteField(field.key)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
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
