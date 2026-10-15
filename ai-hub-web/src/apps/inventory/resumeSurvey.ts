import type { SurveySession } from './types'
export function belongsToSurveyUser(session: SurveySession, name: string, parentDept: string, dept: string) {
  if (session.parentDept !== parentDept || session.dept.trim() !== dept.trim()) return false
  return session.createdBy === name || Object.values(session.results).some(result => result.verifier === name)
}
// Server timestamps are UTC without a zone ("2026-09-22 07:52:17"); local ones are ISO.
const createdTime = (value: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`) || 0
/**
 * One shared survey per survey department (dataset + survey name + dept): every
 * inspector of that department joins the earliest one instead of creating their own
 * copy, whoever started it. Matches the server's createSession.
 */
export function findContinuingSurvey(sessions: SurveySession[], input: { name: string; datasetId: string; parentDept: string; dept: string; createdBy: string }) {
  return sessions
    .filter(session => session.datasetId === input.datasetId && session.parentDept === input.parentDept
      && session.dept.trim() === input.dept.trim() && session.name.trim() === input.name.trim())
    .sort((a, b) => createdTime(a.createdAt) - createdTime(b.createdAt))[0]
}
