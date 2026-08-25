export async function issueTencentApiToken(input: {
  secretId: string
  secretKey: string
  subAppId: string
}): Promise<{ ok: true; shape: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/tencent/create-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretId: input.secretId.trim(),
        secretKey: input.secretKey.trim(),
        subAppId: input.subAppId.trim(),
      }),
    })
    const payload = (await res.json().catch(() => null)) as
      | { ok?: unknown; shape?: unknown; error?: unknown }
      | null
    if (payload?.ok === true && typeof payload.shape === 'string') {
      return { ok: true, shape: payload.shape }
    }
    if (typeof payload?.error === 'string' && payload.error) {
      return { ok: false, error: payload.error }
    }
    return { ok: false, error: `Token 발급 실패 (${res.status})` }
  } catch (err) {
    return {
      ok: false,
      error: `로컬 서버에 연결하지 못했습니다: ${(err as Error).message}`,
    }
  }
}
