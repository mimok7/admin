import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { checkAdmin, fetchAll, SERVICE_TABLES } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function fetchByAnyColumn(table: string, candidateColumns: string[], values: any[]) {
  if (!serviceSupabase || values.length === 0) return [];
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length === 0) return [];

  const lastErrors: string[] = [];
  for (const col of candidateColumns) {
    try {
      const rows: any[] = [];
      const chunkSize = 200;
      for (let i = 0; i < uniqueValues.length; i += chunkSize) {
        const chunk = uniqueValues.slice(i, i + chunkSize);
        const { data, error } = await serviceSupabase
          .from(table)
          .select('*')
          .in(col, chunk);
        if (error) throw error;
        if (data?.length) rows.push(...data);
      }
      return rows;
    } catch (e: any) {
      lastErrors.push(`${table}.${col}: ${e?.message ?? String(e)}`);
    }
  }

  throw new Error(lastErrors.join(' | '));
}

// 사용자별 예약 + 모든 서비스 상세 행을 한 번에 반환
export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!serviceSupabase) return NextResponse.json({ error: 'service role 미설정' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get('userId') || '').trim();

  try {
    // 1) 예약 조회 (특정 유저 또는 전체)
    let reservations: any[] = [];
    try {
      reservations = await fetchAll('reservation', (q) => {
        let qq = q.order('re_created_at', { ascending: false });
        if (userId) qq = qq.eq('re_user_id', userId);
        return qq;
      });
    } catch {
      // 운영 DB 컬럼 차이가 있는 경우 정렬 컬럼 없이 재시도
      reservations = await fetchAll('reservation', (q) => (userId ? q.eq('re_user_id', userId) : q));
    }

    // 2) 견적 조회 (예약과 연결)
    const quoteIds = Array.from(new Set(reservations.map(r => r.re_quote_id).filter(Boolean)));
    let quotes: any[] = [];
    if (quoteIds.length > 0) {
      // 스키마별로 quote PK 컬럼명이 다른 경우를 대비해 quote_id -> id 순으로 폴백
      quotes = await fetchByAnyColumn('quote', ['quote_id', 'id'], quoteIds);
    }

    // 3) 사용자 조회
    const userIds = Array.from(new Set(reservations.map(r => r.re_user_id).filter(Boolean)));
    let users: any[] = [];
    if (userId) {
      const { data } = await serviceSupabase.from('users').select('*').eq('id', userId).maybeSingle();
      if (data) users = [data];
    } else if (userIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const part = await fetchAll('users', (q) => q.in('id', chunk));
        users.push(...part);
      }
    }

    // 4) 서비스 상세 조회 (예약 ID 기준)
    const reIds = reservations.map(r => r.re_id).filter(Boolean);
    const services: Record<string, any[]> = {};
    if (reIds.length > 0) {
      for (const svc of SERVICE_TABLES) {
        services[svc.key] = [];
        try {
          services[svc.key] = await fetchByAnyColumn(svc.table, ['reservation_id', 're_id'], reIds);
        } catch {
          // 해당 테이블 스키마가 달라도 전체 export가 중단되지 않도록 스킵
          services[svc.key] = [];
        }
      }
    }

    return NextResponse.json({
      ok: true,
      userId: userId || null,
      counts: {
        reservations: reservations.length,
        quotes: quotes.length,
        users: users.length,
        services: Object.fromEntries(Object.entries(services).map(([k, v]) => [k, v.length])),
      },
      users,
      reservations,
      quotes,
      services,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
