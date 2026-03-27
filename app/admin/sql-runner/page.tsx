'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import { useRouter } from 'next/navigation';

export default function SqlRunnerPage() {
  const [sqlQuery, setSqlQuery] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      const { data: userInfo } = await supabase
        .from('users')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (userInfo?.role !== 'admin') {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [router]);

  const testConnection = async () => {
    setLoading(true);
    setOutput('데이터베이스 연결 테스트 중...\n');

    try {
      const { data, error } = await supabase.from('users').select('id').limit(1);

      if (error) {
        setOutput((prev) => prev + `연결 실패: ${error.message}\n`);
      } else {
        setOutput((prev) => prev + '✅ 데이터베이스 연결 성공!\n');
      }
    } catch (error: any) {
      setOutput((prev) => prev + `연결 오류: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const showSecurityPoliciesSQL = () => {
    const policies = `-- RLS 보안 정책 설정
-- 다음 SQL을 Supabase 대시보드 > SQL Editor에서 실행하세요

-- 기존 정책 삭제
DROP POLICY IF EXISTS quote_user_policy ON quote;
DROP POLICY IF EXISTS quote_admin_policy ON quote;

-- quote 테이블 RLS 설정
ALTER TABLE quote ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_user_policy ON quote
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY quote_admin_policy ON quote
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );`;

    setOutput(policies);
  };

  const executeReservationRecalc = async () => {
    setLoading(true);
    setOutput('예약 총금액 재계산 중...\n');

    try {
      const { data, error } = await supabase.rpc('recompute_all_reservation_totals');

      if (error) {
        setOutput((prev) => prev + `❌ 재계산 실패: ${error.message}\n`);
      } else {
        setOutput((prev) => prev + '✅ 예약 총금액 재계산 완료!\n\n');
        setOutput((prev) => prev + '📊 재계산 결과:\n');
        setOutput((prev) => prev + '=====================================\n');

        if (data && data.length > 0) {
          data.forEach((item: any, index: number) => {
            setOutput((prev) => prev + `${index + 1}. 예약 ID: ${item.reservation_id.slice(0, 8)}... → ${Number(item.total_amount).toLocaleString()}동\n`);
          });
          setOutput((prev) => prev + `\n총 ${data.length}개 예약의 금액이 재계산되었습니다.\n`);
        } else {
          setOutput((prev) => prev + '재계산할 예약이 없습니다.\n');
        }
      }
    } catch (error: any) {
      setOutput((prev) => prev + `❌ 재계산 오류: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const executeSQL = async () => {
    if (!sqlQuery.trim()) {
      alert('SQL 쿼리를 입력하세요.');
      return;
    }

    const query = sqlQuery.trim().toLowerCase();
    if (!query.startsWith('select')) {
      alert('보안상 SELECT 쿼리만 실행 가능합니다.');
      return;
    }

    setLoading(true);
    setOutput('쿼리 실행 중...\n');

    try {
      const { data, error } = await supabase.rpc('exec_sql', { query: sqlQuery });

      if (error) {
        setOutput(`❌ 쿼리 실행 실패: ${error.message}\n`);
      } else {
        setOutput('✅ 쿼리 실행 완료!\n\n');
        setOutput((prev) => prev + '📊 결과:\n');
        setOutput((prev) => prev + '=====================================\n');

        if (data && Array.isArray(data)) {
          if (data.length === 0) {
            setOutput((prev) => prev + '조회된 데이터가 없습니다.\n');
          } else {
            setOutput((prev) => prev + JSON.stringify(data, null, 2) + '\n');
            setOutput((prev) => prev + `\n총 ${data.length}개 행이 조회되었습니다.\n`);
          }
        } else {
          setOutput((prev) => prev + JSON.stringify(data, null, 2) + '\n');
        }
      }
    } catch (error: any) {
      setOutput(`❌ 쿼리 실행 오류: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const checkReservationTotals = async () => {
    setLoading(true);
    setOutput('예약 총금액 현황 조회 중...\n');

    try {
      const { data, error } = await supabase
        .from('reservation')
        .select('re_id, re_status, re_type, total_amount, re_created_at')
        .order('total_amount', { ascending: false })
        .limit(20);

      if (error) {
        setOutput((prev) => prev + `❌ 조회 실패: ${error.message}\n`);
      } else {
        setOutput((prev) => prev + '✅ 예약 총금액 현황 (상위 20개):\n\n');
        setOutput((prev) => prev + '=====================================\n');
        setOutput((prev) => prev + `${'예약ID'.padEnd(10)} | ${'상태'.padEnd(8)} | ${'타입'.padEnd(10)} | ${'총금액'.padStart(12)} | 생성일\n`);
        setOutput((prev) => prev + '=====================================\n');

        if (data && data.length > 0) {
          data.forEach((item: any) => {
            const shortId = item.re_id.slice(0, 8) + '..';
            const amount = Number(item.total_amount || 0).toLocaleString() + '동';
            const date = new Date(item.re_created_at).toLocaleDateString();
            setOutput((prev) => prev + `${shortId.padEnd(10)} | ${item.re_status.padEnd(8)} | ${item.re_type.padEnd(10)} | ${amount.padStart(12)} | ${date}\n`);
          });

          const totalSum = data.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
          setOutput((prev) => prev + '=====================================\n');
          setOutput((prev) => prev + `총 ${data.length}개 예약 합계: ${totalSum.toLocaleString()}동\n`);
        } else {
          setOutput((prev) => prev + '조회할 예약이 없습니다.\n');
        }
      }
    } catch (error: any) {
      setOutput((prev) => prev + `❌ 조회 오류: ${error.message}\n`);
    } finally {
      setLoading(false);
    }
  };

  const showProjectSQL = (scriptName: string) => {
    const scripts: Record<string, string> = {
      'database-schema': `-- 데이터베이스 스키마 수정: 누락된 컬럼들 추가
-- 파일: fix-database-schema.sql

-- 1. users 테이블에 updated_at 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 2. reservation 테이블에 필요한 컬럼들 추가
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE reservation ADD COLUMN IF NOT EXISTS special_requests TEXT;

-- 3. users 테이블의 updated_at 트리거 생성 (자동 업데이트)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. users 테이블에 트리거 적용
DROP TRIGGER IF EXISTS update_users_updated_at ON users;`,
      'guest-access': `-- 견적자(guest) 접근 허용 RLS 정책
ALTER TABLE quote ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_guest_access ON quote
  FOR SELECT USING (true);

-- 예약 테이블은 소유자만 접근 허용
CREATE POLICY reservation_owner_access ON reservation
  FOR SELECT USING (auth.uid() = re_user_id);`,
      'quote-rls-fix': `-- 견적 RLS 정책 수정 예시
ALTER TABLE quote ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_owner_read ON quote
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY quote_admin_full ON quote
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );`,
      'manager-note': `-- 매니저 노트 컬럼 추가
ALTER TABLE quote ADD COLUMN IF NOT EXISTS manager_note TEXT;`,
      'reservation-confirmation': `-- 예약확인서 개선
ALTER TABLE reservation ALTER COLUMN re_id SET NOT NULL;`,
      'reservation-total': `-- reservation 테이블에 총금액 컬럼 추가 및 자동계산 시스템
-- 파일: add-reservation-total-amount.sql

-- 1. reservation 테이블에 총금액 컬럼 추가
ALTER TABLE reservation
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 2. 특정 예약의 총금액 재계산 함수
CREATE OR REPLACE FUNCTION recompute_reservation_total(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC(14,2) := 0;
BEGIN
  -- 각 서비스별 금액 합산
  SELECT
      COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(room_total_price, 0) > 0 THEN room_total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(guest_count, 1)
                  END
                 ) 
                 FROM reservation_cruise 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(car_total_price, 0)) 
                 FROM reservation_cruise_car 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_airport 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_hotel 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_tour 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_rentcar 
                 WHERE reservation_id = p_reservation_id), 0 )
  INTO v_total;

  UPDATE reservation
  SET total_amount = COALESCE(v_total, 0)
  WHERE re_id = p_reservation_id;
END;
$$;

-- 3. 수동 재계산 프로시저
CREATE OR REPLACE FUNCTION recompute_all_reservation_totals()
RETURNS TABLE(reservation_id UUID, total_amount NUMERIC(14,2))
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT re_id FROM reservation LOOP
    PERFORM recompute_reservation_total(r.re_id);
  END LOOP;
  
  RETURN QUERY 
  SELECT re_id, reservation.total_amount 
  FROM reservation 
  ORDER BY total_amount DESC;
END;
$$;`
    };

    setOutput(scripts[scriptName] || '스크립트를 찾을 수 없습니다.');
  };

  const sampleQueries = [
    {
      name: '전체 견적 수 조회',
      query: 'SELECT COUNT(*) as total_quotes FROM quote;',
    },
    {
      name: '상태별 견적 통계',
      query: 'SELECT status, COUNT(*) as count FROM quote GROUP BY status;',
    },
    {
      name: '사용자 목록',
      query: 'SELECT email, role, created_at FROM users LIMIT 10;',
    },
    {
      name: '예약 총금액별 통계',
      query: 'SELECT re_status, re_type, COUNT(*) as count, SUM(total_amount) as total_amount FROM reservation GROUP BY re_status, re_type ORDER BY total_amount DESC;',
    },
    {
      name: '높은 금액 예약 조회',
      query: 'SELECT re_id, re_status, re_type, total_amount, re_created_at FROM reservation WHERE total_amount > 100000 ORDER BY total_amount DESC LIMIT 10;',
    },
  ];

  if (!isAdmin) {
    return (
      <AdminLayout title="데이터베이스 관리" activeTab="database">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⚠️</div>
          <p>권한 확인 중...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="데이터베이스 관리" activeTab="database">
      <div className="space-y-6">
        {/* 빠른 작업 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">빠른 작업</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={testConnection}
              disabled={loading}
              className="flex items-center justify-center px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              🔌 연결 테스트
            </button>
            <button
              onClick={showSecurityPoliciesSQL}
              className="flex items-center justify-center px-4 py-3 bg-green-500 text-white rounded hover:bg-green-600"
            >
              🔒 보안 정책 SQL
            </button>
            <button
              onClick={() => window.open('https://app.supabase.io', '_blank')}
              className="flex items-center justify-center px-4 py-3 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              🔗 Supabase 대시보드
            </button>
          </div>
        </div>

        {/* 프로젝트 SQL 스크립트 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">프로젝트 SQL 스크립트</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => showProjectSQL('database-schema')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">🏗️ 데이터베이스 스키마 수정</div>
              <div className="text-sm text-gray-500 mt-1">users updated_at, reservation 컬럼 추가</div>
            </button>
            <button
              onClick={() => showProjectSQL('guest-access')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">👤 게스트 접근 허용</div>
              <div className="text-sm text-gray-500 mt-1">견적자용 RLS 정책 설정</div>
            </button>
            <button
              onClick={() => showProjectSQL('quote-rls-fix')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">🔧 견적 RLS 정책 수정</div>
              <div className="text-sm text-gray-500 mt-1">infinite recursion 오류 해결</div>
            </button>
            <button
              onClick={() => showProjectSQL('manager-note')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">📝 매니저 노트 컬럼</div>
              <div className="text-sm text-gray-500 mt-1">견적 승인/거절 메모 기능</div>
            </button>
            <button
              onClick={() => showProjectSQL('reservation-confirmation')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">📋 예약확인서 개선</div>
              <div className="text-sm text-gray-500 mt-1">reservation_id 필수화</div>
            </button>
            <button
              onClick={() => showProjectSQL('reservation-total')}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
            >
              <div className="font-medium text-gray-900">💰 예약 총금액 시스템</div>
              <div className="text-sm text-gray-500 mt-1">자동 계산 및 트리거 설정</div>
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p>• 각 스크립트를 클릭하면 Supabase SQL Editor에서 실행할 수 있는 SQL이 표시됩니다.</p>
            <p>• 스크립트는 순서대로 실행하는 것을 권장합니다.</p>
          </div>
        </div>

        {/* 샘플 쿼리 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">샘플 쿼리</h3>
          <div className="grid grid-cols-1 gap-4">
            {sampleQueries.map((sample, index) => (
              <button
                key={index}
                onClick={() => setSqlQuery(sample.query)}
                className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded border"
              >
                <div className="font-medium text-gray-900">{sample.name}</div>
                <div className="text-sm text-gray-500 mt-1 font-mono">{sample.query}</div>
              </button>
            ))}
          </div>
        </div>

        {/* SQL 쿼리 실행 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">SQL 쿼리</h3>
          <div className="space-y-4">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM users LIMIT 10;"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={executeSQL}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {loading ? '실행 중...' : '실행'}
              </button>
              <button
                onClick={() => setSqlQuery('')}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                지우기
              </button>
            </div>
            <p className="text-sm text-red-600">
              ⚠️ 보안상 이 도구에서는 SELECT 쿼리만 실행 가능합니다. 다른 SQL 명령은 Supabase
              대시보드에서 직접 실행하세요.
            </p>
          </div>
        </div>

        {/* 출력 결과 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">실행 결과</h3>
          <div className="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-auto">
            <pre>{output || '결과가 여기에 표시됩니다...'}</pre>
          </div>
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => setOutput('')}
              className="text-sm px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              지우기
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              className="text-sm px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              복사
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
