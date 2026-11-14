import type { SupabaseClient } from '@supabase/supabase-js'

// Server-side helpers shared by the /api/community/* routes.

/** True when a Postgres/PostgREST error means a column/table doesn't exist
 *  yet — i.e. scripts/community-v3.sql hasn't been run. */
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST200' ||
    /column .* does not exist|relation .* does not exist|Could not find the .* column/i.test(error.message ?? '')
}

/** Unique lowercase @usernames mentioned in text (max 5, matching the
 *  signup username rules: lowercase letters, numbers, underscores, 3+). */
export function extractMentions(text: string): string[] {
  const names = new Set<string>()
  for (const m of text.matchAll(/(^|[^a-z0-9_])@([a-z0-9_]{3,30})/gi)) names.add(m[2].toLowerCase())
  return [...names].slice(0, 5)
}

/** Insert a notification, attaching post_id when the column exists
 *  (community-v3.sql) and silently retrying without it otherwise. Never
 *  throws — a failed notification must not fail the action that caused it. */
export async function notify(
  admin: SupabaseClient,
  n: { user_id: string; message: string; type: string; post_id?: string | null }
) {
  const base = { user_id: n.user_id, message: n.message, type: n.type, read: false, visible_after: new Date().toISOString() }
  try {
    if (n.post_id) {
      const { error } = await admin.from('notifications').insert({ ...base, post_id: n.post_id })
      if (!error) return
      if (!isMissingSchema(error)) return
    }
    await admin.from('notifications').insert(base)
  } catch {
    // ignore
  }
}

/** Notify each @mentioned user (except the author and anyone in `skip`). */
export async function notifyMentions(
  admin: SupabaseClient,
  opts: { text: string; authorId: string; authorName: string; postId: string; where: 'post' | 'comment'; skip?: string[] }
) {
  const names = extractMentions(opts.text)
  if (names.length === 0) return
  const { data: users } = await admin.from('profiles').select('id, username').in('username', names)
  const preview = opts.text.length > 80 ? `${opts.text.slice(0, 80)}…` : opts.text
  for (const u of users ?? []) {
    if (u.id === opts.authorId || opts.skip?.includes(u.id)) continue
    await notify(admin, {
      user_id: u.id,
      type: 'mention',
      post_id: opts.postId,
      message: `@${opts.authorName} mentioned you in a ${opts.where}: "${preview}"`,
    })
  }
}
