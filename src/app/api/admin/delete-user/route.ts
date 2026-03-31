import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId, requesterId } = await req.json()

  if (!userId || !requesterId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify requester is an admin
  const { data: requester } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', requesterId)
    .single()

  if (!requester?.is_admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Delete from Supabase Auth (cascades to profiles via FK)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
