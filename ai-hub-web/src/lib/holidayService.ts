import { supabase } from './supabase';
import type { CompanyHoliday, CreateHolidayInput, UpdateHolidayInput } from '../types/holiday';
import { localHolidayService } from './localHolidayService';
import {
  generateBiweeklyFridaysForRange,
  generateBiweeklyFridaysForYear,
} from './biweeklyHolidayGenerator';
import { getKoreanHolidaysForYear, type KoreanHoliday } from './koreanHolidays';
import { getMonthDateRange } from './dateUtils';

/**
 * Built-in COMPANY default holidays shown to ALL users. National legal/
 * traditional holidays are generated separately (see ./koreanHolidays). These
 * are defined in code so that every account inherits them for display, even
 * without a configured Supabase backend. Admins can add more via the holiday
 * management dialog (persisted to Supabase, or localStorage as a fallback).
 * Default entries are read-only.
 */
const DEFAULT_HOLIDAYS: ReadonlyArray<{
  date: string;
  name: string;
  description: string;
}> = [
  { date: '2026-06-22', name: '창립기념일', description: '회사 휴일' },
];

function makeDefaultHoliday(d: { date: string; name: string; description: string }): CompanyHoliday {
  return {
    id: `default-${d.date}`,
    holiday_date: d.date,
    holiday_name: d.name,
    description: d.description,
    is_recurring: false,
    created_at: '',
    updated_at: '',
  };
}

// National holidays use a `default-kr-` prefix so the management UI treats them
// as read-only (same as other default holidays). The name is included to keep
// ids unique when two holidays share a date (e.g. 어린이날 + 부처님오신날).
function makeKoreanHoliday(h: KoreanHoliday): CompanyHoliday {
  return {
    id: `default-kr-${h.date}-${h.name}`,
    holiday_date: h.date,
    holiday_name: h.name,
    description: h.description,
    is_recurring: false,
    created_at: '',
    updated_at: '',
  };
}

/**
 * Build the full set of code-defined default holidays (company + national)
 * that fall within the inclusive [startDate, endDate] range. National holidays
 * are generated for every year the range spans.
 */
function getDefaultsForRange(startDate: string, endDate: string): CompanyHoliday[] {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const out: CompanyHoliday[] = DEFAULT_HOLIDAYS.map(makeDefaultHoliday);
  for (let year = startYear; year <= endYear; year++) {
    for (const h of getKoreanHolidaysForYear(year)) {
      out.push(makeKoreanHoliday(h));
    }
  }
  return out;
}

/**
 * Merge code defaults with stored (admin) holidays. A stored holiday on a given
 * date replaces ALL default holidays on that same date; otherwise multiple
 * defaults per date are preserved (e.g. overlapping national holidays).
 */
function mergeWithStored(defaults: CompanyHoliday[], stored: CompanyHoliday[]): CompanyHoliday[] {
  const storedDates = new Set(stored.map(h => h.holiday_date));
  const keptDefaults = defaults.filter(d => !storedDates.has(d.holiday_date));
  return [...keptDefaults, ...stored].sort(byDateAsc);
}

function expandRecurringHolidays(stored: CompanyHoliday[], startDate: string, endDate: string): CompanyHoliday[] {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const expanded: CompanyHoliday[] = [];

  for (const holiday of stored) {
    expanded.push(holiday);
    if (!holiday.is_recurring) continue;

    const monthDay = holiday.holiday_date.slice(4);
    for (let year = startYear; year <= endYear; year++) {
      const recurringDate = `${year}${monthDay}`;
      if (recurringDate === holiday.holiday_date) continue;
      expanded.push({
        ...holiday,
        id: `${holiday.id}-recurring-${year}`,
        holiday_date: recurringDate,
      });
    }
  }

  return expanded;
}

const BIWEEKLY_HOLIDAY_NAME = '격주 휴무';

/**
 * Build virtual (auto-generated) biweekly Friday holidays for the given dates,
 * excluding any dates already covered by default/admin holidays.
 *
 * Biweekly Fridays are a pure client-side computation, so they must always be
 * available regardless of whether Supabase is configured or reachable.
 */
function buildBiweeklyHolidays(dates: string[], existing: CompanyHoliday[]): CompanyHoliday[] {
  const now = new Date().toISOString();
  return dates
    .filter(date => !existing.some(h => h.holiday_date === date))
    .map(date => ({
      id: `biweekly-${date}`,
      holiday_date: date,
      holiday_name: BIWEEKLY_HOLIDAY_NAME,
      description: '회사 정기 휴무일',
      is_recurring: true,
      created_at: now,
      updated_at: now,
    }));
}

const byDateAsc = (a: CompanyHoliday, b: CompanyHoliday) =>
  a.holiday_date.localeCompare(b.holiday_date);

/**
 * Read admin-managed holidays from Supabase when available, otherwise from the
 * local store. Never throws — falls back gracefully.
 */
async function getStoredHolidays(): Promise<CompanyHoliday[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('company_holidays')
        .select('*')
        .order('holiday_date', { ascending: true });

      if (!error && data) {
        return data;
      }
      if (error) {
        console.warn('Could not fetch holidays from DB, using local store:', error.message);
      }
    } catch (err) {
      console.warn('Company holidays DB unavailable, using local store:', err);
    }
  }
  return localHolidayService.getAll();
}

export const holidayService = {
  /**
   * All holidays (default + admin-managed) for the current year, excluding auto
   * biweekly Fridays.
   */
  async getHolidays(): Promise<CompanyHoliday[]> {
    const stored = await getStoredHolidays();
    const year = new Date().getFullYear();
    const defaults = getDefaultsForRange(`${year}-01-01`, `${year}-12-31`);
    return mergeWithStored(defaults, stored);
  },

  /**
   * Get all holidays for a given year, including auto-generated biweekly Fridays.
   */
  async getHolidaysByYear(year: number): Promise<CompanyHoliday[]> {
    const stored = await getStoredHolidays();
    const defaults = getDefaultsForRange(`${year}-01-01`, `${year}-12-31`);
    const inYear = mergeWithStored(defaults, stored).filter(
      h => h.holiday_date.slice(0, 4) === String(year)
    );
    const biweekly = buildBiweeklyHolidays(generateBiweeklyFridaysForYear(year), inYear);
    return [...inYear, ...biweekly].sort(byDateAsc);
  },

  /**
   * Get holidays for a specific date range (includes biweekly Fridays).
   */
  async getHolidaysByDateRange(startDate: string, endDate: string): Promise<CompanyHoliday[]> {
    const stored = await getStoredHolidays();
    const expandedStored = expandRecurringHolidays(stored, startDate, endDate);
    const defaults = getDefaultsForRange(startDate, endDate);
    const inRange = mergeWithStored(defaults, expandedStored).filter(
      h => h.holiday_date >= startDate && h.holiday_date <= endDate
    );
    const biweekly = buildBiweeklyHolidays(
      generateBiweeklyFridaysForRange(startDate, endDate),
      inRange
    );
    return [...inRange, ...biweekly].sort(byDateAsc);
  },

  /**
   * Get holidays for a specific year and month (includes biweekly Fridays).
   */
  async getHolidaysByMonth(year: number, month: number): Promise<CompanyHoliday[]> {
    const { startDate, endDate } = getMonthDateRange(year, month);
    return this.getHolidaysByDateRange(startDate, endDate);
  },

  /**
   * Create a new holiday (admin only). Persists to Supabase if available,
   * otherwise to the local store.
   */
  async createHoliday(holiday: CreateHolidayInput): Promise<CompanyHoliday> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('company_holidays')
          .insert({
            holiday_date: holiday.holiday_date,
            holiday_name: holiday.holiday_name,
            description: holiday.description,
            is_recurring: holiday.is_recurring || false,
          })
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        console.warn('Create holiday in DB failed, falling back to local store:', error?.message);
      } catch (err) {
        console.warn('Create holiday DB error, falling back to local store:', err);
      }
    }
    return localHolidayService.create(holiday);
  },

  /**
   * Update an existing holiday (admin only). Default/auto holidays are read-only.
   */
  async updateHoliday(id: string, updates: UpdateHolidayInput): Promise<CompanyHoliday> {
    if (id.startsWith('default-') || id.startsWith('biweekly-')) {
      throw new Error('기본/자동 생성 휴일은 수정할 수 없습니다.');
    }

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('company_holidays')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) {
          return data;
        }
        console.warn('Update holiday in DB failed, falling back to local store:', error?.message);
      } catch (err) {
        console.warn('Update holiday DB error, falling back to local store:', err);
      }
    }
    return localHolidayService.update(id, updates);
  },

  /**
   * Delete a holiday (admin only). Default/auto holidays are read-only.
   */
  async deleteHoliday(id: string): Promise<void> {
    if (id.startsWith('default-') || id.startsWith('biweekly-')) {
      throw new Error('기본/자동 생성 휴일은 삭제할 수 없습니다.');
    }

    if (supabase) {
      try {
        const { error } = await supabase.from('company_holidays').delete().eq('id', id);
        if (!error) {
          return;
        }
        console.warn('Delete holiday in DB failed, falling back to local store:', error.message);
      } catch (err) {
        console.warn('Delete holiday DB error, falling back to local store:', err);
      }
    }
    localHolidayService.delete(id);
  },

  /**
   * Check if a specific date is a holiday (includes defaults and biweekly).
   */
  async isHoliday(date: string): Promise<boolean> {
    const holiday = await this.getHolidayByDate(date);
    return holiday !== null;
  },

  /**
   * Get holiday by date (includes defaults and biweekly Fridays).
   */
  async getHolidayByDate(date: string): Promise<CompanyHoliday | null> {
    const holidays = await this.getHolidaysByDateRange(date, date);
    return holidays.find(h => h.holiday_date === date) ?? null;
  },
};

// Made with Bob
