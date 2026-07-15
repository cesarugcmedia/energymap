// Signs/verifies the waitlist invite cookie so middleware can validate it
// without a DB round-trip on every request, while still preventing forgery
// (previously the cookie was only checked against a UUID-format regex).
const encoder = new TextEncoder()

function getSecret(): string {
  const secret = process.env.INVITE_COOKIE_SECRET
  if (!secret) throw new Error('INVITE_COOKIE_SECRET is not set')
  return secret
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signInviteToken(token: string): Promise<string> {
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(token))
  return `${token}.${toHex(sig)}`
}

export async function verifyInviteToken(cookieValue: string): Promise<boolean> {
  const dotIndex = cookieValue.lastIndexOf('.')
  if (dotIndex === -1) return false
  const token = cookieValue.slice(0, dotIndex)
  const sig = cookieValue.slice(dotIndex + 1)
  try {
    const key = await getKey()
    const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(token))
    return toHex(expected) === sig
  } catch {
    // Misconfigured secret — fail closed rather than crashing every request
    console.error('verifyInviteToken: INVITE_COOKIE_SECRET is not set')
    return false
  }
}
