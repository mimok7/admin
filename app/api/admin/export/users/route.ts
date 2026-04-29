import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { checkAdmin, fetchAll } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!serviceSupabase) return NextResponse.json({ error: 'service role 미설정' }, { status: 500 });

  try {
    const users = await fetchAll('users', (q) => q.order('created_at', { ascending: false }));
    return NextResponse.json({ ok: true, count: users.length, users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
