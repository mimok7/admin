// lib/updateQuoteRoomDetailPrices.ts
import supabase from './supabase';
import { getRoomPriceCode } from './getRoomPriceCode';
import { getCarPriceCode } from './getCarPriceCode';

export async function updateRoomAndCarPriceCodes(quoteId: string, checkin: string) {
  // Step 1: quote_room_detail 목록 조회
  const { data: details, error: detailError } = await supabase
    .from('quote_room_detail')
    .select('id, room_code, category, quote_room_id, vehicle_code')
    .eq('quote_id', quoteId);

  if (detailError || !details) {
    console.error('❌ quote_room_detail 불러오기 실패:', detailError?.message);
    return;
  }

  // Step 2: quote 공통 정보 한 번만 조회
  const { data: quote, error: quoteError } = await supabase
    .from('quote')
    .select('schedule_code, cruise_code, payment_code, vehicle_category_code')
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    console.error('❌ quote 정보 조회 실패:', quoteError?.message);
    return;
  }

  const { schedule_code, cruise_code, payment_code, vehicle_category_code } = quote;

  // Step 3: 각 detail에 대해 price_code 계산 및 업데이트
  for (const detail of details) {
    const room_price_code = await getRoomPriceCode({
      schedule_code,
      cruise_code,
      payment_code,
      room_code: detail.room_code,
      room_category_code: detail.category,
      checkin_date: checkin,
    });

    const car_price_code = await getCarPriceCode({
      schedule_code,
      cruise_code,
      car_code: detail.vehicle_code,
      car_category_code: vehicle_category_code,
    });

    const { error: updateError } = await supabase
      .from('quote_room_detail')
      .update({ room_price_code, car_price_code })
      .eq('id', detail.id);

    if (updateError) {
      console.warn(`⚠️ quote_room_detail 업데이트 실패 (id: ${detail.id}):`, updateError.message);
    } else {
      console.log(`✅ 업데이트 성공: ${detail.id}`);
    }
  }

  console.log('🎉 모든 가격 코드 업데이트 완료');
}
