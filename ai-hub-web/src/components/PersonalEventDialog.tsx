import { useState, useEffect } from 'react';
import { eventService } from '../lib/eventService';
import type { PersonalEvent, CreatePersonalEventInput } from '../types/event';
import { Icon } from './Icon';

interface PersonalEventDialogProps {
  open: boolean;
  onClose: () => void;
  onEventChange: () => void;
  event?: PersonalEvent;
  initialDate?: string;
}

export default function PersonalEventDialog({
  open,
  onClose,
  onEventChange,
  event,
  initialDate,
}: PersonalEventDialogProps) {
  const [formData, setFormData] = useState<CreatePersonalEventInput>({
    event_date: initialDate || new Date().toISOString().split('T')[0],
    event_time: '',
    event_name: '',
    description: '',
    location: '',
    is_all_day: false,
  });

  const [notifications, setNotifications] = useState<{
    popup: boolean;
    email: boolean;
    sms: boolean;
    reminderMinutes: number;
  }>({
    popup: true,
    email: false,
    sms: false,
    reminderMinutes: 30,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setFormData({
        event_date: event.event_date,
        event_time: event.event_time || '',
        event_name: event.event_name,
        description: event.description || '',
        location: event.location || '',
        is_all_day: event.is_all_day,
      });
    } else if (initialDate) {
      setFormData(prev => ({ ...prev, event_date: initialDate }));
    }
  }, [event, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let savedEvent: PersonalEvent;

      if (event) {
        // Update existing event
        savedEvent = await eventService.updatePersonalEvent(event.id, formData);
      } else {
        // Create new event
        savedEvent = await eventService.createPersonalEvent(formData);

        // Create notifications if enabled
        const eventDateTime = new Date(`${formData.event_date}T${formData.event_time || '00:00'}`);
        const notificationTime = new Date(eventDateTime.getTime() - notifications.reminderMinutes * 60000);

        const notificationPromises: Promise<any>[] = [];

        if (notifications.popup) {
          notificationPromises.push(
            eventService.createEventNotification({
              event_id: savedEvent.id,
              notification_type: 'popup',
              notification_time: notificationTime.toISOString(),
            })
          );
        }

        if (notifications.email) {
          notificationPromises.push(
            eventService.createEventNotification({
              event_id: savedEvent.id,
              notification_type: 'email',
              notification_time: notificationTime.toISOString(),
            })
          );
        }

        if (notifications.sms) {
          notificationPromises.push(
            eventService.createEventNotification({
              event_id: savedEvent.id,
              notification_type: 'sms',
              notification_time: notificationTime.toISOString(),
            })
          );
        }

        await Promise.all(notificationPromises);
      }

      onEventChange();
      handleClose();
    } catch (err) {
      console.error('Failed to save event:', err);
      setError(err instanceof Error ? err.message : '일정 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event) return;

    if (!confirm('이 일정을 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      await eventService.deletePersonalEvent(event.id);
      onEventChange();
      handleClose();
    } catch (err) {
      console.error('Failed to delete event:', err);
      setError(err instanceof Error ? err.message : '일정 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      event_date: initialDate || new Date().toISOString().split('T')[0],
      event_time: '',
      event_name: '',
      description: '',
      location: '',
      is_all_day: false,
    });
    setNotifications({
      popup: true,
      email: false,
      sms: false,
      reminderMinutes: 30,
    });
    setError(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <h2 className="font-h2 text-h2 text-on-surface">
            {event ? '일정 수정' : '새 일정 추가'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <Icon name="close" className="text-on-surface-variant" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-4 bg-error-container rounded-lg border border-error">
              <p className="text-error text-body">{error}</p>
            </div>
          )}

          {/* Event Name */}
          <div>
            <label className="block text-label text-on-surface mb-2">
              일정 제목 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.event_name}
              onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
              className="w-full px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
              placeholder="일정 제목을 입력하세요"
              required
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-label text-on-surface mb-2">
                날짜 <span className="text-error">*</span>
              </label>
              <input
                type="date"
                value={formData.event_date}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                className="w-full px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="block text-label text-on-surface mb-2">시간</label>
              <input
                type="time"
                value={formData.event_time}
                onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                disabled={formData.is_all_day}
                className="w-full px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
          </div>

          {/* All Day */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_all_day"
              checked={formData.is_all_day}
              onChange={(e) => setFormData({ ...formData, is_all_day: e.target.checked, event_time: '' })}
              className="w-5 h-5 rounded border-outline text-primary focus:ring-primary"
            />
            <label htmlFor="is_all_day" className="text-body text-on-surface cursor-pointer">
              종일 일정
            </label>
          </div>

          {/* Location */}
          <div>
            <label className="block text-label text-on-surface mb-2">장소</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
              placeholder="장소를 입력하세요"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-label text-on-surface mb-2">설명</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary resize-none"
              rows={3}
              placeholder="일정에 대한 설명을 입력하세요"
            />
          </div>

          {/* Notifications (only for new events) */}
          {!event && (
            <div className="border-t border-outline-variant pt-4">
              <h3 className="font-h3 text-h3 text-on-surface mb-3">알림 설정</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="popup"
                    checked={notifications.popup}
                    onChange={(e) => setNotifications({ ...notifications, popup: e.target.checked })}
                    className="w-5 h-5 rounded border-outline text-primary focus:ring-primary"
                  />
                  <label htmlFor="popup" className="text-body text-on-surface cursor-pointer flex items-center gap-2">
                    <Icon name="notifications" className="text-primary" />
                    팝업 알림
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="email"
                    checked={notifications.email}
                    onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
                    className="w-5 h-5 rounded border-outline text-primary focus:ring-primary"
                  />
                  <label htmlFor="email" className="text-body text-on-surface cursor-pointer flex items-center gap-2">
                    <Icon name="mail" className="text-secondary" />
                    이메일 알림
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sms"
                    checked={notifications.sms}
                    onChange={(e) => setNotifications({ ...notifications, sms: e.target.checked })}
                    className="w-5 h-5 rounded border-outline text-primary focus:ring-primary"
                  />
                  <label htmlFor="sms" className="text-body text-on-surface cursor-pointer flex items-center gap-2">
                    <Icon name="sms" className="text-warning" />
                    SMS 알림
                  </label>
                </div>

                <div className="ml-7">
                  <label className="block text-label text-on-surface mb-2">알림 시간</label>
                  <select
                    value={notifications.reminderMinutes}
                    onChange={(e) => setNotifications({ ...notifications, reminderMinutes: Number(e.target.value) })}
                    className="px-4 py-2 bg-surface-container-high border border-outline rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value={5}>5분 전</option>
                    <option value={10}>10분 전</option>
                    <option value={15}>15분 전</option>
                    <option value={30}>30분 전</option>
                    <option value={60}>1시간 전</option>
                    <option value={120}>2시간 전</option>
                    <option value={1440}>1일 전</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-outline-variant">
            {event ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 bg-error text-on-error rounded-lg font-label hover:bg-error/90 disabled:opacity-50 transition-colors"
              >
                삭제
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg font-label hover:bg-surface-container-highest disabled:opacity-50 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? '저장 중...' : event ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Made with Bob