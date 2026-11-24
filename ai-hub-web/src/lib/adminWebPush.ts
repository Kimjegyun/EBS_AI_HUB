import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim() ?? ''

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

async function adminServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.')
  const scope = new URL(import.meta.env.BASE_URL, window.location.origin).href
  const registration = await navigator.serviceWorker.getRegistration(scope)
  if (registration) return registration
  return navigator.serviceWorker.ready
}

export async function getAdminWebPushState(): Promise<'unsupported' | 'not-configured' | 'denied' | 'enabled' | 'disabled'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await adminServiceWorker()
  return (await registration.pushManager.getSubscription()) ? 'enabled' : 'disabled'
}

export async function enableAdminWebPush(): Promise<void> {
  if (!supabase) throw new Error('AI HUB 인증 연결이 설정되지 않았습니다.')
  if (!VAPID_PUBLIC_KEY) throw new Error('푸시 알림 서버 설정이 아직 완료되지 않았습니다.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.')
  }
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('브라우저 알림 권한을 허용해 주세요.')

  const registration = await adminServiceWorker()
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(VAPID_PUBLIC_KEY) as BufferSource,
  })
  const { error } = await supabase.functions.invoke('register-admin-web-push', {
    body: { subscription: subscription.toJSON() },
  })
  if (error) throw new Error('이 기기를 푸시 알림에 등록하지 못했습니다.')
}

export async function disableAdminWebPush(): Promise<void> {
  const registration = await adminServiceWorker().catch(() => null)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  try {
    await supabase?.functions.invoke('remove-admin-web-push', {
      body: { endpoint: subscription.endpoint },
    })
  } finally {
    await subscription.unsubscribe()
  }
}
