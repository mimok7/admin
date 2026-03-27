import supabase from './supabase';

/**
 * 공통 배치 조회 유틸리티
 * 긴 id 배열을 Supabase PostgREST URL 길이 제한을 피하기 위해 chunk로 나누어 조회합니다.
 */
export async function fetchTableInBatches<T = any>(
    table: string,
    column: string,
    ids: string[],
    select: string = '*',
    batchSize: number = 100
): Promise<T[]> {
    if (!ids || ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids));

    // 병렬 배치 조회로 성능 개선
    const batches: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
        batches.push(uniqueIds.slice(i, i + batchSize));
    }

    const batchPromises = batches.map(async (batch, idx) => {
        const { data, error } = await supabase.from(table).select(select).in(column, batch);
        if (error) {
            console.warn(`⚠️ ${table} 배치(${idx + 1}) 조회 실패:`, error.message);
            return [];
        }
        return data || [];
    });

    const results = await Promise.all(batchPromises);
    return results.flat() as T[];
}

/**
 * reservation_id 기반 서비스 테이블 다건 조회를 안전하게 수행 (크루즈/공항 등)
 */
export async function fetchServiceByReservationIds<T = any>(
    table: string,
    reservationIds: string[],
    select: string = '*',
    batchSize: number = 80 // 예약 ID는 더 많아질 수 있어 약간 더 작은 크기 권장
): Promise<T[]> {
    return fetchTableInBatches<T>(table, 'reservation_id', reservationIds, select, batchSize);
}

/**
 * 여러 테이블을 병렬로 조회하여 성능 최적화
 */
export async function fetchMultipleTablesParallel<T extends Record<string, any>>(
    queries: Array<{
        key: string;
        table: string;
        select?: string;
        filter?: { column: string; value: any };
        orderBy?: { column: string; ascending?: boolean };
        limit?: number;
    }>
): Promise<T> {
    const promises = queries.map(async (q) => {
        let query = supabase.from(q.table).select(q.select || '*');

        if (q.filter) {
            query = query.eq(q.filter.column, q.filter.value);
        }
        if (q.orderBy) {
            query = query.order(q.orderBy.column, { ascending: q.orderBy.ascending ?? true });
        }
        if (q.limit) {
            query = query.limit(q.limit);
        }

        const { data, error } = await query;
        if (error) {
            console.warn(`⚠️ ${q.table} 조회 실패:`, error.message);
            return { key: q.key, data: [] };
        }
        return { key: q.key, data: data || [] };
    });

    const results = await Promise.all(promises);
    return results.reduce((acc, { key, data }) => {
        acc[key] = data;
        return acc;
    }, {} as any) as T;
}
