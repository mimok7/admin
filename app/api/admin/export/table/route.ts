import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { checkAdmin, fetchAll } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!serviceSupabase) return NextResponse.json({ error: 'service role 미설정' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') || '').trim();
  if (!name) return NextResponse.json({ error: 'name 파라미터가 필요합니다.' }, { status: 400 });
  // 보안: 영숫자/언더스코어만 허용
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return NextResponse.json({ error: '잘못된 테이블명' }, { status: 400 });
  }

  try {
    const rows = await fetchAll(name);
    return NextResponse.json({ ok: true, table: name, count: rows.length, rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
