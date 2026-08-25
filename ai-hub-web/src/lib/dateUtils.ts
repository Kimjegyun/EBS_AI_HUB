export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  return {
    startDate: toDateKey(year, month, 1),
    endDate: toDateKey(year, month, new Date(year, month, 0).getDate()),
  }
}
