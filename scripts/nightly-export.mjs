import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPORT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.EXPORT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env: EXPORT_SUPABASE_URL / EXPORT_SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SERVICE_TABLES = [
  { key: 'cruise', table: 'reservation_cruise' },
  { key: 'cruise_car', table: 'reservation_cruise_car' },
  { key: 'airport', table: 'reservation_airport' },
  { key: 'hotel', table: 'reservation_hotel' },
  { key: 'tour', table: 'reservation_tour' },
  { key: 'rentcar', table: 'reservation_rentcar' },
  { key: 'car_sht', table: 'reservation_car_sht' },
];

function sanitizeSheetName(name) {
  return String(name).replace(/[\\/?*\[\]:]/g, '_').slice(0, 31);
}

function sheetFromRows(rows) {
  if (!rows || rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([['(데이터 없음)']]);
  }
  const flattened = rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) out[k] = '';
      else if (typeof v === 'object') out[k] = JSON.stringify(v);
      else out[k] = v;
    }
    return out;
  });
  return XLSX.utils.json_to_sheet(flattened);
}

async function fetchAll(table, filterFn, pageSize = 1000) {
  const all = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select('*').range(offset, offset + pageSize - 1);
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

async function fetchByAnyColumn(table, candidateColumns, values) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length === 0) return [];

  const lastErrors = [];
  for (const col of candidateColumns) {
    try {
      const rows = [];
      const chunkSize = 200;
      for (let i = 0; i < uniqueValues.length; i += chunkSize) {
        const chunk = uniqueValues.slice(i, i + chunkSize);
        const { data, error } = await supabase.from(table).select('*').in(col, chunk);
        if (error) throw error;
        if (data?.length) rows.push(...data);
      }
      return rows;
    } catch (e) {
      lastErrors.push(`${table}.${col}: ${e?.message || String(e)}`);
    }
  }
  throw new Error(lastErrors.join(' | '));
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(process.cwd(), 'export_artifacts');
  await fs.mkdir(outDir, { recursive: true });

  // 1) 전체 예약/견적/서비스 상세
  let reservations = [];
  try {
    reservations = await fetchAll('reservation', (q) => q.order('re_created_at', { ascending: false }));
  } catch {
    reservations = await fetchAll('reservation');
  }

  const quoteIds = Array.from(new Set(reservations.map((r) => r.re_quote_id).filter(Boolean)));
  let quotes = [];
  if (quoteIds.length > 0) {
    quotes = await fetchByAnyColumn('quote', ['quote_id', 'id'], quoteIds);
  }

  const userIds = Array.from(new Set(reservations.map((r) => r.re_user_id).filter(Boolean)));
  let users = [];
  if (userIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      const part = await fetchAll('users', (q) => q.in('id', chunk));
      users.push(...part);
    }
  }

  const reIds = reservations.map((r) => r.re_id).filter(Boolean);
  const services = {};
  for (const svc of SERVICE_TABLES) {
    services[svc.key] = [];
    if (reIds.length === 0) continue;
    try {
      services[svc.key] = await fetchByAnyColumn(svc.table, ['reservation_id', 're_id'], reIds);
    } catch {
      services[svc.key] = [];
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(users), sanitizeSheetName('users'));
  XLSX.utils.book_append_sheet(wb, sheetFromRows(reservations), sanitizeSheetName('reservations'));
  XLSX.utils.book_append_sheet(wb, sheetFromRows(quotes), sanitizeSheetName('quotes'));
  for (const svc of SERVICE_TABLES) {
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromRows(services[svc.key] || []),
      sanitizeSheetName(svc.table)
    );
  }

  const xlsxName = `reservations_all_${stamp}.xlsx`;
  const xlsxPath = path.join(outDir, xlsxName);
  XLSX.writeFile(wb, xlsxPath, { bookType: 'xlsx' });

  // 2) 서비스 테이블만 별도(간단본)
  const wbSvc = XLSX.utils.book_new();
  let serviceTotal = 0;
  for (const svc of SERVICE_TABLES) {
    const rows = await fetchAll(svc.table).catch(() => []);
    serviceTotal += rows.length;
    XLSX.utils.book_append_sheet(wbSvc, sheetFromRows(rows), sanitizeSheetName(svc.table));
  }
  const svcName = `services_all_${stamp}.xlsx`;
  XLSX.writeFile(wbSvc, path.join(outDir, svcName), { bookType: 'xlsx' });

  const summary = {
    generatedAt: new Date().toISOString(),
    files: [xlsxName, svcName],
    counts: {
      users: users.length,
      reservations: reservations.length,
      quotes: quotes.length,
      services: Object.fromEntries(SERVICE_TABLES.map((s) => [s.key, (services[s.key] || []).length])),
      serviceTotal,
    },
  };

  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
