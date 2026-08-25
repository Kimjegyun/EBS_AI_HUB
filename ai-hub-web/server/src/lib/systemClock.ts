const TIME_ZONE = 'Asia/Seoul'

export type SystemClock = {
  timeZone: string
  isoDate: string
  weekday: string
  display: string
}

export function readSystemClock(now = new Date()): SystemClock {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  const weekday = pick('weekday')
  const hour = pick('hour')
  const minute = pick('minute')
  const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

  return {
    timeZone: TIME_ZONE,
    isoDate,
    weekday,
    display: `${year}년 ${month}월 ${day}일 ${weekday} ${hour}:${minute} (${TIME_ZONE})`,
  }
}
