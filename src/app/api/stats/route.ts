import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const [{ count: stores }, { count: drinks }] = await Promise.all([
    supabaseAdmin.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabaseAdmin.from('drinks').select('id', { count: 'exact', head: true }),
  ])
  return NextResponse.json({ stores: stores ?? 0, drinks: drinks ?? 0 })
}
