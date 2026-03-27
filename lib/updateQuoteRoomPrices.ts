// lib/updateQuoteRoomPrices.ts
import supabase from './supabase';
import { getRoomPriceCode } from './getRoomPriceCode';

export async function updateQuoteRoomPrices(quoteId: string, checkin: string) {
  // Step 1: quote 공통 정보 조회
  const { data: quote, error: quoteError } = await supabase
    .from('quote')
    .select('schedule_code, cruise_code, payment_code')
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    console.error('❌ quote 정보 조회 실패:', quoteError?.message);
    return;
  }

  const { schedule_code, cruise_code, payment_code } = quote;

  // Step 2: quote_room 목록 조회
  const { data: rooms, error: roomError } = await supabase
    .from('quote_room')
    .select('id, room_code, category')
    .eq('quote_id', quoteId);

  if (roomError || !rooms) {
    console.error('❌ quote_room 불러오기 실패:', roomError?.message);
    return;
  }

  // Step 3: 각 quote_room에 대해 room_price_code 조회 & 업데이트
  for (const room of rooms) {
    const room_price_code = await getRoomPriceCode({
      schedule_code,
      cruise_code,
      payment_code,
      room_code: room.room_code,
      room_category_code: room.category,
      checkin_date: checkin,
    });

    if (!room_price_code) {
      console.warn(`⚠️ room_price_code 찾지 못함 (room_id: ${room.id})`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('quote_room')
      .update({ room_price_code })
      .eq('id', room.id);

    if (updateError) {
      console.warn(`❌ room_price_code 업데이트 실패 (room_id: ${room.id})`, updateError.message);
    } else {
      console.log(`✅ room_price_code 업데이트 성공 (room_id: ${room.id})`);
    }
  }

  console.log('🎉 모든 객실 가격 코드 업데이트 완료');
}
