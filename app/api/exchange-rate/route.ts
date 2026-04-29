import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import serviceSupabase from '@/lib/serviceSupabase';

type Candidate = {
  table: string;
  currencyCol: string;
  rateCol: string;
  updatedCol?: string;
  sourceCol?: string;
};

const CANDIDATES: Candidate[] = [
  { table: 'exchange_rate', currencyCol: 'currency_code', rateCol: 'rate_to_krw', updatedCol: 'last_updated', sourceCol: 'source' },
  { table: 'exchange_rates', currencyCol: 'currency_code', rateCol: 'rate_to_krw', updatedCol: 'last_updated', sourceCol: 'source' },
  { table: 'currency_rate', currencyCol: 'currency_code', rateCol: 'rate_to_krw', updatedCol: 'updated_at', sourceCol: 'source' },
  { table: 'currency_rates', currencyCol: 'currency_code', rateCol: 'rate_to_krw', updatedCol: 'updated_at', sourceCol: 'source' },
];

function getReadonlyClient() {
  if (serviceSupabase) return serviceSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const currency = (req.nextUrl.searchParams.get('currency') || 'VND').trim().toUpperCase();
  const client = getReadonlyClient();

  if (!client) {
    return NextResponse.json({ success: false, error: 'Supabase 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  const errors: string[] = [];

  for (const c of CANDIDATES) {
    try {
      const columns = [c.currencyCol, c.rateCol, c.updatedCol, c.sourceCol].filter(Boolean).join(', ');
      let query: any = client
        .from(c.table)
        .select(columns)
        .eq(c.currencyCol, currency)
        .limit(1);

      if (c.updatedCol) {
        query = query.order(c.updatedCol, { ascending: false });
      }

      const { data, error } = await query;
      if (error) {
        errors.push(`${c.table}: ${error.message}`);
        continue;
      }

      const row = data?.[0];
      if (!row) continue;

      const rate = Number(row[c.rateCol] || 0);
      if (!Number.isFinite(rate) || rate <= 0) {
        errors.push(`${c.table}: invalid rate value`);
        continue;
      }

      return NextResponse.json({
        success: true,
        data: {
          currency_code: row[c.currencyCol] || currency,
          rate_to_krw: rate,
          last_updated: c.updatedCol ? row[c.updatedCol] : new Date().toISOString(),
          source: row[c.sourceCol || 'source'] || c.table,
        },
      });
    } catch (e: any) {
      errors.push(`${c.table}: ${e?.message || String(e)}`);
    }
  }

  return NextResponse.json({
    success: false,
    error: '환율 테이블 조회 실패',
    detail: errors,
  });
}
