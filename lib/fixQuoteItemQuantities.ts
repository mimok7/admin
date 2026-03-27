// 기존 견적 아이템의 수량을 한 번만 수정하는 일회성 스크립트

import supabase from '@/lib/supabase';

export const fixQuoteItemQuantities = async () => {
    try {
        console.log('🔧 견적 아이템 수량 일회성 수정 시작...');

        // 모든 견적 아이템 조회
        const { data: quoteItems, error } = await supabase
            .from('quote_item')
            .select('*')
            .order('created_at');

        if (error) throw error;

        let fixedCount = 0;
        const errors: string[] = [];

        for (const item of quoteItems || []) {
            try {
                let actualQuantity = 1; // 기본값

                // 서비스 타입별 실제 수량 계산
                switch (item.service_type) {
                    case 'room':
                        const { data: roomData } = await supabase
                            .from('room')
                            .select('person_count, extra_count')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (roomData) {
                            // 우선 person_count 를 사용하고, 없으면 extra_count 사용
                            const person = roomData.person_count;
                            if (person !== undefined && person !== null) {
                                actualQuantity = person || 1;
                            } else {
                                actualQuantity = (roomData.extra_count || 0);
                                if (!actualQuantity) actualQuantity = 1;
                            }
                        }
                        break;

                    case 'car':
                        const { data: carData } = await supabase
                            .from('car')
                            .select('car_count')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (carData) {
                            actualQuantity = carData.car_count || 1;
                        }
                        break;

                    case 'airport':
                        const { data: airportData } = await supabase
                            .from('airport')
                            .select('passenger_count')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (airportData) {
                            actualQuantity = airportData.passenger_count || 1;
                        }
                        break;

                    case 'hotel':
                        const { data: hotelData } = await supabase
                            .from('hotel')
                            .select('checkin_date, checkout_date')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (hotelData && hotelData.checkin_date && hotelData.checkout_date) {
                            const checkinDate = new Date(hotelData.checkin_date);
                            const checkoutDate = new Date(hotelData.checkout_date);
                            const nightCount = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
                            actualQuantity = Math.max(nightCount, 1);
                        }
                        break;

                    case 'rentcar':
                        const { data: rentcarData } = await supabase
                            .from('rentcar')
                            .select('vehicle_count, pickup_date, return_date')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (rentcarData) {
                            if (rentcarData.pickup_date && rentcarData.return_date) {
                                const pickupDate = new Date(rentcarData.pickup_date);
                                const returnDate = new Date(rentcarData.return_date);
                                const dayCount = Math.ceil((returnDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24));
                                const vehicleCount = rentcarData.vehicle_count || 1;
                                actualQuantity = vehicleCount * Math.max(dayCount, 1);
                            } else {
                                actualQuantity = rentcarData.vehicle_count || 1;
                            }
                        }
                        break;

                    case 'tour':
                        const { data: tourData } = await supabase
                            .from('tour')
                            .select('participant_count')
                            .eq('id', item.service_ref_id)
                            .single();

                        if (tourData) {
                            actualQuantity = tourData.participant_count || 1;
                        }
                        break;
                }

                // 현재 수량과 다른 경우에만 업데이트
                if (item.quantity !== actualQuantity) {
                    const { error: updateError } = await supabase
                        .from('quote_item')
                        .update({
                            quantity: actualQuantity,
                            total_price: (item.unit_price || 0) * actualQuantity
                        })
                        .eq('id', item.id);

                    if (updateError) {
                        errors.push(`${item.service_type} ${item.id}: ${updateError.message}`);
                    } else {
                        fixedCount++;
                        console.log(`✅ 수정됨: ${item.service_type} ${item.id} - ${item.quantity} → ${actualQuantity}`);
                    }
                }

            } catch (serviceError) {
                errors.push(`${item.service_type} ${item.id}: ${serviceError}`);
            }
        }

        console.log(`🎉 견적 아이템 수량 수정 완료: ${fixedCount}개 수정됨`);
        if (errors.length > 0) {
            console.warn('⚠️ 수정 실패 항목들:', errors);
        }

        return { success: true, fixedCount, errors };

    } catch (error) {
        console.error('❌ 견적 아이템 수량 수정 실패:', error);
        return { success: false, error };
    }
};