// Korean legal public holidays + traditional holidays (명절), generated per year.
//
// Solar (fixed-date) holidays are computed directly. Lunar-based holidays
// (설날 / 추석 / 부처님오신날) vary each year, so their Gregorian dates are
// tabulated for the supported range. Substitute holidays (대체공휴일) are then
// derived from the current statutory rules.

export type KoreanHoliday = { date: string; name: string; description: string }

// Gregorian date of the lunar holiday DAY for each year.
// 설날 = 음력 1/1, 추석 = 음력 8/15 (each observed as a 3-day 연휴),
// 부처님오신날 = 음력 4/8.
const SEOLLAL: Record<number, string> = {
  2024: '2024-02-10',
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-07',
  2028: '2028-01-27',
  2029: '2029-02-13',
  2030: '2030-02-03',
}
const CHUSEOK: Record<number, string> = {
  2024: '2024-09-17',
  2025: '2025-10-06',
  2026: '2026-09-25',
  2027: '2027-09-15',
  2028: '2028-10-03',
  2029: '2029-09-22',
  2030: '2030-09-12',
}
const BUDDHA: Record<number, string> = {
  2024: '2024-05-15',
  2025: '2025-05-05',
  2026: '2026-05-24',
  2027: '2027-05-13',
  2028: '2028-05-02',
  2029: '2029-05-20',
  2030: '2030-05-09',
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// 0 = Sunday ... 6 = Saturday
function dow(iso: string): number {
  return new Date(iso + 'T00:00:00').getDay()
}

function isWeekend(iso: string): boolean {
  const w = dow(iso)
  return w === 0 || w === 6
}

type SubRule =
  | 'none' // never substituted (신정, 현충일, 제헌절)
  | 'weekend' // substituted if on Sat/Sun (삼일절, 광복절, 개천절, 한글날, 부처님오신날, 크리스마스)
  | 'weekendOrHoliday' // substituted if on Sat/Sun or overlapping another holiday (어린이날)

type Single = { date: string; name: string; description: string; rule: SubRule }
type Group = { name: string; days: string[] } // substituted if any day is Sunday (설날, 추석)

function buildSingles(year: number): Single[] {
  const s: Single[] = [
    { date: `${year}-01-01`, name: '신정', description: '법정공휴일', rule: 'none' },
    { date: `${year}-03-01`, name: '삼일절', description: '법정공휴일', rule: 'weekend' },
    { date: `${year}-05-05`, name: '어린이날', description: '법정공휴일', rule: 'weekendOrHoliday' },
    { date: `${year}-06-06`, name: '현충일', description: '법정공휴일', rule: 'none' },
    { date: `${year}-08-15`, name: '광복절', description: '법정공휴일', rule: 'weekend' },
    { date: `${year}-10-03`, name: '개천절', description: '법정공휴일', rule: 'weekend' },
    { date: `${year}-10-09`, name: '한글날', description: '법정공휴일', rule: 'weekend' },
    { date: `${year}-12-25`, name: '크리스마스', description: '법정공휴일', rule: 'weekend' },
  ]
  // 제헌절: restored as a public holiday from 2026.
  if (year >= 2026) {
    s.push({ date: `${year}-07-17`, name: '제헌절', description: '법정공휴일', rule: 'none' })
  }
  const buddha = BUDDHA[year]
  if (buddha) {
    s.push({ date: buddha, name: '부처님오신날', description: '명절', rule: 'weekend' })
  }
  // Known one-off statutory holidays.
  if (year === 2026) {
    s.push({ date: '2026-06-03', name: '전국동시지방선거', description: '법정공휴일', rule: 'none' })
  }
  return s
}

function buildGroups(year: number): Group[] {
  const g: Group[] = []
  const seollal = SEOLLAL[year]
  if (seollal) {
    g.push({ name: '설날', days: [addDays(seollal, -1), seollal, addDays(seollal, 1)] })
  }
  const chuseok = CHUSEOK[year]
  if (chuseok) {
    g.push({ name: '추석', days: [addDays(chuseok, -1), chuseok, addDays(chuseok, 1)] })
  }
  return g
}

/** All Korean public/traditional holidays for the given year (incl. 대체공휴일). */
export function getKoreanHolidaysForYear(year: number): KoreanHoliday[] {
  const singles = buildSingles(year)
  const groups = buildGroups(year)

  const occupied = new Set<string>()
  const countByDate = new Map<string, number>()
  const bump = (d: string) => {
    occupied.add(d)
    countByDate.set(d, (countByDate.get(d) ?? 0) + 1)
  }
  for (const s of singles) bump(s.date)
  for (const g of groups) for (const d of g.days) bump(d)

  const result: KoreanHoliday[] = []
  for (const g of groups) {
    g.days.forEach((d, i) => {
      result.push({ date: d, name: i === 1 ? g.name : `${g.name} 연휴`, description: '명절' })
    })
  }
  for (const s of singles) {
    result.push({ date: s.date, name: s.name, description: s.description })
  }

  // Find the next weekday that isn't already a holiday/substitute.
  const nextFree = (from: string): string => {
    let d = addDays(from, 1)
    while (isWeekend(d) || occupied.has(d)) d = addDays(d, 1)
    occupied.add(d)
    return d
  }

  // Collect substitute requests, then resolve them in chronological order so
  // chained holidays don't claim the same make-up day.
  const requests: { order: string; from: string }[] = []
  for (const g of groups) {
    if (g.days.some((d) => dow(d) === 0)) {
      requests.push({ order: g.days[2], from: g.days[2] })
    }
  }
  for (const s of singles) {
    let blocked = false
    if (s.rule === 'weekend') blocked = isWeekend(s.date)
    else if (s.rule === 'weekendOrHoliday')
      blocked = isWeekend(s.date) || (countByDate.get(s.date) ?? 0) > 1
    if (blocked) requests.push({ order: s.date, from: s.date })
  }
  requests.sort((a, b) => a.order.localeCompare(b.order))

  const subs: KoreanHoliday[] = requests.map((r) => ({
    date: nextFree(r.from),
    name: '대체공휴일',
    description: '대체공휴일',
  }))

  return [...result, ...subs].sort((a, b) => a.date.localeCompare(b.date))
}
