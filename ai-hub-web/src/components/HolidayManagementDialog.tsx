import { useState, useEffect } from 'react';
import { holidayService } from '../lib/holidayService';
import type { CompanyHoliday, CreateHolidayInput } from '../types/holiday';
import { Icon } from './Icon';

interface HolidayManagementDialogProps {
  open: boolean;
  onClose: () => void;
  onHolidayChange: () => void;
}

export default function HolidayManagementDialog({ open, onClose, onHolidayChange }: HolidayManagementDialogProps) {
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<CompanyHoliday | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [formData, setFormData] = useState<CreateHolidayInput>({
    holiday_date: '',
    holiday_name: '',
    description: '',
    is_recurring: false,
  });

  useEffect(() => {
    if (open) {
      loadHolidays();
    }
  }, [open, selectedYear]);

  const loadHolidays = async () => {
    try {
      setLoading(true);
      setError(null);
      // Includes both admin-defined DB holidays and auto-generated biweekly Fridays
      const data = await holidayService.getHolidaysByYear(selectedYear);
      setHolidays(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingHoliday) {
        await holidayService.updateHoliday(editingHoliday.id, {
          holiday_name: formData.holiday_name,
          description: formData.description,
          is_recurring: formData.is_recurring,
        });
      } else {
        await holidayService.createHoliday(formData);
      }
      
      setShowAddForm(false);
      setEditingHoliday(null);
      setFormData({
        holiday_date: '',
        holiday_name: '',
        description: '',
        is_recurring: false,
      });
      loadHolidays();
      onHolidayChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save holiday');
    }
  };

  const handleEdit = (holiday: CompanyHoliday) => {
    setEditingHoliday(holiday);
    setFormData({
      holiday_date: holiday.holiday_date,
      holiday_name: holiday.holiday_name,
      description: holiday.description || '',
      is_recurring: holiday.is_recurring,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 휴일을 삭제하시겠습니까?')) return;
    
    try {
      await holidayService.deleteHoliday(id);
      loadHolidays();
      onHolidayChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingHoliday(null);
    setFormData({
      holiday_date: '',
      holiday_name: '',
      description: '',
      is_recurring: false,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-surface-container rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <Icon name="event" className="text-primary text-[24px]" />
            <h2 className="font-h2 text-h2 text-on-surface">사내 휴일 관리</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <Icon name="close" className="text-on-surface-variant" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-error-container text-on-error-container rounded-lg flex items-center gap-2">
              <Icon name="error" />
              {error}
            </div>
          )}

          {/* Year Filter & Add Button */}
          <div className="flex items-center justify-between mb-6">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 bg-surface-container-high border border-outline-variant rounded-lg font-label text-label"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors font-label text-label"
              >
                <Icon name="add" />
                휴일 추가
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-surface-container-high rounded-lg border border-outline-variant">
              <h3 className="font-h3 text-h3 text-on-surface mb-4">
                {editingHoliday ? '휴일 수정' : '새 휴일 추가'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-label font-label text-on-surface mb-1">날짜 *</label>
                  <input
                    type="date"
                    value={formData.holiday_date}
                    onChange={(e) => setFormData({ ...formData, holiday_date: e.target.value })}
                    disabled={!!editingHoliday}
                    required
                    className="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-label font-label text-on-surface mb-1">휴일 이름 *</label>
                  <input
                    type="text"
                    value={formData.holiday_name}
                    onChange={(e) => setFormData({ ...formData, holiday_name: e.target.value })}
                    required
                    placeholder="예: 사내 휴일"
                    className="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-label font-label text-on-surface mb-1">설명</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="휴일에 대한 추가 설명"
                    rows={2}
                    className="w-full px-3 py-2 bg-surface-container border border-outline-variant rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_recurring" className="text-label font-label text-on-surface">
                    반복 휴일 (매년 같은 날짜)
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors font-label text-label"
                  >
                    {editingHoliday ? '수정' : '추가'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container-highest transition-colors font-label text-label"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Holidays List */}
          {loading ? (
            <div className="text-center py-8 text-on-surface-variant">로딩 중...</div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant">
              {selectedYear}년에 등록된 휴일이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {holidays.map((holiday) => {
                const isBiweekly = holiday.id.startsWith('biweekly-');
                const isDefault = holiday.id.startsWith('default-');
                const isLocked = isBiweekly || isDefault;
                return (
                  <div
                    key={holiday.id}
                    className={`
                      flex items-center justify-between p-4 rounded-lg border transition-colors
                      ${isLocked
                        ? 'bg-primary/5 border-primary/30'
                        : 'bg-surface-container-high border-outline-variant hover:border-primary'
                      }
                    `}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-h3 text-h3 text-on-surface">{holiday.holiday_name}</span>
                        {isBiweekly && (
                          <span className="px-2 py-0.5 bg-primary text-on-primary rounded text-caption font-caption">
                            자동
                          </span>
                        )}
                        {isDefault && (
                          <span className="px-2 py-0.5 bg-error text-white rounded text-caption font-caption">
                            기본
                          </span>
                        )}
                        {holiday.is_recurring && !isLocked && (
                          <span className="px-2 py-0.5 bg-primary-container text-on-primary-container rounded text-caption font-caption">
                            반복
                          </span>
                        )}
                      </div>
                      <div className="text-body-sm text-on-surface-variant">
                        {formatDate(holiday.holiday_date)}
                        {holiday.description && ` • ${holiday.description}`}
                      </div>
                      {isBiweekly && (
                        <div className="text-caption text-primary mt-1">
                          💡 자동 생성된 격주 휴무입니다
                        </div>
                      )}
                      {isDefault && (
                        <div className="text-caption text-error mt-1">
                          📌 기본 제공 공휴일(법정공휴일/회사 휴일)입니다
                        </div>
                      )}
                    </div>
                    {!isLocked && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(holiday)}
                          className="p-2 rounded-full hover:bg-surface-container transition-colors"
                          title="수정"
                        >
                          <Icon name="edit" className="text-primary text-[18px]" />
                        </button>
                        <button
                          onClick={() => handleDelete(holiday.id)}
                          className="p-2 rounded-full hover:bg-surface-container transition-colors"
                          title="삭제"
                        >
                          <Icon name="delete" className="text-error text-[18px]" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant bg-surface-container-low space-y-2">
          <div className="text-caption text-on-surface-variant">
            💡 <strong>격주 휴무:</strong> 2026년 6월 12일부터 2주 단위로 금요일마다 자동 생성됩니다.
          </div>
          <div className="text-caption text-on-surface-variant">
            📌 <strong>기본 공휴일:</strong> 법정공휴일·회사 휴일은 모든 사용자에게 표시되며 관리자가 추가 휴일을 등록할 수 있습니다.
          </div>
          <div className="text-caption text-on-surface-variant">
            ℹ️ 자동/기본 휴일은 수정·삭제할 수 없습니다. 추가로 등록한 휴일만 관리할 수 있습니다.
          </div>
        </div>
      </div>
    </div>
  );
}

// Made with Bob
