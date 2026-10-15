type FocusMode = 'continuous' | 'single-shot'
type FocusCamera = {
  getRunningTrackCapabilities(): MediaTrackCapabilities
  applyVideoConstraints(constraints: MediaTrackConstraints): Promise<void>
}

/** Optional focus controls must never prevent a camera from scanning. */
export function createCameraFocus(camera: FocusCamera, shouldRefocus = () => true) {
  let disposed = false
  let busy = false
  let restore: ReturnType<typeof setTimeout> | undefined
  let pending: { point?: { x: number; y: number }; resolve: (accepted: boolean) => void } | null = null
  let focusPoint = { x: 0.5, y: 0.5 }
  let modes: string[] = []
  try {
    modes = (camera.getRunningTrackCapabilities() as MediaTrackCapabilities & { focusMode?: string[] }).focusMode ?? []
  } catch { /* Some browsers leave focus control to the camera. */ }

  const apply = async (mode: FocusMode | null, point?: { x: number; y: number }): Promise<boolean> => {
    if (disposed) return false
    try {
      await camera.applyVideoConstraints({ advanced: [{
        ...(mode ? { focusMode: mode } : {}),
        ...(point ? { pointsOfInterest: [point] } : {}),
      } as MediaTrackConstraintSet] })
      return !disposed
    } catch {
      // A device may support focus but reject a requested metering point.
      if (point && mode && !disposed) return apply(mode)
      return false
    }
  }

  const automaticMode = modes.includes('continuous') ? 'continuous'
    : modes.includes('single-shot') ? 'single-shot' : null

  const finish = () => {
    busy = false
    const next = pending
    pending = null
    if (next) void refocus(next.point).then(next.resolve)
  }

  const refocus = async (point?: { x: number; y: number }): Promise<boolean> => {
    // Unknown advanced constraints can silently succeed on Safari without focusing.
    if (disposed || !automaticMode) return false
    if (busy) return new Promise<boolean>((resolve) => {
      pending?.resolve(false)
      pending = { point, resolve }
    })
    busy = true
    clearTimeout(restore)
    if (point) focusPoint = point
    const mode = modes.includes('single-shot') ? 'single-shot' : automaticMode
    const accepted = await apply(mode, point)
    if (mode === 'single-shot' && automaticMode === 'continuous' && !disposed) {
      restore = setTimeout(() => {
        void apply('continuous', focusPoint).finally(finish)
      }, 800)
    } else finish()
    return accepted
  }

  return {
    supported: automaticMode !== null,
    async start() {
      if (!automaticMode || disposed) return false
      // Set continuous autofocus once and let the camera track distance itself.
      // Re-applying it on a timer (formerly every 3.5s, together with the exposure
      // and white-balance profile) restarts the focus search on many Android
      // cameras, so labels kept going soft just as they were being read.
      return apply(automaticMode)
    },
    /** User-driven refocus only (tap, zoom change, returning to the app). */
    refocus: (point?: { x: number; y: number }) => (shouldRefocus() ? refocus(point) : Promise.resolve(false)),
    dispose() {
      disposed = true
      clearTimeout(restore)
      pending?.resolve(false)
      pending = null
    },
  }
}
