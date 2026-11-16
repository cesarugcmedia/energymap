import { supabase } from '@/lib/supabase'
import { FREE_ALERT_LIMIT } from '@/lib/plans'

/** How many more flavors this account can follow (Infinity for Tracker).
 *  The drink_alerts trigger in scripts/tracker-features.sql enforces the same
 *  limit server-side once it's been run; this is the friendly check first. */
export async function alertSlotsLeft(userId: string, isTracker: boolean): Promise<number> {
  if (isTracker) return Infinity
  const { count } = await supabase.from('drink_alerts').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return Math.max(0, FREE_ALERT_LIMIT - (count ?? 0))
}

/** True when a save was refused by the plan-limits trigger. */
export function isAlertLimitError(error: { message?: string } | null | undefined): boolean {
  return !!error && /alert_limit/i.test(error.message ?? '')
}
