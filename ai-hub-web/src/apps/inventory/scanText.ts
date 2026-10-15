// Pure text helpers for scanned codes, kept out of the component file for fast refresh.

/** QR URL과 1차원 바코드 평문을 동일한 자산번호 문자열로 바꿉니다. */
export function extractAssetNoFromScan(decodedText: string): string {
  const raw = decodedText.trim()
  if (!raw) return ''

  try {
    const url = new URL(raw)
    const assetPath = url.pathname.match(/\/asset\/([^/?#]+)/i)
    if (assetPath?.[1]) return decodeURIComponent(assetPath[1]).trim()
    const queryValue = url.searchParams.get('assetNo') || url.searchParams.get('asset') || url.searchParams.get('code')
    if (queryValue) return queryValue.trim()
  } catch {
    // URL이 아닌 일반 바코드 값은 아래에서 그대로 처리합니다.
  }

  // 일부 산업용 스캐너가 붙이는 AIM symbology identifier(예: ]C1)를 제거합니다.
  return raw.replace(/^\][A-Z][0-9]/i, '').replace(/^(?:ASSET|자산번호)\s*[:=]\s*/i, '').trim()
}

/** 현재 ERP의 신·구 자산번호 규칙(영문 2자 + 숫자 9/12자리)인지 확인합니다. */
export function isValidScannedAssetNo(value: string): boolean {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{2}(?:\d{9}|\d{12})$/.test(compact)
}
