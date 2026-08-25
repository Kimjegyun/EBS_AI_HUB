import { timingSafeEqual } from 'crypto'

export function secretsEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(provided, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
