import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user : null
}

export async function DELETE(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  const { error } = await supabaseAdmin.from('waitlist').delete().eq('email', email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data } = await supabaseAdmin
    .from('waitlist')
    .select('email, created_at, invited_at')
    .order('created_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  // Always generate a fresh token so old links expire on resend
  const newToken = crypto.randomUUID()
  const { error: updateError } = await supabaseAdmin
    .from('waitlist')
    .update({ invite_token: newToken, invited_at: new Date().toISOString() })
    .eq('email', email)
  if (updateError) {
    return NextResponse.json({ error: 'Could not generate invite' }, { status: 500 })
  }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/invite/accept?token=${newToken}`

  const { error: sendError } = await resend.emails.send({
    from: 'AmpedMap <no-reply@ampedmap.com>',
    to: email,
    subject: "You're invited to Amped Map ⚡",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:16px;border:1px solid rgba(34,197,94,0.15);overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0f0f1a;border:1.5px solid rgba(34,197,94,0.4);border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:20px;">⚡</td>
                  <td style="padding-left:12px;font-size:18px;font-weight:700;color:#ffffff;">AmpedMap</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">You're invited! 🎉</p>
              <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.6;">
                You've been granted early access to AmpedMap — the fastest way to find energy drinks near you. Click below to get in.
              </p>
              <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display:inline-block;background:#22c55e;color:#000000;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;">
                      Accept Invite →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">
                This link is personal — please don't share it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">
                You signed up for the AmpedMap waitlist at ampedmap.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  })

  if (sendError) {
    console.error('Resend error:', sendError)
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
