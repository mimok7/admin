'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import AdminLayout from '@/components/AdminLayout';
import { getSupabase } from '@/lib/supabase';

const SERVICE_OPTIONS: { key: string; label: string; table: string }[] = [
  { key: 'cruise', label: '크루즈', table: 'reservation_cruise' },
  { key: 'cruise_car', label: '크루즈 차량', table: 'reservation_cruise_car' },
  { key: 'airport', label: '공항', table: 'reservation_airport' },
  { key: 'hotel', label: '호텔', table: 'reservation_hotel' },
  { key: 'tour', label: '투어', table: 'reservation_tour' },
  { key: 'rentcar', label: '렌트카', table: 'reservation_rentcar' },
  { key: 'car_sht', label: '스하 차량', table: 'reservation_car_sht' },
];

type Mode = 'user' | 'service' | 'table';

interface UserRow {
  id: string;
  email?: string;
  name?: string;
  nickname?: string;
  role?: string;
  created_at?: string;
}

export default function ExportPage() {
  const [mode, setMode] = useState<Mode>('user');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');

  // 사용자별 모드
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // 서비스별 모드
  const [selectedService, setSelectedService] = useState<string>('cruise');

  // 테이블별 모드
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableQuery, setTableQuery] = useState('');

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await getSupabase().auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  // 초기 사용자 / 테이블 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const [u, t] = await Promise.all([
          fetch('/api/admin/export/users', { headers }).then(r => r.json()),
          fetch('/api/admin/backup/tables', { headers }).then(r => r.json()),
        ]);
        if (u.ok) setUsers(u.users || []);
        if (t.ok) setTables(t.tables || []);
      } catch (e: any) {
        setMessage(`초기 로딩 실패: ${e.message ?? e}`);
      }
    })();
  }, []);

  const downloadWorkbook = (wb: XLSX.WorkBook, filename: string) => {
    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
  };

  const sheetFromRows = (rows: any[]): XLSX.WorkSheet => {
    if (!rows || rows.length === 0) {
      return XLSX.utils.aoa_to_sheet([['(데이터 없음)']]);
    }
    // 객체/배열 값은 JSON 문자열로 직렬화
    const flattened = rows.map(r => {
      const out: any = {};
      for (const k of Object.keys(r)) {
        const v = r[k];
        if (v === null || v === undefined) out[k] = '';
        else if (typeof v === 'object') out[k] = JSON.stringify(v);
        else out[k] = v;
      }
      return out;
    });
    return XLSX.utils.json_to_sheet(flattened);
  };

  const sanitize = (name: string) => name.replace(/[\\/?*\[\]:]/g, '_').slice(0, 31);

  // === 1. 예약자별 ===
  const exportByUser = async (allUsers: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const url = allUsers
        ? '/api/admin/export/user-reservations'
        : `/api/admin/export/user-reservations?userId=${encodeURIComponent(selectedUserId)}`;
      if (!allUsers && !selectedUserId) {
        setMessage('사용자를 선택하세요.');
        setBusy(false);
        return;
      }
      setMessage('데이터를 수집하는 중...');
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '데이터 조회 실패');

      const wb = XLSX.utils.book_new();
      // 사용자 시트
      XLSX.utils.book_append_sheet(wb, sheetFromRows(data.users || []), sanitize('users'));
      // 예약 + 사용자 정보 결합 시트
      const userMap = new Map<string, any>();
      (data.users || []).forEach((u: any) => userMap.set(u.id, u));
      const reservationRows = (data.reservations || []).map((r: any) => {
        const u = userMap.get(r.re_user_id) || {};
        return {
          ...r,
          user_email: u.email ?? '',
          user_name: u.name ?? '',
          user_nickname: u.nickname ?? '',
        };
      });
      XLSX.utils.book_append_sheet(wb, sheetFromRows(reservationRows), sanitize('reservations'));
      // 견적 시트
      XLSX.utils.book_append_sheet(wb, sheetFromRows(data.quotes || []), sanitize('quotes'));
      // 서비스별 시트
      const services = data.services || {};
      for (const svc of SERVICE_OPTIONS) {
        const rows = services[svc.key] || [];
        XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), sanitize(svc.table));
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = allUsers
        ? `reservations_all_${stamp}.xlsx`
        : `reservations_${selectedUserId.slice(0, 8)}_${stamp}.xlsx`;
      downloadWorkbook(wb, fname);
      setMessage(`완료: ${fname} (예약 ${data.counts?.reservations ?? 0}건)`);
    } catch (e: any) {
      setMessage(`실패: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  // === 2. 서비스별 ===
  const exportByService = async (all: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const targets = all ? SERVICE_OPTIONS : SERVICE_OPTIONS.filter(s => s.key === selectedService);
      const wb = XLSX.utils.book_new();
      let totalRows = 0;
      for (const svc of targets) {
        setMessage(`${svc.label} 조회 중...`);
        const res = await fetch(`/api/admin/export/table?name=${encodeURIComponent(svc.table)}`, { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(`${svc.table}: ${data.error || '조회 실패'}`);
        XLSX.utils.book_append_sheet(wb, sheetFromRows(data.rows || []), sanitize(svc.table));
        totalRows += (data.rows || []).length;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = all
        ? `services_all_${stamp}.xlsx`
        : `service_${selectedService}_${stamp}.xlsx`;
      downloadWorkbook(wb, fname);
      setMessage(`완료: ${fname} (총 ${totalRows}건)`);
    } catch (e: any) {
      setMessage(`실패: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  // === 3. 테이블별 ===
  const exportTable = async () => {
    if (!selectedTable) {
      setMessage('테이블을 선택하세요.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      setMessage(`${selectedTable} 조회 중...`);
      const res = await fetch(`/api/admin/export/table?name=${encodeURIComponent(selectedTable)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheetFromRows(data.rows || []), sanitize(selectedTable));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fname = `table_${selectedTable}_${stamp}.xlsx`;
      downloadWorkbook(wb, fname);
      setMessage(`완료: ${fname} (${(data.rows || []).length}건)`);
    } catch (e: any) {
      setMessage(`실패: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!userQuery.trim()) return true;
    const q = userQuery.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  });

  const filteredTables = tables.filter(t => !tableQuery.trim() || t.toLowerCase().includes(tableQuery.toLowerCase()));

  return (
    <AdminLayout title="엑셀 내보내기" activeTab="export">
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          예약·서비스·테이블 데이터를 Excel(.xlsx) 파일로 내려받습니다. 큰 데이터(수만 건+)는 다운로드까지 시간이 걸릴 수 있습니다.
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          PC 전원이 꺼져 있어도 새벽 자동 생성이 필요하면 GitHub Actions의
          <b> Nightly Excel Export</b> 워크플로우를 사용하세요.
          생성 파일은 Actions Artifacts에 저장되며, 수동 실행은 Actions 화면에서 가능합니다.
        </div>

        {/* 모드 탭 */}
        <div className="flex gap-2 border-b border-gray-200">
          {([
            { k: 'user', l: '1. 예약자별' },
            { k: 'service', l: '2. 서비스별' },
            { k: 'table', l: '3. 테이블별' },
          ] as { k: Mode; l: string }[]).map(t => (
            <button
              key={t.k}
              onClick={() => setMode(t.k)}
              className={`px-4 py-2 text-sm rounded-t-md border-b-2 ${mode === t.k ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}
            >
              {t.l}
            </button>
          ))}
        </div>

        {/* 1. 예약자별 */}
        {mode === 'user' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-2">예약자별 내보내기</h3>
              <p className="text-sm text-gray-600 mb-3">
                선택한 사용자의 모든 예약(reservation) + 견적(quote) + 서비스 상세(크루즈/공항/호텔/투어/렌트카/스하차량)를
                시트별로 저장합니다.
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  placeholder="이름/이메일/닉네임/ID 검색"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">총 {users.length}명</span>
              </div>
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left text-xs text-gray-500">
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">이름</th>
                      <th className="px-3 py-2">이메일</th>
                      <th className="px-3 py-2">닉네임</th>
                      <th className="px-3 py-2">권한</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.slice(0, 200).map(u => (
                      <tr
                        key={u.id}
                        className={`border-t border-gray-100 hover:bg-blue-50 cursor-pointer ${selectedUserId === u.id ? 'bg-blue-50' : ''}`}
                        onClick={() => setSelectedUserId(u.id)}
                      >
                        <td className="px-3 py-2">
                          <input type="radio" checked={selectedUserId === u.id} onChange={() => setSelectedUserId(u.id)} />
                        </td>
                        <td className="px-3 py-2">{u.name || '-'}</td>
                        <td className="px-3 py-2">{u.email || '-'}</td>
                        <td className="px-3 py-2">{u.nickname || '-'}</td>
                        <td className="px-3 py-2">{u.role || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length > 200 && (
                  <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">상위 200명만 표시. 검색을 사용해 좁혀주세요.</div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  disabled={busy || !selectedUserId}
                  onClick={() => exportByUser(false)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  📥 선택 사용자 내보내기
                </button>
                <button
                  disabled={busy}
                  onClick={() => exportByUser(true)}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  📥 전체 사용자 일괄 내보내기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. 서비스별 */}
        {mode === 'service' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-2">서비스별 내보내기</h3>
            <p className="text-sm text-gray-600 mb-3">
              선택한 서비스 테이블의 전체 데이터를 시트로 저장합니다.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {SERVICE_OPTIONS.map(s => (
                <label
                  key={s.key}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer ${selectedService === s.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <input
                    type="radio"
                    name="service"
                    checked={selectedService === s.key}
                    onChange={() => setSelectedService(s.key)}
                  />
                  <span className="text-sm">{s.label}</span>
                  <span className="text-xs text-gray-500 ml-auto">{s.table}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => exportByService(false)}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                📥 선택 서비스 내보내기
              </button>
              <button
                disabled={busy}
                onClick={() => exportByService(true)}
                className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-md hover:bg-emerald-700 disabled:opacity-50"
              >
                📥 모든 서비스 일괄 내보내기
              </button>
            </div>
          </div>
        )}

        {/* 3. 테이블별 */}
        {mode === 'table' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-2">테이블별 내보내기</h3>
            <p className="text-sm text-gray-600 mb-3">
              데이터베이스의 임의 테이블을 선택해 전체 행을 내려받습니다. (총 {tables.length}개 테이블)
            </p>
            <input
              value={tableQuery}
              onChange={e => setTableQuery(e.target.value)}
              placeholder="테이블명 검색"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
            />
            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md mb-3">
              <ul className="divide-y divide-gray-100">
                {filteredTables.map(t => (
                  <li
                    key={t}
                    onClick={() => setSelectedTable(t)}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${selectedTable === t ? 'bg-blue-50 font-semibold text-blue-700' : ''}`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      checked={selectedTable === t}
                      onChange={() => setSelectedTable(t)}
                    />
                    {t}
                  </li>
                ))}
                {filteredTables.length === 0 && (
                  <li className="px-3 py-4 text-sm text-gray-500 text-center">결과 없음</li>
                )}
              </ul>
            </div>
            <button
              disabled={busy || !selectedTable}
              onClick={exportTable}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              📥 테이블 내보내기
            </button>
          </div>
        )}

        {/* 상태 메시지 */}
        {(busy || message) && (
          <div className={`rounded-lg p-3 text-sm ${busy ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : message.startsWith('실패') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {busy ? '⏳ ' : message.startsWith('실패') ? '❌ ' : '✅ '}
            {message || '처리 중...'}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
