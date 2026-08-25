/**
 * Biweekly Friday Holiday Generator
 * Generates company holidays for every other Friday starting from June 12, 2026
 */

// Use UTC to avoid timezone issues
const BIWEEKLY_START_DATE = new Date(Date.UTC(2026, 5, 12)); // June 12, 2026 (month is 0-indexed)

/**
 * Check if a date string (YYYY-MM-DD) is a biweekly Friday holiday
 */
export function isBiweeklyFriday(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  
  // Check if it's a Friday (5 = Friday)
  if (date.getUTCDay() !== 5) return false;

  // Calculate days difference from start date
  const timeDiff = date.getTime() - BIWEEKLY_START_DATE.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  
  // Must be on or after start date
  if (daysDiff < 0) return false;
  
  // Check if it's on a biweekly cycle (every 14 days)
  return daysDiff % 14 === 0;
}

/**
 * Generate biweekly Friday holidays for a given year and month
 */
export function generateBiweeklyFridaysForMonth(year: number, month: number): string[] {
  const holidays: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isBiweeklyFriday(dateStr)) {
      holidays.push(dateStr);
    }
  }

  return holidays;
}

/**
 * Generate biweekly Friday holidays for a date range
 */
export function generateBiweeklyFridaysForRange(startDate: string, endDate: string): string[] {
  const holidays: string[] = [];
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  let current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (isBiweeklyFriday(dateStr)) {
      holidays.push(dateStr);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return holidays;
}

/**
 * Get the next biweekly Friday from a given date
 */
export function getNextBiweeklyFriday(fromDate: Date = new Date()): string {
  let current = new Date(fromDate);
  current.setUTCDate(current.getUTCDate() + 1); // Start from tomorrow

  // Find next Friday
  while (current.getUTCDay() !== 5) {
    current.setUTCDate(current.getUTCDate() + 1);
  }

  // Check if it's a biweekly Friday, if not, go to next Friday
  let dateStr = current.toISOString().split('T')[0];
  while (!isBiweeklyFriday(dateStr)) {
    current.setUTCDate(current.getUTCDate() + 7);
    dateStr = current.toISOString().split('T')[0];
  }

  return dateStr;
}

/**
 * Get all biweekly Fridays for a given year
 */
export function generateBiweeklyFridaysForYear(year: number): string[] {
  const holidays: string[] = [];
  
  for (let month = 1; month <= 12; month++) {
    holidays.push(...generateBiweeklyFridaysForMonth(year, month));
  }

  return holidays;
}

// Made with Bob