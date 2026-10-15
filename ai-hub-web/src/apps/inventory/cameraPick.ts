// Android phones expose several rear lenses (main, ultra-wide, macro, depth).
// `facingMode: environment` may open one without autofocus, which can never
// sharpen a label held close. We check once, switch to a rear camera that
// reports continuous autofocus, and remember it on this device.

const KEY = 'inventory-camera-device'

export const isAndroid = () => /Android/i.test(navigator.userAgent)

export function savedCameraId(): string | null {
  try { return localStorage.getItem(KEY) || null } catch { return null }
}

export function rememberCamera(deviceId: string) {
  try { localStorage.setItem(KEY, deviceId) } catch { /* Not remembered; checked again next time. */ }
}

export function forgetCamera() {
  try { localStorage.removeItem(KEY) } catch { /* Nothing stored. */ }
}

export function hasContinuousFocus(caps: MediaTrackCapabilities | undefined): boolean {
  return ((caps as { focusMode?: string[] } | undefined)?.focusMode ?? []).includes('continuous')
}

const FRONT_LABEL = /front|user|전면|셀피|selfie/i

/** Opens each other rear camera briefly; returns the first with continuous autofocus. */
export async function findAutofocusBackCamera(skipDeviceId?: string): Promise<string | null> {
  let devices: MediaDeviceInfo[]
  try { devices = await navigator.mediaDevices.enumerateDevices() } catch { return null }
  const candidates = devices.filter((device) => device.kind === 'videoinput'
    && device.deviceId && device.deviceId !== skipDeviceId && !FRONT_LABEL.test(device.label))
  for (const device of candidates) {
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } })
      const track = stream.getVideoTracks()[0]
      if (track?.getSettings().facingMode === 'user') continue
      if (hasContinuousFocus(track?.getCapabilities?.())) return device.deviceId
    } catch { /* Busy or unavailable lens; try the next one. */ }
    finally { stream?.getTracks().forEach((track) => track.stop()) }
  }
  return null
}
