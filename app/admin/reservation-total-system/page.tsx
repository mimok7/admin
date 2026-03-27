'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';
import {
    checkReservationTotalSystem,
    setupReservationTotalSystem,
    recalculateAllReservationTotals
} from '@/lib/reservationTotalSystem';

interface SystemStatus {
    hasColumn: boolean;
    needsMigration?: boolean;
    stats?: {
        total_reservations: number;
        reservations_with_amount: number;
        reservations_without_amount: number;
    };
    functions?: any;
    isFullySetup?: boolean;
    error?: any;
    message?: string;
}

export default function ReservationTotalSystemPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const router = useRouter();

    // 로그 추가 함수
    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    // 시스템 상태 확인
    const checkSystemStatus = async () => {
        setIsLoading(true);
        addLog('🔍 예약 총금액 자동계산 시스템 상태 확인 중...');

        try {
            const status = await checkReservationTotalSystem();
            if (status && typeof status === 'object' && 'hasColumn' in status) {
                setSystemStatus(status as any);
            } else {
                setSystemStatus(null);
                addLog('❌ 시스템 상태 확인 실패');
                return;
            }

            if (status.hasColumn) {
                addLog('✅ total_amount 컬럼이 존재합니다.');
                if (status.stats) {
                    addLog(`📊 예약 현황: 총 ${status.stats.total_reservations}건, 금액있음 ${status.stats.reservations_with_amount}건`);
                }
            } else {
                addLog('❌ total_amount 컬럼이 없습니다. 시스템 설정이 필요합니다.');
            }
        } catch (error) {
            addLog(`❌ 상태 확인 실패: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 시스템 설정
    const setupSystem = async () => {
        setIsProcessing(true);
        addLog('🚀 예약 총금액 자동계산 시스템 설정 시작...');

        try {
            // SQL 마이그레이션 파일 내용을 직접 실행
            const migrationSQL = `
                -- 1. reservation 테이블에 총금액 컬럼 추가
                ALTER TABLE reservation
                ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
            `;

            const { error: columnError } = await supabase.rpc('exec_sql', {
                sql_query: migrationSQL
            });

            if (columnError) {
                addLog(`❌ 컬럼 추가 실패: ${columnError.message}`);
                return;
            }

            addLog('✅ total_amount 컬럼 추가 완료');

            // 상태 재확인
            await checkSystemStatus();

        } catch (error) {
            addLog(`❌ 시스템 설정 실패: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // 모든 예약 총금액 재계산
    const recalculateAll = async () => {
        setIsProcessing(true);
        addLog('🔄 모든 예약 총금액 일괄 재계산 시작...');

        try {
            const result = await recalculateAllReservationTotals();

            if (result.success) {
                addLog(`✅ 일괄 재계산 완료: ${result.data?.length || 0}건`);
                await checkSystemStatus(); // 상태 재확인
            } else {
                addLog(`❌ 일괄 재계산 실패: ${(result.error as any)?.message || '알 수 없는 오류'}`);
            }
        } catch (error) {
            addLog(`❌ 재계산 오류: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // 수동 SQL 실행을 위한 함수
    const executeMigrationSQL = async () => {
        setIsProcessing(true);
        addLog('📄 SQL 마이그레이션 파일 실행 중...');

        try {
            // 파일에서 SQL 읽어오기 (실제로는 전체 마이그레이션 SQL)
            const migrationSQL = `
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
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(ra_car_count, 1)
                  END
                 ) 
                 FROM reservation_airport 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_hotel 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(COALESCE(total_price, 0)) 
                 FROM reservation_tour 
                 WHERE reservation_id = p_reservation_id), 0 )
    + COALESCE( (SELECT SUM(
                  CASE 
                    WHEN COALESCE(total_price, 0) > 0 THEN total_price
                    ELSE COALESCE(unit_price, 0) * COALESCE(car_count, 1)
                  END
                 ) 
                 FROM reservation_rentcar 
                 WHERE reservation_id = p_reservation_id), 0 )
  INTO v_total;

  UPDATE reservation
  SET total_amount = COALESCE(v_total, 0)
  WHERE re_id = p_reservation_id;
END;
$$;
            `;

            // SQL을 직접 실행할 수 있는 RPC 함수가 있다면 사용
            addLog('⚠️ SQL 마이그레이션은 Supabase SQL Editor에서 직접 실행해주세요.');
            addLog('📁 파일 위치: sql/add-reservation-total-amount.sql');

        } catch (error) {
            addLog(`❌ SQL 실행 오류: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // 권한 확인
    useEffect(() => {
        const checkAuth = async () => {
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

            // 시스템 상태 확인
            await checkSystemStatus();
        };

        checkAuth();
    }, [router]);

    if (isLoading) {
        return (
            <AdminLayout title="예약 총금액 자동계산 시스템" activeTab="data-management">
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">⚙️</div>
                    <p className="text-lg">시스템 상태 확인 중...</p>
                    <div className="mt-4 animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="예약 총금액 자동계산 시스템" activeTab="data-management">
            <div className="space-y-6">
                {/* 시스템 상태 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">🔍 시스템 상태</h3>

                    {systemStatus?.hasColumn ? (
                        <div className="space-y-3">
                            <div className="flex items-center text-green-600">
                                <span className="text-xl mr-2">✅</span>
                                <span>total_amount 컬럼이 존재합니다.</span>
                            </div>

                            {systemStatus.stats && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-medium text-gray-900 mb-2">📊 예약 현황</h4>
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-blue-600">
                                                {systemStatus.stats.total_reservations}
                                            </div>
                                            <div className="text-gray-600">총 예약</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-green-600">
                                                {systemStatus.stats.reservations_with_amount}
                                            </div>
                                            <div className="text-gray-600">금액 계산됨</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-red-600">
                                                {systemStatus.stats.reservations_without_amount}
                                            </div>
                                            <div className="text-gray-600">금액 미계산</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center text-red-600">
                                <span className="text-xl mr-2">❌</span>
                                <span>예약 총금액 자동계산 시스템이 설정되지 않았습니다.</span>
                            </div>
                            <p className="text-gray-600 text-sm">
                                reservation 테이블에 total_amount 컬럼과 자동계산 트리거가 필요합니다.
                            </p>
                        </div>
                    )}
                </div>

                {/* 시스템 관리 액션 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">⚙️ 시스템 관리</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                            onClick={checkSystemStatus}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            🔍 상태 재확인
                        </button>

                        {!systemStatus?.hasColumn && (
                            <button
                                onClick={executeMigrationSQL}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                🚀 시스템 설정
                            </button>
                        )}

                        {systemStatus?.hasColumn && (
                            <button
                                onClick={recalculateAll}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                            >
                                🔄 총금액 재계산
                            </button>
                        )}

                        <a
                            href="/admin/sql-runner"
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-center"
                        >
                            📄 SQL Runner
                        </a>
                    </div>
                </div>

                {/* 안내 정보 */}
                <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-4">💡 시스템 안내</h3>

                    <div className="space-y-3 text-sm text-yellow-700">
                        <div>
                            <strong>🎯 목적:</strong> 각 서비스의 총금액이 변경되면 예약 테이블의 총금액과 결제 금액이 자동으로 업데이트됩니다.
                        </div>
                        <div>
                            <strong>🔧 작동 방식:</strong>
                            <ul className="list-disc list-inside mt-1 ml-4">
                                <li>서비스 테이블(reservation_cruise, reservation_airport 등) 변경 → reservation.total_amount 자동 계산</li>
                                <li>예약 총금액 변경 → reservation_payment.amount 자동 동기화</li>
                                <li>완료된 결제는 변경하지 않음 (pending, processing 상태만 동기화)</li>
                            </ul>
                        </div>
                        <div>
                            <strong>📁 설치 파일:</strong>
                            <ul className="list-disc list-inside mt-1 ml-4">
                                <li><code>complete-auto-sync-system.sql</code> - 완전 자동화 시스템</li>
                                <li><code>add-reservation-total-amount.sql</code> - 기본 총금액 시스템</li>
                                <li><code>install-payment-sync-system.sql</code> - 결제 동기화 시스템</li>
                            </ul>
                        </div>
                        <div className="bg-green-50 p-3 rounded border border-green-200">
                            <strong>✨ 권장 설치 방법:</strong>
                            <ol className="list-decimal list-inside mt-1 ml-2">
                                <li>SQL Runner에서 <code>complete-auto-sync-system.sql</code> 파일 열기</li>
                                <li>전체 스크립트를 한번에 실행</li>
                                <li>설치 로그 확인 후 상태 재확인</li>
                            </ol>
                        </div>
                    </div>
                </div>

                {/* 실행 로그 */}
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 실행 로그</h3>

                    <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto">
                        {logs.length > 0 ? (
                            <div className="space-y-1 text-sm font-mono">
                                {logs.map((log, index) => (
                                    <div key={index} className="text-gray-700">
                                        {log}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">로그가 없습니다.</p>
                        )}
                    </div>

                    {logs.length > 0 && (
                        <button
                            onClick={() => setLogs([])}
                            className="mt-2 px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                        >
                            🗑️ 로그 지우기
                        </button>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
