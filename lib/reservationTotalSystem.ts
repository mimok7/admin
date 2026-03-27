import supabase from './supabase';

/**
 * 예약 총금액 자동계산 시스템 상태 확인
 */
export async function checkReservationTotalSystem() {
    try {
        console.log('🔍 예약 총금액 자동계산 시스템 상태 확인 중...');

        // 1. reservation 테이블에 total_amount 컬럼 존재 여부 확인
        const { data: columnCheck, error: columnError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_name', 'reservation')
            .eq('column_name', 'total_amount');

        if (columnError) {
            console.error('❌ 컬럼 확인 실패:', columnError);
            return { hasColumn: false, error: columnError };
        }

        const hasColumn = columnCheck && columnCheck.length > 0;
        console.log(hasColumn ? '✅ total_amount 컬럼 존재' : '❌ total_amount 컬럼 없음');

        if (!hasColumn) {
            return {
                hasColumn: false,
                needsMigration: true,
                message: 'total_amount 컬럼이 없습니다. 마이그레이션이 필요합니다.'
            };
        }

        // 2. 예약 총금액 현황 확인
        const { data: reservationStats, error: statsError } = await supabase
            .rpc('get_reservation_total_stats');

        if (statsError) {
            console.warn('⚠️ 통계 조회 실패, 직접 쿼리로 확인:', statsError);

            // 직접 쿼리로 확인
            const { data: reservations, error: directError } = await supabase
                .from('reservation')
                .select('total_amount')
                .not('total_amount', 'is', null);

            if (directError) {
                console.error('❌ 직접 쿼리도 실패:', directError);
                return { hasColumn: true, error: directError };
            }

            const total = reservations?.length || 0;
            const withAmount = reservations?.filter(r => r.total_amount > 0).length || 0;
            const withoutAmount = total - withAmount;

            console.log(`📊 예약 현황: 총 ${total}건, 금액있음 ${withAmount}건, 금액없음 ${withoutAmount}건`);

            return {
                hasColumn: true,
                stats: {
                    total_reservations: total,
                    reservations_with_amount: withAmount,
                    reservations_without_amount: withoutAmount
                }
            };
        }

        console.log('📊 예약 총금액 현황:', reservationStats);

        // 3. 트리거 함수 존재 여부 확인
        const { data: functions, error: functionError } = await supabase
            .rpc('check_reservation_functions_exist');

        if (functionError) {
            console.warn('⚠️ 함수 확인 실패:', functionError);
        } else {
            console.log('🔧 자동계산 함수 상태:', functions);
        }

        return {
            hasColumn: true,
            stats: reservationStats,
            functions: functions,
            isFullySetup: hasColumn && reservationStats
        };

    } catch (error) {
        console.error('❌ 시스템 상태 확인 실패:', error);
        return { error };
    }
}

/**
 * 예약 총금액 자동계산 시스템 설정
 */
export async function setupReservationTotalSystem() {
    try {
        console.log('🚀 예약 총금액 자동계산 시스템 설정 시작...');

        // SQL 마이그레이션 실행
        const { error: migrationError } = await supabase
            .rpc('setup_reservation_total_system');

        if (migrationError) {
            console.error('❌ 시스템 설정 실패:', migrationError);
            return { success: false, error: migrationError };
        }

        console.log('✅ 예약 총금액 자동계산 시스템 설정 완료');
        return { success: true };

    } catch (error) {
        console.error('❌ 시스템 설정 오류:', error);
        return { success: false, error };
    }
}

/**
 * 특정 예약의 총금액 수동 재계산
 */
export async function recalculateReservationTotal(reservationId: string) {
    try {
        console.log(`🔄 예약 ${reservationId} 총금액 재계산 중...`);

        const { data, error } = await supabase
            .rpc('recompute_reservation_total', { p_reservation_id: reservationId });

        if (error) {
            console.error('❌ 총금액 재계산 실패:', error);
            return { success: false, error };
        }

        console.log('✅ 총금액 재계산 완료');
        return { success: true, data };

    } catch (error) {
        console.error('❌ 총금액 재계산 오류:', error);
        return { success: false, error };
    }
}

/**
 * 모든 예약의 총금액 일괄 재계산
 */
export async function recalculateAllReservationTotals() {
    try {
        console.log('🔄 모든 예약 총금액 일괄 재계산 중...');

        const { data, error } = await supabase
            .rpc('recompute_all_reservation_totals');

        if (error) {
            console.error('❌ 일괄 재계산 실패:', error);
            return { success: false, error };
        }

        console.log(`✅ 모든 예약 총금액 일괄 재계산 완료: ${data?.length || 0}건`);
        return { success: true, data };

    } catch (error) {
        console.error('❌ 일괄 재계산 오류:', error);
        return { success: false, error };
    }
}
