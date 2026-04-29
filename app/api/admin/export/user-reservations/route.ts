import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { checkAdmin, fetchAll, SERVICE_TABLES } from '@/lib/exportAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 사용자별 예약 + 모든 서비스 상세 행을 한 번에 반환
export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!serviceSupabase) return NextResponse.json({ error: 'service role 미설정' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get('userId') || '').trim();

  try {
    // 1) 예약 조회 (특정 유저 또는 전체)
    const reservations = await fetchAll('reservation', (q) => {
      let qq = q.order('re_created_at', { ascending: false });
      if (userId) qq = qq.eq('re_user_id', userId);
      return qq;
    });

    // 2) 견적 조회 (예약과 연결)
    const quoteIds = Array.from(new Set(reservations.map(r => r.re_quote_id).filter(Boolean)));
    let quotes: any[] = [];
    if (quoteIds.length > 0) {
      // chunk로 in 쿼리 (Postgres in 절 한도 회피)
      const chunkSize = 200;
      for (let i = 0; i < quoteIds.length; i += chunkSize) {
        const chunk = quoteIds.slice(i, i + chunkSize);
        const part = await fetchAll('quote', (q) => q.in('quote_id', chunk));
        quotes.push(...part);
      }
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
        const chunkSize = 200;
        for (let i = 0; i < reIds.length; i += chunkSize) {
          const chunk = reIds.slice(i, i + chunkSize);
          try {
            const part = await fetchAll(svc.table, (q) => q.in('reservation_id', chunk));
            services[svc.key].push(...part);
          } catch (e) {
            // 해당 테이블에 reservation_id 컬럼이 없거나 접근 실패 → 스킵
          }
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
