import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';
import { exec } from 'child_process';
import { promisify } from 'util';

async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!serviceSupabase) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY 미설정', status: 500 };
  }

  let requesterId: string | null = null;
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearerToken) {
    const { data, error } = await serviceSupabase.auth.getUser(bearerToken);
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) {
    const response = NextResponse.next();
    const supabase = await createSupabaseServerClient(response);
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) requesterId = data.user.id;
  }
  if (!requesterId) return { ok: false, error: '로그인이 필요합니다.', status: 401 };

  const { data: me, error } = await serviceSupabase
    .from('users')
    .select('role')
    .eq('id', requesterId)
    .maybeSingle();
  if (error || me?.role !== 'admin') return { ok: false, error: '관리자 권한이 필요합니다.', status: 403 };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdmin(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseDbUrl = process.env.SUPABASE_DB_URL;
    if (!supabaseDbUrl) {
      return NextResponse.json(
        { error: 'SUPABASE_DB_URL이 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    // psql을 사용하여 public schema의 모든 테이블 조회
    const execPromise = promisify(exec);
    const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    
    try {
      const { stdout } = await execPromise(
        `psql "${supabaseDbUrl}" -t -c "${query}"`,
        { env: { ...process.env, PGSSLMODE: 'require' }, timeout: 10000 }
      );

      const tables = stdout
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('_'))
        .sort();

      return NextResponse.json({
        ok: true,
        count: tables.length,
        tables: tables,
      });
    } catch (psqlError: any) {
      // psql 명령 실패 시 기본 테이블 목록 반환
      console.error('psql 오류:', psqlError.message);
      const defaultTables = [
        'users',
        'quotes',
        'quote_items',
        'quote_room_details',
        'reservations',
        'reservation_items',
        'base_prices',
        'car_prices',
        'room_prices',
        'cruise_prices',
        'exchange_rates',
        'notifications',
      ].sort();

      return NextResponse.json({
        ok: true,
        count: defaultTables.length,
        tables: defaultTables,
        note: 'psql을 사용할 수 없어 기본 테이블 목록을 반환합니다',
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 });
  }
}
