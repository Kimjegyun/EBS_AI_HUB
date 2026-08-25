import { supabase } from './supabase';
import { localEventService } from './localEventService';
import type {
  PersonalEvent,
  CreatePersonalEventInput,
  UpdatePersonalEventInput,
  EventNotification,
  CreateEventNotificationInput,
  NotificationPreferences,
  UpdateNotificationPreferencesInput,
  CalendarEvent,
} from '../types/event';
import type { CompanyHoliday } from '../types/holiday';
import { getMonthDateRange } from './dateUtils';

export const eventService = {
  /**
   * Get all personal events for the current user.
   * Falls back to localStorage when Supabase is unavailable.
   */
  async getPersonalEvents(): Promise<PersonalEvent[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('personal_events')
          .select('*')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });

        if (!error) {
          return data || [];
        }
        console.warn('Fetch personal events failed, using local store:', error.message);
      } catch (err) {
        console.warn('Personal events DB unavailable, using local store:', err);
      }
    }
    return localEventService.getPersonalEvents();
  },

  /**
   * Get personal events for a specific date range.
   * Falls back to localStorage when Supabase is unavailable.
   */
  async getPersonalEventsByDateRange(startDate: string, endDate: string): Promise<PersonalEvent[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('personal_events')
          .select('*')
          .gte('event_date', startDate)
          .lte('event_date', endDate)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });

        if (!error) {
          return data || [];
        }
        console.warn('Fetch personal events by range failed, using local store:', error.message);
      } catch (err) {
        console.warn('Personal events DB unavailable, using local store:', err);
      }
    }
    return localEventService.getPersonalEventsByDateRange(startDate, endDate);
  },

  /**
   * Get personal events for a specific month
   */
  async getPersonalEventsByMonth(year: number, month: number): Promise<PersonalEvent[]> {
    const { startDate, endDate } = getMonthDateRange(year, month);

    return this.getPersonalEventsByDateRange(startDate, endDate);
  },

  /**
   * Create a new personal event.
   * Falls back to localStorage when Supabase is unavailable.
   */
  async createPersonalEvent(event: CreatePersonalEventInput): Promise<PersonalEvent> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('personal_events')
          .insert({
            event_date: event.event_date,
            event_time: event.event_time,
            event_name: event.event_name,
            description: event.description,
            location: event.location,
            is_all_day: event.is_all_day || false,
          })
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        console.warn('Create personal event failed, using local store:', error?.message);
      } catch (err) {
        console.warn('Personal events DB unavailable, using local store:', err);
      }
    }
    return localEventService.createPersonalEvent(event);
  },

  /**
   * Update an existing personal event.
   * Falls back to localStorage when Supabase is unavailable.
   */
  async updatePersonalEvent(id: string, updates: UpdatePersonalEventInput): Promise<PersonalEvent> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('personal_events')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        console.warn('Update personal event failed, using local store:', error?.message);
      } catch (err) {
        console.warn('Personal events DB unavailable, using local store:', err);
      }
    }
    const updated = localEventService.updatePersonalEvent(id, updates);
    if (!updated) {
      throw new Error('Event not found');
    }
    return updated;
  },

  /**
   * Delete a personal event.
   * Falls back to localStorage when Supabase is unavailable.
   */
  async deletePersonalEvent(id: string): Promise<void> {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('personal_events')
          .delete()
          .eq('id', id);

        if (!error) {
          return;
        }
        console.warn('Delete personal event failed, using local store:', error.message);
      } catch (err) {
        console.warn('Personal events DB unavailable, using local store:', err);
      }
    }
    localEventService.deletePersonalEvent(id);
  },

  /**
   * Get notifications for an event
   */
  async getEventNotifications(eventId: string): Promise<EventNotification[]> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { data, error } = await supabase
      .from('event_notifications')
      .select('*')
      .eq('event_id', eventId)
      .order('notification_time', { ascending: true });

    if (error) {
      console.error('Error fetching event notifications:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create a notification for an event
   */
  async createEventNotification(notification: CreateEventNotificationInput): Promise<EventNotification> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('event_notifications')
          .insert(notification)
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        console.warn('Create event notification failed (ignored):', error?.message);
      } catch (err) {
        console.warn('Event notification DB unavailable (ignored):', err);
      }
    }
    // No local notification backend — return a stub so event creation still succeeds.
    return {
      id: crypto.randomUUID(),
      event_id: notification.event_id,
      user_id: 'local',
      notification_type: notification.notification_type,
      notification_time: notification.notification_time,
      is_sent: false,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Delete a notification
   */
  async deleteEventNotification(id: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { error } = await supabase
      .from('event_notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting event notification:', error);
      throw error;
    }
  },

  /**
   * Get user's notification preferences
   */
  async getNotificationPreferences(): Promise<NotificationPreferences | null> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching notification preferences:', error);
      throw error;
    }

    return data || null;
  },

  /**
   * Update user's notification preferences
   */
  async updateNotificationPreferences(
    updates: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferences> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        ...updates,
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating notification preferences:', error);
      throw error;
    }

    return data;
  },

  /**
   * Get pending notifications that need to be sent
   */
  async getPendingNotifications(): Promise<EventNotification[]> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('event_notifications')
      .select('*')
      .eq('is_sent', false)
      .lte('notification_time', now)
      .order('notification_time', { ascending: true });

    if (error) {
      console.error('Error fetching pending notifications:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Mark notification as sent
   */
  async markNotificationAsSent(id: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }

    const { error } = await supabase
      .from('event_notifications')
      .update({
        is_sent: true,
        sent_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as sent:', error);
      throw error;
    }
  },

  /**
   * Get combined calendar events (personal + company holidays)
   * @param year - Year to fetch events for
   * @param month - Month to fetch events for
   * @param includeCompanyHolidays - Whether to include company holidays (default: true)
   */
  async getCombinedCalendarEvents(
    year: number,
    month: number,
    includeCompanyHolidays: boolean = true
  ): Promise<CalendarEvent[]> {
    // Personal events and company holidays are independent data sources. A
    // failure in one (e.g. Supabase table missing / RLS) must not prevent the
    // other from rendering — in particular, biweekly Friday holidays are a pure
    // client-side computation and should always show up on the calendar.
    const personalEventsPromise = this.getPersonalEventsByMonth(year, month).catch(err => {
      console.warn('Failed to load personal events:', err);
      return [] as PersonalEvent[];
    });

    const holidaysPromise = includeCompanyHolidays
      ? import('./holidayService')
          .then(m => m.holidayService.getHolidaysByMonth(year, month))
          .catch(err => {
            console.warn('Failed to load company holidays:', err);
            return [] as CompanyHoliday[];
          })
      : Promise.resolve([] as CompanyHoliday[]);

    const [personalEvents, holidays] = await Promise.all([
      personalEventsPromise,
      holidaysPromise,
    ]);

    const calendarEvents: CalendarEvent[] = [
      ...personalEvents.map((event): CalendarEvent => ({
        id: event.id,
        date: event.event_date,
        time: event.event_time,
        name: event.event_name,
        description: event.description,
        type: 'personal',
        isAllDay: event.is_all_day,
        location: event.location,
      })),
      ...holidays.map((holiday): CalendarEvent => ({
        id: holiday.id,
        date: holiday.holiday_date,
        name: holiday.holiday_name,
        description: holiday.description,
        type: 'company',
        isAllDay: true,
      })),
    ];

    return calendarEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      if (!a.time) return -1;
      if (!b.time) return 1;
      return a.time.localeCompare(b.time);
    });
  },
};

// Made with Bob
