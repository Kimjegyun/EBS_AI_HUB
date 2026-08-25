import type { CompanyHoliday, CreateHolidayInput, UpdateHolidayInput } from '../types/holiday';

const STORAGE_KEY = 'ai-hub-company-holidays-v1';

/**
 * Local storage based company holiday store.
 *
 * Used as a fallback for admin holiday management when Supabase is not
 * configured/reachable. Admin-defined holidays are persisted in the browser so
 * that legal/public holidays and company holidays can still be managed locally.
 *
 * NOTE: localStorage is per-browser. For true cross-user inheritance, the
 * Supabase `company_holidays` table migration must be applied.
 */
export const localHolidayService = {
  getAll(): CompanyHoliday[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as CompanyHoliday[];
    } catch (err) {
      console.error('Failed to read local holidays:', err);
      return [];
    }
  },

  save(list: CompanyHoliday[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error('Failed to save local holidays:', err);
      throw new Error('Failed to save holidays');
    }
  },

  create(input: CreateHolidayInput): CompanyHoliday {
    const list = this.getAll();
    const now = new Date().toISOString();
    const holiday: CompanyHoliday = {
      id: crypto.randomUUID(),
      holiday_date: input.holiday_date,
      holiday_name: input.holiday_name,
      description: input.description,
      is_recurring: input.is_recurring || false,
      created_at: now,
      updated_at: now,
    };
    list.push(holiday);
    this.save(list);
    return holiday;
  },

  update(id: string, updates: UpdateHolidayInput): CompanyHoliday {
    const list = this.getAll();
    const index = list.findIndex(h => h.id === id);
    if (index === -1) {
      throw new Error('Holiday not found');
    }
    list[index] = {
      ...list[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.save(list);
    return list[index];
  },

  delete(id: string): void {
    const list = this.getAll();
    this.save(list.filter(h => h.id !== id));
  },
};

// Made with Bob
