/** 네트워크 등으로 Promise가 끝나지 않을 때 UI가 멈추지 않도록 제한합니다. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage = '요청 시간이 초과되었습니다.',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
