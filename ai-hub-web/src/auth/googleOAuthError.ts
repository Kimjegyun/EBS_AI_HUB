/** Read only OAuth error fields, never copy tokens or authorization codes to UI/logs. */
export function googleOAuthError(url: string): string | null {
  const parsed = new URL(url)
  const hash = new URLSearchParams(parsed.hash.slice(1))
  const value = (key: string) => hash.get(key) || parsed.searchParams.get(key) || ''
  const code = value('error_code') || value('error')
  const description = value('error_description')
  if (!code && !description) return null
  if (/invalid_client|client secret|exchange external code/i.test(`${code} ${description}`)) {
    return 'Google 계정 인증을 완료하지 못했습니다. 관리자가 Supabase의 Google Client ID와 Client Secret 설정을 확인해야 합니다. 설정 수정 후 다시 시도해 주세요.'
  }
  if (code === 'access_denied') return 'Google 계정 연결이 취소되었거나 허용되지 않았습니다. 다시 연결해 주세요.'
  return 'Google 인증 서버에서 오류가 발생해 로그인을 완료하지 못했습니다. 관리자에게 Google 로그인 설정 확인을 요청해 주세요.'
}
