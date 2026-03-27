// lib/updateQuoteItemPricesNew.ts
import supabase from './supabase';

interface CruiseInfo {
  schedule: string;
  cruise_code: string;
  payment_code: string;
  checkin: string;
}

export async function updateQuoteItemPrices(quoteId: string, cruiseInfo?: CruiseInfo) {
  try {
    console.log('🔄 quote_item 가격 계산 시작:', quoteId);

    // 먼저 quote_item이 있는지 확인
    const { data: quoteItems, error: itemsError } = await supabase
      .from('quote_item')
      .select('*')
      .eq('quote_id', quoteId);

    if (itemsError) {
      console.error('❌ quote_item 조회 실패:', itemsError);
      return false;
    }

    if (!quoteItems || quoteItems.length === 0) {
      console.log('ℹ️ 계산할 quote_item이 없습니다.');
      return true;
    }

    console.log('📋 처리할 quote_item:', quoteItems.length, '건');

    let totalQuotePrice = 0;

    // 각 아이템별 가격 계산
    for (const item of quoteItems) {
      let unitPrice = 0;

      try {
        console.log(`🔍 처리 중: ${item.service_type} (ref_id: ${item.service_ref_id})`);

        if (item.service_type === 'room') {
          // 객실 가격 계산
          const { data: roomData, error: roomError } = await supabase
            .from('room')
            .select('room_code')
            .eq('id', item.service_ref_id)
            .single();

          if (roomError || !roomData) {
            console.warn(`⚠️ room 데이터 조회 실패 (id: ${item.service_ref_id}):`, roomError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('cruise_rate_card')
            .select('price_adult')
            .eq('id', roomData.room_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ cruise_rate_card 조회 실패 (id: ${roomData.room_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].price_adult || 0;
          console.log(`  💰 객실 가격: ${unitPrice}`);

        } else if (item.service_type === 'car') {
          // 차량 가격 계산
          const { data: carData, error: carError } = await supabase
            .from('car')
            .select('car_code')
            .eq('id', item.service_ref_id)
            .single();

          if (carError || !carData) {
            console.warn(`⚠️ car 데이터 조회 실패 (id: ${item.service_ref_id}):`, carError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('car_price')
            .select('price, base_price')
            .eq('car_code', carData.car_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ car_price 조회 실패 (car_code: ${carData.car_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].price || priceData[0].base_price || 0;
          console.log(`  💰 차량 가격: ${unitPrice}`);

        } else if (item.service_type === 'airport') {
          // 공항 가격 계산
          const { data: airportData, error: airportError } = await supabase
            .from('airport')
            .select('airport_code')
            .eq('id', item.service_ref_id)
            .single();

          if (airportError || !airportData) {
            console.warn(`⚠️ airport 데이터 조회 실패 (id: ${item.service_ref_id}):`, airportError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('airport_price')
            .select('price, base_price')
            .eq('airport_code', airportData.airport_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ airport_price 조회 실패 (airport_code: ${airportData.airport_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].price || priceData[0].base_price || 0;
          console.log(`  💰 공항 가격: ${unitPrice}`);

        } else if (item.service_type === 'hotel') {
          // 호텔 가격 계산
          const { data: hotelData, error: hotelError } = await supabase
            .from('hotel')
            .select('hotel_code')
            .eq('id', item.service_ref_id)
            .single();

          if (hotelError || !hotelData) {
            console.warn(`⚠️ hotel 데이터 조회 실패 (id: ${item.service_ref_id}):`, hotelError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('hotel_price')
            .select('base_price')
            .eq('hotel_price_code', hotelData.hotel_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ hotel_price 조회 실패 (hotel_price_code: ${hotelData.hotel_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].base_price || 0;
          console.log(`  💰 호텔 가격: ${unitPrice}`);

        } else if (item.service_type === 'rentcar') {
          // 렌트카 가격 계산
          const { data: rentcarData, error: rentcarError } = await supabase
            .from('rentcar')
            .select('rentcar_code')
            .eq('id', item.service_ref_id)
            .single();

          if (rentcarError || !rentcarData) {
            console.warn(`⚠️ rentcar 데이터 조회 실패 (id: ${item.service_ref_id}):`, rentcarError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('rentcar_price')
            .select('price')
            .eq('rent_code', rentcarData.rentcar_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ rentcar_price 조회 실패 (rent_code: ${rentcarData.rentcar_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].price || priceData[0].base_price || 0;
          console.log(`  💰 렌트카 가격: ${unitPrice}`);

        } else if (item.service_type === 'tour') {
          // 투어 가격 계산
          const { data: tourData, error: tourError } = await supabase
            .from('tour')
            .select('tour_code')
            .eq('id', item.service_ref_id)
            .single();

          if (tourError || !tourData) {
            console.warn(`⚠️ tour 데이터 조회 실패 (id: ${item.service_ref_id}):`, tourError);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('tour_pricing')
            .select('price_per_person, tour:tour_id!inner(tour_code)')
            .eq('tour.tour_code', tourData.tour_code)
            .eq('is_active', true)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ tour_pricing 조회 실패 (tour_code: ${tourData.tour_code}):`, priceError);
            continue;
          }

          unitPrice = priceData[0].price_per_person || 0;
          console.log(`  💰 투어 가격: ${unitPrice}`);

        } else {
          console.log(`  ⚠️ 지원하지 않는 서비스 타입: ${item.service_type}`);
          continue;
        }

        const totalPrice = unitPrice * (item.quantity || 1);
        totalQuotePrice += totalPrice;

        // quote_item 업데이트
        const { error: updateError } = await supabase
          .from('quote_item')
          .update({
            unit_price: unitPrice,
            total_price: totalPrice,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`❌ quote_item 업데이트 실패 (id: ${item.id}):`, updateError);
        } else {
          console.log(`  ✅ 업데이트 완료: ${unitPrice} x ${item.quantity} = ${totalPrice}`);
        }

      } catch (itemError) {
        console.error(`❌ ${item.service_type} 가격 계산 중 오류:`, itemError);
      }
    }

    // 견적 총액 업데이트
    const { error: quoteUpdateError } = await supabase
      .from('quote')
      .update({
        total_price: totalQuotePrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteId);

    if (quoteUpdateError) {
      console.error('❌ 견적 총액 업데이트 실패:', quoteUpdateError);
      return false;
    }

    console.log('✅ 가격 계산 완료. 총액:', totalQuotePrice.toLocaleString(), '동');
    return true;

  } catch (error) {
    console.error('❌ 가격 계산 중 전체 오류:', error);
    return false;
  }
}

export default updateQuoteItemPrices;

