import { supabase } from '@/lib/supabase'

// Browser side of Tracker push notifications: subscribe this device through
// the service worker (public/sw.js) and register it with /api/push/subscribe.

export type PushState = 'unavailable' | 'unsupported' | 'ios-install' | 'denied' | 'on' | 'off'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!VAPID) return 'unavailable' // keys not set on this deployment yet
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // iPhone only allows web push from an app added to the Home Screen.
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!supported) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function post(body: unknown) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, status: 401 }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  }).catch(() => null)
  return { ok: !!res?.ok, status: res?.status ?? 0 }
}

/** Asks for permission, subscribes and saves. Returns the resulting state,
 *  or 'not_ready' when the server table hasn't been created yet. */
export async function enablePush(): Promise<PushState | 'not_ready' | 'error'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }))
  const { ok, status } = await post(sub.toJSON())
  if (ok) return 'on'
  await sub.unsubscribe().catch(() => {})
  return status === 503 ? 'not_ready' : 'error'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await post({ endpoint: sub.endpoint, remove: true })
    await sub.unsubscribe().catch(() => {})
  }
  return 'off'
}
