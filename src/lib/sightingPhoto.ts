import { supabase } from '@/lib/supabase'

// Optional photo on a Spotted sighting (+15 XP). Shrunk in the browser to a
// 1280px-long-edge JPEG, uploaded to sighting-photos/<user_id>/<report>.jpg
// (scripts/xp-bounties.sql), then attached to the report by
// POST /api/stock/photo, which checks it's your own recent sighting.

const MAX_EDGE = 1280

async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  let img: CanvasImageSource & { width: number; height: number }
  if (bitmap) img = bitmap
  else {
    const el = new Image()
    el.src = URL.createObjectURL(file)
    await el.decode()
    img = el
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  bitmap?.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82))
}

export type PhotoResult = { ok: true; url: string } | { ok: false; message: string }

export async function addSightingPhoto(userId: string, reportId: string, file: File): Promise<PhotoResult> {
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Pick a photo (JPG, PNG or HEIC).' }
  if (file.size > 20 * 1024 * 1024) return { ok: false, message: 'That photo is too big. Try one under 20 MB.' }
  let blob: Blob
  try { blob = await toJpeg(file) } catch { return { ok: false, message: 'Couldn’t read that photo. Try another.' } }

  const path = `${userId}/${reportId}.jpg`
  const { error: upErr } = await supabase.storage.from('sighting-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '86400' })
  if (upErr) return { ok: false, message: /bucket/i.test(upErr.message) ? 'Photos aren’t switched on yet. Check back soon.' : 'Upload failed. Try again.' }
  const url = supabase.storage.from('sighting-photos').getPublicUrl(path).data.publicUrl

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, message: 'Session expired. Sign in again.' }
  const res = await fetch('/api/stock/photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id: reportId, photo_url: url }),
  }).catch(() => null)
  const body = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok) return { ok: false, message: body.error === 'not_ready' ? 'Photos aren’t switched on yet. Check back soon.' : body.error ?? 'Couldn’t attach the photo.' }
  return { ok: true, url }
}
