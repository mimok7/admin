import supabase from './supabase';

/**
 * 견적의 모든 아이템에 대해 가격을 계산하고 업데이트하는 함수
 * @param quoteId - 견적 ID
 * @returns 성공 여부
 */
export async function updateQuoteItemPrices(quoteId: string): Promise<boolean> {
  try {
    console.log('💰 견적 가격 계산 시작:', quoteId);

    // quote_item 조회
    const { data: quoteItems, error: itemsError } = await supabase
      .from('quote_item')
      .select('*')
      .eq('quote_id', quoteId);

    if (itemsError) {
      console.error('❌ quote_item 조회 실패:', itemsError);
      return false;
    }

    if (!quoteItems || quoteItems.length === 0) {
      console.warn('⚠️ quote_item이 비어있습니다.');
      return false;
    }

    console.log(`📋 처리할 아이템 수: ${quoteItems.length}`);

    let totalQuotePrice = 0;

    // 각 아이템별로 가격 계산
    for (const item of quoteItems) {
      try {
        console.log(`🔍 처리 중: ${item.service_type} (ref_id: ${item.service_ref_id})`);

        let unitPrice = 0;

        if (item.service_type === 'room') {
          // 객실 가격 계산 (성인/아동/유아/엑스트라/싱글 분리 계산)
          const { data: roomData, error: roomError } = await supabase
            .from('room')
            .select('room_code, person_count, extra_count, adult_count, child_count, child_extra_bed_count, infant_count, extra_bed_count, single_count')
            .eq('id', item.service_ref_id)
            .single();

          if (roomError || !roomData) {
            console.warn(`⚠️ room 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          // cruise_rate_card에서 가격 조회
          const { data: priceData, error: priceError } = await supabase
            .from('cruise_rate_card')
            .select('price_adult, price_child, price_child_extra_bed, price_infant, price_extra_bed, price_single')
            .eq('id', roomData.room_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ cruise_rate_card 조회 실패 (room_code: ${roomData.room_code})`);
            continue;
          }

          const price = priceData[0] || {};
          const adultCount = Number(roomData.adult_count || 0);
          const childCount = Number(roomData.child_count || 0);
          const childExtraBedCount = Number(roomData.child_extra_bed_count || 0);
          const infantCount = Number(roomData.infant_count || 0);
          const extraBedCount = Number(roomData.extra_bed_count || 0);
          const singleCount = Number(roomData.single_count || 0);

          const hasDetailedCounts =
            adultCount > 0 ||
            childCount > 0 ||
            childExtraBedCount > 0 ||
            infantCount > 0 ||
            extraBedCount > 0 ||
            singleCount > 0;

          if (hasDetailedCounts) {
            unitPrice =
              (Number(price.price_adult || 0) * adultCount) +
              (Number(price.price_child || 0) * childCount) +
              (Number(price.price_child_extra_bed || 0) * childExtraBedCount) +
              (Number(price.price_infant || 0) * infantCount) +
              (Number(price.price_extra_bed || 0) * extraBedCount) +
              (Number(price.price_single || 0) * singleCount);
          } else {
            // 과거 데이터 호환: 상세 인원 컬럼이 비어있는 경우 person_count 기반으로 계산
            const person = Number(roomData.person_count || 0);
            let cnt = person > 0 ? person : Number(roomData.extra_count || 0);
            if (cnt <= 0) cnt = 1;
            unitPrice = Number(price.price_adult || 0) * cnt;
          }

          console.log(`  💰 객실 가격: ${unitPrice}`);

        } else if (item.service_type === 'car') {
          // 차량 가격 계산
          const { data: carData, error: carError } = await supabase
            .from('car')
            .select('car_code, car_count')
            .eq('id', item.service_ref_id)
            .single();

          if (carError || !carData) {
            console.warn(`⚠️ car 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('car_price')
            .select('price')
            .eq('car_code', carData.car_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ car_price 조회 실패 (car_code: ${carData.car_code})`);
            continue;
          }

          unitPrice = (priceData[0].price || 0) * (carData.car_count || 1);
          console.log(`  💰 차량 가격: ${unitPrice}`);

        } else if (item.service_type === 'airport') {
          // 공항 서비스 가격 계산
          const { data: airportData, error: airportError } = await supabase
            .from('airport')
            .select('airport_code, passenger_count')
            .eq('id', item.service_ref_id)
            .single();

          if (airportError || !airportData) {
            console.warn(`⚠️ airport 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('airport_price')
            .select('price')
            .eq('airport_code', airportData.airport_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ airport_price 조회 실패 (airport_code: ${airportData.airport_code})`);
            continue;
          }

          unitPrice = (priceData[0].price || 0) * (airportData.passenger_count || 1);
          console.log(`  💰 공항 가격: ${unitPrice}`);

        } else if (item.service_type === 'hotel') {
          // 호텔 가격 계산
          const { data: hotelData, error: hotelError } = await supabase
            .from('hotel')
            .select('hotel_code')
            .eq('id', item.service_ref_id)
            .single();

          if (hotelError || !hotelData) {
            console.warn(`⚠️ hotel 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('hotel_price')
            .select('base_price')
            .eq('hotel_price_code', hotelData.hotel_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ hotel_price 조회 실패 (hotel_price_code: ${hotelData.hotel_code})`);
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
            console.warn(`⚠️ rentcar 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('rentcar_price')
            .select('price')
            .eq('rent_code', rentcarData.rentcar_code)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ rentcar_price 조회 실패 (rent_code: ${rentcarData.rentcar_code})`);
            continue;
          }

          unitPrice = priceData[0].price || 0;
          console.log(`  💰 렌트카 가격: ${unitPrice}`);

        } else if (item.service_type === 'tour') {
          // 투어 가격 계산
          const { data: tourData, error: tourError } = await supabase
            .from('tour')
            .select('tour_code, participant_count')
            .eq('id', item.service_ref_id)
            .single();

          if (tourError || !tourData) {
            console.warn(`⚠️ tour 데이터 조회 실패 (id: ${item.service_ref_id})`);
            continue;
          }

          const { data: priceData, error: priceError } = await supabase
            .from('tour_pricing')
            .select('price_per_person, tour:tour_id!inner(tour_code)')
            .eq('tour.tour_code', tourData.tour_code)
            .eq('is_active', true)
            .limit(1);

          if (priceError || !priceData || priceData.length === 0) {
            console.warn(`⚠️ tour_pricing 조회 실패 (tour_code: ${tourData.tour_code})`);
            continue;
          }

          unitPrice = (priceData[0].price_per_person || 0) * (tourData.participant_count || 1);
          console.log(`  💰 투어 가격: ${unitPrice}`);

        } else {
          console.log(`  ⚠️ 지원하지 않는 서비스 타입: ${item.service_type}`);
          continue;
        }

        // 차량은 unit_price에 이미 car_count가 곱해져 있으므로 quantity를 곱하지 않음
        const totalPrice = item.service_type === 'car'
          ? unitPrice
          : unitPrice * (item.quantity || 1);
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
          if (item.service_type === 'car') {
            console.log(`  ✅ 업데이트 완료 (차량): ${unitPrice} (quantity 미적용)`);
          } else {
            console.log(`  ✅ 업데이트 완료: ${unitPrice} x ${item.quantity} = ${totalPrice}`);
          }
        }

      } catch (itemError) {
        console.error(`❌ ${item.service_type} 가격 계산 중 오류:`, itemError);
        continue;
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

