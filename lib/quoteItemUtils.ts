// room과 car를 quote_item을 통해 견적에 연결하는 유틸리티 함수들

import supabase from '@/lib/supabase';

// 객실을 견적에 추가하고 quote_item에 연결
export async function addRoomToQuote(
    quoteId: string,
    roomData: {
        room_code: string;
        adult_count: number;
        child_count: number;
        infant_count?: number;
        extra_adult_count?: number;
        extra_child_count?: number;
        additional_categories?: any[];
    },
    usageDate: string // 체크인 날짜
): Promise<boolean> {
    try {
        // 1. room 테이블에 객실 데이터 저장
        const { data: room, error: roomError } = await supabase
            .from('room')
            .insert({
                room_code: roomData.room_code,
                adult_count: roomData.adult_count,
                child_count: roomData.child_count,
                infant_count: roomData.infant_count || 0,
                extra_adult_count: roomData.extra_adult_count || 0,
                extra_child_count: roomData.extra_child_count || 0,
                additional_categories: JSON.stringify(roomData.additional_categories || [])
            })
            .select()
            .single();

        if (roomError || !room) {
            console.error('객실 저장 오류:', roomError);
            return false;
        }

        // 2. quote_item에 연결 정보 저장
        const { error: itemError } = await supabase
            .from('quote_item')
            .insert({
                quote_id: quoteId,
                service_type: 'room',
                service_ref_id: room.id,
                quantity: 1,
                unit_price: 0,
                total_price: 0,
                usage_date: usageDate
            });

        if (itemError) {
            console.error('견적 아이템 저장 오류:', itemError);
            return false;
        }

        return true;
    } catch (error) {
        console.error('객실 추가 중 오류:', error);
        return false;
    }
}

// 차량을 견적에 추가하고 quote_item에 연결
export async function addCarToQuote(
    quoteId: string,
    carData: {
        car_code: string;
        count?: number;
    },
    usageDate: string // 픽업 날짜
): Promise<boolean> {
    try {
        // 1. car 테이블에 차량 데이터 저장
        const { data: car, error: carError } = await supabase
            .from('car')
            .insert({
                car_code: carData.car_code
            })
            .select()
            .single();

        if (carError || !car) {
            console.error('차량 저장 오류:', carError);
            return false;
        }

        // 2. 가능한 단가 정보를 car_price 테이블에서 조회
        let unitPrice = 0;
        try {
            const { data: priceRow } = await supabase
                .from('car_price')
                .select('price')
                .eq('car_code', carData.car_code)
                .maybeSingle();

            if (priceRow && priceRow.price != null) {
                unitPrice = Number(priceRow.price) || 0;
            }
        } catch (e) {
            console.warn('차량 단가 조회 실패, 기본 0 적용', e);
            unitPrice = 0;
        }

        const totalPrice = unitPrice * (carData.count || 1);

        // 3. quote_item에 연결 정보 저장 (단가 포함)
        const { error: itemError } = await supabase
            .from('quote_item')
            .insert({
                quote_id: quoteId,
                service_type: 'car',
                service_ref_id: car.id,
                quantity: carData.count || 1,
                unit_price: unitPrice,
                total_price: totalPrice,
                usage_date: usageDate
            });

        if (itemError) {
            console.error('견적 아이템 저장 오류:', itemError);
            return false;
        }

        return true;
    } catch (error) {
        console.error('차량 추가 중 오류:', error);
        return false;
    }
}

// 견적의 quote_item들에서 사용일자 업데이트
export async function updateQuoteItemUsageDates(
    quoteId: string,
    updates: Array<{
        serviceType: 'room' | 'car' | 'cruise' | 'airport' | 'hotel' | 'tour' | 'rentcar';
        serviceRefId: string;
        usageDate: string;
    }>
): Promise<boolean> {
    try {
        for (const update of updates) {
            const { error } = await supabase
                .from('quote_item')
                .update({ usage_date: update.usageDate })
                .eq('quote_id', quoteId)
                .eq('service_type', update.serviceType)
                .eq('service_ref_id', update.serviceRefId);

            if (error) {
                console.error('사용일자 업데이트 오류:', error);
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error('사용일자 업데이트 중 오류:', error);
        return false;
    }
}
