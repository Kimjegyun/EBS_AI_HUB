type Range = { min: number; max: number; step?: number }
type LabelCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[]
  whiteBalanceMode?: string[]
  exposureCompensation?: Range
  torch?: boolean
}
type Camera = {
  getRunningTrackCapabilities(): MediaTrackCapabilities
  getRunningTrackSettings(): MediaTrackSettings
  applyVideoConstraints(constraints: MediaTrackConstraints): Promise<void>
}

// A starting profile for reflective white labels, not a universal optimum.
export const LABEL_EXPOSURE_EV = -0.7
/** The same acquisition profile on Android and iOS, following phone orientation. */
export function labelVideoConstraints(portrait: boolean): MediaTrackConstraints {
  return {
    facingMode: { ideal: 'environment' },
    width: { ideal: portrait ? 1080 : 1920 },
    height: { ideal: portrait ? 1920 : 1080 },
    frameRate: { ideal: 30 },
    advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
  }
}
export function exposureStep(range: Range, desired: number): number | null {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) return null
  const clamped = Math.max(range.min, Math.min(range.max, desired))
  const step = range.step
  if (!step || !Number.isFinite(step) || step < 0) return clamped
  return Math.max(range.min, Math.min(range.max, Number((range.min + Math.round((clamped - range.min) / step) * step).toFixed(6))))
}

export async function configureLabelCamera(camera: Camera, active = () => true, resetTorch = true) {
  const retained: Record<string, unknown> = {}
  let exposureEV: number | null = null
  let caps: LabelCapabilities
  try { caps = camera.getRunningTrackCapabilities() as LabelCapabilities } catch { return { retained, exposureEV } }
  const apply = async (settings: Record<string, unknown>, retain = true) => {
    if (!active()) return false
    try {
      await camera.applyVideoConstraints({ advanced: [{ ...retained, ...settings } as MediaTrackConstraintSet] })
      if (retain) Object.assign(retained, settings)
      return true
    } catch { return false }
  }
  // Each optional feature is independent; unsupported controls do not stop scanning.
  if (caps.torch && resetTorch) await apply({ torch: false }, false)
  if (caps.whiteBalanceMode?.includes('continuous')) await apply({ whiteBalanceMode: 'continuous' })
  if (caps.exposureMode?.includes('continuous')) await apply({ exposureMode: 'continuous' })
  const range = caps.exposureCompensation
  if (range && range.min < 0) {
    const target = exposureStep(range, LABEL_EXPOSURE_EV)
    if (target !== null && target < 0 && await apply({ exposureCompensation: target })) {
      try {
        const actual = (camera.getRunningTrackSettings() as MediaTrackSettings & { exposureCompensation?: number }).exposureCompensation
        if (typeof actual === 'number' && Number.isFinite(actual)) exposureEV = actual
      } catch { /* Do not claim a measured exposure when the device omits it. */ }
    }
  }
  return { retained, exposureEV }
}
