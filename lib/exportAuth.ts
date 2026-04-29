import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import serviceSupabase from '@/lib/serviceSupabase';

export async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; error?: string; status?: number }> {
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

export async function fetchAll(
  table: string,
  filterFn?: (q: any) => any,
  pageSize = 1000
): Promise<any[]> {
  if (!serviceSupabase) throw new Error('service role 미설정');
  const all: any[] = [];
  let offset = 0;
  while (true) {
    let q: any = serviceSupabase.from(table).select('*').range(offset, offset + pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export const SERVICE_TABLES: { key: string; label: string; table: string }[] = [
  { key: 'cruise', label: '크루즈', table: 'reservation_cruise' },
  { key: 'cruise_car', label: '크루즈 차량', table: 'reservation_cruise_car' },
  { key: 'airport', label: '공항', table: 'reservation_airport' },
  { key: 'hotel', label: '호텔', table: 'reservation_hotel' },
  { key: 'tour', label: '투어', table: 'reservation_tour' },
  { key: 'rentcar', label: '렌트카', table: 'reservation_rentcar' },
  { key: 'car_sht', label: '스하 차량', table: 'reservation_car_sht' },
];
