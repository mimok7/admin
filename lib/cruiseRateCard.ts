
import supabase from '@/lib/supabase';

export interface CruiseRate {
    id: string;
    cruise_name: string;
    schedule_type: string;
    room_type: string;
    room_type_en: string | null;
    price_adult: number;
    price_child: number | null;
    price_child_extra_bed: number | null;
    price_child_older: number | null;
    price_infant: number | null;
    price_extra_bed: number | null;
    price_single: number | null;
    extra_bed_available: boolean;
    single_available: boolean;
    includes_vehicle: boolean;
    vehicle_type: string | null;
    infant_policy: string | null;
    child_age_range: string | null;
    season_name: string | null;
    is_promotion: boolean;
    valid_year: number;
    valid_from: string | null;
    valid_to: string | null;
    display_order: number;
    currency: string;
    notes: string | null;
}

export interface HolidaySurcharge {
    id: string;
    cruise_name: string;
    schedule_type: string | null;
    holiday_date: string;
    holiday_date_end: string | null;
    holiday_name: string | null;
    surcharge_per_person: number;
    surcharge_child: number | null;
    is_confirmed: boolean;
    valid_year: number;
    notes: string | null;
}

/**
 * 활성화된 크루즈 목록 조회 (중복 제거)
 */
export async function getCruiseList(year: number = 2026): Promise<string[]> {
    const { data, error } = await supabase
        .from('cruise_rate_card')
        .select('cruise_name')
        .eq('valid_year', year)
        .eq('is_active', true)
        .order('cruise_name');

    if (error) {
        console.error('Error fetching cruise list:', error);
        return [];
    }

    // 중복 제거 후 반환
    const cruiseNames: string[] = [];
    for (const item of (data || []) as any[]) {
        if (typeof item?.cruise_name === 'string' && item.cruise_name.trim().length > 0) {
            cruiseNames.push(item.cruise_name);
        }
    }

    return Array.from(new Set(cruiseNames));
}

/**
 * 특정 크루즈의 날짜/일정별 객실 요금 조회
 * @param cruiseName 크루즈 이름
 * @param scheduleType 일정 유형 ('1N2D', '2N3D', 'DAY')
 * @param date 기준 날짜 (YYYY-MM-DD)
 * @param seasonName (옵션) 시즌 이름으로 필터링 (예: '신용카드', 'VND 송금')
 */
export async function getCruiseRates(
    cruiseName: string,
    scheduleType: string,
    date: string,
    seasonName?: string
): Promise<CruiseRate[]> {
    let query = supabase
        .from('cruise_rate_card')
        .select('*')
        .eq('cruise_name', cruiseName)
        .eq('schedule_type', scheduleType)
        .eq('is_active', true)
        .order('display_order');

    // 시즌/기간 필터링 로직
    // 1. 기간이 지정된 경우 (valid_from <= date <= valid_to)
    // 2. 기간이 없는 경우 (valid_from/to IS NULL -> 연중 동일)
    // Supabase 쿼리로 OR 조건 구현이 복잡하므로, 전체 조회 후 JS 필터링

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching cruise rates:', error);
        return [];
    }

    return (data || []).filter((rate: CruiseRate) => {
        // 년도 체크
        if (rate.valid_year !== new Date(date).getFullYear()) return false;

        // 시즌 이름 필터링 (옵션)
        if (seasonName && rate.season_name !== seasonName) return false;

        // 기간 체크
        if (rate.valid_from && rate.valid_to) {
            return date >= rate.valid_from && date <= rate.valid_to;
        }
        // 기간이 없으면 연중 적용 (단, 다른 시즌과 겹치지 않는지 로직 필요하나 우선순위 처리)
        return true;
    });
}

/**
 * 해당 날짜의 공휴일 추가요금 조회
 */
export async function getHolidaySurcharge(
    cruiseName: string,
    scheduleType: string,
    date: string
): Promise<HolidaySurcharge | null> {
    const { data, error } = await supabase
        .from('cruise_holiday_surcharge')
        .select('*')
        .eq('cruise_name', cruiseName)
        // schedule_type이 NULL이면 전체 적용, 아니면 일치해야 함
        .or(`schedule_type.eq.${scheduleType},schedule_type.is.null`)
        .eq('is_confirmed', true)
        .lte('holiday_date', date)
        .gte('holiday_date', date) // 단일 날짜 체크 (범위는 아래에서 처리)
    // 실제로는 범위 체크가 필요하므로 JS 필터링 권장

    if (error) {
        console.error('Error fetching holiday surcharge:', error);
        return null;
    }

    // 범위 체크 로직 보완
    // holiday_date <= date <= holiday_date_end (or holiday_date if end is null)

    // 다시 조회 (범위 고려)
    const { data: allSurcharges } = await supabase
        .from('cruise_holiday_surcharge')
        .select('*')
        .eq('cruise_name', cruiseName)
        .eq('valid_year', new Date(date).getFullYear());

    const matched = (allSurcharges || []).find((s: HolidaySurcharge) => {
        const start = s.holiday_date;
        const end = s.holiday_date_end || s.holiday_date;
        return date >= start && date <= end;
    });

    return matched || null;
}

/**
 * 예상 총 금액 계산
 */
export function calculateTotalAmount(
    rate: CruiseRate,
    surcharge: HolidaySurcharge | null,
    adults: number,
    children: number,
    infants: number,
    useExtraBed: boolean,
    isSingle: boolean
): number {
    let total = 0;

    // 1. 기본 객실료
    if (isSingle && rate.single_available && rate.price_single) {
        total += rate.price_single;
    } else {
        // 성인
        total += rate.price_adult * adults;

        // 아동 (엑스트라 베드 사용 여부에 따라 다를 수 있음)
        if (children > 0) {
            if (useExtraBed && rate.price_child_extra_bed) {
                total += rate.price_child_extra_bed * children;
            } else if (rate.price_child) {
                total += rate.price_child * children;
            }
            // TODO: 아동 연령별(older) 로직 추가 필요 시 확장
        }

        // 유아
        if (infants > 0 && rate.price_infant) {
            total += rate.price_infant * infants;
        }

        // 성인 엑스트라 베드
        if (useExtraBed && rate.price_extra_bed && !rate.price_child_extra_bed) {
            // 아동 엑스트라가 아닌 일반 엑스트라 (성인이 엑스트라를 쓰는 경우 등)
            // 현재 로직은 단순화됨. 실제로는 성인 수 - 2 > 0 일 때 엑스트라 적용 등 복잡
            // 여기서는 'useExtraBed'가 1명분을 의미한다고 가정
            total += rate.price_extra_bed;
        }
    }

    // 2. 공휴일 추가요금
    if (surcharge) {
        total += surcharge.surcharge_per_person * adults;

        if (children > 0) {
            if (surcharge.surcharge_child !== null) {
                total += surcharge.surcharge_child * children;
            } else {
                total += surcharge.surcharge_per_person * children;
            }
        }
        // 유아는 보통 추가요금 제외 (정책 확인 필요)
    }

    return total;
}
