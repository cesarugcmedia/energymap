import { supabase } from '@/lib/supabase'
import { isMissingSchema } from '@/lib/community'

// Profile photos (scripts/profile-v2.sql): stored at avatars/<user_id>/avatar.jpg,
// center-cropped to a square and shrunk to 320px JPEG in the browser so
// uploads stay small. profiles.avatar_url carries a ?v= stamp so a new photo
// isn't hidden behind the old one in caches.

const SIZE = 320

async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  let img: CanvasImageSource & { width: number; height: number }
  if (bitmap) img = bitmap
  else {
    // Older Safari: fall back to an <img> element.
    const el = new Image()
    el.src = URL.createObjectURL(file)
    await el.decode()
    img = el
  }
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap?.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86))
}

export type AvatarResult = { ok: true; url: string | null } | { ok: false; message: string }

export async function uploadAvatar(userId: string, file: File): Promise<AvatarResult> {
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Pick a photo (JPG, PNG or HEIC).' }
  if (file.size > 15 * 1024 * 1024) return { ok: false, message: 'That photo is too big. Try one under 15 MB.' }
  let blob: Blob
  try { blob = await toSquareJpeg(file) } catch { return { ok: false, message: 'Couldn’t read that photo. Try a different one.' } }

  const path = `${userId}/avatar.jpg`
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (upErr) {
    return { ok: false, message: /bucket/i.test(upErr.message) ? 'Profile photos aren’t switched on yet. Check back soon.' : 'Upload failed. Try again.' }
  }
  const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (error) return { ok: false, message: isMissingSchema(error) ? 'Profile photos aren’t switched on yet. Check back soon.' : 'Couldn’t save your photo. Try again.' }
  return { ok: true, url }
}

export async function removeAvatar(userId: string): Promise<AvatarResult> {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
  if (error) return { ok: false, message: 'Couldn’t remove your photo. Try again.' }
  await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`])
  return { ok: true, url: null }
}

// id → { username, avatar_url } for a set of users, via the anon client.
// Tries avatar_url and falls back to usernames only before profile-v2 runs.
export async function fetchProfileLites(ids: string[]): Promise<Map<string, { username: string; avatar: string | null }>> {
  const out = new Map<string, { username: string; avatar: string | null }>()
  if (!ids.length) return out
  let res = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
  if (res.error) res = (await supabase.from('profiles').select('id, username').in('id', ids)) as typeof res
  for (const p of (res.data ?? []) as { id: string; username: string; avatar_url?: string | null }[]) {
    out.set(p.id, { username: p.username, avatar: p.avatar_url ?? null })
  }
  return out
}
