/** AIGC API Token only — not Tencent Cloud SecretId/SecretKey. */
export function normalizeTencentApiKey(raw: string): string {
  let key = raw.replace(/^\uFEFF/, '').trim()
  key = key.replace(/^authorization\s*:\s*/i, '').trim()
  key = key.replace(/^bearer\s+/i, '').trim()
  key = key
    .replace(/^(?:tencent\s+)?(?:aigc\s+)?api\s*(?:키|토큰|token)\s*[:：]?\s*/i, '')
    .trim()
  key = key.replace(/^(?:키|토큰)\s*[:：]\s*/i, '').trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  return key.replace(/\s+/g, '')
}

export function describeTencentKeyProblem(raw: string): string | null {
  const key = normalizeTencentApiKey(raw)
  if (!key) {
    return 'Tencent API 키가 비어 있습니다. 칸 이름 말고 Token 값만 붙여넣으세요.'
  }
  if ([...key].some((ch) => ch.charCodeAt(0) > 127)) {
    return '키에 한글이나 유니코드가 들어 있습니다. CreateAigcApiToken으로 발급한 Token 값만 붙여넣으세요.'
  }
  if (/^[ai]kid/i.test(key)) {
    return '지금 넣은 값은 Tencent Cloud SecretId(IKID/AKID)입니다. 텍스트 생성 API는 이 키를 받지 않습니다. VOD CreateAigcApiToken으로 발급한 ApiToken만 넣으세요.'
  }
  if (/^sk-proj-|^sk-svcacct-|^sk-or-/i.test(key)) {
    return 'OpenAI 또는 OpenRouter API 키입니다. Tencent VOD CreateAigcApiToken 응답의 ApiToken을 넣으세요.'
  }
  if (key.length < 12) {
    return 'Token이 너무 짧습니다. CreateAigcApiToken으로 발급된 ApiToken 전체를 붙여넣으세요.'
  }
  if (/^secretid\s*=/i.test(raw) || /^secretkey\s*=/i.test(raw)) {
    return 'Tencent Cloud SecretId/SecretKey가 아닙니다. AIGC API Token만 입력하세요.'
  }
  return null
}
