/** Remove the separately displayed headquarters prefix. */
export function surveyDepartment(department: string | undefined, headquarters: string): string {
  const value = department?.trim() || ''
  const prefix = headquarters.trim()
  if (!prefix || !value.startsWith(prefix)) return value
  const remainder = value.slice(prefix.length)
  return /^[\s/>]/.test(remainder) ? remainder.replace(/^[\s/>]+/, '') : value
}
