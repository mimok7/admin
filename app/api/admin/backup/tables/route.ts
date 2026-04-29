import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';

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

    // 모든 복원 가능한 테이블 목록
    // 공개 스키마의 모든 사용자 데이터 테이블 포함
    const tables = [
      'users',
      'quotes',
      'quote_items',
      'quote_room_details',
      'reservations',
      'reservation_items',
      'reservation_totals',
      'base_prices',
      'car_prices',
      'car_price_details',
      'room_prices',
      'room_price_details',
      'cruise_prices',
      'cruise_price_details',
      'exchange_rates',
      'notifications',
      'settings',
      'audit_logs',
      'sessions',
      'service_configs',
      'payment_records',
      'sync_logs',
      'user_roles',
      'permissions',
      'tenant_settings',
    ]
      .filter((name: string) => name && !name.startsWith('_'))
      .sort();

    return NextResponse.json({
      ok: true,
      count: tables.length,
      tables: tables,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 });
  }
}
