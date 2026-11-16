// Opens the phone's share sheet for a link, or copies it where sharing isn't
// available. Link previews come from each route's opengraph-image.tsx.
export async function shareLink(opts: { url: string; title?: string; text?: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ url: opts.url, title: opts.title, text: opts.text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(opts.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
