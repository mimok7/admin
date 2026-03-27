import supabase from './supabase';

// 각 서비스별 베이스 가격 업데이트 함수
export const updateRoomBasePrices = async () => {
    try {
        // room 테이블에서 베이스 가격이 없는 항목 조회
        const { data: rooms, error: roomError } = await supabase
            .from('room')
            .select('id, room_code')
            .or('base_price.is.null,base_price.eq.0');

        if (roomError) throw roomError;

        const updatePromises = rooms.map(async (room) => {
            if (!room.room_code) return;

            // cruise_rate_card 테이블에서 가격 조회
            const { data: priceData, error: priceError } = await supabase
                .from('cruise_rate_card')
                .select('price_adult')
                .eq('id', room.room_code)
                .single();

            if (priceError || !priceData) return;

            // room 테이블의 base_price 업데이트
            return supabase
                .from('room')
                .update({ base_price: priceData.price_adult })
                .eq('id', room.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Room 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

export const updateCarBasePrices = async () => {
    try {
        const { data: cars, error: carError } = await supabase
            .from('car')
            .select('id, car_code')
            .or('base_price.is.null,base_price.eq.0');

        if (carError) throw carError;

        const updatePromises = cars.map(async (car) => {
            if (!car.car_code) return;

            const { data: priceData, error: priceError } = await supabase
                .from('car_price')
                .select('price')
                .eq('car_code', car.car_code)
                .single();

            if (priceError || !priceData) return;

            return supabase
                .from('car')
                .update({ base_price: priceData.price })
                .eq('id', car.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Car 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

export const updateAirportBasePrices = async () => {
    try {
        const { data: airports, error: airportError } = await supabase
            .from('airport')
            .select('id, airport_code')
            .or('base_price.is.null,base_price.eq.0');

        if (airportError) throw airportError;

        const updatePromises = airports.map(async (airport) => {
            if (!airport.airport_code) return;

            const { data: priceData, error: priceError } = await supabase
                .from('airport_price')
                .select('price')
                .eq('airport_code', airport.airport_code)
                .single();

            if (priceError || !priceData) return;

            return supabase
                .from('airport')
                .update({ base_price: priceData.price })
                .eq('id', airport.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Airport 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

export const updateHotelBasePrices = async () => {
    try {
        const { data: hotels, error: hotelError } = await supabase
            .from('hotel')
            .select('id, hotel_code')
            .or('base_price.is.null,base_price.eq.0');

        if (hotelError) throw hotelError;

        const updatePromises = hotels.map(async (hotel) => {
            if (!hotel.hotel_code) return;

            const { data: priceData, error: priceError } = await supabase
                .from('hotel_price')
                .select('base_price')
                .eq('hotel_price_code', hotel.hotel_code)
                .single();

            if (priceError || !priceData) return;

            return supabase
                .from('hotel')
                .update({ base_price: priceData.base_price })
                .eq('id', hotel.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Hotel 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

export const updateTourBasePrices = async () => {
    try {
        const { data: tours, error: tourError } = await supabase
            .from('tour')
            .select('id, tour_code')
            .or('base_price.is.null,base_price.eq.0');

        if (tourError) throw tourError;

        const updatePromises = tours.map(async (tour) => {
            if (!tour.tour_code) return;

            const { data: priceData, error: priceError } = await supabase
                .from('tour_pricing')
                .select('price_per_person, tour:tour_id!inner(tour_code)')
                .eq('tour.tour_code', tour.tour_code)
                .eq('is_active', true)
                .limit(1)
                .single();

            if (priceError || !priceData) return;

            return supabase
                .from('tour')
                .update({ base_price: priceData.price_per_person })
                .eq('id', tour.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Tour 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

export const updateRentcarBasePrices = async () => {
    try {
        const { data: rentcars, error: rentcarError } = await supabase
            .from('rentcar')
            .select('id, rentcar_code')
            .or('base_price.is.null,base_price.eq.0');

        if (rentcarError) throw rentcarError;

        const updatePromises = rentcars.map(async (rentcar) => {
            if (!rentcar.rentcar_code) return;

            // rentcar_price 테이블 사용 (DB 스키마 참조)
            const { data: priceData, error: priceError } = await supabase
                .from('rentcar_price')
                .select('price')
                .eq('rent_code', rentcar.rentcar_code)
                .single();

            if (priceError || !priceData) return;

            return supabase
                .from('rentcar')
                .update({ base_price: priceData.price })
                .eq('id', rentcar.id);
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(result => result && !result.error).length;

        return { success: true, updated: successCount };
    } catch (error) {
        console.error('Rentcar 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

// 전체 베이스 가격 일괄 업데이트
export const updateAllBasePrices = async () => {
    try {
        const results = await Promise.all([
            updateRoomBasePrices(),
            updateCarBasePrices(),
            updateAirportBasePrices(),
            updateHotelBasePrices(),
            updateTourBasePrices(),
            updateRentcarBasePrices()
        ]);

        return {
            success: true,
            results: {
                room: results[0],
                car: results[1],
                airport: results[2],
                hotel: results[3],
                tour: results[4],
                rentcar: results[5]
            }
        };
    } catch (error) {
        console.error('전체 베이스 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};

// Quote Item 가격 업데이트 함수 추가
export const updateQuoteItemPrices = async () => {
    try {
        // 각 서비스별 quote_item 업데이트
        const serviceTypes = ['room', 'car', 'airport', 'hotel', 'tour', 'rentcar'];

        for (const serviceType of serviceTypes) {
            const { data: items, error: itemsError } = await supabase
                .from('quote_item')
                .select('id, service_ref_id')
                .eq('service_type', serviceType);

            if (itemsError) continue;

            for (const item of items || []) {
                const { data: serviceData, error: serviceError } = await supabase
                    .from(serviceType)
                    .select('base_price')
                    .eq('id', item.service_ref_id)
                    .single();

                if (serviceError || !serviceData?.base_price) continue;

                await supabase
                    .from('quote_item')
                    .update({
                        unit_price: serviceData.base_price,
                        total_price: serviceData.base_price * 1 // quantity 기본값 1
                    })
                    .eq('id', item.id);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Quote Item 가격 업데이트 오류:', error);
        return { success: false, error };
    }
};