// lib/updateQuoteCarPrices.ts
import supabase from './supabase';
import { getCarPriceCode } from './getCarPriceCode';

export async function updateQuoteCarPrices(quoteId: string) {
  // Step 1: quote에서 조건 조회
  const { data: quote, error: quoteError } = await supabase
    .from('quote')
    .select('schedule_code, cruise_code, vehicle_category_code')
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    console.error('❌ quote 정보 조회 실패:', quoteError.message);
    return;
  }

  const { schedule_code, cruise_code, vehicle_category_code } = quote;

  // Step 2: quote_car 목록 조회
  const { data: cars, error: carError } = await supabase
    .from('quote_car')
    .select('id, vehicle_code')
    .eq('quote_id', quoteId);

  if (carError || !cars) {
    console.error('❌ quote_car 불러오기 실패:', carError.message);
    return;
  }

  // Step 3: 각 차량에 대해 car_price_code 조회 & 업데이트
  for (const car of cars) {
    const car_price_code = await getCarPriceCode({
      schedule_code,
      cruise_code,
      car_code: car.vehicle_code,
      car_category_code: vehicle_category_code,
    });

    if (!car_price_code) {
      console.warn(`⚠️ car_price_code 찾지 못함 (car_id: ${car.id})`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('quote_car')
      .update({ car_price_code })
      .eq('id', car.id);

    if (updateError) {
      console.warn(`❌ car_price_code 업데이트 실패 (car_id: ${car.id})`, updateError.message);
    } else {
      console.log(`✅ car_price_code 업데이트 성공 (car_id: ${car.id})`);
    }
  }

  console.log('🚗 차량 가격 코드 업데이트 완료');
}
