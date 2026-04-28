'use client';

import React, { useState, useEffect, useCallback } from 'react';
import supabase from '../../../lib/supabase';
import AdminLayout from '../../../components/AdminLayout';

interface ShtSeatRow {
  id: string;
  reservation_id: string;
  car_price_code: string | null;
  passenger_count: number;
  sht_category: string | null;
  unit_price: number | null;
  car_total_price: number | null;
  pickup_datetime: string | null;
  usage_date: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  vehicle_number: string | null;
  dispatch_code: string | null;
  request_note: string | null;
  created_at: string;
  // reservation join
  order_id: string | null;
  re_status: string | null;
  re_type: string | null;
  re_created_at: string | null;  // 예약일
  reservation_date: string | null; // 사용일(예약 기준)
  customer_name: string | null;    // 예약자 이름
}

const VEHICLE_LABEL: Record<string, string> = {
  SHT_LIMO_SOLO_HN_HL_2WAY_DIFF: '단독 리무진 (다른날왕복)',
  SHT_LIMO_SOLO_HN_HL_2WAY: '단독 리무진 (당일왕복)',
  SHT_LIMO_A_HN_HL_2WAY: '공유 리무진 A (당일왕복)',
  SHT_LIMO_A_HN_HL_2WAY_DIFF: '공유 리무진 A (다른날왕복)',
  SHT_LIMO_B_HN_HL_2WAY_DIFF: '공유 리무진 B (다른날왕복)',
};

export default function ShtSeatPage() {
  const [rows, setRows] = useState<ShtSeatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // id of row being saved
  const [editSeats, setEditSeats] = useState<Record<string, string>>({}); // id → input value
  const [filterCode, setFilterCode] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('reservation_car_sht')
        .select(`
          id,
          reservation_id,
          car_price_code,
          passenger_count,
          sht_category,
          unit_price,
          car_total_price,
          pickup_datetime,
          usage_date,
          pickup_location,
          dropoff_location,
          vehicle_number,
          dispatch_code,
          request_note,
          created_at,
          reservation:reservation_id (
            order_id,
            re_status,
            re_type,
            re_created_at,
            reservation_date,
            users:re_user_id (
              name
            )
          )
        `)
        .is('seat_number', null)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const normalized: ShtSeatRow[] = (data || []).map((r: any) => ({
        ...r,
        order_id: r.reservation?.order_id ?? null,
        re_status: r.reservation?.re_status ?? null,
        re_type: r.reservation?.re_type ?? null,
        re_created_at: r.reservation?.re_created_at ?? null,
        reservation_date: r.reservation?.reservation_date ?? null,
        customer_name: r.reservation?.users?.name ?? null,
      }));
      setRows(normalized);

      // 초기 edit 값 세팅
      const initEdit: Record<string, string> = {};
      normalized.forEach((row) => { initEdit[row.id] = ''; });
      setEditSeats(initEdit);
    } catch (e: any) {
      setError(e.message ?? '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (id: string) => {
    const seat = editSeats[id]?.trim();
    if (!seat) { alert('좌석 값을 입력하세요.'); return; }
    setSaving(id);
    try {
      const { error: updateErr } = await supabase
        .from('reservation_car_sht')
        .update({ seat_number: seat })
        .eq('id', id);
      if (updateErr) throw updateErr;
      setSuccessMsg(`저장 완료: ${seat}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchData();
    } catch (e: any) {
      alert('저장 실패: ' + (e.message ?? e));
    } finally {
      setSaving(null);
    }
  };

  const handleBulkAll = async () => {
    const targets = filtered.filter(
      (r) => r.car_price_code?.includes('SOLO') || r.car_price_code?.startsWith('CRUISE_')
    );
    if (!targets.length) { alert('해당 조건의 행이 없습니다.'); return; }
    if (!confirm(`단독 리무진 ${targets.length}건에 "All" 을 일괄 입력합니다. 계속할까요?`)) return;
    setSaving('bulk');
    try {
      const ids = targets.map((r) => r.id);
      const { error: bulkErr } = await supabase
        .from('reservation_car_sht')
        .update({ seat_number: 'All' })
        .in('id', ids);
      if (bulkErr) throw bulkErr;
      setSuccessMsg(`${targets.length}건 일괄 "All" 저장 완료`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchData();
    } catch (e: any) {
      alert('일괄 저장 실패: ' + (e.message ?? e));
    } finally {
      setSaving(null);
    }
  };

  const filtered = rows.filter((r) => {
    const codeMatch = filterCode ? (r.car_price_code ?? '').toLowerCase().includes(filterCode.toLowerCase()) : true;
    const catMatch = filterCategory ? (r.sht_category ?? '').toLowerCase().includes(filterCategory.toLowerCase()) : true;
    return codeMatch && catMatch;
  });

  const formatPrice = (v: number | null) =>
    v == null ? '-' : v.toLocaleString('ko-KR') + '원';

  const formatDate = (v: string | null) => {
    if (!v) return '-';
    return v.slice(0, 10);
  };

  const categoryBadge = (cat: string | null) => {
    if (!cat) return <span className="text-gray-400">-</span>;
    const lower = cat.toLowerCase();
    if (lower === 'pickup') return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">픽업</span>;
    if (lower === 'drop-off' || lower === 'dropoff') return <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">드롭오프</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{cat}</span>;
  };

  const statusBadge = (s: string | null) => {
    if (!s) return <span className="text-gray-400">-</span>;
    const map: Record<string, string> = {
      confirmed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return <span className={`px-2 py-0.5 text-xs rounded-full ${map[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>;
  };

  // 가격 코드별 집계
  const codeStats = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.car_price_code ?? '(없음)';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout title="스하좌석 배정" activeTab="sht-seat">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">🚌 스하좌석 배정</h1>
            <p className="text-gray-500 text-sm mt-1">
              seat_number가 비어 있는 예약 목록 — 총 <strong>{rows.length}건</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleBulkAll}
              disabled={saving === 'bulk'}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving === 'bulk' ? '처리 중...' : '⚡ 단독 리무진 일괄 "All"'}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? '로딩...' : '🔄 새로고침'}
            </button>
          </div>
        </div>

        {/* 성공 메시지 */}
        {successMsg && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            ✅ {successMsg}
          </div>
        )}

        {/* 가격코드 통계 */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(codeStats).map(([code, cnt]) => (
            <div key={code} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
              <div className="text-xs text-gray-500 truncate">{VEHICLE_LABEL[code] ?? code}</div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{cnt}<span className="text-sm font-normal text-gray-500">건</span></div>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="가격 코드 검색"
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">전체 카테고리</option>
            <option value="Pickup">픽업</option>
            <option value="Drop-off">드롭오프</option>
            <option value="dropoff">dropoff</option>
          </select>
          {(filterCode || filterCategory) && (
            <button
              onClick={() => { setFilterCode(''); setFilterCategory(''); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ✕ 필터 초기화
            </button>
          )}
          <span className="ml-auto text-sm text-gray-500 self-center">
            표시: <strong>{filtered.length}</strong>건
          </span>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* 테이블 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">예약자</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">예약일</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">사용일</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">주문번호</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">가격 코드</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">차량 유형</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">인원수</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">구분</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">단가</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">합계금액</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">픽업지</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">차량번호</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">상태</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">좌석 입력</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-gray-400">
                    <div className="text-3xl mb-2">⏳</div>데이터 불러오는 중...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-gray-400">
                    <div className="text-3xl mb-2">✅</div>좌석 미배정 예약이 없습니다.
                  </td>
                </tr>
              )}
              {!loading && filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                >
                  <td className="px-3 py-2 text-xs font-semibold text-gray-800 whitespace-nowrap">
                    {row.customer_name ?? <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(row.re_created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs text-blue-600 font-semibold whitespace-nowrap">
                    {formatDate(row.reservation_date ?? row.usage_date ?? row.pickup_datetime)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                    {row.order_id ?? <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-700 whitespace-nowrap">
                    <span title={row.car_price_code ?? ''} className="cursor-help">
                      {row.car_price_code
                        ? row.car_price_code.length > 20
                          ? row.car_price_code.slice(0, 18) + '…'
                          : row.car_price_code
                        : <span className="text-red-400">없음</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {VEHICLE_LABEL[row.car_price_code ?? ''] ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-gray-800">
                    {row.passenger_count ?? 0}명
                  </td>
                  <td className="px-3 py-2 text-center">
                    {categoryBadge(row.sht_category)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700 whitespace-nowrap">
                    {formatPrice(row.unit_price)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800 whitespace-nowrap">
                    {formatPrice(row.car_total_price)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[120px] truncate" title={row.pickup_location ?? ''}>
                    {row.pickup_location ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 font-mono">
                    {row.vehicle_number ?? '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {statusBadge(row.re_status)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 items-center min-w-[160px]">
                      <input
                        type="text"
                        value={editSeats[row.id] ?? ''}
                        onChange={(e) =>
                          setEditSeats((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        placeholder="예) A1 , A2"
                        className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(row.id); }}
                      />
                      <button
                        onClick={() => handleSave(row.id)}
                        disabled={saving === row.id || !editSeats[row.id]?.trim()}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
                      >
                        {saving === row.id ? '…' : '저장'}
                      </button>
                      {/* 단독 리무진이면 All 버튼 */}
                      {(row.car_price_code?.includes('SOLO') || row.car_price_code?.startsWith('CRUISE_')) && (
                        <button
                          onClick={() => {
                            setEditSeats((prev) => ({ ...prev, [row.id]: 'All' }));
                            setTimeout(() => handleSave(row.id), 0);
                          }}
                          disabled={saving === row.id}
                          className="px-2 py-1 bg-indigo-500 text-white text-xs rounded hover:bg-indigo-600 disabled:opacity-40"
                        >
                          All
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 하단 안내 */}
        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <p>• 단독 리무진(SOLO/CRUISE) 코드는 "All" 버튼 또는 상단 일괄 버튼으로 처리 가능합니다.</p>
          <p>• 공유 리무진(A/B) 코드는 차량 내 다른 고객 좌석 배분에 맞춰 수동으로 입력하세요.</p>
          <p>• 저장 후 해당 행은 목록에서 자동으로 사라집니다.</p>
        </div>
      </div>
    </AdminLayout>
  );
}
