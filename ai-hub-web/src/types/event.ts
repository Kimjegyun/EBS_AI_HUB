export interface PersonalEvent {
  id: string;
  user_id: string;
  event_date: string;
  event_time?: string;
  event_name: string;
  description?: string;
  location?: string;
  is_all_day: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePersonalEventInput {
  event_date: string;
  event_time?: string;
  event_name: string;
  description?: string;
  location?: string;
  is_all_day?: boolean;
}

export interface UpdatePersonalEventInput {
  event_date?: string;
  event_time?: string;
  event_name?: string;
  description?: string;
  location?: string;
  is_all_day?: boolean;
}

export type NotificationType = 'popup' | 'email' | 'sms';

export interface EventNotification {
  id: string;
  event_id: string;
  user_id: string;
  notification_type: NotificationType;
  notification_time: string;
  is_sent: boolean;
  sent_at?: string;
  created_at: string;
}

export interface CreateEventNotificationInput {
  event_id: string;
  notification_type: NotificationType;
  notification_time: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  enable_popup: boolean;
  enable_email: boolean;
  enable_sms: boolean;
  email_address?: string;
  phone_number?: string;
  default_reminder_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateNotificationPreferencesInput {
  enable_popup?: boolean;
  enable_email?: boolean;
  enable_sms?: boolean;
  email_address?: string;
  phone_number?: string;
  default_reminder_minutes?: number;
}

// Combined type for calendar display
export interface CalendarEvent {
  id: string;
  date: string;
  time?: string;
  name: string;
  description?: string;
  type: 'personal' | 'company' | 'holiday';
  isAllDay: boolean;
  location?: string;
}

// Made with Bob