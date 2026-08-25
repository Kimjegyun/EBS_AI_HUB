export function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i]
  }
  return diff === 0
}

export async function timingSafeEqualString(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const leftHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(left)))
  const rightHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(right)))
  return timingSafeEqualBytes(leftHash, rightHash)
}
