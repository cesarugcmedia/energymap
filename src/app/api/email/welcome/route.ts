import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, username, tier } = await req.json()

    if (!email || !username) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Allow internal calls from the Stripe webhook (no auth header), or
    // calls from an authenticated user whose token matches the email being welcomed.
    const authHeader = req.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
      if (error || !user || user.email !== email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } else {
      // No auth header — only allow from same-origin server (Stripe webhook internal fetch)
      const origin = req.headers.get('origin')
      if (origin) {
        // Browser requests always have an origin header; block them without a token
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const tierLabel = tier === 'tracker' ? '🔥 Tracker' : 'Free'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#13131a;border-radius:16px;border:1px solid rgba(34,197,94,0.15);overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#0f0f1a;border:1.5px solid rgba(34,197,94,0.4);border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:20px;">⚡</td>
                  <td style="padding-left:12px;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">AmpedMap</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">Welcome, ${username} 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.6;">
                You're now part of the AmpedMap community — the fastest way to find energy drinks near you.
              </p>

              <table cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:12px;width:100%;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:rgba(34,197,94,0.6);letter-spacing:1.2px;text-transform:uppercase;">Your Plan</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">${tierLabel}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,0.5);">Here's what you can do:</p>
              <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:32px;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#22c55e;margin-right:10px;">✓</span>
                    <span style="font-size:14px;color:rgba(255,255,255,0.7);">Search the map for nearby stores</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="color:#22c55e;margin-right:10px;">✓</span>
                    <span style="font-size:14px;color:rgba(255,255,255,0.7);">Report stock availability at stores</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="color:#22c55e;margin-right:10px;">✓</span>
                    <span style="font-size:14px;color:rgba(255,255,255,0.7);">Get real-time stock alerts</span>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="display:inline-block;background:#22c55e;color:#000000;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.2px;">Open AmpedMap</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">
                You're receiving this because you signed up at ampedmap.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    await resend.emails.send({
      from: 'AmpedMap <no-reply@send.ampedmap.com>',
      to: email,
      subject: 'Welcome to AmpedMap ⚡',
      html,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Welcome email error:', err)
    return NextResponse.json({ error: err?.message ?? 'Failed to send email' }, { status: 500 })
  }
}
