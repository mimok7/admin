import { getRoomPriceCode } from './getRoomPriceCode';
import { getCarPriceCode } from './getCarPriceCode';
import supabase from './supabase';

export async function updateRoomAndCarPriceCodes(quoteId: string, checkin: string) {
  if (!quoteId) throw new Error('❌ quoteId 누락');
  if (!checkin || isNaN(Date.parse(checkin))) {
    console.warn('❌ 유효하지 않은 checkin 날짜:', checkin);
    return;
  }

  const { data: details, error } = await supabase
    .from('quote_room_detail')
    .select('*')
    .eq('quote_id', quoteId);

  if (error) {
    throw new Error('❌ quote_room_detail 조회 실패: ' + error.message);
  }

  for (const detail of details) {
    const {
      id,
      quote_id,
      room_code,
      vehicle_code,
      category,
      passenger_type,
      room_price_code,
      car_price_code,
    } = detail;

    let newRoomPriceCode = null;
    let newCarPriceCode = null;

    // ✅ room_price_code 조회
    if (
      detail.schedule_code &&
      detail.cruise_code &&
      detail.payment_code &&
      room_code &&
      category
    ) {
      try {
        newRoomPriceCode = await getRoomPriceCode({
          schedule_code: detail.schedule_code,
          cruise_code: detail.cruise_code,
          payment_code: detail.payment_code,
          room_code,
          room_category_code: category,
          checkin_date: checkin,
        });
      } catch (err) {
        const e = err as any;
        console.warn(`⚠️ room_price_code 조회 실패 (${room_code}, ${category}):`, e?.message ?? e);
      }
    }

    // ✅ car_price_code 조회
    if (
      vehicle_code &&
      detail.schedule_code &&
      detail.cruise_code &&
      detail.vehicle_category_code
    ) {
      try {
        newCarPriceCode = await getCarPriceCode({
          schedule_code: detail.schedule_code,
          cruise_code: detail.cruise_code,
          car_code: vehicle_code,
          car_category_code: detail.vehicle_category_code,
        });
      } catch (err) {
        const e = err as any;
        console.warn(`⚠️ car_price_code 조회 실패 (${vehicle_code}):`, e?.message ?? e);
      }
    }

    // ✅ update 수행
    const { error: updateError } = await supabase
      .from('quote_room_detail')
      .update({
        room_price_code: newRoomPriceCode,
        car_price_code: newCarPriceCode,
      })
      .eq('id', id);

    if (updateError) {
      console.warn(`❌ quote_room_detail (${id}) 업데이트 실패:`, updateError.message);
    }
  }

  console.log('✅ 가격 코드 업데이트 완료');
}
