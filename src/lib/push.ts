import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side web push (Tracker restock notifications). Needs
// NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, plus the
// push_subscriptions table from scripts/tracker-features.sql. Without either,
// sending is a silent no-op — the in-app notification still happens.

let configured: boolean | null = null

export function pushConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return (configured = false)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://ampedmap.com', pub, priv)
  return (configured = true)
}

export type PushPayload = { title: string; body: string; url: string; tag?: string }

/** Sends one payload per user to every device they've subscribed. Expired
 *  subscriptions (404/410 from the push service) are deleted. Never throws. */
export async function sendPush(admin: SupabaseClient, messages: { userId: string; payload: PushPayload }[]): Promise<void> {
  if (!messages.length || !pushConfigured()) return
  try {
    const ids = [...new Set(messages.map((m) => m.userId))]
    const { data: subs, error } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', ids)
    if (error || !subs?.length) return
    await Promise.all(messages.flatMap((m) =>
      subs.filter((s) => s.user_id === m.userId).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m.payload), { TTL: 6 * 3600 })
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
        }
      })
    ))
  } catch {
    // push is best-effort
  }
}

/** Only Tracker (and admin) accounts get push. */
export async function trackerIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const { data } = await admin.from('profiles').select('id, tier, is_admin').in('id', userIds)
  return new Set((data ?? []).filter((p) => p.is_admin || p.tier === 'tracker' || p.tier === 'admin').map((p) => p.id))
}
