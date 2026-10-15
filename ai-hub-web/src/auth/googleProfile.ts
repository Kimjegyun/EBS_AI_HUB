export type GoogleProfile = { headquarters: string; department: string; name: string; phone: string }
export function profileError(profile: GoogleProfile): string | null {
  if (Object.values(profile).some(value => !value.trim())) return '본부, 부서, 이름, 연락처를 모두 입력해 주세요.'
  if (!/^[+\d\s()-]+$/.test(profile.phone) || !/^\d{9,15}$/.test(profile.phone.replace(/\D/g, ''))) return '연락처를 올바른 전화번호로 입력해 주세요.'
  return null
}
export function readGoogleProfile(meta: Record<string, unknown>): GoogleProfile {
  const text = (key: string) => typeof meta[key] === 'string' ? meta[key] as string : ''
  return { headquarters: text('headquarters'), department: text('department'), name: text('display_name') || text('full_name') || text('name'), phone: text('contact_phone') }
}
