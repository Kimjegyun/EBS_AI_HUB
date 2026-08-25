import type { PersonalEvent, CreatePersonalEventInput, UpdatePersonalEventInput } from '../types/event';
import { getMonthDateRange } from './dateUtils';
import {
  getCurrentUserStorageId,
  getUserScopedItem,
  removeUserScopedItem,
  setUserScopedItem,
} from './userScopedStorage';

const STORAGE_KEY = 'ai-hub-personal-events-v1';

/**
 * Local storage based personal event service
 * Stores user's personal events in browser localStorage
 */
export const localEventService = {
  /**
   * Get all personal events from localStorage
   */
  getPersonalEvents(): PersonalEvent[] {
    try {
      const data = getUserScopedItem(STORAGE_KEY);
      if (!data) return [];
      
      const events = JSON.parse(data) as PersonalEvent[];
      return events.sort((a, b) => {
        const dateCompare = a.event_date.localeCompare(b.event_date);
        if (dateCompare !== 0) return dateCompare;
        return (a.event_time || '').localeCompare(b.event_time || '');
      });
    } catch (err) {
      console.error('Failed to load personal events from localStorage:', err);
      return [];
    }
  },

  /**
   * Get personal events for a specific date range
   */
  getPersonalEventsByDateRange(startDate: string, endDate: string): PersonalEvent[] {
    const allEvents = this.getPersonalEvents();
    return allEvents.filter(event => 
      event.event_date >= startDate && event.event_date <= endDate
    );
  },

  /**
   * Get personal events for a specific month
   */
  getPersonalEventsByMonth(year: number, month: number): PersonalEvent[] {
    const { startDate, endDate } = getMonthDateRange(year, month);
    return this.getPersonalEventsByDateRange(startDate, endDate);
  },

  /**
   * Create a new personal event
   */
  createPersonalEvent(input: CreatePersonalEventInput): PersonalEvent {
    const events = this.getPersonalEvents();
    
    const newEvent: PersonalEvent = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserStorageId(),
      event_date: input.event_date,
      event_time: input.event_time,
      event_name: input.event_name,
      description: input.description,
      location: input.location,
      is_all_day: input.is_all_day || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    events.push(newEvent);
    this.saveEvents(events);
    return newEvent;
  },

  /**
   * Update an existing personal event
   */
  updatePersonalEvent(id: string, updates: UpdatePersonalEventInput): PersonalEvent | null {
    const events = this.getPersonalEvents();
    const index = events.findIndex(e => e.id === id);
    
    if (index === -1) {
      throw new Error('Event not found');
    }

    const updatedEvent: PersonalEvent = {
      ...events[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    events[index] = updatedEvent;
    this.saveEvents(events);
    return updatedEvent;
  },

  /**
   * Delete a personal event
   */
  deletePersonalEvent(id: string): void {
    const events = this.getPersonalEvents();
    const filtered = events.filter(e => e.id !== id);
    
    if (filtered.length === events.length) {
      throw new Error('Event not found');
    }

    this.saveEvents(filtered);
  },

  /**
   * Get a single event by ID
   */
  getPersonalEventById(id: string): PersonalEvent | null {
    const events = this.getPersonalEvents();
    return events.find(e => e.id === id) || null;
  },

  /**
   * Save events to localStorage
   */
  saveEvents(events: PersonalEvent[]): void {
    try {
      setUserScopedItem(STORAGE_KEY, JSON.stringify(events));
    } catch (err) {
      console.error('Failed to save personal events to localStorage:', err);
      throw new Error('Failed to save events');
    }
  },

  /**
   * Clear all personal events (for testing/reset)
   */
  clearAllEvents(): void {
    removeUserScopedItem(STORAGE_KEY);
  },

  /**
   * Export events as JSON
   */
  exportEvents(): string {
    const events = this.getPersonalEvents();
    return JSON.stringify(events, null, 2);
  },

  /**
   * Import events from JSON
   */
  importEvents(jsonData: string): void {
    try {
      const events = JSON.parse(jsonData) as PersonalEvent[];
      this.saveEvents(events);
    } catch (err) {
      console.error('Failed to import events:', err);
      throw new Error('Invalid JSON data');
    }
  },
};

// Made with Bob
