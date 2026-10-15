let previousRelease: Promise<void> = Promise.resolve()

/** Camera drivers may never resolve stop(); don't leave every later scan blocked. */
export async function settleCameraOperation(operation: Promise<unknown> | undefined, timeoutMs = 1500) {
  if (!operation) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      operation.catch(() => {}),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Do not open the next camera until the previous instance has released it. */
export function reserveCamera() {
  const ready = previousRelease
  let release!: () => void
  previousRelease = new Promise<void>((resolve) => { release = resolve })
  return { ready, release }
}
